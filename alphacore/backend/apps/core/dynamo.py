"""
AlphaCore — DynamoDB data layer.
Replaces Django ORM for all business data.
Django SQLite is kept only for auth users + sessions.
"""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', '..', '..', 'shared'))

from dynamo.client import (
    put_item, get_item, update_item, delete_item,
    query_table, scan_table, new_id, now_iso, provision_tables,
    to_decimal, from_decimal, table
)
from boto3.dynamodb.conditions import Key, Attr

# ── Table definitions ─────────────────────────────────────────────────────────
TABLES = [
    ('ac_companies',    'company_id', None,       [{'name':'slug-index','pk':'slug'}]),
    ('ac_roles',        'company_id', 'role_id',  []),
    ('ac_memberships',  'user_id',    'company_id',[{'name':'company-index','pk':'company_id','sk':'status'}]),
    ('ac_join_requests','company_id', 'request_id',[{'name':'user-index','pk':'user_id','sk':'status'}]),
    ('ac_profiles',     'user_id',    None,        []),
    ('ac_deals',        'company_id', 'deal_id',   [
        {'name':'strategy-index','pk':'company_id','sk':'strategy'},
        {'name':'stage-index','pk':'company_id','sk':'stage'},
    ]),
    ('ac_deal_notes',   'deal_id',    'note_id',   []),
    ('ac_stage_history','deal_id',    'changed_at',[]),
    ('ac_dd_checklists','deal_id',    None,        []),
    ('ac_dd_items',     'checklist_id','item_id',  [{'name':'status-index','pk':'checklist_id','sk':'status'}]),
    ('ac_dd_findings',  'checklist_id','finding_id',[]),
    ('ac_ic_memos',     'company_id', 'memo_id',   [
        {'name':'deal-index','pk':'deal_id'},
        {'name':'status-index','pk':'company_id','sk':'status'},
    ]),
    ('ac_ic_votes',     'memo_id',    'member_id', []),
    ('ac_ic_comments',  'memo_id',    'comment_id',[]),
    ('ac_positions',    'company_id', 'position_id',[{'name':'deal-index','pk':'deal_id'}]),
    ('ac_snapshots',    'position_id','period_end', []),
    ('ac_kpi_alerts',   'company_id', 'alert_id',  [{'name':'status-index','pk':'company_id','sk':'status'}]),
    ('ac_documents',    'company_id', 'doc_id',    [
        {'name':'deal-index','pk':'deal_id'},
        {'name':'category-index','pk':'company_id','sk':'category'},
    ]),
    ('ac_activity_log', 'company_id', 'log_id',    []),
]


def setup_tables():
    """Call once at startup to ensure all tables exist."""
    provision_tables(TABLES)


# ── Companies ─────────────────────────────────────────────────────────────────
def create_company(data: dict) -> dict:
    item = {**data, 'company_id': new_id()}
    return put_item('ac_companies', item)


def get_company(company_id: str) -> dict:
    return get_item('ac_companies', 'company_id', company_id)


def get_company_by_slug(slug: str) -> dict:
    r = query_table('ac_companies', 'slug', slug, index_name='slug-index')
    return r['items'][0] if r['items'] else None


def list_companies(limit=50) -> list:
    return scan_table('ac_companies', limit=limit)['items']


def update_company(company_id: str, updates: dict) -> dict:
    return update_item('ac_companies', {'company_id': company_id}, updates)


# ── Roles ─────────────────────────────────────────────────────────────────────
BUILTIN_ROLES = [
    {'name':'owner',   'label':'Owner',             'order':1, 'is_builtin':True,
     'can_manage_company':True,'can_manage_members':True,'can_manage_roles':True,
     'can_create_deals':True,'can_edit_deals':True,'can_delete_deals':True,
     'can_edit_dd':True,'can_create_memos':True,'can_vote_ic':True,'can_decide_ic':True,
     'can_edit_portfolio':True,'can_upload_documents':True,'can_delete_documents':True},
    {'name':'admin',   'label':'Admin',             'order':2, 'is_builtin':True,
     'can_manage_company':True,'can_manage_members':True,
     'can_create_deals':True,'can_edit_deals':True,'can_delete_deals':True,
     'can_edit_dd':True,'can_create_memos':True,'can_vote_ic':True,'can_decide_ic':True,
     'can_edit_portfolio':True,'can_upload_documents':True,'can_delete_documents':True},
    {'name':'pm',      'label':'Portfolio Manager', 'order':3, 'is_builtin':True,
     'can_create_deals':True,'can_edit_deals':True,'can_edit_dd':True,
     'can_create_memos':True,'can_vote_ic':True,'can_edit_portfolio':True,'can_upload_documents':True},
    {'name':'analyst', 'label':'Analyst',           'order':4, 'is_builtin':True,
     'can_create_deals':True,'can_edit_deals':True,'can_edit_dd':True,
     'can_create_memos':True,'can_upload_documents':True},
    {'name':'viewer',  'label':'Viewer (Read-only)','order':5, 'is_builtin':True},
]

PERM_FLAGS = [
    'can_manage_company','can_manage_members','can_manage_roles',
    'can_view_deals','can_create_deals','can_edit_deals','can_delete_deals',
    'can_view_dd','can_edit_dd','can_create_memos','can_vote_ic','can_decide_ic',
    'can_view_portfolio','can_edit_portfolio','can_view_documents',
    'can_upload_documents','can_delete_documents',
]


def create_default_roles(company_id: str) -> list:
    roles = []
    for r in BUILTIN_ROLES:
        item = {**r, 'company_id': company_id, 'role_id': new_id()}
        # Default all unset perms to False
        for flag in PERM_FLAGS:
            item.setdefault(flag, False)
        put_item('ac_roles', item)
        roles.append(item)
    return roles


def get_roles(company_id: str) -> list:
    return query_table('ac_roles', 'company_id', company_id)['items']


def get_role_by_name(company_id: str, name: str) -> dict:
    roles = get_roles(company_id)
    return next((r for r in roles if r['name'] == name), None)


def create_role(company_id: str, data: dict) -> dict:
    item = {**data, 'company_id': company_id, 'role_id': new_id(), 'is_custom': True}
    for flag in PERM_FLAGS:
        item.setdefault(flag, False)
    return put_item('ac_roles', item)


def update_role(company_id: str, role_id: str, updates: dict) -> dict:
    return update_item('ac_roles', {'company_id': company_id, 'role_id': role_id}, updates)


# ── Memberships ───────────────────────────────────────────────────────────────
def create_membership(user_id: str, company_id: str, role: dict,
                      invited_by: str = None) -> dict:
    item = {
        'user_id': user_id, 'company_id': company_id,
        'role_id': role['role_id'], 'role_name': role['name'],
        'role_label': role['label'], 'status': 'active',
        'can_approve_members': role['name'] == 'owner',
        'permissions': {f: role.get(f, False) for f in PERM_FLAGS},
    }
    if invited_by:
        item['invited_by'] = invited_by
    return put_item('ac_memberships', item)


def get_membership(user_id: str, company_id: str) -> dict:
    return get_item('ac_memberships', 'user_id', user_id, 'company_id', company_id)


def get_company_members(company_id: str) -> list:
    return query_table('ac_memberships', 'company_id', company_id,
                       index_name='company-index',
                       filter_expression=Attr('status').eq('active'))['items']


def update_membership(user_id: str, company_id: str, updates: dict) -> dict:
    return update_item('ac_memberships',
                       {'user_id': user_id, 'company_id': company_id}, updates)


# ── User profiles ─────────────────────────────────────────────────────────────
def get_or_create_profile(user_id: str) -> dict:
    existing = get_item('ac_profiles', 'user_id', user_id)
    if existing:
        return existing
    item = {'user_id': user_id, 'onboarding_done': False, 'auth_provider': 'email'}
    return put_item('ac_profiles', item)


def update_profile(user_id: str, updates: dict) -> dict:
    return update_item('ac_profiles', {'user_id': user_id}, updates)


# ── Join requests ─────────────────────────────────────────────────────────────
def create_join_request(user_id: str, company_id: str, message: str = '') -> dict:
    item = {
        'company_id': company_id, 'request_id': new_id(),
        'user_id': user_id, 'message': message, 'status': 'pending',
    }
    return put_item('ac_join_requests', item)


def get_pending_requests(company_id: str) -> list:
    return query_table('ac_join_requests', 'company_id', company_id,
                       filter_expression=Attr('status').eq('pending'))['items']


def get_user_request(user_id: str, company_id: str) -> dict:
    r = query_table('ac_join_requests', 'user_id', user_id,
                    index_name='user-index',
                    filter_expression=Attr('company_id').eq(company_id))
    return r['items'][0] if r['items'] else None


def update_join_request(company_id: str, request_id: str, updates: dict) -> dict:
    return update_item('ac_join_requests',
                       {'company_id': company_id, 'request_id': request_id}, updates)


# ── Deals ─────────────────────────────────────────────────────────────────────
def create_deal(company_id: str, data: dict, created_by: str) -> dict:
    item = {**data, 'company_id': company_id,
            'deal_id': new_id(), 'created_by': created_by}
    return put_item('ac_deals', item)


def get_deal(company_id: str, deal_id: str) -> dict:
    return get_item('ac_deals', 'company_id', company_id, 'deal_id', deal_id)


def list_deals(company_id: str, strategy: str = None, stage: str = None,
               limit: int = 100) -> list:
    if strategy:
        r = query_table('ac_deals', 'company_id', company_id,
                        sk_name='strategy', sk_prefix=strategy,
                        index_name='strategy-index', limit=limit)
    elif stage:
        r = query_table('ac_deals', 'company_id', company_id,
                        sk_name='stage', sk_prefix=stage,
                        index_name='stage-index', limit=limit)
    else:
        r = query_table('ac_deals', 'company_id', company_id, limit=limit)
    return r['items']


def update_deal(company_id: str, deal_id: str, updates: dict) -> dict:
    return update_item('ac_deals', {'company_id': company_id, 'deal_id': deal_id}, updates)


def advance_stage(company_id: str, deal_id: str,
                  new_stage: str, changed_by: str, note: str = '') -> dict:
    deal = get_deal(company_id, deal_id)
    old_stage = deal.get('stage', '')
    # Log stage history
    put_item('ac_stage_history', {
        'deal_id': deal_id, 'changed_at': now_iso(),
        'from_stage': old_stage, 'to_stage': new_stage,
        'changed_by': changed_by, 'note': note,
    }, add_timestamps=False)
    return update_deal(company_id, deal_id, {'stage': new_stage})


def add_deal_note(deal_id: str, author_id: str, content: str,
                  is_private: bool = False) -> dict:
    item = {
        'deal_id': deal_id, 'note_id': new_id(),
        'author_id': author_id, 'content': content, 'is_private': is_private,
    }
    return put_item('ac_deal_notes', item)


def get_deal_notes(deal_id: str) -> list:
    return query_table('ac_deal_notes', 'deal_id', deal_id,
                       scan_forward=False)['items']


def get_pipeline_summary(company_id: str) -> list:
    """Aggregate deal counts per strategy+stage."""
    deals = list_deals(company_id, limit=500)
    summary = {}
    for d in deals:
        key = (d.get('strategy',''), d.get('stage',''))
        if key not in summary:
            summary[key] = {'strategy': key[0], 'stage': key[1], 'count': 0}
        summary[key]['count'] += 1
    return list(summary.values())


# ── Due Diligence ─────────────────────────────────────────────────────────────
DD_TEMPLATES = {
    'pe': [
        ('financial','Audited financial statements (3 years)','high'),
        ('financial','Management accounts (YTD)','high'),
        ('legal','Corporate structure and cap table','high'),
        ('legal','Material contracts review','high'),
        ('commercial','Market sizing and competitive analysis','high'),
        ('operational','Management team background checks','high'),
    ],
    'private_credit': [
        ('financial','Borrower financial statements','high'),
        ('financial','Cash flow and debt service coverage','high'),
        ('legal','Security documentation','high'),
        ('operational','KYC / AML checks','high'),
    ],
    'commodities': [
        ('commercial','Commodity specification and quality','high'),
        ('commercial','Counterparty credit assessment','high'),
        ('legal','Trade contract review','high'),
    ],
    'real_estate': [
        ('financial','Valuation report (independent)','high'),
        ('legal','Title search and ownership verification','high'),
        ('technical','Building inspection report','high'),
    ],
}


def create_checklist_for_deal(deal_id: str, strategy: str) -> dict:
    checklist = {'deal_id': deal_id, 'checklist_id': deal_id}
    put_item('ac_dd_checklists', checklist)
    template = DD_TEMPLATES.get(strategy, [])
    for i, (cat, title, priority) in enumerate(template):
        put_item('ac_dd_items', {
            'checklist_id': deal_id, 'item_id': new_id(),
            'category': cat, 'title': title,
            'priority': priority, 'status': 'pending', 'order': str(i),
        })
    return checklist


def get_checklist(deal_id: str) -> dict:
    checklist = get_item('ac_dd_checklists', 'deal_id', deal_id)
    if not checklist:
        return None
    checklist['items']    = query_table('ac_dd_items', 'checklist_id', deal_id)['items']
    checklist['findings'] = query_table('ac_dd_findings', 'checklist_id', deal_id)['items']
    total    = len(checklist['items'])
    complete = sum(1 for i in checklist['items'] if i.get('status') == 'complete')
    checklist['completion_pct'] = round(complete/total*100) if total else 0
    return checklist


def update_dd_item(checklist_id: str, item_id: str, updates: dict) -> dict:
    return update_item('ac_dd_items',
                       {'checklist_id': checklist_id, 'item_id': item_id}, updates)


def add_finding(checklist_id: str, data: dict, created_by: str) -> dict:
    item = {**data, 'checklist_id': checklist_id,
            'finding_id': new_id(), 'created_by': created_by}
    return put_item('ac_dd_findings', item)


# ── IC Committee ──────────────────────────────────────────────────────────────
def create_memo(company_id: str, data: dict, prepared_by: str) -> dict:
    item = {**data, 'company_id': company_id,
            'memo_id': new_id(), 'prepared_by': prepared_by, 'status': 'draft'}
    return put_item('ac_ic_memos', item)


def get_memo(company_id: str, memo_id: str) -> dict:
    memo = get_item('ac_ic_memos', 'company_id', company_id, 'memo_id', memo_id)
    if not memo:
        return None
    memo['votes']    = query_table('ac_ic_votes', 'memo_id', memo_id)['items']
    memo['comments'] = query_table('ac_ic_comments', 'memo_id', memo_id,
                                   scan_forward=True)['items']
    votes = memo['votes']
    memo['vote_summary'] = {
        'approve': sum(1 for v in votes if v.get('vote') == 'approve'),
        'reject':  sum(1 for v in votes if v.get('vote') == 'reject'),
        'abstain': sum(1 for v in votes if v.get('vote') == 'abstain'),
        'pending': sum(1 for v in votes if v.get('vote') == 'pending'),
        'total':   len(votes),
    }
    return memo


def list_memos(company_id: str, status: str = None) -> list:
    if status:
        r = query_table('ac_ic_memos', 'company_id', company_id,
                        sk_name='status', sk_prefix=status,
                        index_name='status-index')
    else:
        r = query_table('ac_ic_memos', 'company_id', company_id)
    return r['items']


def cast_vote(memo_id: str, member_id: str, vote: str,
              rationale: str = '', conditions: str = '') -> dict:
    item = {
        'memo_id': memo_id, 'member_id': member_id,
        'vote': vote, 'rationale': rationale,
        'conditions': conditions, 'voted_at': now_iso(),
    }
    return put_item('ac_ic_votes', item, add_timestamps=False)


def update_memo(company_id: str, memo_id: str, updates: dict) -> dict:
    return update_item('ac_ic_memos',
                       {'company_id': company_id, 'memo_id': memo_id}, updates)


# ── Portfolio ─────────────────────────────────────────────────────────────────
def create_position(company_id: str, data: dict) -> dict:
    item = {**data, 'company_id': company_id, 'position_id': new_id()}
    return put_item('ac_positions', item)


def list_positions(company_id: str, active_only: bool = True) -> list:
    items = query_table('ac_positions', 'company_id', company_id)['items']
    if active_only:
        items = [i for i in items if i.get('is_active', True)]
    return items


def get_position(company_id: str, position_id: str) -> dict:
    pos = get_item('ac_positions', 'company_id', company_id,
                   'position_id', position_id)
    if pos:
        pos['snapshots'] = query_table('ac_snapshots', 'position_id',
                                       position_id, scan_forward=False)['items']
        pos['alerts']    = query_table('ac_kpi_alerts', 'company_id', company_id,
                                       filter_expression=Attr('position_id').eq(position_id))['items']
    return pos


def add_snapshot(company_id: str, position_id: str, data: dict) -> dict:
    item = {**data, 'position_id': position_id}
    snapshot = put_item('ac_snapshots', item)
    update_item('ac_positions',
                {'company_id': company_id, 'position_id': position_id},
                {'current_value': data.get('nav')})
    return snapshot


def portfolio_summary(company_id: str) -> dict:
    positions = list_positions(company_id)
    total_invested = sum(float(p.get('entry_value', 0)) for p in positions)
    total_current  = sum(float(p.get('current_value', 0)) for p in positions)
    by_strategy = {}
    for p in positions:
        s = p.get('strategy', 'other')
        if s not in by_strategy:
            by_strategy[s] = {'count': 0, 'invested': 0.0, 'current': 0.0}
        by_strategy[s]['count']    += 1
        by_strategy[s]['invested'] += float(p.get('entry_value', 0))
        by_strategy[s]['current']  += float(p.get('current_value', 0))
    open_alerts = query_table('ac_kpi_alerts', 'company_id', company_id,
                              sk_name='status', sk_prefix='open',
                              index_name='status-index')['count']
    return {
        'total_positions': len(positions),
        'total_invested':  total_invested,
        'total_current':   total_current,
        'total_gain':      total_current - total_invested,
        'total_return_pct': round((total_current - total_invested) / total_invested * 100, 2)
                            if total_invested else 0,
        'by_strategy':     by_strategy,
        'open_alerts':     open_alerts,
    }


# ── Documents ─────────────────────────────────────────────────────────────────
def create_document(company_id: str, data: dict, uploaded_by: str) -> dict:
    item = {**data, 'company_id': company_id,
            'doc_id': new_id(), 'uploaded_by': uploaded_by,
            'version': 1, 'is_active': True}
    return put_item('ac_documents', item)


def list_documents(company_id: str, category: str = None,
                   deal_id: str = None, limit: int = 100) -> list:
    if deal_id:
        return query_table('ac_documents', 'deal_id', deal_id,
                           index_name='deal-index', limit=limit)['items']
    if category:
        return query_table('ac_documents', 'company_id', company_id,
                           sk_name='category', sk_prefix=category,
                           index_name='category-index', limit=limit)['items']
    return query_table('ac_documents', 'company_id', company_id,
                       limit=limit)['items']


# ── Activity log ──────────────────────────────────────────────────────────────
def log_activity(company_id: str, user_id: str, action: str,
                 entity: str = '', entity_id: str = '', detail: str = ''):
    put_item('ac_activity_log', {
        'company_id': company_id, 'log_id': new_id(),
        'user_id': user_id, 'action': action,
        'entity': entity, 'entity_id': entity_id, 'detail': detail,
    })


def get_activity_log(company_id: str, limit: int = 50) -> list:
    return query_table('ac_activity_log', 'company_id', company_id,
                       scan_forward=False, limit=limit)['items']
