create table servicios (
  id bigint generated always as identity primary key,
  nombre text not null,
  descripcion text,
  precio numeric(10, 2) not null,
  duracion_minutos integer not null,
  created_at timestamptz not null default now()
);

alter table servicios enable row level security;

create policy "Cualquiera puede leer servicios"
  on servicios
  for select
  to anon
  using (true);
