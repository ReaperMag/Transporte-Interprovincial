# Registro de cambios

Todos los cambios relevantes de este proyecto se documentan en este archivo.

El formato se basa en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/)
y el proyecto sigue el [Versionado Semántico](https://semver.org/lang/es/).

## [Sin publicar]

## [1.1.0-beta.1] - 2026-11-04

Versión beta de preparación para el despliegue.

### Fixed

- Los códigos QR de los boletos se incorporan al correo electrónico como imágenes PNG MIME, compatibles con los principales clientes de correo.

## [1.0.1] - 2026-11-04

Corrección sobre la versión 1.0.0.

### Fixed

- Validación de los datos en todos los formularios y en la API: cédulas ecuatorianas con dígito verificador, RUC, teléfonos solo con números, nombres solo con letras, correos con dominio completo, placas y número de disco.
- Los campos numéricos ya no aceptan letras y los de nombres ya no aceptan números.
- El panel del pasajero ya no muestra los accesos de «Inicio» ni de «Seleccionar asientos (demo)»; los asientos se eligen después de escoger el viaje.
- La búsqueda de viajes muestra todos los viajes disponibles al entrar y los filtros de origen, destino y fecha son opcionales.
- La pantalla para elegir asientos vuelve a mostrar el mapa visual del bus, ahora con los asientos reales del viaje y los ocupados marcados.

## [1.0.0-alpha.1] - 2026-11-03

Primera versión preliminar (pre-release) del sistema. Reúne el trabajo integrado
en `develop` mediante los Pull Requests #1 al #33. No es una versión estable:
consulta la sección «Problemas conocidos» antes de usarla.

### Added

#### Administrador

- Panel de administración con gestión de cooperativas y creación de la cuenta de acceso de cada cooperativa (#13).
- Creación automática del administrador inicial al arrancar la API (#13).
- Formulario y gestión de cooperativas simplificados en el panel del administrador (#25).

#### Cooperativa

- Acceso protegido al panel de la cooperativa, endpoint de identidad y configuración de sus datos con vista previa (#17).
- Gestión de grupos de buses: creación, edición y eliminación protegida (#18).
- Gestión de buses: registro, consulta, edición, estados, número de disco y eliminación protegida (#24).
- Editor visual de buses, plantillas de estructura reutilizables y carga opcional de fotos (#26).
- Resumen del panel de control de la cooperativa (#27).
- Gestión de rutas y horarios, con su interfaz de planificación (#27).
- Registro, consulta y edición de oficinistas por cooperativa (#32).

#### Oficinista

- Panel del oficinista con registro de pasajeros, selección automática o manual de asientos y vista previa de la factura (#16).
- Reserva de asientos en oficina desde la API (#19).
- Cobro en efectivo, revisión de comprobantes pendientes y aprobación o rechazo de pagos con motivo, desde la API (#21).
- Cambio de boleto en oficina desde la API (#22).

#### Pasajero

- Selección interactiva de asientos con plantillas de buses (#11).
- Panel del pasajero, consulta y edición del perfil, y endpoints de ciudades y búsqueda de viajes (#15).
- Reservas de asientos por tramo con tiempo límite, cálculo del precio por tramo y descuento, cancelación y liberación de asientos de reservas vencidas (#19).
- Declaración de la categoría de cada pasajero de la reserva (menor de edad, tercera edad, discapacidad) (#20).
- Subida de comprobantes de pago y de documentos de categoría, y descarga de los archivos subidos (#21).
- Emisión de un boleto por asiento al confirmarse el pago, con código, QR descargable, vigencia e historial (#22).
- Flujo completo en el frontend: búsqueda de viajes, selección de asientos, creación y cancelación de reservas, registro de comprobantes y consulta de boletos con QR (#29).
- Vinculación de los viajes comprados en oficina cuando el pasajero se registra con la misma identificación y verifica su cuenta; el historial los marca como «Comprado en oficina» (#31).
- Opción para agregar el boleto a Google Wallet y Apple Wallet (#33).

#### Autenticación

- Pantallas de inicio de sesión y de creación de cuenta (#7, #8).
- Registro de pasajeros con contraseñas protegidas con Argon2 (#10).
- Inicio y cierre de sesión con JWT en cookies, validación de origen y límite de intentos fallidos (#12).
- Diferenciación de cuentas de administrador de cooperativa y de oficinista (#32).
- Verificación de la cuenta con un código enviado por correo (#30).
- Recuperación de contraseña con código (#30).

#### Notificaciones

- Avisos de cambios de estado de reservas y pagos, consultables desde la API y con opción de marcarlos como leídos (#21).
- Servicio de envío de correos por SMTP y envío por correo de los cambios de estado de reservas y pagos (#30).
- Notificación de la creación, el vencimiento y la cancelación de reservas (#30).
- Aviso al pasajero de los viajes vinculados a su identificación (#31).

#### Infraestructura

- Arquitectura inicial del monorepo con `apps/web` (React + Vite), `apps/api` (FastAPI) y `packages/shared-types` (#1).
- Guías de contribución, README y `.gitignore` para Python, Node y SQLite (#2, #3, #5).
- Plantillas de issues y Pull Requests de GitHub (#6).
- Base de datos con SQLAlchemy sobre SQLite, entidades del dominio y scripts para crear y reiniciar la base (#9).
- Arranque del backend con `fastapi run` y base de datos única en `apps/api/transporte.db` (#14).
- Validación y almacenamiento de archivos subidos (#21).
- Rediseño visual de todas las plantillas del frontend: autenticación, administración, cooperativas, pasajero y oficinista (#28).

### Fixed

#### Autenticación

- Corrección de las propiedades para integrar la vista de inicio de sesión (#7).
- Validaciones del formulario de registro alineadas con la API (#10).
- Se permite registrar una identificación que ya se usó en una venta de oficina (#31).
- Las cuentas de administrador de cooperativa y de oficinista se distinguen correctamente al validar permisos (#32).

#### Cooperativa

- Se conservan los errores inesperados de base de datos en la gestión de grupos de buses (#18).
- El número de disco es obligatorio y se exige una plantilla válida para registrar buses (#24).

#### Pasajero

- El descuento se aplica según la categoría declarada para cada pasajero (#20).
- El historial muestra las reservas compradas en oficina (#31).

#### Infraestructura

- Registro de los modelos de SQLAlchemy al iniciar la API (#10).
- Dependencia `python-multipart` agregada para procesar formularios (#24).
- Encabezado incompleto de los diálogos del frontend (#28).

### Problemas conocidos

- **Módulo del personal del bus sin implementar:** no existe el rol ni sus pantallas. Por eso todavía no se pueden iniciar ni finalizar viajes, validar boletos con el lector de QR, registrar la ocupación de asientos ni vender boletos durante el trayecto.
- **Cédula ocupada por registros sin verificar** (documentado en #31): un registro normal con una cédula nueva asigna el pasajero a la cuenta antes de verificar el correo. Si esa persona nunca verifica, la cédula queda ocupada y su dueño real no puede registrarse.
- **Panel del oficinista incompleto:**
  - La pantalla de venta (`/oficinista/vender-asientos/:tripId`) usa plantillas de buses simuladas, genera una factura de ejemplo (`DEMO-…`) y no guarda la venta ni procesa el pago.
  - El panel consulta `/api/v1/staff/me` y `/api/v1/trips/upcoming-for-sale`, que todavía no existen en la API.
  - La revisión de comprobantes, el cobro en efectivo y el cambio de boletos solo están disponibles en la API; aún no tienen pantalla.
- **Selección de asientos de demostración en el menú del pasajero:** la opción «Seleccionar asientos (demo)» del menú y la tarjeta «Seleccionar asientos» del panel abren `/pasajero/asientos`, una vista con datos simulados que no registra compras. La compra real se hace desde «Buscar viajes».
- **Datos de pago de demostración:** el titular de la cuenta, el número de cuenta y el código de DeUna que se muestran al pagar son de ejemplo, y la pantalla de pago lo advierte.
- **Avisos sin pantalla:** las notificaciones se envían por correo y se pueden consultar desde la API, pero el frontend aún no tiene una sección para verlas.
- **Reportes sin implementar:** el módulo `reports` de la API está vacío.
- **Wallet requiere configuración:** sin las credenciales de Google Wallet o Apple Wallet en el `.env`, la API responde 503 al pedir el pase.

### Notas para el equipo

- **Reinstalar las dependencias del backend:** el PR #33 cambió `PyJWT` por `PyJWT[crypto]`, que instala `cryptography`. Si tu entorno virtual es anterior a ese cambio, `pytest` y la API fallan con `ModuleNotFoundError: No module named 'cryptography'`. Ejecuta `pip install -r requirements.txt -r requirements-dev.txt` dentro de `apps/api` con el entorno virtual activo.
- **Nuevas variables de entorno:** `apps/api/.env.example` documenta las variables opcionales de Google Wallet y Apple Wallet.
- **`pnpm format:check` falla** en archivos que ya tenían problemas de formato antes de esta versión. `pnpm lint`, `pnpm typecheck`, `pnpm build:web` y `pytest` pasan.

[Sin publicar]: https://github.com/ReaperMag/Transporte-Interprovincial/compare/v1.0.0-alpha.1...develop
[1.0.0-alpha.1]: https://github.com/ReaperMag/Transporte-Interprovincial/releases/tag/v1.0.0-alpha.1
