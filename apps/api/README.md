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

Al crear una cooperativa desde el panel, el administrador también registra el
correo y la contraseña inicial de su cuenta de acceso. La API guarda la
contraseña como hash y vincula la cuenta de tipo `cooperative` al registro de la
cooperativa en una sola transacción. Si el correo ya pertenece a otra cuenta,
no se crea la cooperativa. La cuenta puede iniciar sesión, pero su panel de
gestión todavía está pendiente de un sprint posterior.

## Acceso administrativo

Las rutas administrativas requieren una cuenta activa de tipo `super_admin`.
El registro público crea exclusivamente cuentas de pasajero; no permite
registrar administradores.

Para crear la primera cuenta, desde `apps/api` define `ADMIN_EMAIL` y
`ADMIN_PASSWORD` y ejecuta `python scripts/create_admin.py`. El script crea las
tablas necesarias si aún no existen y no altera cuentas ya registradas. Usa una
contraseña de al menos 12 caracteres. En PowerShell, puedes ingresar la
contraseña sin mostrarla en pantalla:

```powershell
$env:ADMIN_EMAIL = Read-Host "Correo administrador"
$securePassword = Read-Host "Contraseña administrador" -AsSecureString
$env:ADMIN_PASSWORD = [System.Net.NetworkCredential]::new("", $securePassword).Password
python scripts/create_admin.py
Remove-Item Env:ADMIN_EMAIL, Env:ADMIN_PASSWORD
```

El inicio de sesión usa la misma pantalla que el de pasajeros. La API devuelve
el tipo de cuenta y limita las rutas de administración a `super_admin`; las
operaciones que modifican cooperativas también validan el origen de la solicitud.

Durante el desarrollo web, Vite reenvía `/api` a `http://127.0.0.1:8000`.