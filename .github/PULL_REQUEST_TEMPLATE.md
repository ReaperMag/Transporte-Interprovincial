<!--
  Título del PR: debe seguir Conventional Commits.
  Ejemplo: feat(tickets): agregar generación de boletos en PDF
-->

## 📝 Descripción

<!-- Explica brevemente qué cambia este PR y por qué. -->

## 🔗 Issue relacionada

<!-- Usa "Closes #número" para cerrar la issue automáticamente al integrar. -->

Closes #

## 🧩 Tipo de cambio

- [ ] `feat`: nueva funcionalidad
- [ ] `fix`: corrección de un error
- [ ] `docs`: documentación
- [ ] `refactor`: mejora de código sin cambiar su comportamiento
- [ ] `chore` / `build`: configuración, dependencias o tareas de mantenimiento
- [ ] Otro: <!-- especifica -->

## 📂 Área afectada

- [ ] `apps/web` (frontend)
- [ ] `apps/api` (backend)
- [ ] `packages/shared-types`
- [ ] Documentación / configuración del repositorio

## 🌿 Rama base

- [ ] `feature/*` → `develop`
- [ ] `release/*` → `main` (y luego `develop`)
- [ ] `hotfix/*` → `main` (y luego `develop`)

## 🧪 ¿Cómo probar los cambios?

<!-- Pasos para que el revisor verifique que todo funciona. -->

1.
2.
3.

## 📸 Capturas de pantalla (opcional)

<!-- Agrega imágenes si el cambio afecta la interfaz. -->

## ✅ Checklist del autor

- [ ] El título del PR sigue Conventional Commits.
- [ ] Los commits siguen Conventional Commits.
- [ ] La rama fue creada con Git Flow desde la rama correcta.
- [ ] Ejecuté las verificaciones locales del área modificada (frontend: `pnpm lint`, `pnpm format:check`, `pnpm typecheck`).
- [ ] La aplicación compila/arranca correctamente con estos cambios.
- [ ] El PR no tiene conflictos con la rama base.
- [ ] Actualicé la documentación si fue necesario.

## 👀 Checklist del revisor

- [ ] Verifiqué manualmente que el commit es una versión funcional.
- [ ] Las funcionalidades afectadas operan correctamente.
- [ ] El merge se hará con **merge commit** (nunca squash ni rebase), con el mensaje `Merge branch '<rama>' into <base>`.
