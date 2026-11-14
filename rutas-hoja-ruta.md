# Plan: actualización de `/cooperativa/rutas` y hoja de ruta automática

## Overview

Actualizar la página de rutas de la cooperativa para que el administrador pueda:

1. Ver las rutas registradas con filtros.
2. Crear rutas mediante un modal(origen y destino solo requiere provincia y canton), asignando obligatoriamente un grupo de buses.
3. Generar la hoja de ruta diaria con asignación automática de buses.
4. Dejar `N` buses en descanso por grupo, configurable por la cooperativa.
5. Mostrar una advertencia cuando no existan buses de repuesto para el descanso.
6. Rotar la disposición de los buses día a día: si un bus empieza el lunes con la salida de las 08:00, el martes debe tomar la siguiente salida, y así hasta su turno de descanso, para luego reiniciar el ciclo.

La implementación reutiliza la hoja de ruta existente (`route_sheets`, `trips`, `frequencies`) y la tabla ya definida `route_sheet_standby_buses`, que hoy no se expone ni se guarda desde la API.

## Project Type

**WEB full-stack**

- Frontend: React 19 + Vite + TypeScript, estilos CSS propios.
- Backend: FastAPI + SQLAlchemy + SQLite/PostgreSQL.
- Autenticación y permisos existentes por cooperativa.

## Decisiones asumidas

Estas decisiones permiten ejecutar el plan sin bloquear el desarrollo. Si alguna no coincide con la intención del negocio, debe corregirse antes de implementar.

1. **El grupo de buses se asigna a la ruta**, no solo a la frecuencia. Se agrega `routes.bus_group_id`; las frecuencias seguirán perteneciendo al mismo grupo para conservar la lógica actual.
2. **La cantidad `N` de buses en descanso se configura por grupo de buses**, porque la hoja de ruta es por grupo y cada grupo puede tener una flota distinta. La cooperativa la administra desde la gestión de grupos y se muestra en la hoja de ruta.
3. **La rotación es circular y continua por fecha calendario**, usando una fecha ancla lunes. Cada día la lista de buses operativos se desplaza una posición; los buses que cumplen su turno pasan a descanso y, al completar el ciclo, vuelven a la rotación.
4. **La generación automática no sobrescribe hojas publicadas** ni hojas con reservas. Solo propone/rellena hojas sin guardar o borradores.
5. **La propuesta automática se muestra como vista previa**; el usuario guarda o publica explícitamente. Esto evita crear viajes sin confirmación.

## Success Criteria

- [x] `/cooperativa/rutas` muestra las rutas de la cooperativa con filtros por texto, grupo y estado.
- [x] Existe un botón visible para crear ruta que abre un modal accesible.
- [x] El modal permite seleccionar grupo de buses, origen, destino, duración y paradas; la ruta creada queda asociada al grupo.
- [x] Al abrir la hoja de ruta de un grupo se precargan los buses de cada frecuencia para los seis días del periodo.
- [x] Cada día muestra los `N` buses en descanso del grupo.
- [x] La asignación de un mismo bus cambia de una salida a la siguiente entre lunes y martes, y continúa rotando hasta el descanso.
- [x] Si la flota no alcanza para cubrir las salidas y dejar `N` buses en descanso, se muestra la advertencia "No hay buses de repuesto".
- [x] La cantidad `N` se puede editar y persiste en el grupo de buses.
- [x] Guardar una hoja conserva las asignaciones y los buses en descanso; publicar mantiene las validaciones actuales de reservas, buses operativos y conflictos de horario.
- [x] Las hojas publicadas no se sobrescriben automáticamente.
- [x] Pasan `pytest`, `pnpm typecheck`, `pnpm lint` y `pnpm build:web`.

## Tech Stack

| Capa | Tecnología | Uso en este cambio |
|---|---|---|
| Frontend | React 19, TypeScript, Vite | Modal, filtros, hoja de ruta automática |
| Estilos | CSS modules por feature | Modal, tarjetas, chips de descanso, advertencias |
| Backend | FastAPI, Pydantic v2 | Nuevos endpoints y contratos |
| ORM | SQLAlchemy 2 | Nuevos campos y consultas |
| Base de datos | SQLite en desarrollo, PostgreSQL en producción | Migración aditiva compatible |
| Pruebas | pytest, TestClient | Rotación, API, persistencia y migraciones |
| Calidad | ESLint, Prettier, tsc | Verificación del frontend |

## Estado actual relevante

- La página `CooperativeRoutesPage.tsx` ya tiene creación de rutas, frecuencias, tarifas y hoja de ruta, pero:
  - El formulario de creación está embebido en la página, no en un modal.
  - No hay filtros de rutas.
  - La ruta no tiene grupo; el grupo vive en `frequencies.bus_group_id`.
  - La asignación de buses es manual por frecuencia y por día.
  - No se muestran ni guardan buses en descanso.
- `RouteSheet` ya tiene la relación `standby_buses` y la tabla `route_sheet_standby_buses`, pero no se usa en la API ni en la interfaz.
- `RouteSheetMode.AUTOMATIC` ya existe, pero no se usa.
- La hoja de ruta actual valida conflictos de 30 minutos, continuidad de ciudad y buses operativos.
- La carga actual hace seis peticiones `GET /route-sheets` en paralelo, una por día.

## Diseño técnico

### Modelo de datos

```text
bus_groups
  + rest_buses_count INTEGER NOT NULL DEFAULT 1   # N buses en descanso por hoja

routes
  + bus_group_id INTEGER NULL REFERENCES bus_groups(id) ON DELETE RESTRICT
  + índice idx_routes_bus_group_id

route_sheets
  (sin cambios de columnas)

route_sheet_standby_buses
  (ya existe; se empieza a leer/escribir)
```

Reglas:

- `rest_buses_count` debe estar entre `0` y `50`; por defecto `1`.
- Una ruta nueva debe enviar `busGroupId` obligatorio.
- Las rutas históricas sin grupo siguen funcionando; se backfillean si todas sus frecuencias pertenecen a un mismo grupo.
- Una frecuencia no puede pertenecer a un grupo distinto al de su ruta.
- `RouteSheetSave` agrega `standbyBusIds` y `mode`.
- `RouteSheetRead` agrega `mode`, `standbyBuses`, `warnings`, `autoGenerated` y `restBusesCount`.

### Algoritmo de rotación

Implementar en un módulo puro y testeable: `apps/api/app/modules/schedules/rotation.py`.

```text
ANCHOR = lunes de referencia (2025-01-06)

day_index = (service_date - ANCHOR).days

buses = buses del grupo con is_active=true y status=operativo,
        ordenados por number, id

rest_count = min(max(group.rest_buses_count, 0), max(len(buses) - 1, 0))
rest_start = (day_index * max(rest_count, 1)) % len(buses)
standby = [buses[(rest_start + i) % len(buses)] for i in range(rest_count)]

working = buses sin los buses de standby
offset = day_index % len(working)
rotation = working[offset:] + working[:offset]

frequencies = frecuencias activas del grupo ordenadas por departure_time, id

para cada frecuencia:
    buscar en rotation, desde el puntero circular, el primer bus que:
      - no tenga viaje previo, o
      - haya llegado antes de departure_time - 30 minutos y
        su destino anterior coincida con el origen de la frecuencia
    si existe:
        asignar bus
        registrar hora de llegada y destino
        avanzar puntero
    si no existe:
        dejar bus_id = null
        agregar advertencia "salida sin bus disponible"

starting_locations = para cada bus asignado,
                     origen de su primera frecuencia del día

warnings:
  - NO_OPERATIONAL_BUSES: no hay buses operativos
  - REST_COUNT_TOO_HIGH: N supera la flota disponible
  - NO_SPARE_BUSES: no queda ningún bus libre después de cubrir las salidas
  - NO_REST_BUSES: no se pudieron dejar los N buses en descanso
  - UNASSIGNED_FREQUENCIES: una o más salidas quedaron sin bus
```

La rotación cumple el requisito: con el paso de los días, el primer bus de la lista cambia de posición y, por tanto, cambia de salida. Cuando un bus entra en descanso, sale de `working`; al completarse el ciclo vuelve a la rotación.

### API propuesta

| Método | Ruta | Uso |
|---|---|---|
| `GET` | `/api/v1/cooperatives/me/route-planning/route-sheets/auto-plan?groupId=&startDate=&days=6` | Devuelve seis días con asignaciones sugeridas, buses en descanso y advertencias. No persiste. |
| `GET` | `/api/v1/cooperatives/me/route-planning/route-sheets?groupId=&serviceDate=` | Se mantiene; ahora incluye `standbyBuses`, `mode` y `warnings` de la hoja guardada. |
| `PUT` | `/api/v1/cooperatives/me/route-planning/route-sheets` | Guarda asignaciones, ubicaciones iniciales, `standbyBusIds` y `mode`. |
| `POST` | `/api/v1/cooperatives/me/route-planning/route-sheets/{sheetId}/publish` | Sin cambios de contrato; valida también los buses en descanso. |
| `PATCH` | `/api/v1/cooperatives/me/groups/{groupId}` | Permite actualizar `restBusesCount`. |
| `POST` | `/api/v1/cooperatives/me/route-planning/routes` | Ahora exige `busGroupId`. |

El endpoint `auto-plan` debe:

- Verificar que el grupo pertenece a la cooperativa autenticada.
- Leer hojas existentes del periodo.
- Si la hoja está publicada, devolverla tal cual.
- Si la hoja no existe o está en borrador sin reservas, devolver la propuesta automática.
- Devolver `warnings` y `standbyBuses` en cada día.
- No escribir en la base de datos.

## File Structure

```text
apps/api/app/modules/
  buses/models.py                         # rest_buses_count en BusGroup
  buses/schemas.py                        # restBusesCount en create/update/read
  buses/service.py                        # persistencia y validación de N
  buses/router.py                         # exponer restBusesCount y proteger borrado
  routes/models.py                        # bus_group_id en Route
  routes/cooperative_schemas.py           # busGroupId obligatorio en ruta
  routes/cooperative_service.py           # validación de grupo y lectura
  routes/cooperative_router.py            # contrato de creación
  schedules/rotation.py                   # NUEVO: algoritmo puro de rotación
  schedules/cooperative_schemas.py        # standbyBuses, warnings, auto plan
  schedules/cooperative_service.py        # auto-plan, persistencia de descanso
  schedules/cooperative_router.py         # endpoint auto-plan y guardado
  core/database.py                        # migración aditiva

apps/api/tests/
  unit/test_route_rotation.py             # NUEVO
  integration/test_cooperative_routes_schedules.py
  integration/test_cooperative_bus_groups.py
  test_route_planning_migration.py        # NUEVO

apps/web/src/features/cooperatives/
  services/busGroup.service.ts            # restBusesCount
  services/routeSchedule.service.ts       # contratos de ruta y hoja automática
  components/CreateRouteModal.tsx         # NUEVO
  components/RouteLocationPicker.tsx      # NUEVO (extraído de la página)
  components/RouteFilters.tsx             # NUEVO
  components/RouteSheetAutoPlan.tsx       # NUEVO
  pages/CooperativeRoutesPage.tsx         # orquestación y estados
  pages/CooperativeRoutesPage.css         # modal, filtros, descanso, advertencias
  pages/CooperativeBusGroupsPage.tsx      # edición de N
  pages/CooperativeBusGroupsPage.css      # estilos del campo N
```

## Task Breakdown

### T01. Modelos y migraciones de datos

- **Agent:** `database-architect`
- **Skills:** `database-design`, `python-patterns`
- **Priority:** P0
- **Dependencies:** ninguna
- **INPUT:** `apps/api/app/modules/buses/models.py`, `apps/api/app/modules/routes/models.py`, `apps/api/app/core/database.py`.
- **OUTPUT:**
  - `BusGroup.rest_buses_count` con default `1` y `CheckConstraint("rest_buses_count >= 0")`.
  - `Route.bus_group_id` nullable, FK a `bus_groups` con `ON DELETE RESTRICT`, índice.
  - Migración aditiva en `init_db()`: `ALTER TABLE` si las columnas no existen; backfill de `routes.bus_group_id` desde `frequencies.bus_group_id` cuando todas las frecuencias de la ruta coincidan.
  - Actualizar `has_group_route_sheets`/borrado de grupo para considerar rutas asociadas.
- **VERIFY:**
  - Crear una base SQLite con tablas antiguas y ejecutar `init_db()`; las columnas nuevas existen.
  - `pytest apps/api/tests/test_route_planning_migration.py -q`.
  - `Base.metadata.create_all()` sigue funcionando en las pruebas existentes.
- **Rollback:** revertir columnas y bloque de migración; no hay cambios destructivos.

### T02. API de configuración de buses en descanso

- **Agent:** `backend-specialist`
- **Skills:** `api-patterns`, `python-patterns`
- **Priority:** P0
- **Dependencies:** T01
- **INPUT:** esquemas, servicio y router de grupos de buses.
- **OUTPUT:**
  - `restBusesCount` en `BusGroupCreate`, `BusGroupUpdate` y `BusGroupRead`.
  - Validación `0 <= restBusesCount <= 50`.
  - Persistencia en `create_bus_group` y `update_bus_group`.
  - `GET /cooperatives/me/groups` devuelve el valor.
- **VERIFY:**
  - Test de integración: crear grupo con `restBusesCount: 2`, actualizar a `1`, leer ambos valores.
  - Valor negativo devuelve `422`.
  - Grupo con rutas asociadas no se puede eliminar (`409`).
- **Rollback:** quitar el campo de esquemas y volver al default de base de datos.

### T03. Rutas con grupo de buses y contrato de frecuencias

- **Agent:** `backend-specialist`
- **Skills:** `api-patterns`, `python-patterns`
- **Priority:** P0
- **Dependencies:** T01, T02
- **INPUT:** `routes/models.py`, `routes/cooperative_schemas.py`, `routes/cooperative_service.py`, `routes/cooperative_router.py`, `schedules/cooperative_service.py`.
- **OUTPUT:**
  - `CooperativeRouteCreate.busGroupId` obligatorio (`gt=0`).
  - `CooperativeRouteRead.busGroupId` y `busGroupName`.
  - `list_routes` precarga el grupo y devuelve el nombre.
  - `create_route` valida que el grupo exista y pertenezca a la cooperativa.
  - `create_frequency` valida que `busGroupId` coincida con el grupo de la ruta; si la ruta histórica no tiene grupo, permite asignarlo o mantiene el comportamiento actual.
  - Actualizar pruebas existentes que crean rutas sin grupo.
- **VERIFY:**
  - Crear ruta con grupo devuelve `busGroupId` y `busGroupName`.
  - Crear ruta con grupo de otra cooperativa devuelve `404`.
  - Crear frecuencia con grupo distinto devuelve `409` con mensaje de grupo.
  - `pytest apps/api/tests/integration/test_cooperative_routes_schedules.py -q`.
- **Rollback:** hacer `busGroupId` opcional temporalmente y conservar la columna nullable.

### T04. Motor puro de rotación

- **Agent:** `backend-specialist`
- **Skills:** `python-patterns`, `testing-patterns`
- **Priority:** P0
- **Dependencies:** T01
- **INPUT:** modelos `Bus`, `Frequency`; reglas de 30 minutos y continuidad de ciudad.
- **OUTPUT:** `apps/api/app/modules/schedules/rotation.py` con funciones puras:
  - `day_index(service_date)`.
  - `select_standby_buses(buses, service_date, rest_count)`.
  - `build_daily_plan(buses, frequencies, service_date, rest_count)`.
  - Resultado con `assignments`, `starting_locations`, `standby_buses`, `warnings`.
- **VERIFY:**
  - Lunes y martes producen asignaciones desplazadas.
  - Con `rest_count=1` y 4 buses, cada día descansa un bus distinto y el ciclo se reinicia.
  - Con `rest_count=0` no hay buses en descanso.
  - Con flota insuficiente se generan las advertencias correctas.
  - Los conflictos de 30 minutos dejan la salida sin bus en lugar de asignar un bus inválido.
  - `pytest apps/api/tests/unit/test_route_rotation.py -q`.
- **Rollback:** el módulo es aislado; se elimina sin afectar la API existente.

### T05. Endpoint de auto-planificación

- **Agent:** `backend-specialist`
- **Skills:** `api-patterns`, `python-patterns`
- **Priority:** P1
- **Dependencies:** T03, T04
- **INPUT:** `schedules/cooperative_service.py`, `cooperative_schemas.py`, `cooperative_router.py`.
- **OUTPUT:**
  - `GET /route-sheets/auto-plan?groupId=&startDate=&days=6`.
  - Respuesta `list[RouteSheetRead]` con `id`, `status`, `mode`, `autoGenerated`, `frequencies`, `buses`, `standbyBuses`, `startingLocations`, `warnings`, `restBusesCount`.
  - Para hojas publicadas devuelve la hoja real sin propuesta.
  - Para hojas inexistentes o borradores sin reservas devuelve la propuesta.
  - No escribe en la base de datos.
- **VERIFY:**
  - Test de integración con 3 días: lunes y martes devuelven buses distintos en la primera salida.
  - Los buses en descanso se devuelven y coinciden con `restBusesCount`.
  - Una hoja publicada no se modifica por la propuesta.
  - Grupo de otra cooperativa devuelve `404`.
- **Rollback:** eliminar endpoint; la página vuelve a cargar hojas con `GET /route-sheets`.

### T06. Persistencia de buses en descanso

- **Agent:** `backend-specialist`
- **Skills:** `api-patterns`, `python-patterns`
- **Priority:** P1
- **Dependencies:** T05
- **INPUT:** `schedules/cooperative_schemas.py`, `schedules/cooperative_service.py`.
- **OUTPUT:**
  - `RouteSheetSave.standbyBusIds: list[int]` y `mode: RouteSheetMode = MANUAL`.
  - `RouteSheetRead.standbyBuses: list[ScheduleBusRead]`, `mode`, `warnings`.
  - `get_route_sheet` carga `sheet.standby_buses`.
  - `save_route_sheet` valida y guarda filas en `route_sheet_standby_buses`; rechaza buses de otro grupo, buses no operativos, duplicados y buses asignados también como descanso.
  - En hojas publicadas solo se permite cambiar descanso si `canReassign` es verdadero.
- **VERIFY:**
  - Guardar con `standbyBusIds` y leer devuelve los mismos buses.
  - Un bus asignado y en descanso a la vez devuelve `409`.
  - Publicar conserva los buses en descanso.
  - Reemplazo en hoja publicada respeta `canReassign`.
- **Rollback:** ignorar `standbyBusIds`; la tabla queda sin uso como hoy.

### T07. Pruebas de integración y regresión del backend

- **Agent:** `test-engineer`
- **Skills:** `testing-patterns`, `python-patterns`
- **Priority:** P1
- **Dependencies:** T01, T02, T03, T04, T05, T06
- **INPUT:** suite actual de rutas, grupos y programación.
- **OUTPUT:**
  - Actualizar `create_route` helper para exigir `busGroupId`.
  - Nuevos tests de auto-plan, rotación, descanso, advertencias, configuración de N y migración.
  - Tests de aislamiento por cooperativa en los endpoints nuevos.
- **VERIFY:** `cd apps/api && ../../venv/bin/python -m pytest -q`.
- **Rollback:** los tests no afectan producción.

### T08. Contratos del frontend

- **Agent:** `frontend-specialist`
- **Skills:** `frontend-design`, `clean-code`
- **Priority:** P1
- **Dependencies:** T02, T03, T05, T06
- **INPUT:** servicios `busGroup.service.ts`, `routeSchedule.service.ts`.
- **OUTPUT:**
  - `CooperativeBusGroup.restBusesCount`.
  - `CooperativeRoute.busGroupId` y `busGroupName`.
  - `createCooperativeRoute` con `busGroupId`.
  - `RouteSheet` con `mode`, `standbyBuses`, `warnings`, `autoGenerated`, `restBusesCount`.
  - `getRouteSheetAutoPlan(groupId, startDate, days)`.
  - `saveRouteSheet` con `standbyBusIds` y `mode`.
- **VERIFY:** `pnpm typecheck`.
- **Rollback:** los tipos son aditivos; revertir el archivo.

### T09. Página de rutas: filtros y modal de creación

- **Agent:** `frontend-specialist`
- **Skills:** `frontend-design`, `clean-code`
- **Priority:** P1
- **Dependencies:** T08
- **INPUT:** `CooperativeRoutesPage.tsx` actual.
- **OUTPUT:**
  - Extraer `RouteLocationPicker` desde la página.
  - Crear `RouteFilters` con búsqueda por texto, grupo y estado.
  - Crear `CreateRouteModal` con grupo, origen, destino, duración y paradas.
  - Botón "Nueva ruta" en el encabezado.
  - La lista de rutas muestra grupo, recorrido, duración, tarifas y estado.
  - Validaciones: grupo obligatorio, origen distinto de destino, paradas ordenadas y duración válida.
  - El modal cierra al guardar, refresca la lista y conserva el mensaje de éxito.
  - Si no hay grupos, el botón se deshabilita con un aviso para crear uno primero.
- **VERIFY:**
  - Crear una ruta desde el modal y verla en la lista con su grupo.
  - Filtrar por texto, grupo y estado.
  - Abrir y cerrar el modal con teclado; foco inicial y retorno de foco.
  - `pnpm typecheck` y `pnpm lint`.
- **Rollback:** conservar el formulario embebido detrás de una condición temporal.

### T10. Hoja de ruta automática y buses en descanso

- **Agent:** `frontend-specialist`
- **Skills:** `frontend-design`, `clean-code`
- **Priority:** P1
- **Dependencies:** T05, T06, T08
- **INPUT:** sección "Hoja de ruta del grupo" actual.
- **OUTPUT:**
  - Reemplazar las seis llamadas `getRouteSheet` por una llamada a `getRouteSheetAutoPlan`.
  - Prellenar `assignedBuses` y `startingCities` con la propuesta.
  - Estado `standbyBuses` por día.
  - Mostrar "Buses en descanso (N)" con número de disco y placa.
  - Mostrar advertencias con `role="alert"`, especialmente "No hay buses de repuesto".
  - Mostrar el `restBusesCount` del grupo y un enlace a la configuración del grupo.
  - Guardar envía `standbyBusIds` y `mode: 'automatic'` cuando la hoja proviene de la propuesta.
  - Mantener la edición manual de borradores y las reglas de publicación existentes.
- **VERIFY:**
  - Abrir un periodo de seis días: todos los días tienen buses precargados.
  - Lunes y martes muestran buses distintos en la primera salida.
  - Los buses en descanso cambian de día a día.
  - Con flota insuficiente aparece la advertencia y no se puede publicar si hay salidas sin bus.
  - Guardar, recargar y comprobar que se conservan asignaciones y descansos.
- **Rollback:** volver a `getRouteSheet` manual para cada día.

### T11. Configuración de N en grupos de buses

- **Agent:** `frontend-specialist`
- **Skills:** `frontend-design`, `clean-code`
- **Priority:** P1
- **Dependencies:** T02, T08
- **INPUT:** `CooperativeBusGroupsPage.tsx` y `busGroup.service.ts`.
- **OUTPUT:**
  - Campo "Buses en descanso por hoja" en creación y edición de grupo.
  - Rango `0` a `50`, valor por defecto `1`.
  - Texto de ayuda que explique que se descuentan de la flota operativa de cada hoja.
  - Mostrar el valor en la tarjeta del grupo.
- **VERIFY:**
  - Crear grupo con `2`, editar a `1`, recargar y comprobar persistencia.
  - La hoja de ruta refleja el valor actualizado.
  - `pnpm typecheck`.
- **Rollback:** ocultar el campo; el backend mantiene el default.

### T12. Estilos, accesibilidad y responsive

- **Agent:** `frontend-specialist`
- **Skills:** `frontend-design`, `clean-code`
- **Priority:** P2
- **Dependencies:** T09, T10, T11
- **INPUT:** CSS de rutas y grupos.
- **OUTPUT:**
  - Estilos del modal, filtros, tarjetas de ruta, chips de descanso y advertencias.
  - Layout responsive para tablas y tarjetas de seis días.
  - Foco visible, contraste WCAG AA y tamaños táctiles mínimos.
  - Sin colores morados/violeta ni plantillas genéricas.
- **VERIFY:**
  - `pnpm lint`, `pnpm build:web`.
  - Revisión manual en 360 px, 768 px y 1280 px.
  - Navegación completa con teclado.
- **Rollback:** cambios solo de presentación.

### T13. Verificación integral y corrección de regresiones

- **Agent:** `orchestrator` con apoyo de `test-engineer`
- **Skills:** `testing-patterns`, `webapp-testing`
- **Priority:** P0
- **Dependencies:** T07, T09, T10, T11, T12
- **INPUT:** implementación completa.
- **OUTPUT:**
  - Ejecutar todas las verificaciones.
  - Corregir fallos de tipos, lint, pruebas y flujo manual.
  - Registrar resultados en este plan.
- **VERIFY:**
  - Backend: `cd apps/api && ../../venv/bin/python -m pytest -q`.
  - Frontend: `pnpm typecheck && pnpm lint && pnpm build:web`.
  - Flujo manual con backend y frontend levantados:
    1. Crear grupo con N=1.
    2. Crear ruta con el grupo y tarifas.
    3. Crear frecuencias de 08:00 y 12:00.
    4. Abrir hoja de ruta de seis días.
    5. Verificar rotación lunes/martes y bus en descanso.
    6. Guardar y publicar.
    7. Reducir la flota o subir N para provocar "No hay buses de repuesto".
- **Rollback:** revertir la tarea que introduzca la regresión.

### T14. Revisión de seguridad y aislamiento multi-cooperativa

- **Agent:** `security-auditor`
- **Skills:** `vulnerability-scanner`, `code-review-checklist`
- **Priority:** P1
- **Dependencies:** T13
- **INPUT:** endpoints nuevos y modificados.
- **OUTPUT:**
  - Verificar que `groupId`, `routeId`, `busId` y `sheetId` siempre se filtren por `cooperative_id`.
  - Verificar CSRF en métodos mutables.
  - Verificar que una cooperativa no pueda leer ni modificar hojas de otra.
  - Verificar que las hojas publicadas con reservas no se puedan alterar.
  - Verificar validación de enteros y límites de `restBusesCount`.
- **VERIFY:** tests de integración de aislamiento y revisión manual de dependencias de permisos.
- **Rollback:** corregir el endpoint afectado; no se requieren cambios de esquema.

## Dependency Graph

```text
T01
 ├─> T02 ─> T03 ─> T05 ─> T06 ─> T07 ─> T13 ─> T14
 ├─> T04 ───────────┘
 └─> T03 ─> T08
              ├─> T09 ─> T12
              ├─> T10 ─> T12
              └─> T11 ─> T12
```

## Risks and Mitigations

| Riesgo | Impacto | Mitigación |
|---|---|---|
| Las rutas existentes no tienen grupo | La nueva validación rompe datos históricos | Columna nullable, backfill desde frecuencias y `busGroupId` obligatorio solo para nuevas rutas |
| La rotación no respeta los 30 minutos de cambio | Buses asignados a salidas imposibles | El motor valida y deja la salida sin bus con advertencia; nunca asigna un bus inválido |
| Se sobrescribe una hoja publicada | Pérdida de viajes o reservas | `auto-plan` devuelve la hoja publicada sin modificarla; `save_route_sheet` mantiene bloqueos actuales |
| `rest_buses_count` mayor que la flota | No se pueden cubrir salidas | Se limita el valor efectivo y se emiten advertencias `REST_COUNT_TOO_HIGH` y `NO_REST_BUSES` |
| Cambios de grupo en rutas con frecuencias | Inconsistencia grupo ruta/frecuencia | Validar coincidencia al crear frecuencia y al actualizar la ruta |
| Seis peticiones por día generan lentitud | Mala experiencia | Nuevo endpoint único `auto-plan` con una sola consulta por periodo |
| Fechas y zonas horarias | Rotación incorrecta | Usar `America/Guayaquil` y fechas `date`, como el servicio actual |
| Pruebas existentes esperan rutas sin grupo | Suite rota | Actualizar helpers y casos de prueba en T07 |

## Phase X: Verification

Ejecutar en este orden y no marcar el plan como completo hasta que todo pase.

### Backend

```bash
cd apps/api
../../venv/bin/python -m pytest -q
```

### Frontend

```bash
pnpm typecheck
pnpm lint
pnpm build:web
```

### Flujo manual

```bash
# Terminal 1
cd apps/api
../../venv/bin/python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000

# Terminal 2
pnpm dev:web
```

Checklist manual:

- [x] Iniciar sesión como administrador de cooperativa.
- [x] Crear un grupo con `restBusesCount = 1`.
- [x] Crear una ruta con grupo, duración, paradas y tarifas.
- [x] Crear frecuencias de 08:00 y 12:00 en el mismo grupo.
- [x] Abrir `/cooperativa/rutas` y verificar filtros.
- [x] Abrir la hoja de ruta de seis días.
- [x] Comprobar que las salidas tienen buses precargados.
- [x] Comprobar que el bus de la salida de las 08:00 cambia entre lunes y martes.
- [x] Comprobar que se muestra el bus en descanso.
- [x] Guardar un borrador y recargar: asignaciones y descansos persisten.
- [x] Publicar y verificar que la hoja queda bloqueada según las reglas actuales.
- [x] Aumentar `restBusesCount` o reducir la flota y comprobar la advertencia "No hay buses de repuesto".
- [x] Verificar que no hay errores en consola ni en la respuesta de la API.

### Cierre

```markdown
## PHASE X COMPLETE

- Backend tests: OK
- Typecheck: OK
- Lint: OK
- Build: OK
- Flujo manual: OK
- Fecha: 2026-11-14
```
