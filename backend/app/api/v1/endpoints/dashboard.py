from fastapi import APIRouter

from app.api.deps import CurrentUser, DbSession
from app.schemas.dashboard import DashboardResponse
from app.services import dashboard_service

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("", response_model=DashboardResponse)
def get_dashboard(user: CurrentUser, db: DbSession) -> DashboardResponse:
    """Today's snapshot. Each section requires the permission of its area; without it the
    section is null."""
    return dashboard_service.dashboard(db, user)
