"""User administration: listing, creation, updates and password resets."""

from collections.abc import Sequence

from sqlalchemy import or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.core.errors import AppError, ConflictError, NotFoundError
from app.core.permissions import RoleCode
from app.core.security import hash_password
from app.models import AuditAction, Role, User
from app.schemas.common import PageParams
from app.schemas.user import UserCreate, UserUpdate
from app.services import audit_service
from app.services.auth_service import revoke_user_sessions
from app.services.query import contains_pattern, paginate


def _audit_values(user: User) -> audit_service.Values:
    return audit_service.values(
        username=user.username,
        full_name=user.full_name,
        role=user.role.name,
        is_active=user.is_active,
    )


def _username_taken() -> ConflictError:
    return ConflictError("El nombre de usuario ya existe.", code="USERNAME_TAKEN")


def _get_role(db: Session, role_id: int) -> Role:
    role = db.get(Role, role_id)
    if role is None:
        raise AppError("El rol seleccionado no existe.", code="ROLE_NOT_FOUND", status_code=422)
    return role


def list_users(
    db: Session, params: PageParams, *, search: str | None = None, is_active: bool | None = None
) -> tuple[Sequence[User], int]:
    stmt = select(User)
    if search and search.strip():
        pattern = contains_pattern(search.strip())
        stmt = stmt.where(or_(User.username.ilike(pattern), User.full_name.ilike(pattern)))
    if is_active is not None:
        stmt = stmt.where(User.is_active == is_active)
    stmt = stmt.options(selectinload(User.role)).order_by(User.full_name, User.id)
    return paginate(db, stmt, params)


def get_user(db: Session, user_id: int, *, for_update: bool = False) -> User:
    stmt = select(User).options(selectinload(User.role)).where(User.id == user_id)
    if for_update:
        stmt = stmt.with_for_update(of=User)
    user = db.scalar(stmt)
    if user is None:
        raise NotFoundError("El usuario no existe.", code="USER_NOT_FOUND")
    return user


def create_user(db: Session, actor: User | None, data: UserCreate) -> User:
    """Create a user. `actor` is `None` only for the `create-admin` command."""
    if db.scalar(select(User.id).where(User.username == data.username)) is not None:
        raise _username_taken()
    user = User(
        username=data.username,
        full_name=data.full_name,
        password_hash=hash_password(data.password),
        role=_get_role(db, data.role_id),
    )
    db.add(user)
    try:
        db.flush()
    except IntegrityError as exc:  # concurrent insert of the same username
        db.rollback()
        raise _username_taken() from exc
    audit_service.record(
        db, actor, AuditAction.USER_CREATE, user.id, user.username, new=_audit_values(user)
    )
    db.commit()
    return user


def create_admin(db: Session, username: str, full_name: str, password: str) -> User:
    """Create a user with the administrator role (used by the `create-admin` CLI)."""
    admin_role = db.scalar(select(Role).where(Role.code == RoleCode.ADMIN))
    if admin_role is None:
        raise AppError(
            "Falta el rol administrador. Ejecute las migraciones.", code="ROLE_NOT_FOUND"
        )
    data = UserCreate(
        username=username, full_name=full_name, password=password, role_id=admin_role.id
    )
    return create_user(db, None, data)


def _ensure_another_active_admin(db: Session, user_id: int) -> None:
    # Lock the remaining admins so two concurrent requests cannot both remove "the other" one.
    other_admins = db.scalars(
        select(User.id)
        .join(User.role)
        .where(Role.code == RoleCode.ADMIN, User.is_active.is_(True), User.id != user_id)
        .with_for_update(of=User)
    ).all()
    if not other_admins:
        raise ConflictError("Debe existir al menos un administrador activo.", code="LAST_ADMIN")


def update_user(db: Session, actor: User, user_id: int, data: UserUpdate) -> User:
    user = get_user(db, user_id, for_update=True)
    before = _audit_values(user)
    new_role = _get_role(db, data.role_id) if data.role_id is not None else None
    deactivating = data.is_active is False and user.is_active
    changing_role = new_role is not None and new_role.id != user.role_id

    if user.id == actor.id:
        if deactivating:
            raise ConflictError(
                "No puede desactivar su propio usuario.", code="CANNOT_DEACTIVATE_SELF"
            )
        if changing_role:
            raise ConflictError("No puede cambiar su propio rol.", code="CANNOT_CHANGE_OWN_ROLE")

    loses_admin = user.is_active and user.role.code == RoleCode.ADMIN
    loses_admin = loses_admin and (
        deactivating or (new_role is not None and new_role.code != RoleCode.ADMIN)
    )
    if loses_admin:
        _ensure_another_active_admin(db, user.id)

    if data.full_name is not None:
        user.full_name = data.full_name
    if new_role is not None:
        user.role = new_role
    if data.is_active is not None:
        user.is_active = data.is_active
    if deactivating:
        revoke_user_sessions(db, user.id)
    audit_service.record_changes(
        db, actor, AuditAction.USER_UPDATE, user.id, user.username, before, _audit_values(user)
    )
    db.commit()
    return user


def reset_password(db: Session, actor: User, user_id: int, new_password: str) -> None:
    user = get_user(db, user_id, for_update=True)
    user.password_hash = hash_password(new_password)
    user.failed_login_attempts = 0
    user.locked_until = None
    revoke_user_sessions(db, user.id)
    # The password itself is never recorded, not even its hash.
    audit_service.record(db, actor, AuditAction.USER_PASSWORD_RESET, user.id, user.username)
    db.commit()


def list_roles(db: Session) -> Sequence[Role]:
    return db.scalars(select(Role).options(selectinload(Role.permissions)).order_by(Role.id)).all()
