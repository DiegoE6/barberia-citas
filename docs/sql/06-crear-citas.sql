-- Citas agendadas.
--
-- ⚠️ A DIFERENCIA DE `servicios` Y `horarios_semana`, ESTA TABLA NO TIENE
--    POLÍTICA DE LECTURA PÚBLICA, Y NO DEBE TENERLA.
--
--    Guarda nombre y teléfono de los clientes. La anon key viaja en el
--    bundle del navegador (por eso es NEXT_PUBLIC_), así que una política
--    `for select to anon` equivaldría a publicar la lista de clientes del
--    negocio con sus teléfonos.
--
--    La Fase 3 necesita saber qué horarios están ocupados: eso se resolverá
--    con una vista que exponga solo inicio/fin, una función RPC que devuelva
--    los slots libres, o calculándolo en el servidor con la service_role key.
--    Ninguna de esas opciones requiere abrir esta tabla a `anon`.

create table citas (
  id bigint generated always as identity primary key,

  -- on delete restrict: si el dueño intenta borrar un servicio que ya tiene
  -- citas, Postgres se lo impide y lo obliga a usar `activo = false`. Protege
  -- el historial de la agenda.
  servicio_id bigint not null references servicios (id) on delete restrict,

  nombre_cliente text not null,

  -- Texto, nunca numérico: se perderían los ceros a la izquierda y no cabría
  -- el prefijo +52.
  telefono text not null,

  -- Instantes, no fecha + hora local. La conversión a hora del negocio
  -- (America/Monterrey) para comparar contra horarios_semana se hace en un
  -- solo lugar, en el generador de slots de la Fase 3.
  inicio timestamptz not null,

  -- `fin` se guarda, no se calcula con un join a servicios.duracion_minutos:
  -- si el dueño cambia la duración de un servicio, las citas ya agendadas no
  -- deben cambiar de largo retroactivamente. Foto del momento.
  fin timestamptz not null,

  -- Precio con el que se agendó, copiado del servicio. Misma lógica que `fin`:
  -- si el dueño sube precios, el reporte de ventas debe usar lo que se cobró,
  -- no el precio actual. Nullable porque las citas viejas o cargadas a mano
  -- pueden no tenerlo.
  precio_cobrado numeric(10, 2),

  estado text not null default 'pendiente',
  created_at timestamptz not null default now(),

  constraint citas_rango_valido
    check (fin > inicio),

  -- Texto + check en vez de un enum: es probable que la Fase 4 quiera agregar
  -- 'no_asistio', y ampliar un check es un alter simple.
  constraint citas_estado_valido
    check (estado in ('pendiente', 'confirmada', 'cancelada')),

  constraint citas_precio_valido
    check (precio_cobrado is null or precio_cobrado >= 0),

  -- La garantía real de que no se empalmen dos citas. El chequeo que haga el
  -- código de la Fase 3 sirve para dar un mensaje bonito, pero no basta: dos
  -- clientes que agendan el mismo horario en el mismo segundo pasarían los dos
  -- la revisión. Esto lo rechaza a nivel de motor.
  --
  -- El rango va como '[)' (abierto al final) a propósito: así una cita de
  -- 10:00-10:30 y otra de 10:30-11:00 son adyacentes, no empalmadas.
  --
  -- El where excluye las canceladas, para que cancelar libere el horario.
  --
  -- No hace falta la extensión btree_gist: es solapamiento puro de rangos,
  -- que Postgres soporta de fábrica. Sería necesaria el día que haya varios
  -- barberos y la restricción tenga que ser por barbero.
  constraint citas_sin_empalme
    exclude using gist ((tstzrange(inicio, fin, '[)')) with &&)
    where (estado <> 'cancelada')
);

comment on table citas is
  'Citas agendadas. Contiene datos personales: sin política de lectura para anon.';

comment on column citas.fin is
  'Fin calculado al agendar a partir de la duración del servicio. Se guarda para que un cambio posterior de duración no altere las citas existentes.';

comment on column citas.precio_cobrado is
  'Precio del servicio al momento de agendar. Foto del momento, para que el reporte de ventas no use precios actuales.';

-- La agenda del día y de la semana (Fase 4) y la consulta de disponibilidad
-- (Fase 3) filtran por rango de fechas. A diferencia de horarios_semana, esta
-- tabla sí crece sin techo.
create index citas_inicio_idx on citas (inicio);

alter table citas enable row level security;

-- Única política: el formulario público puede crear citas.
-- El with check evita que un cliente se auto-confirme la cita mandando el
-- campo a mano, o que agende en el pasado.
create policy "Cualquiera puede crear una cita"
  on citas
  for insert
  to anon
  with check (
    estado = 'pendiente'
    and inicio > now()
  );

-- Deliberadamente NO hay política de select, update ni delete para anon.
-- Leer, confirmar y cancelar citas es cosa del panel de la Fase 4, con
-- Supabase Auth y políticas para el rol authenticated.
