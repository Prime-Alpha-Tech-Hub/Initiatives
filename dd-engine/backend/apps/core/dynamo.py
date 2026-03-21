"""
DD Engine — DynamoDB data layer.
Replaces Django ORM for all business data.
"""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', '..', '..', 'shared'))

from dynamo.client import (
    put_item, get_item, update_item, delete_item,
    query_table, scan_table, new_id, now_iso, provision_tables,
    to_decimal, from_decimal, table
)
from boto3.dynamodb.conditions import Key, Attr

TABLES = [
    ('dd_documents',  'user_id',    'doc_id',      [
        {'name':'status-index',   'pk':'status',   'sk':'created_at'},
        {'name':'deal-index',     'pk':'deal_id'},
    ]),
    ('dd_analyses',   'doc_id',     'analysis_type',[
        {'name':'status-index',   'pk':'status',   'sk':'created_at'},
    ]),
    ('dd_risk_flags', 'analysis_id','flag_id',      [
        {'name':'severity-index', 'pk':'severity'},
    ]),
    ('dd_financials', 'analysis_id', None,          []),
    ('dd_reports',    'user_id',    'report_id',    [
        {'name':'deal-index',     'pk':'deal_id'},
        {'name':'status-index',   'pk':'status'},
    ]),
]


def setup_tables():
    provision_tables(TABLES)


# ── Documents ─────────────────────────────────────────────────────────────────
def create_document(user_id: str, data: dict) -> dict:
    item = {**data, 'user_id': user_id, 'doc_id': new_id(), 'status': 'uploaded'}
    return put_item('dd_documents', item)


def get_document(user_id: str, doc_id: str) -> dict:
    return get_item('dd_documents', 'user_id', user_id, 'doc_id', doc_id)


def get_document_by_id(doc_id: str) -> dict:
    """Scan when we don't know the user_id (e.g. from analysis)."""
    r = scan_table('dd_documents',
                   filter_expression=Attr('doc_id').eq(doc_id), limit=1)
    return r['items'][0] if r['items'] else None


def list_documents(user_id: str, status: str = None, limit: int = 50) -> list:
    if status:
        r = query_table('dd_documents', 'status', status,
                        index_name='status-index', limit=limit)
        return [i for i in r['items'] if i.get('user_id') == user_id]
    return query_table('dd_documents', 'user_id', user_id,
                       scan_forward=False, limit=limit)['items']


def update_document(user_id: str, doc_id: str, updates: dict) -> dict:
    return update_item('dd_documents',
                       {'user_id': user_id, 'doc_id': doc_id}, updates)


# ── Analyses ──────────────────────────────────────────────────────────────────
def create_analysis(doc_id: str, analysis_type: str) -> dict:
    item = {
        'doc_id': doc_id, 'analysis_type': analysis_type,
        'status': 'pending', 'result': {}, 'tokens_used': 0,
        'model_used': 'claude-sonnet-4-6', 'duration_ms': 0,
    }
    return put_item('dd_analyses', item)


def get_analysis(doc_id: str, analysis_type: str) -> dict:
    return get_item('dd_analyses', 'doc_id', doc_id,
                    'analysis_type', analysis_type)


def get_analyses_for_doc(doc_id: str) -> list:
    analyses = query_table('dd_analyses', 'doc_id', doc_id)['items']
    for a in analyses:
        a['risk_flags'] = get_risk_flags(a.get('analysis_id', f"{doc_id}#{a['analysis_type']}"))
    return analyses


def update_analysis(doc_id: str, analysis_type: str, updates: dict) -> dict:
    return update_item('dd_analyses',
                       {'doc_id': doc_id, 'analysis_type': analysis_type}, updates)


# ── Risk flags ────────────────────────────────────────────────────────────────
def save_risk_flags(doc_id: str, analysis_type: str, flags: list) -> list:
    analysis_id = f"{doc_id}#{analysis_type}"
    saved = []
    for f in flags:
        if not isinstance(f, dict):
            continue
        item = {
            **f,
            'analysis_id': analysis_id,
            'flag_id':     new_id(),
        }
        saved.append(put_item('dd_risk_flags', item))
    return saved


def get_risk_flags(analysis_id: str) -> list:
    return query_table('dd_risk_flags', 'analysis_id', analysis_id)['items']


# ── Extracted financials ──────────────────────────────────────────────────────
def save_financials(doc_id: str, analysis_type: str, fin_data: dict) -> dict:
    analysis_id = f"{doc_id}#{analysis_type}"
    item = {**fin_data, 'analysis_id': analysis_id}
    return put_item('dd_financials', item)


def get_financials(doc_id: str, analysis_type: str) -> dict:
    analysis_id = f"{doc_id}#{analysis_type}"
    return get_item('dd_financials', 'analysis_id', analysis_id)


# ── Reports ───────────────────────────────────────────────────────────────────
def create_report(user_id: str, data: dict) -> dict:
    item = {**data, 'user_id': user_id, 'report_id': new_id(),
            'status': 'draft', 'doc_ids': []}
    return put_item('dd_reports', item)


def get_report(user_id: str, report_id: str) -> dict:
    return get_item('dd_reports', 'user_id', user_id, 'report_id', report_id)


def list_reports(user_id: str) -> list:
    return query_table('dd_reports', 'user_id', user_id,
                       scan_forward=False)['items']


def update_report(user_id: str, report_id: str, updates: dict) -> dict:
    return update_item('dd_reports',
                       {'user_id': user_id, 'report_id': report_id}, updates)


def compile_report(user_id: str, report_id: str) -> dict:
    """Aggregate all document analyses into a single report."""
    report = get_report(user_id, report_id)
    if not report:
        return None

    all_risks   = []
    all_gaps    = []
    all_steps   = []
    max_score   = 0

    for doc_id in report.get('doc_ids', []):
        analyses = query_table('dd_analyses', 'doc_id', doc_id)['items']
        for a in analyses:
            if a.get('status') != 'complete':
                continue
            result = a.get('result', {})
            analysis_id = f"{doc_id}#{a['analysis_type']}"
            flags = get_risk_flags(analysis_id)
            all_risks.extend([{**f, 'source_doc': doc_id} for f in flags])

            if a['analysis_type'] in ('risk', 'full'):
                rd = result.get('risk', result)
                score = rd.get('overall_risk_score', 0)
                if isinstance(score, (int, float)) and score > max_score:
                    max_score = int(score)
                all_gaps.extend(rd.get('diligence_gaps', []))
                all_steps.extend(rd.get('next_steps', []))

    sev_order = {'critical':0,'high':1,'medium':2,'low':3,'info':4}
    all_risks.sort(key=lambda r: sev_order.get(r.get('severity',''), 5))

    rec = ('do_not_proceed' if max_score >= 8 else
           'further_diligence_required' if max_score >= 6 else
           'proceed_with_caution' if max_score >= 4 else 'proceed')

    return update_report(user_id, report_id, {
        'consolidated_risks': all_risks,
        'diligence_gaps':     list(set(all_gaps)),
        'next_steps':         list(set(all_steps)),
        'overall_risk_score': max_score or None,
        'recommendation':     rec,
        'status':             'complete',
    })
