"""
AutoOps — DynamoDB data layer.
Replaces Django ORM for all business data.
"""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', '..', '..', 'shared'))

from dynamo.client import (
    put_item, get_item, update_item, delete_item,
    query_table, scan_table, new_id, now_iso, provision_tables,
    to_decimal, from_decimal
)
from boto3.dynamodb.conditions import Key, Attr

TABLES = [
    ('ao_run_log',          'module',       'run_id',       [{'name':'status-index','pk':'status','sk':'started_at'}]),
    ('ao_incoming_docs',    'source',       'doc_id',       [{'name':'status-index','pk':'status','sk':'received_at'}]),
    ('ao_kyc_records',      'entity_type',  'kyc_id',       [
        {'name':'status-index',  'pk':'status'},
        {'name':'country-index', 'pk':'country','sk':'status'},
    ]),
    ('ao_watchlist',        'status',       'entry_id',     [{'name':'entity-index','pk':'entity_name'}]),
    ('ao_compliance_alerts','status',       'alert_id',     [{'name':'severity-index','pk':'severity','sk':'created_at'}]),
    ('ao_bank_feeds',       'feed_type',    'feed_id',      [{'name':'status-index','pk':'status'}]),
    ('ao_transactions',     'feed_id',      'tx_id',        [
        {'name':'status-index','pk':'status','sk':'tx_date'},
        {'name':'type-index',  'pk':'transaction_type','sk':'tx_date'},
    ]),
    ('ao_email_rules',      'action',       'rule_id',      [{'name':'active-index','pk':'is_active_str'}]),
    ('ao_email_log',        'status',       'log_id',       [{'name':'sender-index','pk':'sender','sk':'received_at'}]),
    ('ao_followup_tasks',   'assigned_to',  'task_id',      [{'name':'status-index','pk':'status','sk':'due_date'}]),
    ('ao_pipelines',        'source_type',  'pipeline_id',  [{'name':'status-index','pk':'status','sk':'schedule'}]),
    ('ao_pipeline_runs',    'pipeline_id',  'run_id',       [{'name':'status-index','pk':'status','sk':'started_at'}]),
]


def setup_tables():
    provision_tables(TABLES)


# ── Automation run log ────────────────────────────────────────────────────────
def log_run(module: str, task_name: str, triggered_by: str = 'scheduler',
            entity_type: str = '', entity_id: str = '') -> dict:
    item = {
        'module': module, 'run_id': new_id(),
        'task_name': task_name, 'triggered_by': triggered_by,
        'entity_type': entity_type, 'entity_id': entity_id,
        'status': 'pending', 'started_at': now_iso(),
        'records_processed': 0,
    }
    return put_item('ao_run_log', item, add_timestamps=False)


def complete_run(module: str, run_id: str, status: str,
                 summary: str = '', records: int = 0,
                 error: str = '', duration_ms: int = 0) -> dict:
    return update_item('ao_run_log', {'module': module, 'run_id': run_id}, {
        'status': status, 'summary': summary,
        'records_processed': records, 'error': error,
        'duration_ms': duration_ms, 'completed_at': now_iso(),
    })


def get_recent_runs(limit: int = 30) -> list:
    return scan_table('ao_run_log', limit=limit)['items']


def dashboard_stats() -> dict:
    from collections import defaultdict
    runs = scan_table('ao_run_log', limit=500)['items']
    total   = len(runs)
    success = sum(1 for r in runs if r.get('status') == 'success')
    failed  = sum(1 for r in runs if r.get('status') == 'failed')
    by_mod  = defaultdict(lambda: {'total':0,'success':0,'failed':0})
    for r in runs:
        m = r.get('module','')
        by_mod[m]['total']   += 1
        if r.get('status') == 'success': by_mod[m]['success'] += 1
        if r.get('status') == 'failed':  by_mod[m]['failed']  += 1
    return {
        'total_runs':   total,
        'success_rate': round(success/total*100, 1) if total else 0,
        'failed':       failed,
        'by_module':    [{'module':k,**v} for k,v in by_mod.items()],
        'recent':       sorted(runs, key=lambda x: x.get('started_at',''), reverse=True)[:10],
    }


# ── Incoming documents ────────────────────────────────────────────────────────
def create_incoming_doc(data: dict) -> dict:
    item = {**data, 'doc_id': new_id(), 'status': 'received',
            'received_at': now_iso()}
    return put_item('ao_incoming_docs', item, add_timestamps=False)


def list_incoming_docs(status: str = None, limit: int = 50) -> list:
    if status:
        return query_table('ao_incoming_docs', 'status', status,
                           index_name='status-index', limit=limit)['items']
    return scan_table('ao_incoming_docs', limit=limit)['items']


def update_incoming_doc(source: str, doc_id: str, updates: dict) -> dict:
    return update_item('ao_incoming_docs',
                       {'source': source, 'doc_id': doc_id}, updates)


# ── KYC records ───────────────────────────────────────────────────────────────
def create_kyc_record(data: dict) -> dict:
    item = {**data, 'kyc_id': new_id(), 'status': 'pending'}
    return put_item('ao_kyc_records', item)


def get_kyc_record(entity_type: str, kyc_id: str) -> dict:
    return get_item('ao_kyc_records', 'entity_type', entity_type,
                    'kyc_id', kyc_id)


def list_kyc_records(status: str = None, limit: int = 100) -> list:
    if status:
        return query_table('ao_kyc_records', 'status', status,
                           index_name='status-index', limit=limit)['items']
    return scan_table('ao_kyc_records', limit=limit)['items']


def update_kyc_record(entity_type: str, kyc_id: str, updates: dict) -> dict:
    return update_item('ao_kyc_records',
                       {'entity_type': entity_type, 'kyc_id': kyc_id}, updates)


def kyc_stats() -> dict:
    records = scan_table('ao_kyc_records', limit=500)['items']
    return {
        'total':    len(records),
        'pending':  sum(1 for r in records if r.get('status') == 'pending'),
        'approved': sum(1 for r in records if r.get('status') == 'approved'),
        'flagged':  sum(1 for r in records if r.get('status') == 'flagged'),
        'expired':  sum(1 for r in records if r.get('status') == 'expired'),
        'high_risk':sum(1 for r in records if r.get('risk_level') in ('high','critical')),
    }


# ── Compliance ────────────────────────────────────────────────────────────────
def create_watchlist_entry(data: dict) -> dict:
    item = {**data, 'entry_id': new_id()}
    return put_item('ao_watchlist', item)


def list_watchlist(status: str = 'active') -> list:
    return query_table('ao_watchlist', 'status', status)['items']


def update_watchlist_entry(status: str, entry_id: str, updates: dict) -> dict:
    return update_item('ao_watchlist',
                       {'status': status, 'entry_id': entry_id}, updates)


def create_alert(data: dict) -> dict:
    item = {**data, 'alert_id': new_id()}
    return put_item('ao_compliance_alerts', item)


def list_alerts(status: str = 'open', limit: int = 100) -> list:
    return query_table('ao_compliance_alerts', 'status', status,
                       scan_forward=False, limit=limit)['items']


def update_alert(status: str, alert_id: str, updates: dict) -> dict:
    return update_item('ao_compliance_alerts',
                       {'status': status, 'alert_id': alert_id}, updates)


def alert_summary() -> dict:
    open_alerts = list_alerts('open', limit=500)
    return {
        'open':     len(open_alerts),
        'critical': sum(1 for a in open_alerts if a.get('severity') == 'critical'),
        'high':     sum(1 for a in open_alerts if a.get('severity') == 'high'),
        'medium':   sum(1 for a in open_alerts if a.get('severity') == 'medium'),
    }


# ── Transactions ──────────────────────────────────────────────────────────────
def create_bank_feed(data: dict) -> dict:
    item = {**data, 'feed_id': new_id(), 'status': 'active', 'sync_count': 0}
    return put_item('ao_bank_feeds', item)


def list_feeds(status: str = None) -> list:
    if status:
        return query_table('ao_bank_feeds', 'status', status,
                           index_name='status-index')['items']
    return scan_table('ao_bank_feeds')['items']


def update_feed(feed_type: str, feed_id: str, updates: dict) -> dict:
    return update_item('ao_bank_feeds',
                       {'feed_type': feed_type, 'feed_id': feed_id}, updates)


def create_transaction(feed_id: str, data: dict) -> dict:
    item = {**data, 'feed_id': feed_id, 'tx_id': new_id(),
            'status': 'pending',
            'tx_date': data.get('date', now_iso()[:10])}
    return put_item('ao_transactions', item)


def list_transactions(feed_id: str = None, status: str = None,
                      tx_type: str = None, limit: int = 100) -> list:
    if feed_id:
        return query_table('ao_transactions', 'feed_id', feed_id,
                           scan_forward=False, limit=limit)['items']
    if status:
        return query_table('ao_transactions', 'status', status,
                           index_name='status-index',
                           scan_forward=False, limit=limit)['items']
    return scan_table('ao_transactions', limit=limit)['items']


def update_transaction(feed_id: str, tx_id: str, updates: dict) -> dict:
    return update_item('ao_transactions',
                       {'feed_id': feed_id, 'tx_id': tx_id}, updates)


def transaction_summary() -> dict:
    from collections import defaultdict
    from decimal import Decimal
    txns = scan_table('ao_transactions', limit=1000)['items']
    posted = [t for t in txns if t.get('status') in ('posted','reconciled')]
    total_vol = sum(float(t.get('amount', 0)) for t in posted)
    by_type = defaultdict(lambda: {'count':0,'total':0.0})
    for t in posted:
        tp = t.get('transaction_type','other')
        by_type[tp]['count'] += 1
        by_type[tp]['total'] += float(t.get('amount', 0))
    return {
        'total_transactions': len(posted),
        'total_volume':       round(total_vol, 2),
        'by_type':            [{'transaction_type':k,**v} for k,v in by_type.items()],
        'pending_review':     sum(1 for t in txns if t.get('status') == 'pending'),
    }


# ── Email workflows ───────────────────────────────────────────────────────────
def create_email_rule(data: dict) -> dict:
    item = {**data, 'rule_id': new_id(), 'match_count': 0,
            'is_active': data.get('is_active', True),
            'is_active_str': 'true' if data.get('is_active', True) else 'false'}
    return put_item('ao_email_rules', item)


def list_email_rules(active_only: bool = False) -> list:
    if active_only:
        return query_table('ao_email_rules', 'is_active_str', 'true',
                           index_name='active-index')['items']
    return scan_table('ao_email_rules')['items']


def create_followup_task(data: dict) -> dict:
    item = {**data, 'task_id': new_id(), 'status': 'pending'}
    return put_item('ao_followup_tasks', item)


def list_followup_tasks(assigned_to: str = None, status: str = None) -> list:
    if assigned_to:
        return query_table('ao_followup_tasks', 'assigned_to', assigned_to)['items']
    if status:
        return query_table('ao_followup_tasks', 'status', status,
                           index_name='status-index')['items']
    return scan_table('ao_followup_tasks')['items']


def update_followup_task(assigned_to: str, task_id: str, updates: dict) -> dict:
    return update_item('ao_followup_tasks',
                       {'assigned_to': assigned_to, 'task_id': task_id}, updates)


# ── Pipelines ─────────────────────────────────────────────────────────────────
def create_pipeline(data: dict) -> dict:
    item = {**data, 'pipeline_id': new_id(), 'status': 'active', 'run_count': 0}
    return put_item('ao_pipelines', item)


def list_pipelines(status: str = None, schedule: str = None) -> list:
    if status:
        return query_table('ao_pipelines', 'status', status,
                           index_name='status-index')['items']
    return scan_table('ao_pipelines')['items']


def update_pipeline(source_type: str, pipeline_id: str, updates: dict) -> dict:
    return update_item('ao_pipelines',
                       {'source_type': source_type, 'pipeline_id': pipeline_id}, updates)


def log_pipeline_run(pipeline_id: str, status: str, **kwargs) -> dict:
    item = {
        'pipeline_id': pipeline_id, 'run_id': new_id(),
        'status': status, 'started_at': now_iso(),
        'records_fetched': 0, 'records_loaded': 0,
        **kwargs,
    }
    return put_item('ao_pipeline_runs', item, add_timestamps=False)


def list_pipeline_runs(pipeline_id: str, limit: int = 10) -> list:
    return query_table('ao_pipeline_runs', 'pipeline_id', pipeline_id,
                       scan_forward=False, limit=limit)['items']


def pipeline_summary() -> dict:
    pipelines = scan_table('ao_pipelines', limit=200)['items']
    runs      = scan_table('ao_pipeline_runs', limit=500)['items']
    total_runs = len(runs)
    success    = sum(1 for r in runs if r.get('status') == 'success')
    return {
        'total':        len(pipelines),
        'active':       sum(1 for p in pipelines if p.get('status') == 'active'),
        'paused':       sum(1 for p in pipelines if p.get('status') == 'paused'),
        'errored':      sum(1 for p in pipelines if p.get('status') == 'error'),
        'total_runs':   total_runs,
        'success_rate': round(success/total_runs*100, 1) if total_runs else 0,
    }
