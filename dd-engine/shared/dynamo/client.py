"""
Shared DynamoDB client layer — used by AlphaCore, DD Engine and AutoOps.

Wraps boto3 with:
- Consistent table naming (prefix from env)
- Automatic ID generation (UUID)
- Automatic timestamps (created_at, updated_at)
- Pagination helpers
- GSI query helpers
- Table provisioning (create if not exists)

All three apps import from this module.
IAM role on EC2 handles auth — no hardcoded credentials.
"""
import boto3
import uuid
import os
from datetime import datetime, timezone
from decimal import Decimal
from typing import Optional, Any
from decouple import config


# ── Client singleton ──────────────────────────────────────────────────────────
_client = None
_resource = None


def get_client():
    global _client
    if _client is None:
        kwargs = dict(region_name=config('AWS_REGION', default='eu-west-2'))
        # Allow local override for testing
        endpoint = config('DYNAMODB_ENDPOINT', default='')
        if endpoint:
            kwargs['endpoint_url'] = endpoint
        _client = boto3.client('dynamodb', **kwargs)
    return _client


def get_resource():
    global _resource
    if _resource is None:
        kwargs = dict(region_name=config('AWS_REGION', default='eu-west-2'))
        endpoint = config('DYNAMODB_ENDPOINT', default='')
        if endpoint:
            kwargs['endpoint_url'] = endpoint
        _resource = boto3.resource('dynamodb', **kwargs)
    return _resource


def table(name: str):
    """Get a DynamoDB Table resource. Prefix from TABLE_PREFIX env var."""
    prefix = config('TABLE_PREFIX', default='')
    return get_resource().Table(f"{prefix}{name}")


# ── ID + timestamp helpers ─────────────────────────────────────────────────────
def new_id() -> str:
    return str(uuid.uuid4())


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# ── Type coercion ─────────────────────────────────────────────────────────────
def to_decimal(value) -> Optional[Decimal]:
    """Convert float/int/str to Decimal for DynamoDB storage."""
    if value is None:
        return None
    try:
        return Decimal(str(value))
    except Exception:
        return None


def from_decimal(value) -> Optional[float]:
    """Convert Decimal back to float for API responses."""
    if isinstance(value, Decimal):
        return float(value)
    return value


def clean_item(item: dict) -> dict:
    """
    Recursively convert floats to Decimal (DynamoDB requirement)
    and remove None values (DynamoDB doesn't store nulls well).
    """
    cleaned = {}
    for k, v in item.items():
        if v is None:
            continue
        elif isinstance(v, float):
            cleaned[k] = Decimal(str(v))
        elif isinstance(v, dict):
            cleaned[k] = clean_item(v)
        elif isinstance(v, list):
            cleaned[k] = [clean_item(i) if isinstance(i, dict) else i for i in v]
        else:
            cleaned[k] = v
    return cleaned


def restore_item(item: dict) -> dict:
    """Convert Decimal back to float in a DynamoDB response item."""
    restored = {}
    for k, v in item.items():
        if isinstance(v, Decimal):
            restored[k] = float(v)
        elif isinstance(v, dict):
            restored[k] = restore_item(v)
        elif isinstance(v, list):
            restored[k] = [restore_item(i) if isinstance(i, dict) else i for i in v]
        else:
            restored[k] = v
    return restored


# ── CRUD helpers ──────────────────────────────────────────────────────────────
def put_item(table_name: str, item: dict, add_timestamps: bool = True) -> dict:
    """
    Write an item to DynamoDB.
    Adds created_at/updated_at if not present.
    Returns the item as stored.
    """
    if add_timestamps:
        ts = now_iso()
        item.setdefault('created_at', ts)
        item['updated_at'] = ts
    item = clean_item(item)
    table(table_name).put_item(Item=item)
    return restore_item(item)


def get_item(table_name: str, pk_name: str, pk_val: str,
             sk_name: str = None, sk_val: str = None) -> Optional[dict]:
    """Get a single item by primary key."""
    key = {pk_name: pk_val}
    if sk_name and sk_val:
        key[sk_name] = sk_val
    resp = table(table_name).get_item(Key=key)
    item = resp.get('Item')
    return restore_item(item) if item else None


def update_item(table_name: str, key: dict, updates: dict) -> dict:
    """
    Update specific fields on an existing item.
    Automatically updates updated_at.
    """
    updates['updated_at'] = now_iso()
    updates = clean_item(updates)

    expr_parts = []
    expr_names  = {}
    expr_values = {}

    for i, (k, v) in enumerate(updates.items()):
        safe_key = f"#f{i}"
        val_key  = f":v{i}"
        expr_parts.append(f"{safe_key} = {val_key}")
        expr_names[safe_key]  = k
        expr_values[val_key]  = v

    resp = table(table_name).update_item(
        Key=key,
        UpdateExpression='SET ' + ', '.join(expr_parts),
        ExpressionAttributeNames=expr_names,
        ExpressionAttributeValues=expr_values,
        ReturnValues='ALL_NEW',
    )
    return restore_item(resp.get('Attributes', {}))


def delete_item(table_name: str, key: dict) -> bool:
    """Delete an item. Returns True."""
    table(table_name).delete_item(Key=key)
    return True


def query_table(table_name: str, pk_name: str, pk_val: str,
                sk_name: str = None, sk_prefix: str = None,
                index_name: str = None,
                filter_expression=None,
                limit: int = None,
                last_key: dict = None,
                scan_forward: bool = False) -> dict:
    """
    Query a table or GSI.
    Returns {'items': [...], 'last_key': ...}
    """
    from boto3.dynamodb.conditions import Key, Attr

    key_cond = Key(pk_name).eq(pk_val)
    if sk_name and sk_prefix:
        key_cond = key_cond & Key(sk_name).begins_with(sk_prefix)

    kwargs = dict(
        KeyConditionExpression=key_cond,
        ScanIndexForward=scan_forward,
    )
    if index_name:
        kwargs['IndexName'] = index_name
    if filter_expression is not None:
        kwargs['FilterExpression'] = filter_expression
    if limit:
        kwargs['Limit'] = limit
    if last_key:
        kwargs['ExclusiveStartKey'] = last_key

    resp = table(table_name).query(**kwargs)
    return {
        'items':    [restore_item(i) for i in resp.get('Items', [])],
        'last_key': resp.get('LastEvaluatedKey'),
        'count':    resp.get('Count', 0),
    }


def scan_table(table_name: str,
               filter_expression=None,
               limit: int = None,
               last_key: dict = None) -> dict:
    """Full table scan — use sparingly, only when no suitable key/GSI exists."""
    kwargs = {}
    if filter_expression is not None:
        kwargs['FilterExpression'] = filter_expression
    if limit:
        kwargs['Limit'] = limit
    if last_key:
        kwargs['ExclusiveStartKey'] = last_key

    resp = table(table_name).scan(**kwargs)
    return {
        'items':    [restore_item(i) for i in resp.get('Items', [])],
        'last_key': resp.get('LastEvaluatedKey'),
        'count':    resp.get('Count', 0),
    }


# ── Table provisioning ────────────────────────────────────────────────────────
def ensure_table(name: str, pk: str, sk: str = None,
                 gsis: list = None, billing: str = 'PAY_PER_REQUEST'):
    """
    Create a DynamoDB table if it doesn't exist.
    Called at app startup — idempotent.

    gsis: list of dicts:
      {'name': 'status-index', 'pk': 'status', 'sk': 'created_at'}
    """
    prefix   = config('TABLE_PREFIX', default='')
    fullname = f"{prefix}{name}"
    client   = get_client()

    try:
        client.describe_table(TableName=fullname)
        return  # already exists
    except client.exceptions.ResourceNotFoundException:
        pass

    key_schema    = [{'AttributeName': pk, 'KeyType': 'HASH'}]
    attr_defs     = [{'AttributeName': pk, 'AttributeType': 'S'}]
    attr_names    = {pk}

    if sk:
        key_schema.append({'AttributeName': sk, 'KeyType': 'RANGE'})
        attr_defs.append({'AttributeName': sk, 'AttributeType': 'S'})
        attr_names.add(sk)

    gsi_specs = []
    if gsis:
        for g in gsis:
            gsi_ks = [{'AttributeName': g['pk'], 'KeyType': 'HASH'}]
            if g.get('pk') not in attr_names:
                attr_defs.append({'AttributeName': g['pk'], 'AttributeType': 'S'})
                attr_names.add(g['pk'])
            if g.get('sk'):
                gsi_ks.append({'AttributeName': g['sk'], 'KeyType': 'RANGE'})
                if g['sk'] not in attr_names:
                    attr_defs.append({'AttributeName': g['sk'], 'AttributeType': 'S'})
                    attr_names.add(g['sk'])
            gsi_specs.append({
                'IndexName': g['name'],
                'KeySchema': gsi_ks,
                'Projection': {'ProjectionType': 'ALL'},
            })

    kwargs = dict(
        TableName=fullname,
        KeySchema=key_schema,
        AttributeDefinitions=attr_defs,
        BillingMode=billing,
    )
    if gsi_specs:
        kwargs['GlobalSecondaryIndexes'] = gsi_specs

    client.create_table(**kwargs)
    # Wait until active
    waiter = client.get_waiter('table_exists')
    waiter.wait(TableName=fullname)


def provision_tables(table_specs: list):
    """
    Provision all tables for an app at startup.
    table_specs: list of (name, pk, sk, gsis) tuples.
    """
    import logging
    logger = logging.getLogger(__name__)
    for spec in table_specs:
        name = spec[0]
        pk   = spec[1]
        sk   = spec[2] if len(spec) > 2 else None
        gsis = spec[3] if len(spec) > 3 else None
        try:
            ensure_table(name, pk, sk, gsis)
            logger.info(f"DynamoDB table ready: {name}")
        except Exception as e:
            logger.error(f"DynamoDB table error ({name}): {e}")
