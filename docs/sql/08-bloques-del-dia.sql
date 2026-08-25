-- Devuelve los bloques de atención de una fecha concreta, ya convertidos a
-- instantes (timestamptz).
--
-- ── Por qué esta función existe ─────────────────────────────────────────
-- `horarios_semana` guarda reloj local (`time`) y `citas` guarda instantes
-- (`timestamptz`). Para cruzarlos hay que convertir, y la dirección que hace
-- falta —de reloj local a instante— es la difícil: JavaScript no trae nada
-- nativo para resolverla, y hacerla a mano exige un helper delicado o una
-- librería de fechas.
--
-- Postgres la resuelve con `at time zone`, que es un operador nativo y usa la
-- base de datos IANA completa. Así la conversión peligrosa ocurre una sola vez,
-- aquí, y del lado de TypeScript todo el cálculo de slots queda como aritmética
-- sobre milisegundos, donde las zonas horarias no existen y no hay nada que
-- equivocar.
--
-- ── Los dos sentidos de `at time zone` ──────────────────────────────────
-- Depende del tipo de entrada:
--   timestamp   at time zone Z  ->  timestamptz   (reloj local -> instante) ← ésta
--   timestamptz at time zone Z  ->  timestamp     (instante -> reloj local)
--
-- `fecha + hora_inicio` da un `timestamp` (fecha + hora, sin zona), así que
-- estamos en el primer caso.
--
-- ── El día de la semana ─────────────────────────────────────────────────
-- `extract(dow from fecha)` se calcula sobre un `date`, que no tiene zona: no
-- hay ambigüedad posible. Esto esquiva por completo la trampa de Date.getDay()
-- en JavaScript, que sobre un string ISO devuelve el día anterior en México.
-- La convención coincide: 0 = domingo ... 6 = sábado.

create or replace function bloques_del_dia(
  fecha date,
  zona text default 'America/Monterrey'
)
returns table (inicio timestamptz, fin timestamptz)
language sql
stable
as $$
  select
    (fecha + h.hora_inicio) at time zone zona,
    (fecha + h.hora_fin) at time zone zona
  from horarios_semana h
  where h.dia_semana = extract(dow from fecha)::smallint
    and h.activo
  order by h.hora_inicio;
$$;

comment on function bloques_del_dia(date, text) is
  'Bloques activos de una fecha, convertidos de reloj local a instantes. La zona es parámetro para que el sistema sirva a negocios en zonas con horario de verano.';

-- Los horarios son datos públicos: ya salen en la landing. No hace falta la
-- service_role key para leerlos.
grant execute on function bloques_del_dia(date, text) to anon;

-- Comprobación. El sábado (2026-08-29) debe devolver DOS filas con el hueco
-- de 14:00 a 16:00; el lunes (2026-08-31), cero.
--
--   select * from bloques_del_dia('2026-08-29');
--   select * from bloques_del_dia('2026-08-31');
--
-- Para verlo en hora local en vez de UTC, se convierte de vuelta:
--
--   select inicio at time zone 'America/Monterrey' as inicio_local,
--          fin    at time zone 'America/Monterrey' as fin_local
--     from bloques_del_dia('2026-08-29');