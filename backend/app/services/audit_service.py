"""Audit log: who changed what and when, with the values before and after.

The services call `record` inside their own transaction and before committing, so the
record and the change are saved or rolled back together. Nothing here commits.
"""

from collections.abc import Iterable, Sequence
from datetime import datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models import AuditAction, AuditEntity, AuditLog, User
from app.schemas.common import PageParams
from app.services.query import contains_pattern, filter_date_range, paginate

CENT = Decimal("0.01")

type Values = dict[str, Any]


def json_value(value: object) -> object:
    # Every decimal in the system has two places; a fixed format keeps "1500" and
    # "1500.00" from looking like a change.
    if isinstance(value, Decimal):
        return str(value.quantize(CENT))
    if isinstance(value, datetime):
        return value.isoformat()
    return value


def snapshot(obj: object, fields: Iterable[str]) -> Values:
    """JSON-ready values of `fields` of `obj`."""
    return {field: json_value(getattr(obj, field)) for field in fields}


def values(**fields: object) -> Values:
    """JSON-ready dict of the given values."""
    return {field: json_value(value) for field, value in fields.items()}


def changes(before: Values, after: Values) -> tuple[Values, Values]:
    """The fields whose value differs, as `(old, new)`."""
    changed = [field for field in after if before.get(field) != after[field]]
    return {f: before.get(f) for f in changed}, {f: after[f] for f in changed}


def record(
    db: Session,
    actor: User | None,
    action: AuditAction,
    entity_id: int,
    entity_label: str,
    *,
    old: Values | None = None,
    new: Values | None = None,
) -> AuditLog:
    """Add an audit record to the current transaction (without committing)."""
    log = AuditLog(
        user_id=actor.id if actor is not None else None,
        action=action,
        entity_type=action.entity_type,
        entity_id=entity_id,
        entity_label=entity_label[:200],
        old_values=old or None,
        new_values=new or None,
    )
    db.add(log)
    return log


def record_changes(
    db: Session,
    actor: User | None,
    action: AuditAction,
    entity_id: int,
    entity_label: str,
    before: Values,
    after: Values,
) -> AuditLog | None:
    """Record only the fields that changed; nothing when no field did."""
    old, new = changes(before, after)
    if not new:
        return None
    return record(db, actor, action, entity_id, entity_label, old=old, new=new)


def list_logs(
    db: Session,
    params: PageParams,
    *,
    entity_type: AuditEntity | None = None,
    entity_id: int | None = None,
    action: AuditAction | None = None,
    user_id: int | None = None,
    search: str | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
) -> tuple[Sequence[AuditLog], int]:
    """Audit records, newest first."""
    stmt = filter_date_range(select(AuditLog), AuditLog.created_at, date_from, date_to)
    if entity_type is not None:
        stmt = stmt.where(AuditLog.entity_type == entity_type)
    if entity_id is not None:
        stmt = stmt.where(AuditLog.entity_id == entity_id)
    if action is not None:
        stmt = stmt.where(AuditLog.action == action)
    if user_id is not None:
        stmt = stmt.where(AuditLog.user_id == user_id)
    if search and search.strip():
        stmt = stmt.where(AuditLog.entity_label.ilike(contains_pattern(search.strip())))
    stmt = stmt.options(selectinload(AuditLog.user)).order_by(
        AuditLog.created_at.desc(), AuditLog.id.desc()
    )
    return paginate(db, stmt, params)
