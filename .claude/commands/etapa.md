---
description: Iniciar una etapa de URANTIAD siguiendo el ciclo de trabajo del proyecto
---

# URANTIAD — Control de etapa

Trabajaremos únicamente en la etapa: **$ARGUMENTS**

## Fase 1 — Análisis y plan (no escribas código todavía)

1. **Analiza el proyecto actual.** Revisa `docs/PROGRESS.md`, la estructura real del repositorio y los archivos relacionados con esta etapa (modelos, migraciones, servicios, endpoints, componentes, tests). No asumas que un archivo existe: verifícalo. Lee de `docs/ESPECIFICACION.md` solo las secciones relevantes.
2. **Objetivo.** En pocas líneas: qué vamos a construir, qué problema resuelve y cómo se integra con lo existente.
3. **Base de datos.** Tablas nuevas o modificadas, campos, relaciones, índices, foreign keys y constraints. Si modificas una tabla existente, indica qué depende de ella.
4. **Backend.** Endpoints (método, ruta, permiso requerido), schemas, modelos, servicios, repositorios (solo si aportan) y validaciones de negocio.
5. **Frontend.** Páginas, componentes, hooks, services, types y rutas.
6. **Pruebas planificadas.** Qué casos críticos vas a probar.
7. **Riesgos o decisiones.** Si detectas un problema arquitectónico que afecte etapas futuras, explícame el problema, por qué ocurre, las opciones y tu recomendación.

Presenta el plan de forma concisa y **espera mi aprobación** antes de implementar.

## Fase 2 — Implementación (tras mi aprobación)

- Implementa solo esta etapa. Nada de funcionalidades de etapas posteriores ni código innecesario.
- Genera y revisa la migración de Alembic; aplícala.
- Ejecuta: tests del backend (pytest), tests del frontend cuando corresponda (Vitest), Ruff y ESLint. Corrige los errores.
- Revisa regresiones: la suite completa de tests debe seguir pasando, especialmente autenticación, base de datos y API.
- Si hay endpoints nuevos, actualiza la colección de Postman en `docs/postman/`.
- Actualiza `README.md` si cambia la instalación o ejecución, y agrega la entrada de la etapa en `docs/PROGRESS.md`.

## Fase 3 — Resultado

Entrega un resumen breve con:

- **Implementado**
- **Archivos creados / modificados**
- **Base de datos** (cambios y migración)
- **API** (endpoints creados o modificados)
- **Pruebas** (ejecutadas y resultado)
- **Commit propuesto** (Conventional Commits, en inglés)
- **Pendientes**

Haz el commit solo cuando yo lo apruebe. No hagas `git push`.

**Detente. No comiences la siguiente etapa sin mi autorización.**
