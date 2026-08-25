-- Bloques del patrón semanal de atención de la barbería.
--
-- Una fila = un bloque continuo de atención.
--   Día normal   -> 1 fila  (ej. martes 10:00-20:00)
--   Día partido  -> 2 filas (ej. sábado 09:00-14:00 y 16:00-20:00)
--   Día cerrado  -> filas con activo = false (se conserva el horario)
--
-- Los cierres de una fecha concreta (festivos, vacaciones) NO van aquí:
-- esta tabla es solo el patrón que se repite cada semana. Eso irá en la
-- tabla `excepciones`.

create table horarios_semana (
  id bigint generated always as identity primary key,
  dia_semana smallint not null,
  hora_inicio time not null,
  hora_fin time not null,
  activo boolean not null default true,
  created_at timestamptz not null default now(),

  -- 0 = domingo ... 6 = sábado. Es la misma convención que devuelven
  -- extract(dow from fecha) en Postgres y Date.getDay() en JavaScript,
  -- así que en la Fase 3 no hay que traducir nada entre BD y navegador.
  constraint horarios_semana_dia_valido
    check (dia_semana between 0 and 6),

  -- Un bloque no puede cerrar antes de abrir. Como consecuencia, tampoco
  -- puede cruzar la medianoche: para una barbería no aplica.
  constraint horarios_semana_rango_valido
    check (hora_fin > hora_inicio),

  -- Evita cargar dos veces el mismo bloque para un día.
  -- El índice que crea esta restricción es además el que sirve para
  -- buscar los bloques de un día en la Fase 3.
  constraint horarios_semana_bloque_unico
    unique (dia_semana, hora_inicio)
);

comment on table horarios_semana is
  'Bloques de atención del patrón semanal. Una fila por bloque; un día con horario partido tiene varias.';

comment on column horarios_semana.dia_semana is
  '0 = domingo, 1 = lunes, ... 6 = sábado. Misma convención que extract(dow) y Date.getDay().';

comment on column horarios_semana.hora_inicio is
  'Hora local del negocio (America/Monterrey). Se usa `time` y no `timetz` a propósito: timetz guarda un offset fijo que se rompe con el horario de verano.';

comment on column horarios_semana.activo is
  'false = no se atiende ese bloque. Permite cerrar un día sin borrar su horario configurado.';

alter table horarios_semana enable row level security;

create policy "Cualquiera puede leer horarios"
  on horarios_semana
  for select
  to anon
  using (true);
