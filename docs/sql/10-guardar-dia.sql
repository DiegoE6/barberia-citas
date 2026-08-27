-- Reemplaza de golpe el horario de un día de la semana.
--
-- ── Por qué existe: el guardado tiene que ser atómico ───────────────────
-- Guardar un día es borrar sus filas e insertar las nuevas. Hecho desde
-- TypeScript son dos llamadas con un viaje de red en medio, y si la segunda
-- fallaba el día quedaba SIN filas — o sea, cerrado, sin que el dueño lo
-- pidiera. Perder el sábado, que es el día más fuerte de la semana, por un
-- error de red intermitente.
--
-- El cuerpo de una función es una sola transacción: si el insert falla, el
-- delete se revierte con él y el día se queda exactamente como estaba. Ese es
-- todo el punto de esta función.
--
-- ── Lo que esta función NO valida, a propósito ──────────────────────────
-- El formato de las horas, que un tramo no quede a medias, que cerrar sea
-- después de abrir y que los tramos no se encimen los valida
-- app/actions/horarios.ts antes de llamar aquí. No se duplica esa lógica:
-- duplicarla es tener dos versiones que con el tiempo dejan de coincidir.
--
-- Lo que sí sigue protegiendo la base de datos son sus propios constraints
-- (`horarios_semana_dia_valido`, `horarios_semana_rango_valido` y el
-- `unique (dia_semana, hora_inicio)`). Y ahora protegen mejor que antes: al
-- estar dentro de la transacción, un rechazo de cualquiera de ellos revierte
-- también el borrado.
--
-- ── Los bloques llegan como jsonb ───────────────────────────────────────
-- Un arreglo de objetos, que es como supabase-js manda un arreglo de
-- TypeScript:  [{"inicio": "09:00", "fin": "14:00"}, ...]
-- Un arreglo vacío es válido y significa "día sin horario cargado": no se
-- inserta ninguna fila.
--
-- Todas las filas del día comparten `activo`, porque el editor tiene un solo
-- interruptor por día. Cerrar guarda las horas con activo = false en vez de
-- no guardarlas: es lo que permite volver a abrir el día sin reescribir su
-- horario. Ver docs/DECISIONES.md.

create or replace function guardar_dia(
  p_dia integer,
  p_abierto boolean,
  p_bloques jsonb
)
returns void
language sql
-- Escribe: `volatile` (el valor por omisión, explícito aquí para que se lea).
-- Las otras funciones del proyecto son `stable` porque solo leen.
volatile
-- `security invoker`: la función corre con los permisos de quien la llama, no
-- con los de quien la creó. Es el valor por omisión y aquí es el correcto —
-- quien la llama es el panel con la service_role key, que ya puede escribir.
-- Un `security definer` le daría permisos prestados a cualquiera que lograra
-- ejecutarla, que es justo lo que no queremos en una función que escribe.
security invoker
-- Con el search_path vacío, los nombres sin calificar no se resuelven contra
-- ningún esquema: por eso las tablas van como `public.…`. Evita que un objeto
-- creado en otro esquema pueda suplantar al que esta función quiere usar.
set search_path = ''
as $$
  delete from public.horarios_semana
   where dia_semana = p_dia::smallint;

  insert into public.horarios_semana (dia_semana, hora_inicio, hora_fin, activo)
  select
    p_dia::smallint,
    (bloque->>'inicio')::time,
    (bloque->>'fin')::time,
    p_abierto
  from jsonb_array_elements(coalesce(p_bloques, '[]'::jsonb)) as bloque;
$$;

comment on function guardar_dia(integer, boolean, jsonb) is
  'Reemplaza en una sola transacción los bloques de un día de la semana. Evita que un insert fallido deje el día sin horario tras el borrado.';


-- ── Permisos: al revés que bloques_del_dia ──────────────────────────────
--
-- ⚠️ Postgres le da `execute` a `public` a TODA función recién creada. Para
-- `bloques_del_dia` eso era inofensivo —solo lee horarios, que ya salen en la
-- landing— y de hecho se le dio permiso a `anon` a propósito.
--
-- Ésta ESCRIBE. Dejar el permiso por omisión le daría a `anon` un endpoint
-- para reescribir los horarios del negocio, y la anon key viaja en el bundle
-- del navegador: es pública por diseño. `horarios_semana` solo tiene política
-- de SELECT para anon justamente para que no pueda escribir; una función
-- ejecutable por cualquiera sería una puerta trasera a esa misma tabla.
--
-- `public` abarca a todos los roles, así que el primer revoke basta. Los otros
-- dos son por si algún grant explícito los hubiera alcanzado: sobre un rol sin
-- permiso, un revoke no hace nada y no da error.
revoke execute on function guardar_dia(integer, boolean, jsonb) from public;
revoke execute on function guardar_dia(integer, boolean, jsonb) from anon;
revoke execute on function guardar_dia(integer, boolean, jsonb) from authenticated;

-- El único que la ejecuta es el panel, a través de la service_role key.
grant execute on function guardar_dia(integer, boolean, jsonb) to service_role;


-- ── Comprobaciones ──────────────────────────────────────────────────────
--
-- 1. Que anon NO pueda ejecutarla. Debe devolver `false`:
--
--      select has_function_privilege(
--        'anon', 'guardar_dia(integer, boolean, jsonb)', 'execute');
--
--    Y service_role sí. Debe devolver `true`:
--
--      select has_function_privilege(
--        'service_role', 'guardar_dia(integer, boolean, jsonb)', 'execute');
--
-- 2. Que reemplace el sábado por sus dos bloques de siempre (6 = sábado):
--
--      select guardar_dia(6, true,
--        '[{"inicio":"09:00","fin":"14:00"},
--          {"inicio":"16:00","fin":"20:00"}]'::jsonb);
--
--      select dia_semana, hora_inicio, hora_fin, activo
--        from horarios_semana where dia_semana = 6 order by hora_inicio;
--
-- 3. Que un insert rechazado NO se lleve por delante el horario que había.
--    Este intento viola el CHECK de rango (cierra antes de abrir) y debe
--    fallar entero:
--
--      select guardar_dia(6, true, '[{"inicio":"20:00","fin":"09:00"}]'::jsonb);
--
--    Y el sábado debe seguir teniendo sus DOS bloques intactos:
--
--      select dia_semana, hora_inicio, hora_fin, activo
--        from horarios_semana where dia_semana = 6 order by hora_inicio;
