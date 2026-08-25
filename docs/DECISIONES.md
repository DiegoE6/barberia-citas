# Decisiones de arquitectura

## Caché de la landing: revalidate = 300 (2026-08-14)

**Contexto**: `Services.tsx` lee la tabla `servicios` de Supabase. Como
Next.js prerrenderiza la página como estática, un cambio de precio en
Supabase no se reflejaba en producción hasta el siguiente deploy.

**Opciones consideradas**:
- `dynamic = 'force-dynamic'` — siempre fresco, pero consulta Supabase en
  cada visita y pierde el caché estático. Descartado: el dueño cambia
  precios pocas veces al mes, no vale la pena pagar ese costo en cada
  visita.
- Revalidación bajo demanda (`revalidatePath()`) — la más eficiente y
  la más fresca, pero requiere que algo avise a Next.js cuándo hubo un
  cambio. Hoy los precios se editan directo en el Table Editor de
  Supabase, fuera de la app, así que requeriría un Database Webhook
  adicional. Descartado por ahora.
- `revalidate = N` (ISR por tiempo) — elegida.

**Decisión**: `export const revalidate = 300` en `app/page.tsx` (se
regenera como máximo cada 5 minutos). Costo de consultas a Supabase
despreciable, y el retraso máximo (5 min) es aceptable para cambios de
precio poco frecuentes.

**Migración futura**: en la Fase 4, cuando exista un panel de admin, los
cambios de precio van a pasar por la propia app. En ese momento se puede
llamar `revalidatePath('/')` justo después de guardar, y frescura pasa a
ser inmediata sin necesidad de un webhook externo. Reemplazar el
`revalidate` por tiempo en ese momento.

## Horarios: una fila por bloque, no por día (2026-08-25)

**Contexto**: la tabla de horarios tiene que alimentar dos cosas muy
distintas: la lista de horarios de la landing (Fase 2) y el cálculo de
slots libres para agendar (Fase 3). Además, el horario partido —cerrar a
mediodía y reabrir por la tarde— es común en las barberías locales, así
que el modelo tiene que soportarlo desde el principio.

**Opciones consideradas**:
- **Una fila por día**, con `hora_apertura` y `hora_cierre`. Es lo más
  directo, pero para el horario partido obliga a agregar
  `hora_apertura_2` y `hora_cierre_2`: dos columnas nullable más, más
  `CHECK`s, y código en la Fase 3 que pregunta "¿hay segundo bloque?".
  Y no extiende a tres bloques. Descartada.
- **Una fila por bloque** (`dia_semana`, `hora_inicio`, `hora_fin`) —
  elegida.

**Decisión**: tabla `horarios_semana`, una fila por bloque continuo de
atención. Un día normal es una fila, uno partido son dos. Tiene *menos*
columnas que la alternativa, y sobre todo le quita trabajo a la Fase 3:
el generador de slots recorre los bloques del día y avanza de
`hora_inicio` a `hora_fin`; un día con uno y uno con dos bloques pasan
por el mismo código, sin casos especiales.

Detalles que se decidieron junto con esto:

- **`dia_semana smallint` con 0 = domingo**, en vez de texto o de un
  `enum`. Es la convención que ya devuelven `extract(dow from fecha)` en
  Postgres y `Date.getDay()` en JavaScript, así que la traducción
  *fecha → día → bloques* de la Fase 3 no necesita ningún mapeo. El
  costo es que ordenar por esa columna pone el domingo primero; se
  resuelve en la consulta con `order by (dia_semana + 6) % 7`.
- **Día cerrado = fila con `activo = false`**, no fila ausente. Así el
  panel de la Fase 4 cierra un día con un switch sin perder el horario
  configurado, y las columnas de hora se quedan `NOT NULL` sin `CHECK`
  condicional. Es la misma convención que ya usa `servicios.activo`.
  Hoy el día inactivo es el lunes; el domingo abre.
- **`time` y no `timetz`**: `timetz` guarda un offset fijo que se rompe
  con el horario de verano. La zona (`America/Monterrey`) se aplica al
  combinar fecha + hora en la Fase 3.
- **Sin índice extra**: la tabla tiene ~7 filas y el `unique
  (dia_semana, hora_inicio)` ya deja un índice utilizable para buscar
  por día.
- **Sin restricción de solapamiento entre bloques**. Se puede prohibir a
  nivel de BD con un `EXCLUDE`, pero requiere habilitar la extensión
  `btree_gist`. Con uno o dos bloques por día y un solo dueño editando,
  se validará en el formulario de la Fase 4.

**Trampa anotada para la Fase 3**: en JavaScript, `new Date("2026-08-30")`
se interpreta como medianoche **UTC**, y `.getDay()` en Monterrey (UTC−6)
devuelve el día anterior. El día de la semana hay que sacarlo de las
partes de la fecha, no de un `Date` construido desde el string ISO.

**Migración futura**: los cierres de una fecha concreta (festivos,
vacaciones) **no** van en esta tabla, que es solo el patrón que se repite
cada semana. Irán en una tabla `excepciones` (fecha + abierto/cerrado)
en la Fase 3. La política RLS de lectura es `to anon`, igual que la de
`servicios`; cuando la Fase 4 traiga Supabase Auth habrá que revisar
ambas para el rol `authenticated`.

## Citas: instantes, foto del momento y empalme en la BD (2026-08-25)

**Contexto**: la tabla `citas` es la única de las tres que guarda datos
personales y la única que crece sin techo. Tiene que alimentar el
formulario público (Fase 3), la agenda del dueño (Fase 4) y, más
adelante, un reporte de ventas.

### Sin lectura pública

`servicios` y `horarios_semana` tienen política `for select to anon`
porque son datos públicos. `citas` **no la tiene y no debe tenerla**: la
anon key viaja en el bundle del navegador, así que abrir la lectura
equivale a publicar la lista de clientes del negocio con sus teléfonos.
La única política es de `insert`, con un `with check` que impide
auto-confirmarse una cita o agendar en el pasado.

La Fase 3 necesita saber qué horarios están ocupados sin poder leer la
tabla. Opciones para entonces: una vista que exponga solo `inicio`/`fin`
sin columnas personales, una función RPC que devuelva directamente los
slots libres, o calcularlo en el servidor de Next.js con la
`service_role key`. Ninguna requiere abrir `citas` a `anon`. Se decide en
la Fase 3; cerrar la tabla hoy es lo que permite posponerlo sin riesgo.

Riesgo conocido que queda abierto: sin autenticación, `anon` puede
insertar citas ilimitadas. Las defensas (rate limit, captcha, verificar
el teléfono) son tema de Fase 3/4.

### `inicio` y `fin` como `timestamptz`

**Opciones consideradas**:
- `date` + `time` por separado — compara directo contra `horarios_semana`,
  que usa `time` local, pero un rango partido en dos columnas complica la
  restricción de empalme, que es la validación crítica. Descartada.
- Un solo `tstzrange` — lo más directo para el empalme, pero PostgREST lo
  entrega como texto y sería incómodo para el panel de la Fase 4.
  Descartada.
- Dos columnas `timestamptz` — elegida.

La conversión a hora local del negocio (`America/Monterrey`) para
comparar contra `horarios_semana` se hace en un solo lugar: el generador
de slots de la Fase 3.

### Foto del momento: `fin` y `precio_cobrado`

Las dos se guardan en vez de derivarse de `servicios`, por la misma
razón: **un cambio de configuración no debe reescribir el pasado.**

- `fin` no se calcula con un join a `servicios.duracion_minutos`. Si el
  dueño cambia la duración de un servicio de 45 a 60 minutos, las citas
  ya agendadas se alargarían retroactivamente y podrían empalmarse entre
  sí sin que nadie las tocara.
- `precio_cobrado numeric(10,2)` nullable, copiada del servicio al
  agendar. Se agregó desde el inicio y no cuando llegue el reporte,
  porque el costo es asimétrico: la columna cuesta una línea hoy, pero
  agregarla después deja todo el historial previo en `NULL` sin forma de
  recuperarlo. El reporte de "cuánto vendí este mes" es parte del
  argumento de venta del producto, así que va a llegar.

### El empalme se garantiza en la base de datos

Un chequeo en el código de la Fase 3 ("busca citas que choquen, si no hay,
inserta") tiene una **condición de carrera**: dos clientes que agendan el
mismo horario en el mismo segundo pasan los dos la revisión y se insertan
los dos. Pasa justo cuando se manda una promoción por WhatsApp y varios
entran a la vez, y es invisible en pruebas.

**Decisión**: restricción `EXCLUDE` sobre `tstzrange(inicio, fin, '[)')`.
El chequeo en el código se mantiene, pero su trabajo pasa a ser dar un
mensaje bonito; el que garantiza la integridad es el constraint.

Detalles:
- El rango es `'[)'` (abierto al final) a propósito: una cita de
  10:00-10:30 y otra de 10:30-11:00 son adyacentes, no empalmadas. Con el
  default equivocado no se podrían agendar dos cortes seguidos.
- Un `where estado <> 'cancelada'` hace que cancelar libere el horario.
- No hace falta `btree_gist`, a diferencia de lo que sí requeriría un
  `EXCLUDE` en `horarios_semana`: aquí es solapamiento puro de rangos, sin
  igualdad sobre una columna escalar.

**Supuesto: una sola silla.** La restricción prohíbe dos citas
simultáneas en todo el negocio. El día que haya un segundo barbero tiene
que pasar a ser por barbero (`barbero_id WITH =` más el rango), y
*entonces* sí entra `btree_gist`.

### Pendiente para la Fase 3

El `with check` de la política de insert solo alcanza a validar
`estado` e `inicio`. No puede verificar que `fin` corresponda a la
duración real del servicio ni que `precio_cobrado` sea el precio real:
como el insert lo hace `anon`, el cliente controla esos valores. Las dos
salidas son un trigger `before insert` que los calcule desde
`servicio_id` ignorando lo que mande el cliente, o hacer el insert del
lado del servidor con la `service_role key`. Se decide junto con el resto
del modelo de acceso de la Fase 3.

### Otras decisiones menores

- `estado` es `text` con `check` en (`pendiente`, `confirmada`,
  `cancelada`), no un `enum`: es probable que la Fase 4 quiera agregar
  `no_asistio`, y ampliar un `check` es un `alter` simple.
- `telefono` es `text`, nunca numérico: se perderían los ceros a la
  izquierda y no cabría el prefijo `+52`.
- `servicio_id` con `on delete restrict` explícito: si el dueño intenta
  borrar un servicio con citas históricas, Postgres se lo impide y lo
  obliga a usar `activo = false`.
- Índice en `inicio`, esta vez sí. Al contrario de `horarios_semana`, que
  tiene 8 filas para siempre, `citas` crece sin techo, y tanto la agenda
  como la disponibilidad filtran por rango de fechas.
