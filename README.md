# URANTIAD

Sistema web full stack de **POS + Inventario + Compras + Proveedores + Caja + Reportes** para un negocio de productos comestibles, bebidas, productos de consumo y servicios de fotocopias e impresiones.

> Estado: en desarrollo por etapas. Ver [docs/PROGRESS.md](docs/PROGRESS.md) y la especificación funcional en [docs/ESPECIFICACION.md](docs/ESPECIFICACION.md).

## Stack

| Capa | Tecnologías |
|---|---|
| Frontend | React 19, TypeScript, Vite, Tailwind CSS v4, React Router, TanStack Query |
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
    main.py        # creación de la app FastAPI
  alembic/         # migraciones
  tests/           # pytest contra PostgreSQL real
frontend/
  src/
    pages/ components/ hooks/ services/ types/ utils/   # carpetas creadas a medida que se necesitan
docker/postgres/   # script de inicio (crea la base de datos de pruebas)
docs/postman/      # colección "URANTIAD API"
```

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

El backend aplica las migraciones (`alembic upgrade head`) al arrancar. Backend y frontend se recargan automáticamente al editar el código.

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

Backend (requiere el contenedor `db` en marcha; usa la base `urantiad_test` y revierte cada test en una transacción):

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
