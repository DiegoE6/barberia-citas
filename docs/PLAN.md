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
- [x] Tabla `excepciones` (cierres de una fecha concreta: festivos, vacaciones)
- [x] Formulario público: servicio, fecha, hora, nombre, teléfono
- [x] Mostrar solo horarios libres según duración del servicio
- [x] Validar que no se empalmen citas
- [x] Confirmación al cliente

## Fase 4 — Panel de administración
- [ ] Login del dueño (Supabase Auth)
- [ ] Agenda del día y de la semana
- [ ] Cancelar y confirmar citas
- [ ] Editar servicios, precios y horarios