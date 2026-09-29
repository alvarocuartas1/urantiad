# URANTIAD — Progreso del proyecto

Este archivo lo actualiza Claude al cerrar cada etapa. Mantenerlo breve.

## Hoja de ruta

| # | Etapa | Estado |
|---|---|---|
| 0 | Configuración inicial: estructura del repo, Docker Compose (PostgreSQL + backend + frontend), FastAPI base, Vite + React + Tailwind, Alembic, Ruff/ESLint, `.env.example`, CI en GitHub Actions | Terminada |
| 1 | Autenticación: usuarios, roles, permisos, JWT, login en frontend, rutas protegidas | Terminada |
| 2 | Categorías y productos (incluye servicios, niveles de stock y alertas) | Terminada |
| 3 | Inventario: movimientos, ajustes, historial, sección de reposición y sugerencia de compra | Terminada |
| 4 | Proveedores y productos por proveedor | En curso (4a terminada) |
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
- Vitest con `pool: 'threads'` (el pool `forks` es lento en Windows). En la primera ejecución en frío puede aparecer `Timeout waiting for worker to respond` (límite fijo de 60 s de Vitest): repetir la ejecución; no es un test fallido.
- React Hook Form + Zod se instalan en la Etapa 1b (primer formulario).
- Sesión: access token JWT de 15 min + refresh token rotativo de 12 h en cookie `httpOnly` (hash SHA-256 en `refresh_tokens`); reutilizar un token rotado revoca todas las sesiones.
- Contraseñas con Argon2 (`pwdlib`). Bloqueo de 15 min tras 5 intentos fallidos.
- Un rol por usuario. Roles fijos (admin, cashier, inventory). Permisos explícitos también para el admin (sin bypass): cada etapa añade sus permisos en `app/core/permissions.py` y en su migración, asignándolos a los roles.
- Usuarios nunca se borran (se desactivan). Siempre debe quedar un administrador activo.
- Primer administrador: `python -m app.cli create-admin` (sin contraseñas en código ni migraciones).
- Frontend: access token en memoria; `AuthProvider` restaura la sesión con `/auth/refresh`; `apiClient` comparte una única petición de refresh entre llamadas concurrentes (evita falsos positivos de reutilización de token).
- Paginación: `Page[T]` = `{items, total, page, size}`, `size` máx. 100.
- Precio de venta con IVA incluido (`tax_rate` = % incluido). El margen bruto se calcula sobre el precio sin IVA.
- Costo de productos físicos: solo lo cambian los movimientos (0 al crear). Servicios: costo de referencia manual.
- Categoría obligatoria en todo producto. `type` no cambia tras crear. Productos nunca se borran (se desactivan).
- `stock_status` calculado (hybrid property: Python + `CASE` SQL), no almacenado. Sin CHECK `current_stock >= 0` en BD: la regla de stock negativo vive en el servicio (configurable).
- Historial de precios de venta (`product_price_history`) desde la creación; historial de costos llega en la Etapa 5.
- PATCH: campos omitidos no cambian; `null` solo en campos anulables (`PartialUpdate`). Bodies con `extra="forbid"`.
- Conflictos de unicidad se traducen por nombre de constraint (`violated_constraint`).
- Costos visibles solo con `products.view_costs` (admin, inventario): sin el permiso la API devuelve `average_cost`/`last_cost` en `null` (`ProductResponse.for_user`).
- Frontend: decimales como string; comparación en centavos (`bigint`); formato con `Intl` (acepta strings). Inputs numéricos aceptan `,` o `.` decimal y rechazan separadores de miles.
- Movimientos de inventario inmutables; `quantity > 0` y el tipo da el sentido. `inventory_service.record_movement` es el único punto que cambia stock y costos; no hace commit (compras y ventas lo reutilizan en su transacción) y exige el producto bloqueado (`get_product(for_update=True)`, con `populate_existing`).
- Documento de origen: FK reales y anulables (`purchase_id`, `sale_id`) que se añadirán en las etapas 5 y 8, no referencias polimórficas. Un ajuste = un movimiento de un producto (sin cabecera ni consecutivo).
- Costeo en ajustes: entrada con `unit_cost` recalcula promedio ponderado (redondeo HALF_UP a centavos; con stock ≤ 0 el promedio es el costo de entrada) y último costo; sin costo, se valora al promedio. Salidas al costo promedio.
- Stock negativo configurable con `ALLOW_NEGATIVE_STOCK` (entorno). Cantidades enteras para unidades contables (`COUNTABLE_UNITS`: unit, pack, box, page).
- Permisos `inventory.read` e `inventory.adjust` (admin, inventario). El cajero no consulta movimientos.
- Pruebas de concurrencia con dos sesiones reales y datos confirmados (se purgan al inicio y al final).
- Proveedores: documento único por (tipo, número), número sin puntos ni espacios y con dígito de verificación. Se desactivan, no se borran. Correo validado con `EmailStr` (`email-validator`).
- `supplier_products`: precio de compra **sin IVA** (misma base que `average_cost`), anulable; `price_updated_at` cambia solo con el precio. Solo productos físicos activos y proveedores activos. La asociación es dato de catálogo y se borra físicamente. En la Etapa 5, confirmar una compra crea la asociación si no existe y actualiza su precio.
- Permisos `suppliers.read` y `suppliers.manage` (admin, inventario). El cajero no accede a proveedores.
- Frontend: selector de producto apto para lector de código de barras (Enter busca al instante y elige la coincidencia exacta de SKU o código). Filtros de fecha por días completos en hora de Bogotá (offset fijo `-05:00`, sin horario de verano; fin exclusivo).

## Registro de etapas terminadas

<!-- Claude: agregar aquí una entrada de 3-5 líneas por etapa (fecha, qué se hizo, commit, pendientes). -->

### Etapa 0 — Configuración inicial
- Monorepo `backend/` (FastAPI + SQLAlchemy + Alembic, uv) y `frontend/` (Vite + React + TS + Tailwind).
- `docker-compose.yml` de desarrollo: `db` (con base de pruebas), `backend` (migra y arranca con reload), `frontend`.
- Endpoint `GET /api/v1/health` (público, verifica la BD). Página inicial que muestra el estado de la conexión.
- CI en GitHub Actions (backend y frontend). Colección Postman inicial. README.
- Sin tablas ni migraciones todavía.

### Etapa 1a — Autenticación (backend)
- Tablas `roles`, `permissions`, `role_permissions`, `users`, `refresh_tokens` (migración con roles y permisos semilla).
- Endpoints `/auth/login|refresh|logout|me|me/password`, `/users` (listar, obtener, crear, editar, restablecer contraseña) y `/roles`.
- Dependencias `get_current_user` y `require_permission`. Comando `create-admin`. Colección Postman actualizada.
- 54 tests backend.

### Etapa 1b — Autenticación (frontend)
- `AuthProvider` + `useAuth`, `apiClient` con Bearer, refresh automático ante 401 y cierre de sesión si falla.
- Rutas: `/login`, `ProtectedRoute`, `RequirePermission`, `AppLayout` (menú filtrado por permisos, cambio de contraseña, cerrar sesión).
- Página de usuarios: listado paginado con búsqueda y filtro de estado, crear/editar, activar/desactivar, restablecer contraseña.
- Componentes UI base: `Button`, `TextField`, `SelectField`, `Modal`, `Alert`, `StatusBadge`, `Pagination`.
- 14 tests frontend (apiClient, login, protección de rutas, inicio).

### Etapa 2a — Categorías y productos (backend)
- Tablas `categories` (nombre único sin distinguir mayúsculas), `products` (producto/servicio, SKU y código de barras únicos, IVA, precio, costos, stock y niveles con CHECKs) y `product_price_history`. Extensión `pg_trgm` para búsquedas.
- Permisos `products.read` (admin, cajero, inventario) y `products.manage` (admin, inventario).
- Endpoints `/categories` (CRUD; eliminar solo sin productos) y `/products` (listar con búsqueda y filtros por categoría, tipo, estado y nivel de stock; crear; editar; historial de precios).
- Utilidades compartidas `services/query.py` (búsqueda, paginación, errores de constraint). Colección Postman actualizada.
- 101 tests backend.

### Etapa 2b — Categorías y productos (frontend) + costos ocultos al cajero
- Permiso `products.view_costs` (migración `9c67e8deeca8`): costos ocultos en la API sin él.
- Páginas `/productos` (búsqueda, filtros por categoría, tipo, nivel de stock y estado; crear/editar; historial de precios) y `/categorias` (CRUD, eliminar solo sin productos).
- `StockStatusBadge` (color + icono + texto), `formatCurrency`/`formatQuantity`, `utils/decimal.ts`, formulario de producto con Zod (servicios sin niveles de stock, costo manual).
- Componentes compartidos `SearchInput`, `FilterSelect`, `FormActions`; `Modal` con tamaño `lg`; `StatusBadge` con tono `warning` e icono opcional.
- 102 tests backend, 43 tests frontend.

### Etapa 3a — Inventario (backend)
- Tabla `inventory_movements` (7 tipos, stock anterior/nuevo con CHECK de consistencia, costo unitario, costo promedio resultante, motivo obligatorio en ajustes). Permisos `inventory.read` e `inventory.adjust` (migración `3737d7632657`).
- Endpoints `POST /inventory/adjustments`, `GET /inventory/movements` (filtros por producto, tipo, usuario y rango de fechas con zona horaria) y `GET /inventory/replenishment` (reposición con cantidad sugerida, más urgentes primero).
- Costo promedio ponderado, validación de stock negativo y de cantidades enteras. Costos ocultos sin `products.view_costs`.
- Tests de concurrencia (dos sesiones y hilos reales): salidas simultáneas no sobrevenden; entradas simultáneas se encadenan. Verificados fallando sin el bloqueo.
- 132 tests backend.

### Etapa 3b — Inventario (frontend)
- Páginas `/inventario/movimientos` (historial con filtros por tipo y fechas, nuevo ajuste) y `/inventario/reposicion` ("Productos que requieren reposición" con cantidad sugerida y acción de ajustar). Menú filtrado por `inventory.read`.
- `AdjustmentFormModal` (React Hook Form + Zod): selector de producto por nombre, SKU o código de barras, entrada/salida, cantidad (entera en unidades contables), costo opcional en entradas, motivo con sugerencias y vista previa del stock resultante (aviso si queda negativo). Errores de stock junto al campo.
- `MovementTypeBadge` (color + icono + texto), `MovementsTable`, `ReplenishmentTable`, `ProductMovementsModal`; acciones "Movimientos" y "Ajustar" en la tabla de productos. `DateFilter` compartido.
- `utils/decimal.ts` admite valores negativos (`toCents`) y `fromCents`; `decimalSchema` se comparte desde `utils/validation.ts`.
- 132 tests backend, 53 tests frontend.

### Etapa 4a — Proveedores (backend)
- Tablas `suppliers` (documento único por tipo y número, índice trigram en nombre) y `supplier_products` (único por proveedor y producto, precio sin IVA y fecha del último precio). Permisos `suppliers.read` y `suppliers.manage` (migración `817ffbfd6d32`).
- Endpoints `/suppliers` (listar con búsqueda y estado, obtener, crear, editar/desactivar), `/suppliers/{id}/products` (listar, asociar, editar, quitar) y `GET /products/{id}/suppliers`.
- Dependencia nueva `email-validator` (reconstruir la imagen del backend). Colección Postman actualizada.
- 170 tests backend.
