# Guía de Contribución

Este documento describe el flujo de trabajo, las convenciones de ramas, commits y Pull Requests que todo colaborador debe seguir para aportar cambios al proyecto. El repositorio es un monorepo gestionado con `pnpm` workspaces:

- `apps/web`: frontend (React + Vite + TypeScript).
- `apps/api`: backend (FastAPI + SQLAlchemy, Python).
- `packages/shared-types`: tipos compartidos.

El repositorio se aloja en GitHub y utiliza **Git Flow** como modelo de ramificación, gestionado con la extensión `git flow`.

## Requisitos previos

Antes de contribuir, asegúrate de tener instalado:

- **Git**.
- La extensión de **git-flow** (git-flow AVH Edition o git-flow-next).
- **Node.js**: versión **25.0.0 o superior** para `apps/web`.
- **pnpm**: gestor de paquetes del workspace (obligatorio, no uses `npm` ni `yarn`).
- **Python**: versión **3.12 o superior** para `apps/api`.


## Ejecución local del backend (FastAPI)

**Importante:** Ejecuta todos los comandos de esta sección desde **Git Bash**, ubicado en la raíz del repositorio `Transporte-Interprovincial`. No ejecutes estos comandos en PowerShell ni en CMD, porque la sintaxis utilizada para configurar las variables de entorno corresponde a Git Bash.

### Instalación de dependencias

Crear el entorno virtual de Python (solo la primera vez):

```bash
python -m venv apps/api/.venv
```

Activar el entorno virtual:

```bash
source apps/api/.venv/Scripts/activate
```

Instalar las dependencias del backend:

```bash
python -m pip install -r apps/api/requirements.txt
```

### Preparación de la base de datos

Para desarrollo local se utiliza SQLite mediante SQLAlchemy.

La primera vez, crear las tablas de la base de datos:

```bash
PYTHONPATH=apps/api/src python -c "from app.core.database import init_db; init_db()"
```

Al iniciar Uvicorn, la API crea automáticamente las tablas que falten y el
primer `super_admin` si todavía no existe ninguno. Antes del primer inicio,
configura `ADMIN_EMAIL` y `ADMIN_PASSWORD` en `apps/api/.env`. La contraseña
debe tener entre 12 y 128 caracteres. Si ya hay un administrador, la API no
crea ni modifica cuentas.

Las rutas SQLite relativas se resuelven desde la raíz del repositorio. La
configuración predeterminada `sqlite:///./transporte.db` usa el archivo
`transporte.db` de esa raíz independientemente de la carpeta actual del
proceso.

### Iniciar el backend

Con el entorno virtual activado, ejecutar:

```bash
PYTHONPATH=apps/api/src python -m uvicorn app.main:app --reload --reload-dir apps/api/src --host 127.0.0.1 --port 8000
```

El servidor estará disponible en:

- API: http://127.0.0.1:8000
- Documentación Swagger: http://127.0.0.1:8000/docs

Para detener el servidor, presionar `Ctrl + C`.

**Nota:** La base SQLite `transporte.db` se guarda en la raíz del repositorio y no se incluye en Git.



## Modelo de ramas (Git Flow)

El proyecto usa el estándar de Git Flow con la extensión `git flow`. Las ramas principales y de soporte son:

| Rama | Propósito | Origen | Se integra a |
| --- | --- | --- | --- |
| `main` | Producción. Siempre estable. | — | — |
| `develop` | Integración. Rama base para el desarrollo. | `main` | — |
| `feature/*` | Nuevas funcionalidades. | `develop` | `develop` |
| `release/*` | Preparación de una versión. | `develop` | `main` y `develop` (con tag) |
| `hotfix/*` | Correcciones urgentes sobre producción. | `main` | `main` y `develop` (con tag) |

Notas:

- Los nombres de las ramas pueden estar en inglés o español; mantén la consistencia dentro de una misma rama.
- Todos los merges son **merge commits** (`--no-ff`, que la extensión `git flow` realiza por defecto). Queda **prohibido** usar *squash* o *rebase* al integrar ramas.

### Comandos de la extensión git flow

```bash
# Inicializar Git Flow (si aún no está configurado)
git flow init

# Features
git flow feature start <nombre>
git flow feature finish <nombre>

# Releases
git flow release start <version>
git flow release finish <version>

# Hotfixes
git flow hotfix start <version>
git flow hotfix finish <version>
```

## Conventional Commits

Los mensajes de commit deben seguir la especificación de **Conventional Commits**:

```
<tipo>(<scope opcional>): <descripción>
```

Reglas:

- Se permiten **todos los tipos**. Como referencia: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`.
- Se permiten **todos los scopes**. Como referencia: `web`, `api`, `shared-types`, `auth`, `accounts`, `staff`, `passengers`, `cooperatives`, `buses`, `routes`, `schedules`, `trips`, `reservations`, `sales`, `tickets`, `reports`, `notifications`, `docs`, `infra`, `deps`.
- El cuerpo y el footer son opcionales.
- Los cambios que rompen compatibilidad se indican con `!` después del tipo/scope y con un footer `BREAKING CHANGE:`.

Ejemplos:

```
feat(tickets): agregar generación de boletos en PDF

fix(auth): corregir expiración del token de refresco

docs(contributing): detallar el flujo de hotfix

refactor(routes): extraer cálculo de paradas a un servicio

feat(api)!: cambiar el contrato de reservas

BREAKING CHANGE: el endpoint de reservas ahora requiere el id del viaje.
```

## Pull Requests

Reglas obligatorias para todo Pull Request:

- El **título del PR debe seguir Conventional Commits**, con el mismo formato que un mensaje de commit.
- **Rama base** según el tipo de trabajo:
  - `feature/*` -> `develop`
  - `hotfix/*` -> `main`
  - `release/*` -> `main` (y luego `develop`)
- Está **prohibido** hacer push directo a `main` y `develop`. Todo cambio se integra mediante un Pull Request.
- **Aprobaciones mínimas**: 1 para integrar a `develop`, 2 para integrar a `main`.
- El PR **no debe tener conflictos** pendientes.
- **No hay CI automático**. En su lugar, antes de aprobar y mergear, un revisor **debe verificar manualmente que el commit sea una versión funcional**: que la aplicación compile/arranque y que las funcionalidades afectadas operen correctamente.
- **Método de merge**: merge commit (`--no-ff`). Nunca *squash* ni *rebase*.
- El **mensaje de merge** debe respetar el formato:

```
Merge branch 'feature/nombre-de-la-rama' into develop
```

Ejemplos análogos:

```
Merge branch 'hotfix/1.2.1' into main
Merge branch 'release/1.2.0' into develop
```

## Verificaciones locales antes de abrir el PR

Ejecuta las verificaciones correspondientes según el área que modifiques.

Frontend (`apps/web`) — sin tests:

```bash
pnpm lint
pnpm format:check
pnpm typecheck
```

Backend (`apps/api`): no hay verificación de lints requerida.

## Flujo de trabajo paso a paso

1. Sincroniza tu rama base (`develop` para features).
2. Crea la rama con `git flow feature start <nombre>`.
3. Realiza commits siguiendo Conventional Commits.
4. Ejecuta las verificaciones locales del área modificada.
5. Sube la rama al repositorio remoto.
6. Abre un Pull Request hacia la rama base correspondiente, con un título en Conventional Commits.
7. Obtén las aprobaciones mínimas y la verificación funcional por parte del revisor.
8. Integra con merge commit.
9. Una vez mergeado el PR en GitHub, actualiza tu `develop` local (`git pull origin develop`) y elimina la rama de trabajo (local). La integración ocurre por PR, así que no se ejecuta `git flow feature finish`.

## Flujo de release

Como `main` y `develop` están protegidas, la integración de una release se realiza por Pull Request en GitHub; por eso `git flow release finish` **no** se ejecuta localmente.

1. Sincroniza `develop`.
2. Crea la rama: `git flow release start <version>` (parte de `develop`).
3. Estabiliza la versión: corrige lo necesario y actualiza los metadatos de versión, con commits Conventional.
4. Ejecuta las verificaciones locales del área modificada.
5. Publica la rama en el remoto:

```bash
git push origin release/<version>
```

6. Abre un Pull Request de `release/<version>` hacia `main`, con título en Conventional Commits. Requiere 2 aprobaciones, verificación funcional y no tener conflictos.
7. Abre un Pull Request de `release/<version>` hacia `develop` (1 aprobación).
8. Integra ambos PRs con merge commit (nunca squash ni rebase), con los mensajes:

```
Merge branch 'release/<version>' into main
Merge branch 'release/<version>' into develop
```

9. Crea y publica el tag de la versión sobre `main`:

```bash
git checkout main
git pull origin main
git tag -a <version> -m "Release <version>"
git push origin <version>
```

10. Actualiza tus ramas locales (`git pull origin main` y `git pull origin develop`)

## Flujo de hotfix

Como `main` y `develop` están protegidas, la integración de un hotfix se realiza por Pull Request en GitHub; por eso `git flow hotfix finish` **no** se ejecuta localmente.

1. Sincroniza `main`.
2. Crea la rama: `git flow hotfix start <version>` (parte de `main`).
3. Aplica la corrección, con commits Conventional, y verifica que el commit sea una versión funcional.
4. Ejecuta las verificaciones locales del área modificada.
5. Publica la rama en el remoto:

```bash
git push origin hotfix/<version>
```

6. Abre un Pull Request de `hotfix/<version>` hacia `main`, con título en Conventional Commits. Requiere 2 aprobaciones, verificación funcional y no tener conflictos.
7. Abre un Pull Request de `hotfix/<version>` hacia `develop` (1 aprobación).
8. Integra ambos PRs con merge commit (nunca squash ni rebase), con los mensajes:

```
Merge branch 'hotfix/<version>' into main
Merge branch 'hotfix/<version>' into develop
```

9. Crea y publica el tag de la versión sobre `main`:

```bash
git checkout main
git pull origin main
git tag -a <version> -m "Hotfix <version>"
git push origin <version>
```

10. Actualiza tus ramas locales (`git pull origin main` y `git pull origin develop`).
