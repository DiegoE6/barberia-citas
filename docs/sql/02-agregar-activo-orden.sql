alter table servicios
  add column activo boolean not null default true,
  add column orden integer not null default 0;