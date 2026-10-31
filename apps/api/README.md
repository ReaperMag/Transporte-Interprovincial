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

## Reservas de asientos

Las rutas viven bajo `/api/v1/reservations` y requieren una sesión iniciada.
Las operaciones que crean o cancelan reservas también validan el origen de la
solicitud.

| Método | Ruta | Quién la usa | Operación |
| --- | --- | --- | --- |
| `GET` | `/trips/{trip_id}/seats` | Pasajero y oficinista | Mapa de asientos del viaje con su disponibilidad para un tramo (`origin_city_id` y `destination_city_id`) |
| `POST` | `/` | Pasajero | Reservar asientos para el pasajero y sus acompañantes |
| `POST` | `/office` | Oficinista | Reservar asientos en la oficina |
| `GET` | `/me` | Pasajero | Listar sus reservas |
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

Cada cambio en el pago o en los boletos registra un aviso para el pasajero con
cuenta: comprobante recibido, pago aprobado, pago rechazado con el motivo,
boletos emitidos y boleto cambiado. Se
consultan en `GET /api/v1/notifications/me` y se marcan como leídos con
`POST /api/v1/notifications/{id}/read`. Las ventas en oficina no generan
avisos porque el pasajero no tiene cuenta. El envío por correo queda pendiente.

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
