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
- Tipos: entrada por compra, anulación de compra, venta, ajuste positivo y negativo, devolución de compra, devolución de venta y anulación de venta (las devoluciones llegarán en una etapa futura). Los movimientos enlazan su documento de origen (`purchase_id`, `sale_id`).
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
- En el frontend: página `/proveedores` (búsqueda, estado, crear/editar/desactivar) con un modal de productos del proveedor (asociar con el selector compatible con lector de código de barras, editar código y precio, quitar), y la acción "Proveedores" en la tabla de productos.

### Compras

- Estados **borrador → confirmada → anulada**. El borrador se edita libremente (`PUT` reemplaza cabecera y líneas) o se descarta; no mueve inventario ni consume consecutivo.
- Costos **sin IVA**, descuento por línea en valor e IVA por línea (por defecto el del producto). Los totales los calcula el backend y `CHECK`s en la base garantizan su coherencia (`total = subtotal − descuentos + IVA`, `saldo = total − pagado`).
- **Confirmar** (una transacción): consecutivo `COMPRA-000001` desde `document_sequences` (fila bloqueada, sin huecos), entradas de inventario al costo neto de cada línea (recalcula costo promedio y último costo) y alta o actualización del precio en productos por proveedor.
- **Anular** (solo administrador, `purchases.cancel`): movimientos inversos al costo de la compra. Si la compra es el último movimiento del producto, el costo promedio y el último costo vuelven exactamente a sus valores previos (cada movimiento guarda esa instantánea); si hubo movimientos después, la compra se retira del promedio con la fórmula inversa y el último costo vuelve al de la compra confirmada más reciente. Si las unidades ya no están en stock, falla sin cambios.
- Una factura de proveedor no se registra dos veces (índice único parcial que ignora compras anuladas).
- **Historial de costos** (`GET /products/{id}/cost-history`, `products.view_costs`): costo neto por compra, variación frente a la anterior y margen bruto sobre el precio sin IVA. Se consulta sobre las líneas de compras confirmadas, sin tabla duplicada.
- Permisos `purchases.read` y `purchases.manage` (administrador e inventario) y `purchases.cancel` (administrador).
- En el frontend: `/compras` (búsqueda, estado, proveedor y fechas) y el editor `/compras/nueva` · `/compras/:id`. El lector de código de barras agrega la línea con el precio del proveedor (o el último costo) y enfoca su cantidad; Enter vuelve al lector. Totales en vivo con el mismo redondeo del backend; "Guardar y confirmar" muestra un resumen de lo que entra al inventario. Las compras confirmadas se ven en solo lectura, con la acción de anular para el administrador. Acción "Costos" en productos y número de compra enlazado en el historial de movimientos.

### Clientes

- Clientes con tipo y número de documento únicos en conjunto (mismas reglas que proveedores), nombre, teléfono, correo y dirección. No se eliminan: se desactivan.
- La migración crea el cliente del sistema **"Consumidor final"** (`CC 222222222222`, `is_default`), que se usará en las ventas sin cliente registrado. No se puede editar ni desactivar, y un índice único parcial garantiza que solo exista uno.
- Permisos `customers.read` y `customers.manage` (administrador y cajero).
- En el frontend: página `/clientes` (búsqueda por nombre, documento o teléfono; estado; crear/editar/desactivar).

### Caja

- **Cajas** (`cash_registers`): nombre único sin distinguir mayúsculas, descripción y estado. No se eliminan; una caja abierta no se puede desactivar. La migración crea **"Caja Principal"**.
- **Aperturas** (`cash_sessions`): caja, usuario, dinero inicial, observaciones y fecha. Una caja y un usuario tienen como máximo una apertura activa, garantizado por índices únicos parciales (`WHERE status = 'open'`) además de la validación del servicio.
- **Movimientos** (`cash_movements`): ingresos y retiros inmutables con concepto obligatorio, solo en la propia apertura activa. Las ventas registran sus propios movimientos (`sale`, `sale_cancellation`, enlazados con `sale_id`). **Efectivo esperado** = dinero inicial + ingresos + ventas en efectivo − retiros − anulaciones en efectivo. Un retiro no puede superar el efectivo esperado: la apertura se bloquea (`SELECT ... FOR UPDATE`) al registrarlo, así dos retiros simultáneos no dejan la caja en negativo.
- **Arqueo y cierre**: se digita el efectivo contado y se guardan el esperado (fijado al cerrar, con la apertura bloqueada), el contado y la **diferencia = contado − esperado** (positiva = sobrante, negativa = faltante). Con diferencia, las observaciones son obligatorias. Si el esperado cambió mientras se contaba (por ejemplo, por una anulación), el cierre se rechaza para revisar de nuevo. El cierre es definitivo: la apertura ya no admite ventas ni movimientos y la caja queda libre. El resumen del cierre incluye las ventas por método de pago (solo el efectivo entra al conteo).
- Permisos `cash_registers.read` y `cash.operate` (administrador y cajero), `cash_registers.manage` y `cash.supervise` (administrador; ver las aperturas de todos y cerrar las que alguien dejó abiertas).
- En el frontend:
  - `/caja` "Mi caja": abrir una caja (las ocupadas aparecen deshabilitadas con quién las tiene), resumen con el efectivo esperado, registrar ingresos y retiros, lista de movimientos y **cerrar caja**: desglose del esperado, ventas por método de pago, efectivo contado con la diferencia en vivo ("Cuadrada", "Sobrante" o "Faltante") y resultado del cierre.
  - `/cajas`: listado con quién tiene abierta cada caja; crear, editar y desactivar (administrador).
  - `/caja/aperturas`: historial de aperturas de todos los usuarios, con contado y arqueo, filtros por caja, estado, arqueo (con sobrante o faltante) y fechas, y detalle con el cierre, las ventas por método y los movimientos; desde el detalle se cierra una apertura que alguien dejó abierta (administrador).

### Ventas

- Una venta nace confirmada, en **una sola transacción**: consecutivo `VENTA-000001`, líneas, pagos, salidas de inventario al costo promedio y entrada de caja por la parte en efectivo. Si algo falla (stock insuficiente, pagos que no cuadran…), no se guarda nada y el número no se consume.
- Requiere una **apertura de caja activa** del usuario; la venta queda asociada a ella. Sin cliente, se usa "Consumidor final".
- El **precio y el costo** de cada línea los toma el servidor del catálogo (nunca del cliente) y quedan guardados para calcular márgenes históricos. Los servicios no mueven inventario.
- **Descuentos** por línea y por venta, en valor. El de la venta se reparte entre las líneas en proporción a su valor (en centavos exactos), así el IVA incluido de cada línea es correcto.
- **Pagos** (`sale_payments`): uno o varios métodos (pago mixto) que deben sumar el total. Los métodos viven en la tabla `payment_methods` (efectivo, Nequi, Daviplata, transferencia, tarjetas, otro); solo el efectivo entra a la caja y admite dinero recibido y cambio.
- **Anular** (`sales.cancel`, administrador) exige motivo: las unidades vuelven al costo con que salieron (el último costo no cambia) y el efectivo sale de la caja de la venta si sigue abierta, o de la caja abierta de quien anula. La venta nunca se borra.
- Se bloquean la apertura, los productos (en orden de id) y la secuencia: dos ventas simultáneas de la última unidad no la venden dos veces.
- Permisos `sales.create` y `sales.read` (administrador y cajero; el cajero solo ve sus ventas), `sales.read_all` y `sales.cancel` (administrador). El costo de las líneas solo se muestra con `products.view_costs`.
- En el frontend:
  - `/pos` "Punto de venta", pensado para teclado y lector de código de barras: el escáner queda siempre enfocado (escanear de nuevo suma una unidad), cantidades y descuentos editables en la tabla, aviso de stock, cliente con **F4** y cobro con **F2**. El cobro abre con efectivo por el total y el foco en "Recibido"; muestra el cambio y admite pagos mixtos. Enter confirma, y en el resumen de la venta Enter inicia la siguiente. Los totales se previsualizan con el mismo redondeo del backend; si un precio cambió, el POS recarga los productos del carrito.
  - `/ventas` (búsqueda, estado y fechas) y `/ventas/:id` (líneas, pagos, cambio y anulación para el administrador).
  - "Mi caja" suma las ventas y anulaciones en efectivo; los movimientos de caja e inventario enlazan la venta de origen.

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
