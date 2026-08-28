-- Columna normalizada del teléfono, para poder contar citas por cliente.
--
-- ── Por qué existe ──────────────────────────────────────────────────────
-- El freno anti-spam limita cuántas citas pendientes puede tener un mismo
-- teléfono. Sin normalizar, ese límite se salta solo: el cliente escribe
-- "81 1234 5678" la primera vez y "8112345678" la segunda, y para la
-- comparación son dos personas distintas.
--
-- ── Por qué una columna generada y no normalizar en TypeScript ──────────
-- Porque el filtro tiene que correr DENTRO de la consulta (`where
-- telefono_norm = '8112345678'`). Normalizar en TypeScript obligaría a
-- traerse todas las citas pendientes al servidor para compararlas ahí.
--
-- `generated always as ... stored` significa que Postgres la calcula solo,
-- en cada insert y cada update, y no se puede escribir a mano. No hay forma
-- de que se desincronice de `telefono`, que sigue siendo el dato de verdad
-- —lo que el cliente escribió— y es el que se le muestra al dueño.
--
-- ── Qué hace la expresión ───────────────────────────────────────────────
-- 1. `regexp_replace(telefono, '\D', '', 'g')` borra todo lo que no sea
--    dígito: espacios, guiones, paréntesis y el '+'.
-- 2. `right(..., 10)` se queda con los últimos 10 dígitos, que es el largo
--    de un número mexicano. Así "+52 81 1234 5678", "5218112345678" y
--    "8112345678" caen todos en la misma clave.
--
-- Un número más corto que 10 dígitos pasa entero; el código lo trata aparte.

alter table citas
  add column telefono_norm text
  generated always as (right(regexp_replace(telefono, '\D', '', 'g'), 10)) stored;

comment on column citas.telefono_norm is
  'Últimos 10 dígitos de telefono, calculados por Postgres. Sirve para agrupar las citas de un mismo cliente aunque escriba el número con distinto formato. El dato que se le muestra al dueño es telefono, no éste.';

-- El límite consulta por teléfono + estado. El índice compuesto evita
-- recorrer la tabla entera, que a diferencia de las de configuración crece
-- sin techo.
create index citas_telefono_norm_idx on citas (telefono_norm, estado);


-- ── Comprobaciones ──────────────────────────────────────────────────────
--
-- 1. Que las tres formas de escribir el mismo número den la misma clave.
--    Las tres filas deben mostrar '8112345678':
--
--      select telefono, telefono_norm from citas
--       where telefono_norm = '8112345678';
--
-- 2. Que la columna sea de solo lectura. Esto debe FALLAR con
--    "cannot insert a non-DEFAULT value into column telefono_norm":
--
--      update citas set telefono_norm = 'inventado' where id = 1;
--
-- 3. Que el índice se use. El plan debe mencionar citas_telefono_norm_idx
--    y no un Seq Scan (con pocas filas Postgres puede preferir el scan;
--    entonces vale con que la consulta funcione):
--
--      explain select count(*) from citas
--       where telefono_norm = '8112345678' and estado = 'pendiente';
