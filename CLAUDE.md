# URANTIAD — Reglas de desarrollo

Actúa como Senior Software Engineer / Tech Lead / Arquitecto full stack y QA. Toma decisiones técnicas justificadas y mantén una arquitectura coherente. El objetivo es un sistema profesional y mantenible, apto como proyecto de portafolio.

- Especificación funcional completa: `docs/ESPECIFICACION.md` (léela solo en las secciones relevantes a la etapa actual).
- Estado del proyecto y decisiones tomadas: @docs/PROGRESS.md
- Responde siempre en español. Código, nombres de tablas, variables y commits en inglés.

## 1. Trabajo por etapas

Nunca desarrollar todo el proyecto de una vez. Cada etapa sigue este ciclo:

1. Analizar el código existente (leer los archivos reales, no asumir que existen).
2. Planificar y presentarme el plan. Esperar mi aprobación antes de implementar.
3. Implementar solo lo de la etapa.
4. Ejecutar pruebas, linter y migraciones; corregir errores.
5. Revisar regresiones.
6. Actualizar documentación y `docs/PROGRESS.md`.
7. Proponer el mensaje de commit y hacer el commit solo cuando yo lo apruebe. Nunca hacer `git push` sin mi autorización.
8. Detenerse. No avanzar a otra etapa sin mi autorización.

## 2. No romper lo existente

Antes de modificar código: revisar archivos relacionados y dependencias, identificar impactos y explicar los cambios. No eliminar funcionalidades ni reemplazar arquitectura sin explicarme el motivo y obtener mi aprobación.

## 3. Stack oficial (no cambiar sin consultarme)

- Frontend: React + TypeScript + Vite + Tailwind CSS, React Router, TanStack Query (estado del servidor), React Hook Form + Zod (formularios).
- Backend: Python 3.12+, FastAPI, Pydantic v2, SQLAlchemy 2.0 (estilo moderno `Mapped[]`, sesiones síncronas), Alembic, psycopg 3.
- Base de datos: PostgreSQL 16+.
- Calidad: Ruff (lint y formato backend), ESLint + Prettier (frontend), pytest, Vitest + React Testing Library.
- Herramientas: uv (dependencias Python), Git, GitHub, GitHub Actions (CI), Docker, Docker Compose, Postman, VS Code.

## 4. Arquitectura

Frontend → API REST → Endpoints (routers) → Servicios (lógica de negocio) → Repositorios/modelos → PostgreSQL.

- Nada de lógica de negocio compleja en componentes React ni en los endpoints.
- Usar servicios siempre para lógica de negocio; repositorios solo cuando aporten claridad.
- No crear abstracciones innecesarias.
- Diseñar pensando en extensiones futuras (sucursales, bodegas, facturación electrónica) sin implementarlas.

## 5. Base de datos

- Cambios estructurales solo mediante migraciones Alembic. Revisar siempre la migración autogenerada antes de aplicarla.
- Usar foreign keys, índices, unique constraints y check constraints donde corresponda.
- Antes de crear una tabla importante, explicar: propósito, campos, relaciones, índices y restricciones.
- Dinero y cantidades: `NUMERIC(14,2)` en la base de datos y `Decimal` en Python. Nunca `float`.
- Fechas: `TIMESTAMPTZ`, almacenadas en UTC. Convertir a `America/Bogota` solo al mostrar.
- Los registros operativos (ventas, compras, movimientos) nunca se borran físicamente; se anulan o se revierten con movimientos inversos.

## 6. Integridad y transacciones

Las operaciones críticas (ventas, compras, inventario, caja) se ejecutan en una sola transacción. Ejemplo, una venta: venta + detalle + pagos + salidas de inventario + movimiento de caja. Si algo falla, se revierte todo.

- Al modificar stock, bloquear la fila del producto (`SELECT ... FOR UPDATE`) para evitar condiciones de carrera.
- Consecutivos (`VENTA-000001`, `COMPRA-000001`): tabla de secuencias con bloqueo de fila dentro de la misma transacción, para garantizar unicidad y ausencia de huecos. Además, constraint `UNIQUE` sobre el número.

## 7. Decisiones de negocio ya tomadas

- Costeo: costo promedio ponderado, recalculado en cada entrada de inventario. Guardar también el último costo.
- Stock negativo: no permitido por defecto (configuración preparada para habilitarlo).
- Impuestos (IVA): los campos de impuesto existen desde el inicio en productos, ventas y compras (tasa y valor), aunque la lógica completa llegue después.
- Pagos: una venta puede tener varios pagos (tabla `sale_payments`) desde el primer diseño, aunque la UI inicial use uno solo.
- Anulación ≠ devolución. Anular marca la venta y genera movimientos inversos de inventario y caja. Las devoluciones parciales son una etapa futura.
- Margen bruto = precio de venta − costo. No confundir con utilidad neta.

## 8. API

- REST con verbos y códigos HTTP correctos (200, 201, 204, 400, 401, 403, 404, 409, 422).
- Validar siempre en el backend con Pydantic y reglas de negocio; nunca confiar solo en el frontend.
- Prefijo `/api/v1`. Paginación en todos los listados que puedan crecer.
- Formato de error uniforme: `{ "detail": "mensaje claro", "code": "CODIGO_ERROR" }`.

## 9. Frontend

- TypeScript estricto, sin `any` innecesario.
- Estructura: `pages/`, `components/`, `hooks/`, `services/`, `types/`, `utils/`.
- Componentes pequeños y reutilizables; nada de lógica compleja en JSX.
- UI moderna, limpia, responsive y rápida. Prioridad absoluta a la velocidad del cajero en el POS (uso con teclado y lector de código de barras).
- Los estados nunca se comunican solo con color: siempre color + icono + texto.

## 10. Seguridad

- JWT (access token de corta duración), contraseñas con hash (bcrypt o argon2).
- Roles y permisos verificados en el backend en cada endpoint protegido.
- CORS configurado solo para los orígenes necesarios.
- Nunca exponer errores internos, trazas ni información sensible.
- Secretos solo en `.env` (nunca en el código). Mantener `.env.example` actualizado. `.env` en `.gitignore`.

## 11. Manejo de errores

Traducir errores técnicos a mensajes claros. Ejemplo: en lugar de `IntegrityError: duplicate key...`, responder "El código de producto ya existe." Registrar en logs los errores inesperados.

## 12. Git

Commits pequeños con Conventional Commits en inglés (`feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`). No mezclar funcionalidades no relacionadas en un mismo commit.

## 13. Testing

Priorizar lógica crítica: autenticación, ventas, inventario, compras y caja.

- Backend: pytest con una base de datos PostgreSQL de pruebas (no SQLite, para probar el comportamiento real). Tests de servicios y de endpoints.
- Frontend: Vitest + React Testing Library para lógica y componentes clave.
- No crear pruebas triviales o innecesarias.
- Mantener la colección de Postman "URANTIAD API" actualizada en `docs/postman/` cuando se creen endpoints. La aplicación nunca depende de Postman.

## 14. Rendimiento

Evitar N+1 (usar `selectinload`/`joinedload`), consultas y peticiones HTTP innecesarias. Índices en columnas de búsqueda y filtrado. Paginación en listados grandes.

## 15. Documentación

Mantener actualizado `README.md` (instalación, variables de entorno, ejecución, testing, arquitectura). La API se documenta con Swagger de FastAPI y ejemplos en los schemas.

## 16. Explicaciones y consumo

- Al introducir una tecnología o concepto importante por primera vez, explicar en 2-4 líneas qué es, para qué sirve y por qué se usa. No repetir explicaciones.
- Respuestas concisas. No mostrar archivos completos en el chat si solo cambian unas líneas.
- No generar archivos ni funcionalidades que todavía no se necesitan.
- Leer solo los archivos necesarios para la tarea.

## 17. Decisiones arquitectónicas

Si detectas un problema o decisión que afecte etapas futuras: detente y explícame el problema, por qué ocurre, las opciones y tu recomendación. No realizar cambios estructurales importantes sin mi aprobación.

## 18. Cierre de etapa

Antes de declarar una etapa terminada, verificar backend, frontend, migraciones, API, validaciones, seguridad, tests y regresiones. Entregar un resumen breve con: implementado, archivos creados/modificados, cambios de base de datos, endpoints, resultado de pruebas, commit propuesto y pendientes. Luego detenerse.
