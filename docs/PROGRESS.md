# URANTIAD — Progreso del proyecto

Este archivo lo actualiza Claude al cerrar cada etapa. Mantenerlo breve.

## Hoja de ruta

| # | Etapa | Estado |
|---|---|---|
| 0 | Configuración inicial: estructura del repo, Docker Compose (PostgreSQL + backend + frontend), FastAPI base, Vite + React + Tailwind, Alembic, Ruff/ESLint, `.env.example`, CI en GitHub Actions | Terminada |
| 1 | Autenticación: usuarios, roles, permisos, JWT, login en frontend, rutas protegidas | Pendiente |
| 2 | Categorías y productos (incluye servicios, niveles de stock y alertas) | Pendiente |
| 3 | Inventario: movimientos, ajustes, historial, sección de reposición y sugerencia de compra | Pendiente |
| 4 | Proveedores y productos por proveedor | Pendiente |
| 5 | Compras: borrador, confirmación, entradas de inventario, costo promedio, historial de costos | Pendiente |
| 6 | Clientes | Pendiente |
| 7 | Cajas, apertura y movimientos de caja | Pendiente |
| 8 | POS y ventas: carrito, pagos, consecutivos, anulación | Pendiente |
| 9 | Arqueo y cierre de caja | Pendiente |
| 10 | Auditoría | Pendiente |
| 11 | Reportes | Pendiente |
| 12 | Dashboard | Pendiente |
| 13 | Estadísticas, pulido final, README y despliegue | Pendiente |

Una etapa grande puede dividirse en sub-etapas (ej. 8a backend de ventas, 8b interfaz del POS).

## Decisiones tomadas

- Base de datos: PostgreSQL 16+ (DDL transaccional: una migración fallida se revierte completa).
- SQLAlchemy 2.0 con sesiones síncronas (más simple; suficiente para el volumen de un negocio).
- Dinero: `NUMERIC(14,2)` / `Decimal`. Fechas en UTC (`TIMESTAMPTZ`), mostradas en `America/Bogota`.
- Costeo: promedio ponderado.
- Stock negativo: no permitido por defecto.
- Pagos mixtos: tabla `sale_payments` desde el inicio.
- Consecutivos: tabla de secuencias con bloqueo de fila.
- Servicios: productos con `type = service`, sin movimientos de inventario.
- Rama principal: `main`. PostgreSQL 17 (cumple 16+). Tailwind CSS v4 (configuración en CSS).
- Constraints con nombres deterministas (`naming_convention` en `Base.metadata`).
- Errores: `AppError(detail, code, status_code)` en servicios; handlers globales devuelven `{detail, code}` (404/405/422/500 incluidos).
- Tests backend: base `urantiad_test`, migraciones Alembic una vez por sesión, cada test en transacción revertida (`join_transaction_mode="create_savepoint"`).
- Vitest con `pool: 'threads'` (el pool `forks` no arranca a tiempo en Windows).
- React Hook Form + Zod se instalan en la Etapa 1 (primer formulario).

## Registro de etapas terminadas

<!-- Claude: agregar aquí una entrada de 3-5 líneas por etapa (fecha, qué se hizo, commit, pendientes). -->

### Etapa 0 — Configuración inicial
- Monorepo `backend/` (FastAPI + SQLAlchemy + Alembic, uv) y `frontend/` (Vite + React + TS + Tailwind).
- `docker-compose.yml` de desarrollo: `db` (con base de pruebas), `backend` (migra y arranca con reload), `frontend`.
- Endpoint `GET /api/v1/health` (público, verifica la BD). Página inicial que muestra el estado de la conexión.
- CI en GitHub Actions (backend y frontend). Colección Postman inicial. README.
- Sin tablas ni migraciones todavía.
