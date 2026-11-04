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

**Importante:** Ejecuta todos los comandos de esta sección desde **Git Bash**, dentro de la carpeta `apps/api` del repositorio `Transporte-Interprovincial`:

```bash
cd apps/api
```

### Instalación de dependencias

Crear el entorno virtual de Python (solo la primera vez):

```bash
python -m venv .venv
```

Activar el entorno virtual:

```bash
source .venv/Scripts/activate
```

Instalar las dependencias del backend:

```bash
python -m pip install -r requirements.txt
```

### Configuración

Copiar el archivo de ejemplo de variables de entorno (solo la primera vez):

```bash
cp .env.example .env
```

Antes del primer inicio, configura en `.env` un `JWT_SECRET_KEY` de al menos
32 caracteres, junto con `ADMIN_EMAIL` y `ADMIN_PASSWORD`. La contraseña debe
tener entre 12 y 128 caracteres. Al iniciar, la API crea automáticamente las
tablas que falten y el primer `super_admin` si todavía no existe ninguno. Si
ya hay un administrador, la API no crea ni modifica cuentas.

### Envío de correos

La API envía correos para verificar cuentas, recuperar contraseñas y avisar
los cambios de reservas, pagos y boletos. Las variables están en
`.env.example`:

| Variable | Uso |
| --- | --- |
| `EMAIL_ENABLED` | `false` (por defecto) no envía nada y escribe el correo en la consola |
| `SMTP_HOST`, `SMTP_PORT` | Servidor y puerto SMTP (`587` con STARTTLS, `465` con SSL) |
| `SMTP_USER`, `SMTP_PASSWORD` | Credenciales de la cuenta que envía |
| `SMTP_FROM` | Remitente visible; si está vacío se usa `SMTP_USER` |
| `SMTP_USE_TLS` | Activa STARTTLS en el puerto 587 |
| `VERIFICATION_CODE_EXPIRE_MINUTES` | Minutos de validez de los códigos (15 por defecto) |

**Probar en local sin SMTP (recomendado).** Deja `EMAIL_ENABLED=false`.
Regístrate como pasajero desde `http://localhost:5173/signup` y busca en la
consola de la API el mensaje `EMAIL_ENABLED=false: el correo no se envió.`
Debajo aparece el correo con la línea `Código: 123456`; ingrésalo en la
pantalla de verificación. Lo mismo ocurre con "¿Olvidaste tu contraseña?".

**Probar con Gmail.**

1. Activa la verificación en dos pasos de la cuenta de Google.
2. Crea una contraseña de aplicación en
   <https://myaccount.google.com/apppasswords>.
3. En `apps/api/.env` configura `EMAIL_ENABLED=true`,
   `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=587`, `SMTP_USE_TLS=true`,
   `SMTP_USER` con tu correo, `SMTP_PASSWORD` con la contraseña de aplicación
   (sin espacios) y, si quieres, `SMTP_FROM=Transporte Interprovincial <tu-correo@gmail.com>`.
4. Reinicia la API.

Nunca subas `.env` ni compartas la contraseña de aplicación. Si el envío
falla, la API lo registra en la consola y la operación principal continúa.

Las cuentas que ya existían en tu base local quedan verificadas al iniciar la
API, así que no pierdes el acceso. Solo los pasajeros que se registren desde
ahora deben verificar su correo.

### Base de datos

Para desarrollo local se utiliza SQLite mediante SQLAlchemy. El proyecto usa
una sola base de datos, `apps/api/transporte.db`. Las rutas SQLite relativas
se resuelven desde `apps/api`, sin importar la carpeta desde la que se ejecute
la API o los scripts.

Para borrar todos los datos y volver a crear las tablas:

```bash
python scripts/reset_db.py --reset
```

### Iniciar el backend

Con el entorno virtual activado, ejecutar:

```bash
fastapi run
```

Durante el desarrollo también puedes usar `fastapi dev`, que reinicia el
servidor automáticamente cuando cambia el código.

El servidor estará disponible en:

- API: http://127.0.0.1:8000
- Documentación Swagger: http://127.0.0.1:8000/docs

Para detener el servidor, presionar `Ctrl + C`.

### Ejecutar las pruebas

```bash
python -m pip install -r requirements-dev.txt
pytest
```

Las pruebas no dependen de tu `.env`: usan una clave JWT propia, desactivan
el envío de correos y simulan el servidor SMTP, así que nunca envían correos
reales.

**Nota:** La base SQLite `transporte.db` no se incluye en Git.

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


# 📦 Versionamiento del Proyecto

## Estándar utilizado

Este proyecto utiliza **Versionamiento Semántico** con el formato:

vX.Y.Z

| Número | Nombre | Cuándo se incrementa |
|--------|--------|----------------------|
| **X** | MAJOR  | Cambios incompatibles con versiones anteriores (breaking changes) |
| **Y** | MINOR  | Nuevas funcionalidades compatibles con versiones anteriores |
| **Z** | PATCH  | Correcciones de errores compatibles con versiones anteriores |


## ⚠️ Adaptación para este proyecto (fines prácticos)

La especificación oficial de SemVer establece que las versiones deben crearse **únicamente al publicar un release** (es decir, al liberar una versión estable al usuario final). Sin embargo, **este proyecto adopta una variante práctica con fines didácticos y de demostración**: se realizará versionamiento **antes del primer release oficial**, tomando como puntos de versionamiento los **merges de Pull Requests (PR) que integren funcionalidades al proyecto**.

## 🧪 Versiones Pre-release (Alpha, Beta y RC)

Además de las versiones estables (`vX.Y.Z`), el proyecto contempla el uso de **versiones pre-release** para etapas de prueba y validación antes de un release definitivo. Estas se identifican añadiendo un sufijo al número de versión, separado por un guion:

vX.Y.Z-alpha
vX.Y.Z-beta
vX.Y.Z-rc

### 🔄 Ciclo de vida de una versión

Antes de publicar una versión estable, el código puede pasar por un ciclo de maduración. El orden recomendado, de menor a mayor estabilidad, es:


1.  **Alpha (`-alpha`)**: Versión muy temprana. La funcionalidad está incompleta o la API es inestable. Se usa para pruebas internas o para obtener retroalimentación temprana. Puede contener errores graves.
2.  **Beta (`-beta`)**: La funcionalidad está completa, pero pueden existir errores conocidos. Es una versión lista para pruebas más amplias (usuarios beta) pero no para producción.
3.  **Release Candidate / RC (`-rc`)**: Versión candidata a ser la definitiva. Si no se detectan errores críticos en esta etapa, el mismo código (sin cambios) se promueve a versión estable eliminando el sufijo `-rc`.