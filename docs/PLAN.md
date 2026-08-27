# Plan de trabajo

## Fase 1 — Landing estática ✅
- [x] Hero, servicios, horarios, ubicación, contacto
- [x] Botón de WhatsApp
- [x] Deploy en Vercel

## Fase 2 — Base de datos
- [x] Proyecto en Supabase + variables en .env.local
- [x] Tabla `servicios` (nombre, descripción, precio, duración en minutos)
- [x] Tabla `horarios_semana` (bloques del patrón semanal: día, hora inicio, hora fin)
- [x] Tabla `citas` (nombre, teléfono, servicio, inicio y fin, estado, precio cobrado)
- [x] La landing lee servicios y horarios desde la BD, ya no de data.ts

## Fase 3 — Reserva de citas
- [x] Formulario público: servicio, fecha, hora, nombre, teléfono
- [x] Mostrar solo horarios libres según duración del servicio
- [x] Validar que no se empalmen citas
- [x] Confirmación al cliente

## Fase 4 — Panel de administración
- [x] Login del dueño (Supabase Auth)
- [x] Agenda del día — verificada en producción
- [ ] Agenda de la semana (resumen por día, enlazando a cada agenda)
- [x] Cancelar y confirmar citas
- [x] Editar servicios y precios
- [ ] Editar horarios de la semana
- [ ] Crear servicios nuevos y reordenarlos
- [ ] Tabla `excepciones` (cerrar un día concreto: festivos, vacaciones) y
      filtrarla en el cálculo de slots
- [ ] Freno anti-spam en el Server Action de citas (TODO en app/actions/citas.ts)
- [x] Migrar la landing de `revalidate = 300` a `revalidatePath('/')` al guardar
      (ver primera entrada de docs/DECISIONES.md)