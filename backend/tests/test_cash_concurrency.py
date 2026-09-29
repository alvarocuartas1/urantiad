"""Concurrency of cash openings and withdrawals, with two real sessions and committed data.

The per-test rollback fixtures share one connection, so they cannot show row locking.
These tests commit their own rows and delete them afterwards.
"""

import threading
from collections.abc import Iterator
from decimal import Decimal

import pytest
from sqlalchemy import delete, select

from app.core.database import SessionLocal
from app.core.errors import AppError
from app.core.permissions import RoleCode
from app.models import CashMovement, CashRegister, CashSession, Role, User
from app.schemas.cash import CashMovementCreate, CashSessionOpen
from app.services import cash_service
from tests.conftest import DEFAULT_PASSWORD_HASH

THREAD_TIMEOUT_SECONDS = 10

REGISTER_NAME = "Concurrency register"
USERNAMES = ("concurrency_cashier1", "concurrency_cashier2")


def _purge_committed_rows() -> None:
    """Delete this module's rows, including leftovers of a run that was killed mid-test."""
    with SessionLocal() as db:
        register_ids = select(CashRegister.id).where(CashRegister.name == REGISTER_NAME)
        session_ids = select(CashSession.id).where(CashSession.cash_register_id.in_(register_ids))
        db.execute(delete(CashMovement).where(CashMovement.cash_session_id.in_(session_ids)))
        db.execute(delete(CashSession).where(CashSession.id.in_(session_ids)))
        db.execute(delete(CashRegister).where(CashRegister.name == REGISTER_NAME))
        db.execute(delete(User).where(User.username.in_(USERNAMES)))
        db.commit()


@pytest.fixture
def committed_register() -> Iterator[tuple[int, list[int]]]:
    """A register and two cashiers, committed; returns `(register_id, user_ids)`."""
    _purge_committed_rows()
    with SessionLocal() as db:
        role = db.scalars(select(Role).where(Role.code == RoleCode.CASHIER)).one()
        users = [
            User(
                username=name,
                full_name=name,
                password_hash=DEFAULT_PASSWORD_HASH,
                role=role,
            )
            for name in USERNAMES
        ]
        register = CashRegister(name=REGISTER_NAME)
        db.add_all([register, *users])
        db.commit()
        ids = (register.id, [u.id for u in users])
    try:
        yield ids
    finally:
        _purge_committed_rows()


def _run_concurrently(*targets: object) -> list[str]:
    """Run each callable in its own thread, released at the same time; return the outcomes
    (`committed` or the error code)."""
    barrier = threading.Barrier(len(targets))
    outcomes: list[str] = []
    errors: list[BaseException] = []

    def run(target: object) -> None:
        try:
            barrier.wait()
            target()  # type: ignore[operator]
            outcomes.append("committed")
        except AppError as exc:
            outcomes.append(exc.code)
        except BaseException as exc:  # surfaced in the main thread
            errors.append(exc)

    threads = [threading.Thread(target=run, args=(t,)) for t in targets]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(THREAD_TIMEOUT_SECONDS)
    assert errors == []
    return sorted(outcomes)


def test_concurrent_openings_of_a_register_only_one_wins(
    committed_register: tuple[int, list[int]],
) -> None:
    """Two cashiers open the same register at once: exactly one session is created and the
    loser gets a clear business error (not a 500 from the unique index)."""
    register_id, user_ids = committed_register

    def opener(user_id: int) -> object:
        def open_register() -> None:
            with SessionLocal() as db:
                actor = db.get_one(User, user_id)
                data = CashSessionOpen(cash_register_id=register_id, opening_amount=Decimal(0))
                cash_service.open_session(db, actor, data)

        return open_register

    outcomes = _run_concurrently(*(opener(user_id) for user_id in user_ids))

    assert outcomes == ["CASH_REGISTER_BUSY", "committed"]
    with SessionLocal() as db:
        sessions = db.scalars(
            select(CashSession).where(CashSession.cash_register_id == register_id)
        ).all()
        assert len(sessions) == 1


def test_concurrent_withdrawals_cannot_overdraw(
    committed_register: tuple[int, list[int]],
) -> None:
    """Two withdrawals of 60.000 over 100.000: the second must see 40.000 and fail.

    Without the session lock both would read 100.000 and the drawer would end at -20.000.
    """
    register_id, user_ids = committed_register
    user_id = user_ids[0]
    with SessionLocal() as db:
        session = CashSession(
            cash_register_id=register_id, user_id=user_id, opening_amount=Decimal(100000)
        )
        db.add(session)
        db.commit()
        session_id = session.id

    def withdraw() -> None:
        with SessionLocal() as db:
            actor = db.get_one(User, user_id)
            data = CashMovementCreate(
                movement_type="withdrawal", amount=Decimal(60000), concept="Retiro concurrente"
            )
            cash_service.create_movement(db, actor, session_id, data)

    outcomes = _run_concurrently(withdraw, withdraw)

    assert outcomes == ["INSUFFICIENT_CASH", "committed"]
    with SessionLocal() as db:
        actor = db.get_one(User, user_id)
        session = cash_service.get_session(db, actor, session_id)
        assert cash_service.summary(db, session).expected_cash == Decimal(40000)
