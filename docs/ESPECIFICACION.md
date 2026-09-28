# URANTIAD — Especificación del sistema

URANTIAD es un negocio de venta de productos comestibles, bebidas, productos de consumo y servicios de fotocopias e impresiones.

El sistema es una aplicación web full stack: **POS + Inventario + Compras + Proveedores + Caja + Reportes**, con trazabilidad y control de todas las operaciones.

Tecnologías: Python, FastAPI, React, TypeScript, PostgreSQL, SQLAlchemy, Alembic, Tailwind CSS, REST API, JWT, Docker, Git, GitHub, GitHub Actions y Postman.

---

## 1. Flujo principal

**Productos:** Proveedor → Compra → Entrada de inventario → Stock → Venta → Salida de inventario → Caja → Reportes

**Servicios:** Fotocopia / Impresión → Venta → Caja (no afectan inventario)

---

## 2. Categorías

Nombre, descripción, estado (activa/inactiva). CRUD con desactivación en lugar de borrado si tiene productos asociados.

## 3. Productos

Campos: ID, SKU (único), código de barras (único, opcional), nombre, descripción, categoría, unidad de medida, tasa de IVA, costo promedio, último costo, precio de venta, stock actual, stock mínimo, punto de reorden, stock objetivo, estado, fechas de creación y actualización.

Funciones: crear, editar, buscar (por nombre, SKU o código de barras), filtrar (categoría, estado, nivel de stock), activar/desactivar y consultar historial de movimientos y de precios.

El stock solo cambia a través de movimientos de inventario, nunca editando el campo directamente.

## 4. Inventario

Tipos de movimiento: entrada por compra, venta, ajuste positivo, ajuste negativo, devolución de compra, devolución de venta, anulación de venta.

Cada movimiento registra: producto, tipo, cantidad, stock anterior, stock nuevo, costo unitario, motivo, usuario, fecha y referencia (documento de origen: venta, compra o ajuste).

Los ajustes manuales exigen motivo obligatorio y quedan en auditoría.

## 5. Alertas de inventario

| Estado | Condición | Texto | Indicador |
|---|---|---|---|
| Verde | stock > punto de reorden | "Stock suficiente" | color + icono + texto |
| Amarillo | stock ≤ punto de reorden | "Comprar pronto" | color + icono + texto |
| Rojo | stock ≤ stock mínimo | "Stock crítico" | color + icono + texto |
| Rojo | stock = 0 | "Agotado" | color + icono + texto |

Nunca depender solo del color. Incluir la sección **"Productos que requieren reposición"**.

## 6. Sugerencia de compra

Configurable por producto: stock mínimo, punto de reorden y stock objetivo.

Regla: si stock ≤ punto de reorden, sugerir comprar `stock objetivo − stock actual`.

Ejemplo: stock actual 8, punto de reorden 10, stock objetivo 20 → sugerencia: comprar 12 unidades.

## 7. Proveedores

Campos: tipo y número de documento/NIT (único), nombre o razón social, persona de contacto, teléfono, correo, dirección, ciudad, observaciones, estado. CRUD con desactivación.

## 8. Productos por proveedor

Relación muchos a muchos con datos propios: precio de compra del proveedor, código del producto en el proveedor, fecha del último precio, observaciones.

Consultas: Proveedor → productos que suministra; Producto → proveedores que lo venden (con su último precio).

## 9. Compras

Encabezado: consecutivo (`COMPRA-000001`), proveedor, número de factura del proveedor, usuario, fecha, subtotal, descuento, impuestos, total, total pagado, saldo pendiente, estado (borrador, confirmada, anulada), observaciones.

Detalle: producto, cantidad, costo unitario, descuento, tasa y valor de impuesto, subtotal.

Al **confirmar** (en una sola transacción): compra confirmada → entradas de inventario → actualización de stock → recálculo de costo promedio ponderado → registro en historial de costos → actualización del precio en productos por proveedor.

Una compra en borrador se puede editar; una confirmada solo se puede anular (con movimientos inversos).

## 10. Historial de costos

Guardar cada costo de compra por producto, proveedor y fecha. Permitir consultar: último costo, costo promedio, variación entre compras y margen.

Fórmula de costo promedio ponderado:
`nuevo costo promedio = (stock actual × costo promedio actual + cantidad comprada × costo unitario) / (stock actual + cantidad comprada)`

## 11. Cuentas por pagar (preparar estructura)

Cada compra guarda total, total pagado y saldo pendiente. Ejemplo: compra $500.000, pagado $300.000, pendiente $200.000.

Etapa futura: registro de pagos y abonos a proveedores, saldos por proveedor e historial.

## 12. Clientes

Campos: tipo y número de documento (único), nombre, teléfono, correo, dirección, estado. Existe un cliente por defecto "Consumidor final" para ventas sin cliente registrado.

## 13. Ventas / POS

Funciones: búsqueda de productos y servicios, lectura de código de barras, carrito, modificar cantidades, eliminar líneas, descuento por línea y por venta, cálculo de subtotal/impuestos/total, selección de cliente, método(s) de pago, cálculo de cambio en efectivo y confirmación.

Reglas:
- No se puede vender sin una apertura de caja activa del usuario.
- No se puede vender más que el stock disponible (salvo que se habilite stock negativo).
- Cada línea guarda el precio de venta y el costo unitario del momento, para calcular márgenes históricos.

Confirmación (una sola transacción): venta + detalle + pagos + salidas de inventario + movimiento de caja por la parte en efectivo.

Anulación: requiere permiso y motivo; marca la venta como anulada y genera movimientos inversos de inventario y caja. Nunca se borra.

## 14. Consecutivos

Cada venta tiene un consecutivo único y sin huecos: `VENTA-000001`, `VENTA-000002`... Igual para compras (`COMPRA-000001`). El backend garantiza la unicidad mediante una tabla de secuencias con bloqueo de fila dentro de la transacción y un constraint `UNIQUE`.

## 15. Métodos de pago

Efectivo, Nequi, Daviplata, transferencia, tarjeta débito, tarjeta crédito, otro.

Los métodos se guardan en una tabla (no como valores fijos en el código) para poder activar o agregar nuevos. Una venta puede tener varios pagos (pagos mixtos); la suma de los pagos debe ser igual al total.

## 16. Cajas

Múltiples cajas (ejemplo: Caja Principal, Caja 2, Caja Fotocopias). Campos: nombre, descripción, estado.

## 17. Apertura de caja

Registrar: caja, usuario, fecha y hora, dinero inicial, observaciones.

Reglas: una caja solo puede tener una apertura activa a la vez; un usuario solo puede tener una apertura activa a la vez.

## 18. Movimientos de caja

Tipos: ingreso y retiro (además de los generados automáticamente por ventas en efectivo y anulaciones).

Registrar: apertura/caja, usuario, tipo, valor, concepto, fecha y hora.

## 19. Arqueo y cierre

Cálculo del efectivo esperado:

```
Esperado = Dinero inicial
         + Ventas en efectivo
         + Ingresos
         − Retiros
         − Anulaciones en efectivo
```

Se solicita el dinero contado y se calcula: `Diferencia = Contado − Esperado` (positiva = sobrante, negativa = faltante).

Al cerrar se guarda: esperado, contado, diferencia, observaciones, usuario y fecha. El cierre también muestra el resumen de ventas por los demás métodos de pago (que no entran al efectivo contado).

## 20. Servicios

Fotocopia B/N, fotocopia color, impresión B/N, impresión color, escaneo. Se venden en el POS por cantidad con precio unitario configurable. No afectan inventario.

Implementación sugerida: productos con un campo `type` (`product` / `service`), donde los servicios no generan movimientos de inventario.

## 21. Devoluciones (preparar arquitectura)

Etapa futura: devoluciones parciales o totales de ventas y devoluciones a proveedores, con sus movimientos de inventario y caja. Los tipos de movimiento ya existen desde la etapa de inventario.

## 22. Reportes

- **Ventas:** por día, rango de fechas, usuario, caja, producto, categoría y método de pago.
- **Compras:** por proveedor, producto, fecha y total comprado.
- **Inventario:** stock actual, agotados, stock bajo, reposición sugerida y movimientos.
- **Caja:** aperturas, cierres, arqueos, ingresos, retiros y diferencias.

Todos con filtros y paginación. Exportación a CSV/Excel en una etapa posterior.

## 23. Dashboard

Ventas del día (valor y número), ventas por método de pago, estado de las cajas, productos agotados, productos por reponer, compras recientes y ventas recientes.

## 24. Estadísticas (etapa posterior)

Ventas diarias, semanales y mensuales; productos más vendidos; ventas por categoría y método de pago; evolución en el tiempo; rotación de inventario.

## 25. Costos y márgenes

```
Margen bruto     = Precio de venta − Costo
Margen bruto (%) = (Precio de venta − Costo) / Precio de venta × 100
```

El margen bruto no es la utilidad neta (esta última descuenta gastos operativos, que el sistema no gestiona).

## 26. Usuarios, roles y permisos

Roles: **Administrador** (acceso total), **Cajero** (POS, su caja, clientes, consulta de productos), **Inventario** (productos, inventario, proveedores, compras).

Los permisos se modelan como permisos específicos asignados a roles (ej. `sales.create`, `sales.cancel`, `inventory.adjust`), no como verificaciones de rol dispersas en el código.

## 27. Auditoría

Registrar quién, qué, cuándo, valor anterior y valor nuevo para: cambios en productos y precios, ajustes de inventario, ventas anuladas, aperturas y cierres de caja, ingresos y retiros, compras y cambios en proveedores.

## 28. Funcionalidades futuras (no implementar)

Facturación electrónica DIAN, impresora térmica, integración con WhatsApp, notificaciones, promociones, múltiples sucursales, múltiples bodegas, IA y predicción de demanda, aplicación móvil.

La arquitectura debe permitir agregarlas después sin rediseños mayores, pero sin crear tablas ni código para ellas por adelantado.

## 29. Objetivo profesional

El proyecto debe demostrar conocimientos prácticos en Python, FastAPI, React, TypeScript, PostgreSQL, SQLAlchemy, Alembic, REST API, JWT, Docker, Git, GitHub, GitHub Actions, Postman y testing, y poder presentarse como proyecto de portafolio.
