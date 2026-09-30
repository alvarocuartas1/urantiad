from fastapi import APIRouter

from app.api.v1.endpoints import (
    audit,
    auth,
    cash_registers,
    cash_sessions,
    categories,
    customers,
    health,
    inventory,
    products,
    purchases,
    reports,
    roles,
    sales,
    suppliers,
    users,
)

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(auth.router)
api_router.include_router(users.router)
api_router.include_router(roles.router)
api_router.include_router(categories.router)
api_router.include_router(products.router)
api_router.include_router(inventory.router)
api_router.include_router(suppliers.router)
api_router.include_router(purchases.router)
api_router.include_router(customers.router)
api_router.include_router(cash_registers.router)
api_router.include_router(cash_sessions.router)
api_router.include_router(sales.payment_methods_router)
api_router.include_router(sales.router)
api_router.include_router(audit.router)
api_router.include_router(reports.router)
