# URANTIAD

Sistema web full stack de **POS + Inventario + Compras + Proveedores + Caja + Reportes** para un negocio de productos comestibles, bebidas, productos de consumo y servicios de fotocopias e impresiones.

> Estado: en desarrollo por etapas. Ver [docs/PROGRESS.md](docs/PROGRESS.md) y la especificación funcional en [docs/ESPECIFICACION.md](docs/ESPECIFICACION.md).

## Stack

| Capa | Tecnologías |
|---|---|
| Frontend | React 19, TypeScript, Vite, Tailwind CSS v4, React Router, TanStack Query, React Hook Form + Zod |
| Backend | Python 3.12, FastAPI, Pydantic v2, SQLAlchemy 2 (síncrono), Alembic, psycopg 3 |
| Base de datos | PostgreSQL 17 |
| Calidad | Ruff, pytest, ESLint, Prettier, Vitest, React Testing Library |
| Infraestructura | Docker Compose, GitHub Actions, uv |

## Arquitectura

```
Frontend (React) → API REST /api/v1 → Routers → Servicios → Modelos (SQLAlchemy) → PostgreSQL
```

```
backend/
  app/
    api/v1/        # routers y endpoints (sin lógica de negocio)
    core/          # configuración, base de datos, manejo de errores
    models/        # modelos SQLAlchemy (Base con convención de nombres)
    schemas/       # schemas Pydantic de entrada/salida
    services/      # lógica de negocio
    cli.py         # comandos administrativos (create-admin)
    main.py        # creación de la app FastAPI
  alembic/         # migraciones
  tests/           # pytest contra PostgreSQL real
frontend/
  src/
    pages/ components/ hooks/ services/ types/ utils/   # carpetas creadas a medida que se necesitan
docker/postgres/   # script de inicio (crea la base de datos de pruebas)
docs/postman/      # colección "URANTIAD API"
```

### Autenticación y permisos

- `POST /api/v1/auth/login` devuelve un **access token JWT** (15 min) que se envía como `Authorization: Bearer <token>`, y deja un **refresh token** en una cookie `httpOnly` (`SameSite=Lax`, ruta `/api/v1/auth`).
- `POST /api/v1/auth/refresh` rota el refresh token (se guarda solo su hash). Reutilizar un token ya rotado revoca todas las sesiones del usuario.
- Contraseñas con hash **Argon2**. Bloqueo temporal tras varios intentos fallidos.
- Autorización por **permisos** (`users.read`, `users.manage`, …) asignados a roles (Administrador, Cajero, Inventario). Cada endpoint declara el permiso que exige con `require_permission(...)`. Roles y permisos se crean por migración.
- Los usuarios no se borran: se desactivan (pierden el acceso de inmediato).
- En el frontend el access token vive **solo en memoria** (nunca en `localStorage`). Al recargar la página la sesión se recupera con `POST /auth/refresh`; ante un 401 el cliente HTTP renueva la sesión una vez y repite la petición. Las rutas se protegen con `ProtectedRoute` y `RequirePermission`, y el menú muestra solo las secciones permitidas (el backend valida siempre).

### Catálogo (categorías y productos)

- Un producto es `type = product` (maneja inventario) o `type = service` (fotocopias, impresiones: sin stock).
- El **precio de venta incluye IVA** (`tax_rate` es el porcentaje incluido). Cada cambio de precio queda en `product_price_history`.
- El stock y el costo de los productos **no se editan**: cambian solo con movimientos de inventario (ajustes y compras). Los servicios tienen un costo de referencia manual.
- Los costos solo se muestran con el permiso `products.view_costs` (administrador e inventario); para el cajero la API los devuelve en `null`.
- `stock_status` se calcula (no se guarda): `out_of_stock` (stock ≤ 0), `critical` (≤ mínimo), `low` (≤ punto de reorden) u `ok`.
- La búsqueda por nombre, SKU o código de barras usa índices trigram (`pg_trgm`, creada por la migración).
- Una categoría con productos no se elimina: se desactiva.
- En el frontend los importes viajan como texto decimal (`"2500.00"`) y nunca se convierten a `number`: se formatean con `Intl` y se comparan en centavos (`utils/decimal.ts`). Los campos numéricos rechazan puntos de miles ("2.500") para no confundirlos con decimales.

### Inventario

- El stock cambia **solo** mediante movimientos (`inventory_movements`), que son inmutables: guardan tipo, cantidad, stock anterior y nuevo, costo unitario, costo promedio resultante, motivo, usuario y fecha. Un `CHECK` garantiza que `stock_after = stock_before ± cantidad`.
- Tipos: entrada por compra, venta, ajuste positivo y negativo, devolución de compra, devolución de venta y anulación de venta (los de compras y ventas se usan en sus etapas).
- **Ajustes manuales** (`inventory.adjust`) con motivo obligatorio. Una entrada con costo recalcula el **costo promedio ponderado** y el último costo (así se hace la carga inicial); sin costo, se valora al promedio actual. Las salidas usan el costo promedio.
- **Stock negativo** no permitido por defecto (`ALLOW_NEGATIVE_STOCK`). Las unidades contables (unidad, paquete, caja, página) solo aceptan cantidades enteras.
- Cada movimiento bloquea la fila del producto (`SELECT … FOR UPDATE`): dos operaciones simultáneas sobre el mismo producto se aplican en serie y nunca venden stock inexistente.
- **Reposición:** productos activos con stock ≤ punto de reorden, los más urgentes primero, con cantidad sugerida = stock objetivo − stock actual.
- En el frontend: páginas de movimientos y de reposición, y un modal de ajuste con selector de producto compatible con lector de código de barras (Enter selecciona la coincidencia exacta) y vista previa del stock resultante.

### Proveedores

- Proveedores con tipo y número de documento únicos en conjunto (`nit`, `cc`, `ce`, `passport`, `other`); el número se guarda sin puntos ni espacios. No se eliminan: se desactivan.
- **Productos por proveedor** (`supplier_products`): código del producto en el proveedor, precio de compra **sin IVA** (la misma base que el costo promedio), fecha del último precio (cambia solo cuando cambia el precio) y observaciones. Solo productos físicos activos y proveedores activos; la asociación sí se puede eliminar.
- Consultas en ambos sentidos: `GET /suppliers/{id}/products` y `GET /products/{id}/suppliers` (el precio más reciente primero).
- Permisos `suppliers.read` y `suppliers.manage` (administrador e inventario).

Todas las respuestas de error de la API tienen el formato `{ "detail": "mensaje claro", "code": "CODIGO_ERROR" }`.

## Requisitos

- Docker y Docker Compose.
- Para desarrollo local fuera de Docker: Python 3.12+ con [uv](https://docs.astral.sh/uv/) y Node.js 24+.

## Puesta en marcha con Docker

```bash
cp .env.example .env
docker compose up --build
```

| Servicio | URL |
|---|---|
| Frontend | http://localhost:5173 |
| API | http://localhost:8000/api/v1 |
| Swagger | http://localhost:8000/docs |
| PostgreSQL | localhost:5432 (bases `urantiad` y `urantiad_test`) |

El backend aplica las migraciones (`alembic upgrade head`) al arrancar. Backend y frontend se recargan automáticamente al editar el código. Si cambian las dependencias (`pyproject.toml` o `package.json`), reconstruya con `docker compose up -d --build`.

Crear el primer administrador (pide la contraseña de forma interactiva):

```bash
docker compose exec backend python -m app.cli create-admin
```

## Desarrollo local (sin Docker para backend/frontend)

Levantar solo la base de datos:

```bash
docker compose up -d db
```

Backend:

```bash
cd backend
cp .env.example .env
uv sync
uv run alembic upgrade head
uv run python -m app.cli create-admin   # solo la primera vez
uv run uvicorn app.main:app --reload
```

Frontend:

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

## Variables de entorno

| Archivo | Variable | Descripción |
|---|---|---|
| `.env` | `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` | Credenciales del contenedor de PostgreSQL |
| `.env` | `POSTGRES_PORT`, `BACKEND_PORT`, `FRONTEND_PORT` | Puertos publicados en el host |
| `.env` / `backend/.env` | `CORS_ORIGINS` | Orígenes permitidos, separados por comas |
| `.env` / `backend/.env` | `LOG_LEVEL` | Nivel de log (`INFO`, `DEBUG`, …) |
| `backend/.env` | `ENVIRONMENT` | `development`, `test` o `production` (en producción se desactiva Swagger) |
| `backend/.env` | `DATABASE_URL` | Conexión SQLAlchemy (`postgresql+psycopg://…`) |
| `backend/.env` | `TEST_DATABASE_URL` | Base de datos usada por pytest |
| `.env` / `backend/.env` | `JWT_SECRET_KEY` | Clave para firmar los JWT (obligatoria, mínimo 32 caracteres) |
| `backend/.env` | `ACCESS_TOKEN_EXPIRE_MINUTES` | Vida del access token (por defecto 15) |
| `backend/.env` | `REFRESH_TOKEN_EXPIRE_HOURS` | Vida de la sesión / refresh token (por defecto 12) |
| `backend/.env` | `COOKIE_SECURE` | `true` en producción (cookie solo por HTTPS) |
| `backend/.env` | `LOGIN_MAX_ATTEMPTS`, `LOGIN_LOCKOUT_MINUTES` | Bloqueo por intentos fallidos (por defecto 5 intentos, 15 min) |
| `.env` / `backend/.env` | `ALLOW_NEGATIVE_STOCK` | Permite que las salidas dejen stock negativo (por defecto `false`) |
| `frontend/.env` | `VITE_API_URL` | URL base de la API |

Los archivos `.env` nunca se versionan; mantener actualizados los `.env.example`.

## Migraciones

```bash
cd backend
uv run alembic revision --autogenerate -m "describe change"   # revisar el archivo generado antes de aplicar
uv run alembic upgrade head
uv run alembic downgrade -1
```

## Pruebas y calidad

Backend (requiere el contenedor `db` en marcha; usa la base `urantiad_test` y revierte cada test en una transacción). Las pruebas de concurrencia (`test_inventory_concurrency.py`) usan dos sesiones reales: confirman sus propios datos y los eliminan al terminar.

```bash
cd backend
uv run pytest
uv run ruff check .
uv run ruff format .
```

Frontend:

```bash
cd frontend
npm test
npm run lint
npm run format:check
npm run typecheck
```

## Integración continua

GitHub Actions ([.github/workflows/ci.yml](.github/workflows/ci.yml)) ejecuta en cada push y pull request a `main`:

- **Backend:** Ruff (lint y formato), migraciones contra PostgreSQL y pytest.
- **Frontend:** ESLint, Prettier, TypeScript, Vitest y build.

## API

- Documentación interactiva: Swagger en `/docs`.
- Colección de Postman: [docs/postman/urantiad.postman_collection.json](docs/postman/urantiad.postman_collection.json).
