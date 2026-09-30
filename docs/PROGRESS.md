# URANTIAD — Progreso del proyecto

Este archivo lo actualiza Claude al cerrar cada etapa. Mantenerlo breve.

## Hoja de ruta

| # | Etapa | Estado |
|---|---|---|
| 0 | Configuración inicial: estructura del repo, Docker Compose (PostgreSQL + backend + frontend), FastAPI base, Vite + React + Tailwind, Alembic, Ruff/ESLint, `.env.example`, CI en GitHub Actions | Terminada |
| 1 | Autenticación: usuarios, roles, permisos, JWT, login en frontend, rutas protegidas | Terminada |
| 2 | Categorías y productos (incluye servicios, niveles de stock y alertas) | Terminada |
| 3 | Inventario: movimientos, ajustes, historial, sección de reposición y sugerencia de compra | Terminada |
| 4 | Proveedores y productos por proveedor | Terminada |
| 5 | Compras: borrador, confirmación, entradas de inventario, costo promedio, historial de costos | Terminada |
| 6 | Clientes | Terminada |
| 7 | Cajas, apertura y movimientos de caja | Terminada |
| 8 | POS y ventas: carrito, pagos, consecutivos, anulación | Terminada |
| 9 | Arqueo y cierre de caja | Terminada |
| 10 | Auditoría | Terminada |
| 11 | Reportes | En curso (11a terminada) |
| 12 | Dashboard | Pendiente |
| 13 | Estadísticas, pulido final, README y despliegue | Pendiente |

Una etapa grande puede dividirse en sub-etapas (ej. 8a backend de ventas, 8b interfaz del POS).

## Pendientes anotados

- **Etapa 13 (o antes del despliegue):** IP y navegador en `audit_logs` (`ip_address`, `user_agent`), capturados con un middleware y una variable de contexto, sin cambiar firmas de servicios.
- **Cuando haya datos reales en producción:** política de retención de la auditoría (tarea en modo `app.audit_maintenance`). Consultar antes con el contador el tiempo legal de conservación.
- **Al llegar funciones que dependan de clientes (crédito, facturación electrónica):** auditar clientes. Categorías y cajas quedan sin auditar salvo que se necesite.

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
- Vitest con `pool: 'threads'` (el pool `forks` es lento en Windows) y `maxWorkers: 2`: arrancar muchos workers jsdom a la vez superaba el límite fijo de 60 s de Vitest (`Timeout waiting for worker to respond`).
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
- Compras: consecutivo asignado al **confirmar** (los borradores no tienen número y se descartan con borrado físico: nunca afectaron nada). Costos sin IVA; descuento por línea en valor (el de la cabecera es la suma); `amount_paid` se digita en el borrador y queda fijo al confirmar (abonos en cuentas por pagar, etapa futura; al llegar la caja, pagar con efectivo deberá generar movimiento de caja).
- Una línea por producto en cada compra. Las líneas de un borrador se actualizan en sitio al guardar (reemplazarlas violaría el UNIQUE por el orden de flush de SQLAlchemy).
- Confirmar y anular bloquean la compra y los productos en orden de id (evita deadlocks); la secuencia se toma al final. Timestamps de confirmación y anulación con la hora de la BD (`now()`), como `created_at`.
- Anulación de compra: tipo `purchase_cancellation` (distinto de `purchase_return`, reservado a devoluciones parciales). Salida al costo neto de la compra. Si la entrada de la compra sigue siendo el último movimiento del producto, se restauran **exactamente** el costo promedio y el último costo previos (instantánea `average_cost_before`/`last_cost_before` que guarda cada movimiento; el promedio se almacena redondeado y la fórmula inversa se desviaba centavos). Si hubo movimientos posteriores: promedio inverso `(S·P − q·c)/(S − q)` (sin stock o valor negativo: se conserva) y último costo = el de la compra confirmada más reciente (si no hay, no cambia). Movimientos anteriores a la migración `1a48d631b91f` tienen la instantánea en NULL y usan la fórmula. El precio del proveedor no se revierte. Solo el administrador (`purchases.cancel`).
- Historial de costos sin tabla propia: consulta sobre `purchase_items` de compras confirmadas. Margen bruto = precio sin IVA − costo promedio.
- Frontend de compras: el editor calcula totales en centavos con el mismo redondeo HALF_UP del backend (solo vista previa; el backend es la fuente de verdad). Escanear un producto ya presente enfoca su línea en vez de duplicarla. "Guardar y confirmar" guarda el borrador y abre el resumen; una compra nueva pasa a `/compras/:id` al salir del resumen. Selector de proveedores limitado a 100 activos (suficiente para el negocio; revisar si crece).
- `document_sequences` genérica (`purchase` sembrada; `sale` llegará en la Etapa 8). `supplier_service.purchasable_product`, `inventory_service.validate_quantity` y `query.filter_date_range` son compartidos.
- Clientes: documento obligatorio y único por (tipo, número), como proveedores. "Consumidor final" (`CC 222222222222`, DIAN) sembrado por migración y marcado con `is_default` (índice único parcial); es de solo lectura (`DEFAULT_CUSTOMER_READONLY`) y encabeza el listado. Las ventas (Etapa 8) tendrán `customer_id NOT NULL` y usarán ese cliente si no se elige otro. Permisos `customers.read` y `customers.manage` (admin y cajero; inventario no).
- Campos de contacto compartidos entre proveedores y clientes: backend `schemas/contact.py`; frontend `types/document.ts`, `utils/document.ts` y esquemas Zod en `utils/validation.ts`.
- Caja: apertura = `cash_sessions` (`status` open/closed; los campos de cierre llegan en la Etapa 9). Índices únicos parciales `WHERE status = 'open'` por caja y por usuario; abrir bloquea la fila de la caja (serializa aperturas y desactivación). Dinero inicial en la apertura, no como movimiento. `cash_movements` inmutables (`income`/`withdrawal`; ventas añadirán tipos y `sale_id`). Un retiro no puede superar el efectivo esperado (bloqueo de la apertura). Movimientos solo en la propia apertura activa, incluso para el administrador. `cash_service.record_cash_movement` no hace commit y `get_open_session_for_user(for_update=True)` los reutilizarán las ventas. Pagos de compras no generan movimiento de caja: si salen de la caja se registra un retiro (vínculo real con cuentas por pagar, etapa futura). Permisos `cash_registers.read`, `cash.operate` (admin, cajero), `cash_registers.manage`, `cash.supervise` (admin). "Caja Principal" sembrada.
- Frontend de caja: la apertura y los movimientos devuelven la apertura con su resumen, que se guarda directo en la caché de `current-session` (sin volver a pedirla); las demás consultas de caja se invalidan. Si abrir falla por `USER_HAS_OPEN_SESSION` (abierta en otra pestaña) se recarga la apertura; con otros errores, la lista de cajas. El límite de retiro se valida también en el formulario (centavos). Menú: `NavItem.end` para no resaltar "Mi caja" en `/caja/aperturas`.
- Ventas: nacen confirmadas (sin borradores); consecutivo `VENTA-` tomado dentro de la transacción. Precio (con IVA) y costo promedio los toma el servidor del catálogo y quedan en `sale_items`. Una línea por producto y un pago por método. Montos: `subtotal` bruto, `lines_discount` + `sale_discount` = `discount_total`, `total = subtotal − discount_total`, `tax_total` = IVA incluido (por línea: `round(total·tasa/(100+tasa))`). El descuento de la venta se reparte por **mayor residuo en centavos** (`sale_service.allocate`): suma exacta y ninguna parte supera el valor de su línea.
- Pagos: suma = total (422 `PAYMENT_TOTAL_MISMATCH` con el total real; el POS debe recargar precios). Solo el método `is_cash` (único, índice parcial) admite `amount_tendered` y cambio, y genera movimiento de caja por `amount` (no por lo recibido). Métodos de pago: solo listado en esta etapa; su administración queda para el pulido (Etapa 13).
- Orden de bloqueo común a crear y anular ventas: venta → apertura → productos (por id) → secuencia. Crear no hace consultas después de agregar la venta a la sesión (no se autoflushea sin número).
- Anulación de venta: entradas `sale_cancellation` al `unit_cost` de la línea (recalculan el promedio; el **último costo no cambia**: `SALE_REVERSAL_TYPES` en `record_movement`). Efectivo: de la apertura de la venta si sigue abierta; si no, de la apertura activa de quien anula (409 `CASH_SESSION_REQUIRED`); si la caja no alcanza, 409 `INSUFFICIENT_CASH` sin cambios. Solo `sales.cancel` (admin).
- `cash_movements`: tipos `sale` (entrada) y `sale_cancellation` (salida) con `sale_id` obligatorio para ellos (CHECK); el endpoint manual solo acepta `income`/`withdrawal` (`ManualCashMovementType`). El resumen de caja agrupa por tipo y suma según `is_inbound`.
- Permisos `sales.create`, `sales.read` (admin, cajero; sin `sales.read_all` solo las propias, 404 para ajenas), `sales.read_all`, `sales.cancel` (admin). Inventario no accede a ventas.
- Tests: si un test verifica que un error no dejó cambios, hace `commit` de la preparación antes de la petición (el `rollback` del servicio deshace también lo que los fixtures solo hicieron `flush`).
- POS (frontend): carrito en `useCart` (`useReducer` puro) y cálculos en `utils/sale.ts`, espejo del backend en centavos (`allocateCents`, IVA incluido). Una línea por producto: escanear de nuevo suma 1. El escáner se remonta tras cada producto (limpio y enfocado). Atajos F2 (cobrar) y F4 (cliente). El cobro usa RHF + Zod (`buildPaymentsSchema`): efectivo por defecto con foco en "Recibido". Si la venta falla, se recargan los productos del carrito (`GET /products/{id}`); con `PAYMENT_TOTAL_MISMATCH` se cierra el cobro para mostrar el total nuevo. Tras vender se invalidan ventas, caja y stock.
- Foco tras cerrar un modal y abrir otro en el mismo render: enfocar desde un efecto (no `autoFocus`), porque la limpieza del modal que se cierra devuelve el foco a su elemento anterior después del `autoFocus`.
- Los cambios hechos por otro usuario (p. ej. una anulación del administrador) aparecen en la pestaña del cajero al recargar o cuando vence el `staleTime` global de 30 s (política de toda la app).
- Cierre de caja: columnas en `cash_sessions` (1:1, sin tabla aparte; arqueos parciales serían una tabla futura). CHECKs: campos de cierre presentes si y solo si `closed`, `counted_cash >= 0`, `difference = counted_cash − expected_cash`. `expected_cash` queda fijo al cerrar, calculado con la apertura bloqueada: ventas, movimientos y reintegros de anulación esperan o reciben `NO_OPEN_CASH_SESSION`/`CASH_SESSION_CLOSED`. El cliente envía el esperado que vio (409 `CASH_EXPECTED_CHANGED` si cambió). Observaciones obligatorias con diferencia (422 `CLOSING_NOTES_REQUIRED`). El cierre es definitivo. `cash.operate` cierra la propia; `cash.supervise` también las ajenas (`closed_by`). `closed_at` con `now()`.
- Resumen de ventas de una apertura (`sale_service.session_sales_summary`): ventas `completed` más las anuladas **después** del cierre (`cancelled_at > closed_at`), para que muestre lo que había al cerrar. En tests, `now()` no avanza entre peticiones (una sola transacción): se retrasa `closed_at` a mano.
- Frontend de cierre: `CloseSessionModal` (RHF + Zod, diferencia en vivo en centavos con `cashDifference`) envía el esperado que muestra; con error se recargan todas las consultas de caja y el modal muestra el nuevo esperado. Usa `mutateAsync`: cerrar la apertura actual la quita de la caché y desmonta el modal, y `mutate` no ejecuta sus callbacks tras desmontarse. `CashDifferenceBadge` (Cuadrada/Sobrante/Faltante, color + icono + texto). El detalle de apertura del supervisor recarga la apertura (`useCashSession`) y alterna con el modal de cierre (sin anidar modales). El POS recarga la apertura ante `NO_OPEN_CASH_SESSION`.
- Frontend: selector de producto apto para lector de código de barras (Enter busca al instante y elige la coincidencia exacta de SKU o código). Filtros de fecha por días completos en hora de Bogotá (offset fijo `-05:00`, sin horario de verano; fin exclusivo).
- Auditoría: `audit_service.record` explícito en cada servicio, dentro de su transacción y antes del commit (no eventos automáticos de SQLAlchemy: darían ruido de bajo nivel, como el stock que cambia en cada venta). Los servicios que auditan una creación hacen `flush` (traduciendo errores de constraint) para tener el id y luego `commit`. Ediciones sin cambios no generan registro. Valores JSONB con decimales como texto de 2 decimales; `entity_id` sin FK y `entity_label` con el nombre del momento. El prefijo de la acción es el tipo de entidad (CHECK). Ajustes de inventario se auditan sobre el producto; ingresos, retiros y cierres sobre la apertura; productos por proveedor sobre el proveedor (con el producto en ambos lados). No se audita crear ventas, editar borradores de compra, iniciar sesión, categorías, clientes ni cajas. Sin IP (llegaría con middleware + `contextvar`).
- `audit_logs` inmutable por trigger (`UPDATE`/`DELETE`/`TRUNCATE`), salvo `SET LOCAL app.audit_maintenance = 'on'`: las purgas de las pruebas de concurrencia usan `purge_audit_logs` (conftest) antes de borrar sus usuarios. Permiso `audit.read` (admin). `create-admin` audita con `user_id` nulo.
- Frontend de auditoría: `useAuditLogs` con `staleTime: 0` (casi toda mutación agrega registros; recargar al abrir la página evita invalidarla desde todas). `utils/audit.ts` concentra etiquetas de acciones y campos, formato de valores (el `status` según la entidad) y el resumen por acción; los campos se ordenan por su declaración ahí, porque JSONB reordena las claves. Las filas de descartes de compra no enlazan (el borrador ya no existe).
- Tablas: la columna de acciones lleva encabezado visible "Acciones". Un `sr-only` (posición absoluta) dentro de un contenedor con `overflow-x-auto` no posicionado escapa del recorte y crea scroll horizontal en la página.
- `cash_service.record_cash_movement` acepta `expected_cash` ya calculado con la apertura bloqueada (evita repetir la consulta en retiros manuales).
- Reportes: sin tablas; `report_service` hace una consulta agrupada paginada (`paginate_rows`) y una de resumen con los mismos filtros (agregados con `FILTER`), sin consultas por fila. Respuesta `ReportPage` = `Page` + `summary`. Permisos reutilizados del área (`sales.read_all`, `purchases.read`, `inventory.read`, `cash.supervise`): un reporte no muestra más que los listados; costos y márgenes solo con `products.view_costs`. Días en `BUSINESS_TIMEZONE` (`America/Bogota`) con `timezone()` de PostgreSQL. Orden: días cronológicos; los demás grupos por total descendente (inventario y caja por nombre).
- Reporte de ventas sobre `sale_items` (la suma de las líneas = total de la venta, así todas las agrupaciones suman lo mismo); solo `completed` (estado actual: una venta anulada después no suma y se muestra aparte), a diferencia del resumen de cierre de caja. Por método de pago se usa `sale_payments` y no admite filtro por producto o categoría (422 `REPORT_FILTER_NOT_SUPPORTED`). Ticket promedio nulo con filtros de línea. Compras por `confirmed_at`, solo confirmadas (anuladas aparte). Inventario: físicos activos; el stock negativo no resta valor. Caja: sobrantes y faltantes (positivo) por separado; esperado y contado solo de cerradas.

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

### Etapa 4b — Proveedores (frontend)
- Página `/proveedores` (búsqueda por nombre, documento o contacto; filtro de estado; crear/editar/desactivar). Menú filtrado por `suppliers.read`.
- `SupplierFormModal` (React Hook Form + Zod, documento normalizado como en el backend, documento duplicado junto al campo) y `SupplierProductsModal` con vistas internas (lista, asociar, editar, quitar) para no anidar modales. `SupplierProductsTable` compartida con `ProductSuppliersModal` (acción "Proveedores" en productos).
- `ProductPicker` pasa a `components/products/` (compartido) y admite `autoFocus`.
- 170 tests backend, 60 tests frontend.

### Etapa 5a — Compras (backend)
- Tablas `document_sequences`, `purchases` (CHECKs de estado, totales y saldo; índice único parcial de factura por proveedor) y `purchase_items` (CHECKs de subtotal y total). `inventory_movements` gana `purchase_id` y el tipo `purchase_cancellation`. Permisos `purchases.read`, `purchases.manage` y `purchases.cancel` (migración `3c7c8fec033a`).
- Endpoints `/purchases` (listar con búsqueda, proveedor, estado y fechas; obtener; crear; `PUT` de borrador; descartar; `confirm`; `cancel`) y `GET /products/{id}/cost-history`. Los movimientos de inventario devuelven la compra de origen (`purchase`).
- Frontend mínimo: etiqueta del nuevo tipo de movimiento. Colección Postman actualizada.
- Tests de concurrencia: confirmaciones simultáneas obtienen consecutivos distintos y seguidos; la misma compra confirmada a la vez se aplica una sola vez (ambos verificados fallando sin el bloqueo).
- 208 tests backend.

### Etapa 5b — Compras (frontend)
- Páginas `/compras` (listado con búsqueda, estado, proveedor y fechas) y `/compras/nueva` · `/compras/:id` (editor de borrador o detalle de solo lectura). Menú filtrado por `purchases.read`; crear requiere `purchases.manage`.
- `PurchaseForm` (React Hook Form + Zod + `useFieldArray`) con `PurchaseLinesEditor`, `PurchaseTotals`, `ConfirmPurchaseModal`, `DiscardPurchaseModal`; `PurchaseDetail` con `CancelPurchaseModal` (solo `purchases.cancel`); `PurchaseStatusBadge` (color + icono + texto).
- `CostHistoryModal` (acción "Costos" en productos, con `products.view_costs`): costo promedio, último costo, margen bruto y variación por compra.
- `MovementsTable` enlaza la compra de origen. `ProductPicker` admite `inputRef`; `isCountableUnit` compartido en `utils/inventory.ts`.
- 208 tests backend, 76 tests frontend.

### Etapa 5 — Corrección tras la prueba en navegador
- Recorrido completo en navegador real (Edge sin ventana + `playwright-core`) contra el backend y una base desechable: registrar con lector, confirmar, movimientos, historial de costos y anular como admin.
- Hallazgo corregido: al anular, el costo promedio no volvía exacto (1.499,98 en vez de 1.500) y el último costo quedaba en el de la compra anulada. Migración `1a48d631b91f`: `inventory_movements.average_cost_before` y `last_cost_before`; la anulación los restaura si la entrada es el último movimiento del producto.
- La lista de productos mostraba ~1 s datos previos a la anulación mientras recargaba: eran datos del mismo usuario (stale-while-revalidate de TanStack Query), no de otra sesión; cerrar sesión limpia la caché. Mejora: `refreshStockQueries` (ajustes, confirmar y anular compras) recarga las consultas de productos, inventario y productos por proveedor que están en pantalla y **descarta** las demás, que al reabrirse cargan frescas en vez de mostrar stock o costos viejos (sin peticiones extra).
- 210 tests backend, 77 tests frontend.

### Etapa 6 — Clientes
- Tabla `customers` (documento único por tipo y número, índice trigram en nombre, `is_default` con índice único parcial). Semilla "Consumidor final" y permisos `customers.read` y `customers.manage` (migración `16dc3234dce6`).
- Endpoints `/customers` (listar con búsqueda por nombre, documento o teléfono y estado; obtener; crear; editar/desactivar). "Consumidor final" no se modifica (409).
- Página `/clientes` (menú filtrado por `customers.read`), `CustomerFormModal` (React Hook Form + Zod) y `CustomersTable` (insignia "Por defecto" con candado, sin acciones).
- Refactor sin cambio de comportamiento: campos de contacto compartidos con proveedores. Colección Postman actualizada.
- 245 tests backend, 82 tests frontend.

### Etapa 7a — Cajas y aperturas (backend)
- Tablas `cash_registers` (nombre único sin distinguir mayúsculas), `cash_sessions` (índices únicos parciales de apertura activa por caja y por usuario) y `cash_movements` (tipo, monto > 0, concepto no vacío). Semilla "Caja Principal" y permisos `cash_registers.read|manage`, `cash.operate|supervise` (migración `85b0113cde15`).
- Endpoints `/cash-registers` (listar con quién la tiene abierta, obtener, crear, editar/desactivar) y `/cash-sessions` (abrir, `current`, historial filtrable, detalle con resumen, movimientos, registrar ingreso/retiro). Colección Postman actualizada.
- Tests de concurrencia: aperturas simultáneas de la misma caja (una gana, la otra recibe `CASH_REGISTER_BUSY`) y retiros simultáneos que no sobregiran (verificado fallando sin el bloqueo).
- 280 tests backend.

### Etapa 7b — Cajas y aperturas (frontend)
- Páginas `/caja` "Mi caja" (`cash.operate`): `OpenSessionForm` o `CashSessionSummary` + `CashMovementModal` (ingreso/retiro con conceptos sugeridos) + `CashMovementsList`; `/cajas` (`cash_registers.read`, gestión con `manage`) con `CashRegistersTable` y `CashRegisterFormModal`; `/caja/aperturas` (`cash.supervise`) con `CashSessionsTable` y detalle en modal. Menú filtrado por permisos.
- `CashSessionStatusBadge` y `CashMovementTypeBadge` (color + icono + texto). `types/cash.ts`, `services/cash.ts`, `hooks/useCash.ts`, `utils/cash.ts` (etiquetas y esquemas Zod).
- Recorrido en navegador real (Edge sin ventana + `playwright-core`) con base desechable: cajero abre caja, ingreso, retiro excedido rechazado, retiro con decimales; admin ve la caja ocupada, no puede desactivarla, nombre duplicado rechazado, crea caja, ve el detalle de la apertura. Corregidos: resaltado doble en el menú y valor partido en dos líneas.
- 280 tests backend, 88 tests frontend.

### Etapa 8a — Ventas (backend)
- Tablas `payment_methods` (7 métodos sembrados; un único `is_cash`), `sales` (consecutivo único, CHECKs de totales y anulación), `sale_items` (precio y costo del momento, reparto del descuento de la venta, CHECK de total) y `sale_payments` (recibido y cambio con CHECK). `inventory_movements` y `cash_movements` ganan `sale_id`; `cash_movements` los tipos `sale` y `sale_cancellation`. Secuencia `sale` (`VENTA`) y permisos `sales.*` (migración `a201edd2370f`).
- Endpoints `GET /payment-methods`, `/sales` (listar con búsqueda por consecutivo o cliente, estado, cliente, apertura, cajero y fechas; obtener; registrar; `cancel`). El resumen de caja incluye `total_cash_sales` y `total_cash_cancellations`; movimientos de inventario y de caja devuelven la venta de origen. Colección Postman actualizada.
- Tests de concurrencia: la última unidad vendida a la vez por dos cajeros se vende una sola vez; consecutivos seguidos; la misma venta anulada a la vez se revierte una sola vez (verificados fallando sin el bloqueo).
- Frontend sin cambios (llega en la 8b).
- 338 tests backend.

### Etapa 8b — POS y ventas (frontend)
- Página `/pos` "Punto de venta" (`sales.create`): sin apertura activa invita a abrir caja. `ProductPicker` con `includeServices` (muestra precio), `CartTable` (cantidad, descuento, aviso de stock, quitar), `CustomerPickerModal`, descuento de la venta, `SaleTotals`, `PaymentModal` (pagos mixtos, recibido y cambio) y `SaleCompletedModal`.
- Páginas `/ventas` y `/ventas/:id` (`sales.read`) con `SalesTable`, `SaleDetail`, `SaleStatusBadge` (color + icono + texto) y `CancelSaleModal` (solo `sales.cancel`). Menú "Punto de venta" y "Ventas".
- Caja: resumen con ventas y anulaciones en efectivo, insignias y signo de los nuevos tipos, concepto enlazado a la venta; tipos manuales separados (`ManualCashMovementType`). Inventario: movimientos enlazan la venta (texto sin enlace sin `sales.read`).
- Compartidos: `divideHalfUp` pasa a `utils/decimal.ts`; `getProduct` en `services/products.ts`; `Button` acepta `ref`.
- Recorrido en navegador real (Edge sin ventana + `playwright-core`) con base desechable: cajero sin caja → abre caja; escanea dos veces (cantidad 2) y un servicio; descuento de venta; F2, recibido y cambio; venta mixta Nequi + efectivo; stock insuficiente rechazado sin cambios; "Mi caja" con ventas en efectivo; admin anula y el reintegro aparece en la caja del cajero. Corregido: Enter en "Venta registrada" no iniciaba la siguiente venta (foco robado por el modal de cobro al cerrarse); título "Movimientos de caja".
- 338 tests backend, 108 tests frontend.

### Etapa 9a — Arqueo y cierre de caja (backend)
- `cash_sessions` gana `closed_at`, `closed_by_id`, `expected_cash`, `counted_cash`, `difference` y `closing_notes` con CHECKs de consistencia; descripciones de `cash.operate` y `cash.supervise` actualizadas (migración `ac51be84502f`).
- Endpoints `POST /cash-sessions/{id}/close` y `GET /cash-sessions/{id}/sales-summary` (ventas y pagos por método). Las aperturas devuelven `closing` y el listado filtra por `has_difference`. Colección Postman y README actualizados.
- Test de concurrencia: venta y cierre simultáneos nunca dejan efectivo fuera del conteo (verificado fallando sin el bloqueo). `_run_concurrently` generalizado (cada llamada devuelve su resultado como texto).
- Tests existentes que marcaban aperturas cerradas usan `mark_closed` (el CHECK exige los datos del cierre).
- Frontend sin cambios (llega en la 9b).
- 360 tests backend.

### Etapa 9b — Arqueo y cierre de caja (frontend)
- "Mi caja": botón "Cerrar caja" con `CloseSessionModal` (desglose del esperado, `CashSalesByMethod`, efectivo contado con `CashDifferenceBadge` en vivo, observaciones obligatorias con diferencia, aviso de cierre definitivo) y modal "Caja cerrada" con el resultado; luego ofrece abrir caja.
- "Aperturas de caja": columnas contado y arqueo, filtro "Arqueo" (`has_difference`), `CashSessionDetailModal` con el cierre, ventas por método, movimientos y "Cerrar caja" para aperturas abiertas. `CashSessionSummary` muestra el cierre.
- POS: si la caja se cerró en otra pestaña, la venta recarga la apertura y pide abrir caja.
- Recorrido en navegador real (Edge sin ventana + `playwright-core`) con base desechable: ventas en efectivo y mixta, cierre con faltante (observaciones exigidas), anulación del admin mientras el cajero contaba (409, nuevo esperado y sobrante en vivo, recuento cuadrado), el supervisor cierra una apertura olvidada, tabla y filtro por diferencia. Corregidos: el resultado del cierre no aparecía (callbacks de `mutate` perdidos al desmontarse el modal) e insignia de arqueo partida en dos líneas.
- 360 tests backend, 111 tests frontend.

### Etapa 10a — Auditoría (backend)
- Tabla `audit_logs` (acción y tipo de entidad con CHECKs, valores anteriores y nuevos en JSONB, índices por entidad, usuario, acción y fecha, trigram en el nombre) con trigger de inmutabilidad y permiso `audit.read` (migración `525470f17f53`).
- 20 acciones auditadas en productos, inventario, ventas, caja, compras, proveedores y usuarios. Servicios de proveedores, descarte de compras y usuarios reciben ahora `actor`.
- Endpoint `GET /audit-logs` (filtros por entidad, acción, usuario, búsqueda y fechas; paginado). Colección Postman y README actualizados.
- Frontend sin cambios (llega en la 10b).
- 380 tests backend.

### Etapa 10b — Auditoría (frontend)
- Página `/auditoria` (`audit.read`, menú "Auditoría"): `AuditLogsTable` (fecha, usuario o "Sistema", `AuditActionBadge` con color + icono + texto, `AuditEntityLink` a ventas y compras, resumen), filtros por área (reinicia la acción), acción, usuario (solo con `users.read`), búsqueda y fechas, y `AuditLogDetailModal` (campo · anterior · nuevo; una sola columna en creaciones y eliminaciones).
- `types/audit.ts`, `services/audit.ts`, `hooks/useAudit.ts`, `utils/audit.ts`; `useUsers` acepta `enabled`.
- Backend: el retiro manual reutiliza el esperado ya calculado (sin consulta repetida).
- Recorrido en navegador real (Edge sin ventana + `playwright-core`) con base desechable: datos de todas las áreas por API; listado, orden, "Sistema" para `create-admin`, detalle, filtros por área, usuario y búsqueda, enlace a la venta, cambio propio visible al volver, móvil sin scroll horizontal y cajero sin acceso. Corregidos: scroll horizontal en móvil (`sr-only` en el encabezado) y orden arbitrario de los campos (JSONB).
- 380 tests backend, 122 tests frontend.

### Etapa 11a — Reportes (backend)
- Endpoints `GET /reports/sales` (por día, cajero, caja, producto, categoría o método de pago), `/reports/purchases` (por proveedor, producto, categoría o día), `/reports/inventory` (por categoría) y `/reports/cash` (por día, caja o cajero), con filtros, grupos paginados y resumen. Sin cambios de base de datos ni permisos nuevos.
- Configuración `BUSINESS_TIMEZONE` (validada al arrancar). `query.paginate_rows` para consultas de varias columnas. Colección Postman y README actualizados.
- Frontend sin cambios (llega en la 11b).
- 401 tests backend.
