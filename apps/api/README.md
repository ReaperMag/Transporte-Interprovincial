# API de transporte interprovincial

## Administración de cooperativas

El administrador se limita a crear, consultar, actualizar y eliminar
cooperativas. El panel consume estos endpoints bajo
`/api/v1/admin/cooperatives`:

| Método | Ruta | Operación |
| --- | --- | --- |
| `GET` | `/` | Listar; admite `search` |
| `POST` | `/` | Crear |
| `GET` | `/{id}` | Consultar detalle |
| `PUT` | `/{id}` | Reemplazar los datos |
| `PATCH` | `/{id}` | Actualizar los campos enviados |
| `DELETE` | `/{id}` | Eliminar si no tiene registros relacionados |
| `GET` | `/summary` | Total de cooperativas registradas |

El contrato JSON usa camelCase. Para crear una cooperativa se solicita el
correo de registro de su cuenta y no el correo de contacto. El correo de
contacto puede consultarse o editarse después; el logo y el estado no se
administran desde este panel. El RUC debe tener 13 dígitos y el nombre y el RUC
son únicos. Los conflictos de unicidad devuelven `409`. Una cooperativa con
registros relacionados no se puede eliminar para conservar la integridad de
esos datos.

## Acceso de cooperativas

El administrador crea la cuenta `cooperative` junto con la cooperativa, usando
una contraseña inicial que se almacena como hash. El registro público solo
permite crear cuentas de pasajero. La cuenta cooperativa autenticada consulta
su propia identidad mediante `GET /api/v1/cooperatives/me`; la API valida el
tipo de cuenta y su vínculo antes de devolver el identificador, nombre y RUC.
Su perfil se consulta y actualiza mediante `GET /api/v1/cooperatives/me/profile`
y `PATCH /api/v1/cooperatives/me/profile`. La API deriva el registro a modificar
del usuario autenticado y no admite el nombre ni el RUC en las actualizaciones.
El perfil incluye dirección, teléfono, correo de contacto, redes sociales,
descripción, logo y colores de marca. El logo debe proporcionarse como una URL
HTTP(S), ya que el proyecto no dispone de almacenamiento de archivos para
cargas. Los colores deben usar el formato hexadecimal `#RRGGBB` y los enlaces,
HTTP(S). Al iniciar, la API añade de forma compatible la columna de descripción
a bases de datos existentes.

Al crear una cooperativa desde el panel, el administrador también registra el
correo y la contraseña inicial de su cuenta de acceso. La API guarda la
contraseña como hash y vincula la cuenta de tipo `cooperative` al registro de la
cooperativa en una sola transacción. Si el correo ya pertenece a otra cuenta,
no se crea la cooperativa.

## Rutas, frecuencias y hojas de ruta

La cooperativa administra estos recursos en
`/api/v1/cooperatives/me/route-planning`. Las ciudades son compartidas por las
cooperativas; las rutas, frecuencias y hojas de servicio pertenecen a la
cooperativa autenticada.

| Método | Ruta | Operación |
| --- | --- | --- |
| `GET` / `POST` | `/cities` | Consultar o agregar ciudades y provincias |
| `GET` / `POST` | `/routes` | Consultar o crear un recorrido principal con paradas ordenadas |
| `GET` / `POST` | `/frequencies` | Consultar o asociar una hora ANT y un grupo de buses a una ruta |
| `GET` | `/route-sheets?groupId={id}&serviceDate=AAAA-MM-DD` | Consultar la hoja del grupo para una fecha |
| `PUT` | `/route-sheets` | Guardar o reemplazar las asignaciones del borrador diario |
| `POST` | `/route-sheets/{id}/publish` | Publicar cuando todas las frecuencias activas tienen bus |

Cada parada registra su orden y los minutos desde el origen. En la hoja diaria,
la cooperativa indica la ubicación inicial de cada bus y puede sustituirlo por
otro bus operativo del grupo. La API no permite asignar buses en mantenimiento,
cruzar servicios ni continuar desde una ciudad diferente; exige al menos 30
minutos entre la llegada de un servicio y la siguiente salida. Las hojas
publicadas quedan en solo lectura.

La búsqueda de viajes existente también exige que la ruta tenga tarifas para
el tramo y tipo de asiento solicitado. La planificación de rutas no define
precios, por lo que publicar una hoja no crea tarifas automáticamente.

## Reservas de asientos

Las rutas viven bajo `/api/v1/reservations` y requieren una sesión iniciada.
Las operaciones que crean o cancelan reservas también validan el origen de la
solicitud.

| Método | Ruta | Quién la usa | Operación |
| --- | --- | --- | --- |
| `GET` | `/trips/{trip_id}/seats` | Pasajero y oficinista | Mapa de asientos del viaje con su disponibilidad para un tramo (`origin_city_id` y `destination_city_id`) |
| `POST` | `/` | Pasajero | Reservar asientos para el pasajero y sus acompañantes |
| `POST` | `/office` | Oficinista | Reservar asientos en la oficina |
| `GET` | `/me` | Pasajero | Listar sus reservas, incluidas las vendidas en oficina a su nombre (ver [Vinculación de pasajeros](#vinculación-de-pasajeros-registrados-en-oficina)) |
| `GET` | `/{id}` | Pasajero y oficinista | Consultar el detalle de una reserva |
| `POST` | `/{id}/cancel` | Pasajero y oficinista | Cancelar una reserva y liberar sus asientos |

Reglas principales:

- Solo se reservan viajes programados, con salida futura y de una cooperativa
  activa.
- En las rutas con paradas, un asiento se ocupa solo en el tramo comprado. Si
  alguien viaja de Quito a Latacunga, el mismo asiento sigue libre de Latacunga
  a Loja. En una ruta directa solo se vende desde la ciudad de origen.
- Cada asiento lleva los datos del pasajero que lo ocupa. Si la cédula ya está
  registrada se reutiliza; si no, se registra como pasajero sin cuenta.
- El precio sale de la tarifa del tramo según el tipo de asiento. Quien compra
  declara la categoría de cada pasajero; los menores de edad, la tercera edad y
  las personas con discapacidad pagan la mitad. En la oficina, el oficinista
  confía en lo que declara el comprador. El chofer verifica la categoría al
  subir al bus; si no corresponde, el pasajero cambia el boleto en oficina y
  paga la diferencia.
- La reserva queda pendiente de pago y vence según el tiempo configurado por la
  cooperativa (`reservation_timeout_minutes`, 5 minutos por defecto). Al
  vencer, sus asientos se liberan.
- El pasajero solo ve y cancela sus propias reservas. El personal de oficina
  (oficinista o administrador de la cooperativa) solo vende y gestiona viajes
  de su cooperativa.

Pendiente para otras ramas:

- **Chofer:** la verificación al subir al bus. La categoría declarada queda
  guardada en cada asiento reservado y en cada boleto para cuando exista ese
  módulo.

## Acceso administrativo

Las rutas administrativas requieren una cuenta activa de tipo `super_admin`.
El registro público crea exclusivamente cuentas de pasajero; no permite
registrar administradores.

Al iniciar la API, se crean las tablas que falten y se comprueba si ya existe
una cuenta `super_admin`. Si no existe, la API crea el administrador inicial
usando `ADMIN_EMAIL` y `ADMIN_PASSWORD` de `apps/api/.env`. Configura un correo
válido y una contraseña de 12 a 128 caracteres antes del primer inicio. Si ya
hay al menos un administrador, no se crea ni modifica ninguna cuenta y esas
variables no son necesarias.

```bash
cd apps/api
cp .env.example .env
source .venv/Scripts/activate
fastapi run
```

El inicio de sesión usa la misma pantalla que el de pasajeros. La API devuelve
el tipo de cuenta y limita las rutas de administración a `super_admin`; las
operaciones que modifican cooperativas también validan el origen de la solicitud.

Las rutas SQLite relativas se resuelven desde `apps/api`. Por defecto, la API
usa una sola base de datos, `apps/api/transporte.db`, sin importar la carpeta
desde la que se ejecuten la API o los scripts. Durante el desarrollo web, Vite
reenvía `/api` a `http://127.0.0.1:8000`.

## Verificación de cuenta y recuperación de contraseña

Las rutas viven bajo `/api/v1/auth` y validan el origen de la solicitud.

| Método | Ruta | Operación |
| --- | --- | --- |
| `POST` | `/verify-email` | Verifica la cuenta con `email` y `code` |
| `POST` | `/verify-email/resend` | Reenvía el código de verificación |
| `POST` | `/password/forgot` | Envía un código para restablecer la contraseña |
| `POST` | `/password/reset` | Cambia la contraseña con `email`, `code`, `password` y `confirmPassword` |

Reglas principales:

- **Registro:** la cuenta del pasajero queda pendiente y se envía un código de
  6 dígitos. Si el correo falla, la cuenta igual se crea y el pasajero puede
  pedir otro código.
- **Login sin verificar:** si la contraseña es correcta pero el pasajero no
  verificó su correo, la API responde `403` con
  `{"code": "email_not_verified", "message": "..."}`. Con una contraseña
  incorrecta responde el `401` de siempre, para no revelar el estado de la
  cuenta. Este rechazo no cuenta como intento fallido.
- **Códigos:** se guardan con Argon2 en `verification_codes`, nunca en texto
  plano, con su propósito (`email_verification` o `password_reset`),
  vencimiento, intentos, uso y revocación. Vencen a los
  `VERIFICATION_CODE_EXPIRE_MINUTES` minutos, admiten 5 intentos y sirven una
  sola vez. Al generar uno nuevo se revocan los anteriores del mismo propósito.
- **Respuestas genéricas:** reenviar el código y "olvidé mi contraseña"
  responden siempre `202` con el mismo mensaje, exista o no la cuenta. Entre
  dos códigos debe pasar al menos 60 segundos; si se piden antes, la API
  responde igual pero no envía nada. La cuenta regresiva se muestra en el
  frontend.
- **Nueva contraseña:** cumple la misma política del registro (8 a 128
  caracteres y confirmación) y se guarda con Argon2. El código queda usado y
  la cuenta queda verificada, porque recibir el código demuestra el control
  del correo. Las sesiones abiertas no se cierran: el JWT vence a los 15
  minutos.
- **Bloqueo:** el cambio de contraseña respeta el bloqueo del inicio de
  sesión. Si el correo y la IP están bloqueados responde `429`, y cada código
  incorrecto cuenta como un intento fallido.
- **Cuentas existentes:** al iniciar, la API agrega
  `accounts.is_email_verified` con `DEFAULT 1`. Todas las cuentas que ya
  existían, el `super_admin` y las cooperativas quedan verificadas; solo el
  registro público crea cuentas pendientes.

## Vinculación de pasajeros registrados en oficina

Cuando un oficinista vende un boleto, la cédula queda registrada en
`passengers` sin cuenta (`account_id` vacío). Ese registro acumula los viajes
de la persona. Si después se registra en la aplicación con la misma cédula,
puede ver los viajes que hizo antes de tener cuenta.

Reglas principales:

- **Registro:** si la cédula ya tiene una cuenta, se rechaza como siempre. Si
  pertenece a un pasajero sin cuenta, se comparan los nombres y apellidos por
  separado, sin distinguir mayúsculas, tildes ni espacios extra. Si la venta
  guardó un correo, el del registro también debe coincidir. Si algo no
  coincide, la API responde `409` con un mensaje genérico que no revela los
  datos guardados: "Los datos no coinciden con el registro existente de esta
  identificación. Acércate a una oficina de la cooperativa."
- **Vinculación pendiente:** si los datos coinciden, la cuenta se crea sin
  verificar y guarda el pasajero reclamado en `accounts.pending_passenger_id`.
  No se crea otro pasajero.
- **Verificación:** la vinculación se concreta solo al verificar el correo
  (o al restablecer la contraseña, que también verifica). Entonces
  `passengers.account_id` apunta a la cuenta, se completa el correo solo si
  estaba vacío y se conservan la cédula, los nombres y la categoría. Si la
  persona nunca verifica, el pasajero sigue sin cuenta y sus viajes no se
  exponen.
- **Varias cuentas:** si dos cuentas reclaman la misma cédula, se vincula la
  primera que verifica. La otra recibe `409` con el mensaje genérico y no
  queda verificada.
- **Aviso:** al vincularse se crea la notificación "Encontramos X viaje(s)
  registrados con tu identificación" (evento `passenger_linked`), que también
  se envía por correo. Cuenta los viajes con boletos emitidos o usados; si no
  hay ninguno, no avisa.
- **Historial:** `GET /reservations/me` incluye las reservas que tienen un
  asiento a nombre del pasajero de la cuenta, aunque las haya vendido un
  oficinista antes o después del registro. En esas reservas solo se devuelven
  los asientos del propio pasajero y su total, para no exponer a otras
  personas de una compra grupal. El campo `channel` indica `online` u `office`.
  `GET /tickets/me` ya incluía los boletos a nombre del pasajero; el frontend
  los marca como "Comprado en oficina" según `tickets.channel`.
- **Gestión:** las reservas vendidas en oficina las sigue gestionando la
  cooperativa. El pasajero las ve, pero pagarlas o cancelarlas solo lo puede
  hacer el personal de oficina.
- **Migración compatible:** al iniciar, la API agrega
  `accounts.pending_passenger_id` si no existe.

## Pagos

Las rutas viven bajo `/api/v1/payments` y requieren una sesión iniciada. Las
operaciones que registran o revisan pagos también validan el origen de la
solicitud.

| Método | Ruta | Quién la usa | Operación |
| --- | --- | --- | --- |
| `GET` | `/methods` | Pasajero y oficinista | Datos de pago de demostración: cuenta del Banco Pichincha y QR de DeUna |
| `POST` | `/reservations/{id}/cash` | Oficinista | Cobrar en efectivo una reserva hecha en la oficina |
| `POST` | `/reservations/{id}/receipt` | Pasajero | Subir el comprobante y, si corresponde, la cédula o el carné |
| `GET` | `/pending` | Oficinista | Comprobantes por revisar de su cooperativa |
| `GET` | `/reservations/{id}` | Pasajero y oficinista | Pagos de una reserva, con el motivo del rechazo |
| `POST` | `/{id}/approve` | Oficinista | Aprobar el comprobante |
| `POST` | `/{id}/reject` | Oficinista | Rechazar el comprobante indicando el motivo |
| `GET` | `/{id}/receipt` | Pasajero y oficinista | Descargar el comprobante |
| `GET` | `/documents/{id}` | Pasajero y oficinista | Descargar la cédula o el carné |

Reglas principales:

- **Efectivo:** solo para reservas hechas en la oficina. El oficinista cobra,
  la reserva queda confirmada y los boletos se emiten en el mismo momento.
- **Depósito o transferencia:** el pasajero sube el comprobante antes de que
  termine el tiempo de su reserva. La reserva pasa a revisión y deja de vencer
  mientras el oficinista la revisa.
- **Documentos:** si un asiento tiene una categoría con descuento (menor de
  edad, tercera edad o discapacidad), el pasajero sube la cédula o el carné de
  esa persona junto con el comprobante. El chofer verifica a la persona al
  subir al bus.
- **Archivos:** se aceptan PDF, JPG y PNG de hasta 5 MB. Se revisa el contenido
  real del archivo, no solo su extensión. Se guardan en `apps/api/uploads`, que
  no se incluye en Git, y solo los ven el dueño de la reserva y el personal de
  oficina de su cooperativa.
- **Aprobación:** la reserva queda confirmada y se emiten los boletos.
- **Rechazo:** el oficinista elige el motivo y puede agregar un comentario.
  - `payment_not_received`: la reserva se cancela y los asientos se liberan.
  - `receipt_unverifiable`: la reserva vuelve a esperar el pago con un nuevo
    tiempo límite para subir otro comprobante. Solo hay una segunda
    oportunidad; si vuelve a pasar, la reserva se cancela.
- **Datos de pago:** son de demostración y se configuran en `apps/api/.env`.
  No corresponden a una cuenta real.

## Notificaciones

Cada cambio en una reserva, un pago o los boletos registra un aviso para el
pasajero con cuenta: reserva creada, reserva vencida, reserva cancelada,
comprobante recibido, pago aprobado, pago rechazado con el motivo, boletos
emitidos y boleto cambiado. Se consultan en `GET /api/v1/notifications/me` y
se marcan como leídos con `POST /api/v1/notifications/{id}/read`. Las ventas
en oficina no generan avisos porque el pasajero no tiene cuenta.

Cada aviso también se envía por correo con el mismo título y mensaje. El envío
se hace desde un único punto (`notifications/dispatcher.py`): `notify()` deja
el aviso pendiente y el correo sale solo cuando la transacción del módulo que
lo creó se confirma. Si esa transacción se revierte, no se envía nada. Si el
envío es exitoso se guarda `email_sent_at`; si falla, se registra en el log,
la compra, el pago o la aprobación continúan y `email_sent_at` queda vacío.

## Envío de correos

El proveedor `notifications/providers/smtp.py` usa `smtplib` de la biblioteca
estándar, así que no requiere dependencias nuevas. Lo usan la verificación de
cuenta, la recuperación de contraseña y las notificaciones. Nunca lanza
excepciones: si el servidor SMTP falla, registra el error y devuelve `False`.

| Variable | Valor por defecto | Uso |
| --- | --- | --- |
| `EMAIL_ENABLED` | `false` | Con `false` no se envía nada: el correo completo, incluido el código, se escribe en la consola del backend |
| `SMTP_HOST` | vacío | Servidor SMTP, por ejemplo `smtp.gmail.com` |
| `SMTP_PORT` | `587` | Puerto. Con `465` se usa SSL directo |
| `SMTP_USER` | vacío | Usuario de la cuenta que envía |
| `SMTP_PASSWORD` | vacío | Contraseña; en Gmail, una contraseña de aplicación |
| `SMTP_FROM` | vacío | Remitente visible. Si está vacío se usa `SMTP_USER` |
| `SMTP_USE_TLS` | `true` | Activa STARTTLS en el puerto 587 |
| `VERIFICATION_CODE_EXPIRE_MINUTES` | `15` | Minutos de validez de los códigos |

**Modo desarrollo.** Con `EMAIL_ENABLED=false` cualquier integrante puede
probar sin configurar SMTP: al registrarse, el correo completo aparece en la
consola donde corre la API, después del mensaje
`EMAIL_ENABLED=false: el correo no se envió.`, con una línea `Código: 123456`.
En este modo `email_sent_at` queda vacío porque no se envió nada.

**Gmail con contraseña de aplicación.**

1. Activa la verificación en dos pasos en la cuenta de Google que enviará los
   correos.
2. Crea una contraseña de aplicación en
   <https://myaccount.google.com/apppasswords>. Google muestra 16 caracteres.
3. Configura `apps/api/.env`:

   ```env
   EMAIL_ENABLED=true
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_USE_TLS=true
   SMTP_USER=tu-correo@gmail.com
   SMTP_PASSWORD=la-contraseña-de-aplicación-sin-espacios
   SMTP_FROM=Transporte Interprovincial <tu-correo@gmail.com>
   ```

4. Reinicia la API. Nunca subas `.env` al repositorio ni compartas la
   contraseña de aplicación; si se filtra, revócala en la misma página.

## Boletos

Las rutas viven bajo `/api/v1/tickets` y requieren una sesión iniciada. El
cambio de boleto también valida el origen de la solicitud.

| Método | Ruta | Quién la usa | Operación |
| --- | --- | --- | --- |
| `GET` | `/me` | Pasajero | Historial de boletos, del viaje más reciente al más antiguo |
| `GET` | `/reservations/{id}` | Pasajero y oficinista | Boletos vigentes de una reserva |
| `GET` | `/{id}` | Pasajero y oficinista | Detalle de un boleto con su vigencia |
| `GET` | `/{id}/qr` | Pasajero y oficinista | Imagen PNG del QR del boleto |
| `POST` | `/{id}/change` | Oficinista | Cambiar la categoría o el asiento de un boleto |

Reglas principales:

- **Emisión:** cuando la reserva queda confirmada, por pago en efectivo o por
  comprobante aprobado, se emite un boleto por asiento. Cada boleto tiene un
  código aleatorio que va dentro del QR. El QR no lleva datos del pasajero.
- **Historial:** el pasajero ve los boletos que compró, incluidos los de sus
  acompañantes, y los emitidos a su nombre en oficina antes de registrarse.
- **Vigencia:** un boleto deja de servir cuando se usa, se cancela o el viaje
  termina. También vence cuando pasa la duración del viaje desde la salida, o
  un día si la ruta no tiene duración registrada.
- **Cambio en oficina:** si el chofer detecta que la categoría declarada no
  corresponde, o el pasajero quiere otro asiento, el oficinista cancela el
  boleto anterior y emite uno nuevo con otro código. Si el nuevo cuesta más,
  se registra el cobro de la diferencia en efectivo; si cuesta menos, no hay
  devolución. El asiento nuevo debe estar libre en el tramo del pasajero.
- **Privacidad:** cada boleto lo ven quien lo compró, el pasajero a cuyo
  nombre está y el personal de oficina de la cooperativa del viaje.

## Búsqueda de viajes

`GET /api/v1/trips/search` lista los viajes programados que todavía no salen.
Sin filtros devuelve todos los disponibles. Los filtros `origin_city_id`,
`destination_city_id` y `travel_date` son opcionales y cada uno reduce los
resultados; si se envían origen y destino, deben ser ciudades distintas.

## Validación de datos

Los formularios de todos los paneles y la API revisan las mismas reglas. Las
validaciones del backend viven en `app/core/validators.py` y las del frontend
en `apps/web/src/shared/utils/validation.ts`.

| Campo | Regla |
| --- | --- |
| Cédula | Solo cédulas ecuatorianas: 10 números, provincia válida y dígito verificador correcto |
| RUC | 13 números, provincia y tipo de contribuyente válidos y establecimiento distinto de `000`; en personas naturales también se revisa la cédula |
| Teléfono | Solo números, con un `+` opcional al inicio, de 7 a 15 dígitos |
| Nombres, apellidos, ciudades y provincias | Solo letras, espacios, apóstrofos y guiones |
| Correo | Debe tener un dominio completo, por ejemplo `usuario@gmail.com` |
| Placa | Tres letras y tres o cuatro números, por ejemplo `PBA-1234` |
| Número de disco | Solo números |

En el frontend, los campos numéricos no dejan escribir letras y los de nombres
no dejan escribir números.
