# API de transporte interprovincial

## Administración de cooperativas

El administrador se limita a crear, consultar, actualizar y eliminar
cooperativas. El panel consume estos endpoints bajo
`/api/v1/admin/cooperatives`:

| Método | Ruta | Operación |
| --- | --- | --- |
| `GET` | `/` | Listar; admite `search` e `isActive` |
| `POST` | `/` | Crear |
| `GET` | `/{id}` | Consultar detalle |
| `PUT` | `/{id}` | Reemplazar los datos |
| `PATCH` | `/{id}` | Actualizar los campos enviados |
| `PATCH` | `/{id}/status` | Activar o desactivar |
| `DELETE` | `/{id}` | Eliminar si no tiene registros relacionados |
| `GET` | `/summary` | Total de cooperativas registradas |

El contrato JSON usa camelCase. El RUC es obligatorio y debe tener 13 dígitos.
El nombre y el RUC son únicos. Los conflictos de unicidad devuelven `409`;
una cooperativa con información relacionada tampoco se elimina (debe
desactivarse para conservar el historial).

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
- El precio sale de la tarifa del tramo según el tipo de asiento. Los menores
  de edad, la tercera edad y las personas con discapacidad pagan la mitad, solo
  si su categoría ya fue verificada.
- La reserva queda pendiente de pago y vence según el tiempo configurado por la
  cooperativa (`reservation_timeout_minutes`, 5 minutos por defecto). Al
  vencer, sus asientos se liberan.
- El pasajero solo ve y cancela sus propias reservas. El personal de oficina
  (oficinista o administrador de la cooperativa) solo vende y gestiona viajes
  de su cooperativa.

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