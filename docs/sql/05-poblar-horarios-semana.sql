-- Horario actual del negocio. Tomado de app/data.ts, con tres cambios:
--   - Domingo abre (día fuerte para barberías en Monterrey).
--   - Lunes pasa a ser el día de descanso.
--   - Sábado queda con horario partido, para que la Fase 3 se pruebe
--     desde el principio contra un día de dos bloques.
--
-- El lunes se inserta igual, con activo = false, para no perder su horario
-- si el dueño decide volver a abrir ese día.
--
-- Convención: 0 = domingo, 1 = lunes, ... 6 = sábado.

insert into horarios_semana (dia_semana, hora_inicio, hora_fin, activo) values
  (0, '09:00', '15:00', true),   -- Domingo
  (1, '10:00', '20:00', false),  -- Lunes     — cerrado (día de descanso)
  (2, '10:00', '20:00', true),   -- Martes
  (3, '10:00', '20:00', true),   -- Miércoles
  (4, '10:00', '20:00', true),   -- Jueves
  (5, '10:00', '21:00', true),   -- Viernes
  (6, '09:00', '14:00', true),   -- Sábado    — bloque 1 (horario partido)
  (6, '16:00', '20:00', true);   -- Sábado    — bloque 2


-- Comprobación: debe devolver 8 filas (el sábado ocupa dos), en orden de
-- despliegue con lunes primero. El (dia_semana + 6) % 7 es lo que mueve el
-- domingo del principio al final; el hora_inicio ordena los dos bloques
-- del sábado entre sí.
--
--   select dia_semana, hora_inicio, hora_fin, activo
--     from horarios_semana
--    order by (dia_semana + 6) % 7, hora_inicio;
