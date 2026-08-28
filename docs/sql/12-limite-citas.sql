-- Contador de intentos de reserva, para el freno anti-spam por IP.
--
-- ── Por qué esto vive en Postgres y no en memoria ───────────────────────
-- El instinto es un Map a nivel de módulo en el Server Action. En Vercel no
-- funciona, por tres razones que se suman:
--
--   1. Cada petición puede caer en una instancia fría distinta, y ahí el
--      contador nace en cero.
--   2. Vercel escala a varias instancias en paralelo. Diez peticiones
--      simultáneas pueden tocar diez contadores distintos, y cada uno ve
--      "primer intento".
--   3. Las instancias se congelan y se reciclan sin aviso.
--
-- O sea que atraparía, con suerte, una ráfaga que por casualidad caiga toda
-- en la misma instancia caliente. El estado tiene que vivir en el único
-- almacén que comparten todas las instancias, que es esta base de datos.
--
-- ── Por qué el límite por teléfono NO usa esta tabla ────────────────────
-- Porque ese estado ya existe: son las filas de `citas`. Contar la realidad
-- en vez de llevar un contador aparte tiene dos ventajas que aquí no se
-- pueden tener: no se puede desincronizar, y se auto-repara —en cuanto el
-- dueño confirma o cancela una cita desde el panel, el cliente recupera su
-- cupo—. Esta tabla existe solo porque un intento RECHAZADO no deja fila en
-- `citas`, y sin fila no hay nada que contar.

create table limite_citas (
  -- 'ip:187.190.x.x'. Lleva prefijo para poder limitar otras cosas más
  -- adelante sin tener que adivinar qué es cada clave.
  clave text primary key,

  -- Inicio de la ventana vigente. Es ventana fija, no deslizante: al vencer
  -- se reinicia de golpe. Una deslizante exigiría guardar una fila por
  -- intento, y para lo que se defiende aquí no compensa.
  ventana_inicio timestamptz not null default now(),

  intentos integer not null default 0
);

comment on table limite_citas is
  'Contador de intentos de reserva por IP. Una fila por clave, no una por intento: la tabla no crece con el tráfico.';

alter table limite_citas enable row level security;

-- Cero políticas, igual que `citas`: un uso equivocado del cliente público
-- falla cerrado en vez de dejar leer o escribir el contador. La service_role
-- key ignora RLS, y es la única que llama a la función de abajo.


-- ── La función ──────────────────────────────────────────────────────────
--
-- Registra un intento y devuelve si se permite o no. Devuelve `true` si se
-- permite.
--
-- ⚠️ Esto TIENE que ser una función, y no leer-decidir-escribir desde
-- TypeScript. Es el mismo argumento de guardar_dia (10-guardar-dia.sql):
-- hecho desde el Server Action serían dos viajes de red con un hueco en
-- medio, y en ese hueco veinte peticiones en paralelo leen todas "0
-- intentos" y pasan todas. El cuerpo de una función es una sola
-- transacción, así que incrementar y comparar es atómico.
--
-- Y ese caso —peticiones en paralelo— no es teórico: es exactamente lo que
-- hace el script que quiere llenar la agenda, que es lo que este freno viene
-- a detener. Sin atomicidad, este límite no sirve para nada.

create or replace function registrar_intento(
  p_clave text,
  p_ventana_minutos integer,
  p_maximo integer
) returns boolean
language plpgsql
as $$
declare
  v_intentos integer;
  v_vencida boolean;
begin
  -- Limpieza oportunista. La tabla tiene una fila por IP, así que es chica;
  -- barrer lo de hace más de un día la mantiene así sin necesitar un cron.
  delete from limite_citas where ventana_inicio < now() - interval '1 day';

  insert into limite_citas (clave, ventana_inicio, intentos)
  values (p_clave, now(), 1)
  on conflict (clave) do update
    -- Las dos ramas del CASE miran `limite_citas.ventana_inicio`, que en un
    -- UPDATE es siempre el valor ANTERIOR de la fila. Por eso las dos
    -- asignaciones deciden lo mismo aunque una de ellas cambie esa columna.
    set ventana_inicio = case
          when limite_citas.ventana_inicio
               < now() - make_interval(mins => p_ventana_minutos)
          then now()
          else limite_citas.ventana_inicio
        end,
        intentos = case
          when limite_citas.ventana_inicio
               < now() - make_interval(mins => p_ventana_minutos)
          then 1
          else limite_citas.intentos + 1
        end
  returning intentos into v_intentos;

  return v_intentos <= p_maximo;
end;
$$;

comment on function registrar_intento(text, integer, integer) is
  'Suma un intento a la clave y responde si sigue dentro del límite. Atómica a propósito: un contador leído y escrito por separado no resiste peticiones en paralelo.';

-- Mismo cierre de permisos que guardar_dia: nadie más que el servidor.
revoke execute on function registrar_intento(text, integer, integer) from public;
revoke execute on function registrar_intento(text, integer, integer) from anon;
revoke execute on function registrar_intento(text, integer, integer) from authenticated;

grant execute on function registrar_intento(text, integer, integer) to service_role;


-- ── Comprobaciones ──────────────────────────────────────────────────────
--
-- 1. Que anon NO pueda ejecutarla. Debe devolver `false`:
--
--      select has_function_privilege(
--        'anon', 'registrar_intento(text, integer, integer)', 'execute');
--
-- 2. Que corte en el sexto intento. Los primeros cinco deben dar `true` y
--    el sexto `false`:
--
--      select i, registrar_intento('ip:prueba', 60, 5)
--        from generate_series(1, 6) as i;
--
-- 3. Que la ventana reinicie. Con la ventana en 0 minutos siempre vence,
--    así que debe volver a dar `true` aunque la clave ya esté quemada:
--
--      select registrar_intento('ip:prueba', 0, 5);
--
-- 4. Limpiar la clave de prueba:
--
--      delete from limite_citas where clave = 'ip:prueba';
