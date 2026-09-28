"""add products view costs permission

Revision ID: 9c67e8deeca8
Revises: 2648e8a63496
Create Date: 2026-09-28 14:10:22.672168

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# Seed data is written as literals so this migration never changes if the code evolves.
PERMISSION = ("products.view_costs", "Ver costos de productos y servicios.")
ROLES = ["admin", "inventory"]

# revision identifiers, used by Alembic.
revision: str = "9c67e8deeca8"
down_revision: str | Sequence[str] | None = "2648e8a63496"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    code, description = PERMISSION
    bind = op.get_bind()
    bind.execute(
        sa.text("INSERT INTO permissions (code, description) VALUES (:code, :description)"),
        {"code": code, "description": description},
    )
    bind.execute(
        sa.text(
            "INSERT INTO role_permissions (role_id, permission_id) "
            "SELECT r.id, p.id FROM roles r, permissions p "
            "WHERE r.code = ANY(:role_codes) AND p.code = :code"
        ),
        {"role_codes": ROLES, "code": code},
    )


def downgrade() -> None:
    """Downgrade schema."""
    # role_permissions rows are removed by ON DELETE CASCADE.
    op.get_bind().execute(
        sa.text("DELETE FROM permissions WHERE code = :code"), {"code": PERMISSION[0]}
    )
