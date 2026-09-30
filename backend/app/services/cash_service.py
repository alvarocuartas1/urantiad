"""Cash registers, openings (sessions), cash movements and closings.

`record_cash_movement` is the only code that adds cash movements; sales reuse it inside
their own transaction, so it never commits. The session row is locked while the
expected cash is checked, so concurrent withdrawals cannot leave it negative. Closing locks
it too, so the expected cash it freezes includes every committed movement and no sale or
movement can enter the session afterwards.
"""

from collections.abc import Sequence
from datetime import datetime
from decimal import Decimal

from sqlalchemy import ColumnElement, Select, case, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.core.errors import AppError, ConflictError, ForbiddenError, NotFoundError
from app.core.permissions import PermissionCode
from app.models import (
    AuditAction,
    CashMovement,
    CashMovementType,
    CashRegister,
    CashSession,
    CashSessionStatus,
    Sale,
    User,
)
from app.schemas.cash import (
    CashMovementCreate,
    CashRegisterCreate,
    CashRegisterUpdate,
    CashSessionClose,
    CashSessionOpen,
    CashSummary,
)
from app.schemas.common import PageParams
from app.services import audit_service
from app.services.query import contains_pattern, filter_date_range, paginate, violated_constraint

REGISTER_NAME_INDEX = "uq_cash_registers_name_lower"
OPEN_REGISTER_INDEX = "uq_cash_sessions_open_register"
OPEN_USER_INDEX = "uq_cash_sessions_open_user"

ZERO = Decimal("0.00")

MANUAL_MOVEMENT_ACTIONS = {
    CashMovementType.INCOME: AuditAction.CASH_SESSION_INCOME,
    CashMovementType.WITHDRAWAL: AuditAction.CASH_SESSION_WITHDRAWAL,
}


def audit_label(session: CashSession) -> str:
    return f"{session.cash_register.name} · apertura #{session.id}"


# --- Errors --------------------------------------------------------------------------


def _name_taken() -> ConflictError:
    return ConflictError("Ya existe una caja con ese nombre.", code="CASH_REGISTER_NAME_TAKEN")


def _register_busy(session: CashSession | None = None) -> ConflictError:
    who = f" por {session.user.full_name}" if session is not None else ""
    return ConflictError(f"La caja ya está abierta{who}.", code="CASH_REGISTER_BUSY")


def _user_has_open_session() -> ConflictError:
    return ConflictError(
        "Ya tiene una caja abierta. Ciérrela antes de abrir otra.", code="USER_HAS_OPEN_SESSION"
    )


def _session_not_found() -> NotFoundError:
    return NotFoundError("La apertura de caja no existe.", code="CASH_SESSION_NOT_FOUND")


# --- Registers -----------------------------------------------------------------------


def _register_query() -> Select[tuple[CashRegister]]:
    return select(CashRegister).options(
        selectinload(CashRegister.open_session).selectinload(CashSession.user)
    )


def list_registers(
    db: Session, params: PageParams, *, search: str | None = None, is_active: bool | None = None
) -> tuple[Sequence[CashRegister], int]:
    stmt = _register_query()
    if search and search.strip():
        stmt = stmt.where(CashRegister.name.ilike(contains_pattern(search.strip())))
    if is_active is not None:
        stmt = stmt.where(CashRegister.is_active == is_active)
    return paginate(db, stmt.order_by(CashRegister.name, CashRegister.id), params)


def get_register(db: Session, register_id: int, *, for_update: bool = False) -> CashRegister:
    stmt = _register_query().where(CashRegister.id == register_id)
    if for_update:
        stmt = stmt.with_for_update(of=CashRegister).execution_options(populate_existing=True)
    register = db.scalar(stmt)
    if register is None:
        raise NotFoundError("La caja no existe.", code="CASH_REGISTER_NOT_FOUND")
    return register


def _commit_register(db: Session) -> None:
    try:
        db.commit()
    except IntegrityError as exc:  # concurrent insert or update with the same name
        db.rollback()
        if violated_constraint(exc) == REGISTER_NAME_INDEX:
            raise _name_taken() from exc
        raise


def create_register(db: Session, data: CashRegisterCreate) -> CashRegister:
    register = CashRegister(name=data.name, description=data.description)
    db.add(register)
    _commit_register(db)
    return get_register(db, register.id)


def update_register(db: Session, register_id: int, data: CashRegisterUpdate) -> CashRegister:
    changes = data.changes()
    # Locked so a concurrent opening cannot slip in while the register is deactivated.
    register = get_register(db, register_id, for_update=changes.get("is_active") is False)
    if changes.get("is_active") is False and register.open_session is not None:
        raise ConflictError(
            "La caja tiene una apertura activa. Ciérrela antes de desactivarla.",
            code="CASH_REGISTER_OPEN",
        )
    for field, value in changes.items():
        setattr(register, field, value)
    _commit_register(db)
    return get_register(db, register.id)


# --- Sessions ------------------------------------------------------------------------


def _session_closed() -> ConflictError:
    return ConflictError("La apertura de caja ya está cerrada.", code="CASH_SESSION_CLOSED")


def _session_query() -> Select[tuple[CashSession]]:
    return select(CashSession).options(
        selectinload(CashSession.cash_register),
        selectinload(CashSession.user),
        selectinload(CashSession.closed_by),
    )


def summaries(db: Session, sessions: Sequence[CashSession]) -> dict[int, CashSummary]:
    """Cash summary of each session, with one grouped query for all of them."""
    if not sessions:
        return {}

    def total_of(movement_type: CashMovementType) -> ColumnElement[Decimal]:
        amount = case((CashMovement.movement_type == movement_type, CashMovement.amount))
        return func.coalesce(func.sum(amount), ZERO)

    types = list(CashMovementType)
    rows = db.execute(
        select(CashMovement.cash_session_id, *(total_of(t) for t in types))
        .where(CashMovement.cash_session_id.in_([s.id for s in sessions]))
        .group_by(CashMovement.cash_session_id)
    ).all()
    totals = {row[0]: dict(zip(types, row[1:], strict=True)) for row in rows}

    result = {}
    for session in sessions:
        by_type = totals.get(session.id, dict.fromkeys(types, ZERO))
        inbound = sum((by_type[t] for t in types if t.is_inbound), ZERO)
        outbound = sum((by_type[t] for t in types if not t.is_inbound), ZERO)
        result[session.id] = CashSummary(
            opening_amount=session.opening_amount,
            total_income=by_type[CashMovementType.INCOME],
            total_withdrawals=by_type[CashMovementType.WITHDRAWAL],
            total_cash_sales=by_type[CashMovementType.SALE],
            total_cash_cancellations=by_type[CashMovementType.SALE_CANCELLATION],
            expected_cash=session.opening_amount + inbound - outbound,
        )
    return result


def summary(db: Session, session: CashSession) -> CashSummary:
    return summaries(db, [session])[session.id]


def _can_supervise(user: User) -> bool:
    return PermissionCode.CASH_SUPERVISE in user.permission_codes


def get_session(
    db: Session, actor: User, session_id: int, *, for_update: bool = False
) -> CashSession:
    """A session visible to `actor`: their own, or any with `cash.supervise` (404 otherwise,
    so other users' sessions are not revealed)."""
    stmt = _session_query().where(CashSession.id == session_id)
    if for_update:
        stmt = stmt.with_for_update(of=CashSession).execution_options(populate_existing=True)
    session = db.scalar(stmt)
    if session is None or (session.user_id != actor.id and not _can_supervise(actor)):
        raise _session_not_found()
    return session


def get_open_session_for_user(
    db: Session, user: User, *, for_update: bool = False
) -> CashSession | None:
    """The user's open session, if any. Sales lock it (`for_update`) in their transaction."""
    stmt = _session_query().where(
        CashSession.user_id == user.id, CashSession.status == CashSessionStatus.OPEN
    )
    if for_update:
        stmt = stmt.with_for_update(of=CashSession).execution_options(populate_existing=True)
    return db.scalar(stmt)


def open_session(db: Session, actor: User, data: CashSessionOpen) -> CashSession:
    # The register lock serializes openings of the same register, so the second one sees
    # the first and gets a clear error; the partial unique indexes are the final guarantee.
    register = db.scalar(
        select(CashRegister)
        .where(CashRegister.id == data.cash_register_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if register is None:
        raise AppError(
            "La caja seleccionada no existe.", code="CASH_REGISTER_NOT_FOUND", status_code=422
        )
    if not register.is_active:
        raise ConflictError("La caja seleccionada está inactiva.", code="CASH_REGISTER_INACTIVE")
    busy = db.scalar(
        _session_query().where(
            CashSession.cash_register_id == register.id,
            CashSession.status == CashSessionStatus.OPEN,
        )
    )
    if busy is not None:
        raise _register_busy(busy)
    if get_open_session_for_user(db, actor) is not None:
        raise _user_has_open_session()

    session = CashSession(
        cash_register=register,
        user=actor,
        opening_amount=data.opening_amount,
        opening_notes=data.opening_notes,
    )
    db.add(session)
    try:
        db.flush()
    except IntegrityError as exc:
        db.rollback()
        constraint = violated_constraint(exc)
        if constraint == OPEN_REGISTER_INDEX:
            raise _register_busy() from exc
        if constraint == OPEN_USER_INDEX:
            raise _user_has_open_session() from exc
        raise
    audit_service.record(
        db,
        actor,
        AuditAction.CASH_SESSION_OPEN,
        session.id,
        audit_label(session),
        new=audit_service.values(
            cash_register=register.name,
            opening_amount=session.opening_amount,
            opening_notes=session.opening_notes,
        ),
    )
    db.commit()
    return get_session(db, actor, session.id)


def list_sessions(
    db: Session,
    actor: User,
    params: PageParams,
    *,
    cash_register_id: int | None = None,
    user_id: int | None = None,
    status: CashSessionStatus | None = None,
    has_difference: bool | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
) -> tuple[Sequence[CashSession], int]:
    """Sessions by opening date, newest first. Without `cash.supervise`, only the actor's."""
    stmt = filter_date_range(_session_query(), CashSession.opened_at, date_from, date_to)
    if not _can_supervise(actor):
        user_id = actor.id
    if user_id is not None:
        stmt = stmt.where(CashSession.user_id == user_id)
    if cash_register_id is not None:
        stmt = stmt.where(CashSession.cash_register_id == cash_register_id)
    if status is not None:
        stmt = stmt.where(CashSession.status == status)
    if has_difference is not None:
        # Open sessions have no difference yet: `difference <> 0` is NULL, never true.
        with_difference = func.coalesce(CashSession.difference != 0, False)
        stmt = stmt.where(with_difference == has_difference)
    stmt = stmt.order_by(CashSession.opened_at.desc(), CashSession.id.desc())
    return paginate(db, stmt, params)


# --- Movements -----------------------------------------------------------------------


def format_money(value: Decimal) -> str:
    """`$150.000,50` (Colombian format) for error messages."""
    text = f"{value:,.2f}".replace(",", "_").replace(".", ",").replace("_", ".")
    return f"${text.removesuffix(',00')}"


def record_cash_movement(
    db: Session,
    session: CashSession,
    movement_type: CashMovementType,
    amount: Decimal,
    user: User,
    concept: str,
    *,
    sale: Sale | None = None,
) -> CashMovement:
    """Record a cash movement in `session`, without committing.

    `session` must be locked by the caller (`for_update=True`) so concurrent movements see
    each other. Outgoing movements cannot exceed the expected cash.
    """
    if session.status != CashSessionStatus.OPEN:
        raise _session_closed()
    if not movement_type.is_inbound:
        available = summary(db, session).expected_cash
        if amount > available:
            raise ConflictError(
                f"Efectivo insuficiente en caja: disponible {format_money(available)}, "
                f"solicitado {format_money(amount)}.",
                code="INSUFFICIENT_CASH",
            )
    movement = CashMovement(
        cash_session_id=session.id,
        movement_type=movement_type,
        amount=amount,
        concept=concept,
        user=user,
        sale=sale,
    )
    db.add(movement)
    return movement


def create_movement(
    db: Session, actor: User, session_id: int, data: CashMovementCreate
) -> CashMovement:
    session = get_session(db, actor, session_id, for_update=True)
    if session.user_id != actor.id:
        raise ForbiddenError(
            "Solo quien abrió la caja puede registrar movimientos en ella.",
            code="CASH_SESSION_NOT_OWNED",
        )
    movement_type = CashMovementType(data.movement_type)
    expected = summary(db, session).expected_cash
    movement = record_cash_movement(db, session, movement_type, data.amount, actor, data.concept)
    sign = 1 if movement_type.is_inbound else -1
    audit_service.record(
        db,
        actor,
        MANUAL_MOVEMENT_ACTIONS[movement_type],
        session.id,
        audit_label(session),
        old=audit_service.values(expected_cash=expected),
        new=audit_service.values(
            amount=data.amount,
            concept=data.concept,
            expected_cash=expected + sign * data.amount,
        ),
    )
    db.commit()
    return movement


def list_movements(
    db: Session, actor: User, session_id: int, params: PageParams
) -> tuple[Sequence[CashMovement], int]:
    """Movements of a visible session, newest first."""
    session = get_session(db, actor, session_id)
    stmt = (
        select(CashMovement)
        .where(CashMovement.cash_session_id == session.id)
        .options(selectinload(CashMovement.user), selectinload(CashMovement.sale))
        .order_by(CashMovement.created_at.desc(), CashMovement.id.desc())
    )
    return paginate(db, stmt, params)


# --- Closing -------------------------------------------------------------------------


def close_session(db: Session, actor: User, session_id: int, data: CashSessionClose) -> CashSession:
    """Close a session with the counted cash: the owner closes their own and a supervisor
    any open one (for a session someone left open). The expected cash is frozen with the
    session locked; a closing is final."""
    session = get_session(db, actor, session_id, for_update=True)
    if session.status != CashSessionStatus.OPEN:
        raise _session_closed()
    expected = summary(db, session).expected_cash
    if data.expected_cash != expected:
        raise ConflictError(
            f"El efectivo esperado cambió a {format_money(expected)}. Revise el conteo.",
            code="CASH_EXPECTED_CHANGED",
        )
    difference = data.counted_cash - expected
    if difference != 0 and data.closing_notes is None:
        raise AppError(
            "Explique en las observaciones el sobrante o faltante.",
            code="CLOSING_NOTES_REQUIRED",
            status_code=422,
        )
    session.status = CashSessionStatus.CLOSED
    session.closed_at = func.now()
    session.closed_by = actor
    session.expected_cash = expected
    session.counted_cash = data.counted_cash
    session.difference = difference
    session.closing_notes = data.closing_notes
    audit_service.record(
        db,
        actor,
        AuditAction.CASH_SESSION_CLOSE,
        session.id,
        audit_label(session),
        old=audit_service.values(status=CashSessionStatus.OPEN),
        new=audit_service.values(
            status=session.status,
            opened_by=session.user.username,
            expected_cash=expected,
            counted_cash=data.counted_cash,
            difference=difference,
            closing_notes=data.closing_notes,
        ),
    )
    db.commit()
    return get_session(db, actor, session.id)
