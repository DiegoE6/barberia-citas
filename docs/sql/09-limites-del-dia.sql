-- Devuelve el inicio y el fin de una fecha, como instantes.
--
-- ── Por qué hace falta ──────────────────────────────────────────────────
-- La agenda del panel necesita traer "las citas del 29 de agosto", y `citas`
-- guarda instantes (timestamptz). Convertir "medianoche del 29 en Monterrey"
-- a un instante es la dirección difícil de la conversión de zona, la que
-- JavaScript no resuelve de forma nativa. Misma razón que bloques_del_dia:
-- la conversión peligrosa vive en Postgres, con `at time zone`.
--
-- No se reutiliza bloques_del_dia para esto: en un día cerrado no devuelve
-- ninguna fila, y aun así puede haber citas agendadas antes de que el dueño
-- cerrara ese día. La agenda tiene que mostrarlas, o el dueño no se entera
-- de que alguien va a llegar.
--
-- `fecha + 1` avanza un día de calendario, así que el rango va de medianoche
-- a medianoche del día siguiente. Se consulta con >= inicio y < fin.

create or replace function limites_del_dia(
  fecha date,
  zona text default 'America/Monterrey'
)
returns table (inicio timestamptz, fin timestamptz)
language sql
stable
as $$
  select
    (fecha + time '00:00') at time zone zona,
    ((fecha + 1) + time '00:00') at time zone zona;
$$;

comment on function limites_del_dia(date, text) is
  'Inicio y fin de una fecha como instantes. La zona es parámetro, igual que en bloques_del_dia, para servir a negocios en zonas con horario de verano.';

-- No expone ningún dato: es aritmética de calendario. Se deja el permiso por
-- omisión; quien la usa es el panel, a través de la service_role key.

-- Comprobación. En Monterrey (UTC-6) el día empieza a las 06:00 UTC.
--
--   select * from limites_del_dia('2026-08-29');
--
--   select inicio at time zone 'America/Monterrey' as inicio_local,
--          fin    at time zone 'America/Monterrey' as fin_local
--     from limites_del_dia('2026-08-29');
