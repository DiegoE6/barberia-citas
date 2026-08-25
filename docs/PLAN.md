# Plan de trabajo

## Fase 1 — Landing estática ✅
- [x] Hero, servicios, horarios, ubicación, contacto
- [x] Botón de WhatsApp
- [x] Deploy en Vercel

## Fase 2 — Base de datos
- [x] Proyecto en Supabase + variables en .env.local
- [x] Tabla `servicios` (nombre, descripción, precio, duración en minutos)
- [ ] Tabla `horarios_semana` (bloques del patrón semanal: día, hora inicio, hora fin)
- [ ] Tabla `citas` (nombre, teléfono, servicio, fecha y hora, estado)
- [ ] La landing lee servicios y horarios desde la BD, ya no de data.ts

## Fase 3 — Reserva de citas
- [ ] Tabla `excepciones` (cierres de una fecha concreta: festivos, vacaciones)
- [ ] Formulario público: servicio, fecha, hora, nombre, teléfono
- [ ] Mostrar solo horarios libres según duración del servicio
- [ ] Validar que no se empalmen citas
- [ ] Confirmación al cliente

## Fase 4 — Panel de administración
- [ ] Login del dueño (Supabase Auth)
- [ ] Agenda del día y de la semana
- [ ] Cancelar y confirmar citas
- [ ] Editar servicios, precios y horarios