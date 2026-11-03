# Roles de cooperativa

Las cuentas de cooperativa se distinguen mediante `Account.role_id` y el código
estable de `Role.code`:

- `cooperative_admin`: administra los recursos de su propia cooperativa.
- `cooperative_clerk`: opera ventas, reservas y comprobantes con un perfil
  `Staff` activo y `position=CLERK`.

Las rutas administrativas no conceden acceso por `account_type` solamente.
También verifican el rol explícito y la cooperativa autenticada. Las operaciones
de oficina verifican además que `Account.cooperative_id` coincida con
`Staff.cooperative_id`.

## Migración de cuentas históricas

Antes de activar las restricciones en una base existente, un responsable debe
obtener la lista autorizada de correos que correspondían a administradores
históricos. No se deben inferir administradores por cuentas
`COOPERATIVE` sin rol, ni por la ausencia de un registro `Staff`.

Ejecutar la migración antes del despliegue que active las restricciones:

```powershell
cd apps\api
python scripts\migrate_cooperative_admins.py admin@cooperativa.ec
```

El comando es idempotente, no cambia contraseñas ni datos de cooperativas y
rechaza cuentas con otro rol o con un perfil `Staff`. Si algún correo del lote
es inválido, la transacción completa se revierte. No ejecutar el comando sobre
la base real sin validar previamente la lista autorizada y contar con respaldo.