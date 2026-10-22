# API de transporte interprovincial

## Administración de cooperativas

El panel administrador consume estos endpoints bajo `/api/v1/admin/cooperatives`:

| Método | Ruta | Operación |
| --- | --- | --- |
| `GET` | `/` | Listar; admite `search` e `isActive` |
| `POST` | `/` | Crear |
| `GET` | `/{id}` | Consultar detalle |
| `PUT` | `/{id}` | Reemplazar los datos |
| `PATCH` | `/{id}` | Actualizar los campos enviados |
| `PATCH` | `/{id}/status` | Activar o desactivar |
| `DELETE` | `/{id}` | Eliminar si no tiene registros relacionados |
| `GET` | `/summary` | Contadores de cooperativas, rutas y buses activos |

El contrato JSON usa camelCase. El RUC es obligatorio y debe tener 13 dígitos.
El nombre y el RUC son únicos. Los conflictos de unicidad devuelven `409`;
una cooperativa con información relacionada tampoco se elimina (debe
desactivarse para conservar el historial).

## Acceso administrativo

El módulo de autenticación actual no proporciona todavía inicio de sesión ni
validación de rol. Por eso las rutas administrativas están cerradas por defecto
y devuelven `503`. Para probar en un entorno local aislado se puede definir
`ALLOW_UNAUTHENTICATED_ADMIN=true` antes de iniciar la API. No actives esa opción
en redes compartidas ni en producción. Antes de desplegar, sustituye
`require_admin_access` en `src/app/core/permissions.py` por la validación del
token y del rol `super_admin`.

Durante el desarrollo web, Vite reenvía `/api` a `http://127.0.0.1:8000`.