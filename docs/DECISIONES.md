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

*Resuelto el 2026-08-25; ver la entrada siguiente.*

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

## Acceso a citas: Server Action con service_role (2026-08-25)

**Contexto**: resuelve el pendiente que dejó la entrada anterior. Había
que decidir cómo se insertan las citas y cómo se lee la disponibilidad,
sabiendo que la política `for insert to anon` de `06-crear-citas.sql`
dejaba dos huecos: el cliente controlaba `fin` y `precio_cobrado`, y
cualquiera con la anon key podía crear citas sin límite.

El punto de partida es que **la anon key es pública por diseño**: viaja
en el bundle del navegador. Cualquier permiso concedido al rol `anon`
está concedido a todo internet.

**Opciones consideradas**:

- **Insert desde el navegador con un trigger.** El trigger `before insert`
  recalcularía `fin` y `precio_cobrado` desde `servicio_id`, pisando lo
  que mande el cliente. Ventaja real: la garantía vale para cualquier
  origen del insert, incluido el Table Editor o una app móvil futura, y
  no hace falta la service_role key en ningún lado. Descartada por el
  spam: el endpoint de escritura sería la API pública de Supabase, y no
  hay dónde interponer un límite propio. Alguien puede llenar la agenda
  con citas falsas en segundos. Además, la disponibilidad exigiría
  construir una vista o un RPC.
- **Server Action con la service_role key** — elegida.

**Decisión**: el formulario público llama a un Server Action. Ese código
corre solo en el servidor, busca el servicio en la BD, calcula él mismo
`fin` y `precio_cobrado`, valida, e inserta con `supabaseAdmin`
(`app/lib/supabase-admin.ts`), que usa la service_role key e ignora RLS.
La disponibilidad se calcula igual, en el servidor: al navegador solo
bajan las horas libres, nunca datos de clientes. No hace falta ni vista
ni RPC.

Razones, por peso:
1. **El spam decide.** Es la única de las dos que deja un lugar propio
   donde poner el freno (límite por teléfono, campo trampa, captcha).
2. Cierra el hueco de `fin`/`precio` sin maquinaria nueva: el cliente
   sencillamente ya no manda esos valores.
3. La disponibilidad no necesita objetos nuevos en la base de datos.
4. La lógica de negocio queda en un solo lenguaje y un solo lugar.

**Lo que se cede**: RLS deja de ser el guardia de `citas`; el guardia
pasa a ser la disciplina de no usar el cliente admin donde no va. Lo
hace manejable que Next.js solo mete en el bundle del navegador las
variables con prefijo `NEXT_PUBLIC_`, así que la llave no existe del lado
del cliente: importar `supabase-admin.ts` por error da un cliente roto,
no una llave filtrada. El módulo además tiene un guard que lanza un error
si se carga en el navegador.

**`07-cerrar-citas.sql` es parte de la decisión, no un extra.** Quita la
política de insert de `anon`. Mientras esa política exista, la puerta
vieja sigue abierta y la Opción A no protege nada. Se corre **después**
de que el Server Action funcione, para no quedarse sin ninguna vía de
insert mientras tanto. Estado final de la tabla: RLS activo y cero
políticas, de modo que un uso equivocado del cliente público **falla
cerrado** en vez de filtrar datos.

**Lo que esta decisión NO resuelve**:
- La verificación CSRF que trae Next (compara `Origin` contra `Host`) no
  es rate limiting: no detiene un `curl` con el `Origin` correcto. El
  freno hay que escribirlo; esta decisión solo da el lugar.
- Un Server Action **es un endpoint público** con sintaxis de función.
  Los docs de Next lo dicen explícitamente: hay que tratar sus entradas
  como no confiables. Validar siempre.
- La restricción `EXCLUDE` de la BD sigue siendo la que garantiza que no
  se empalmen las citas. El Server Action puede tener bugs; el constraint
  no.
- Un límite por teléfono es débil porque los teléfonos se inventan. El
  freno serio (verificación por SMS) tiene costo y queda fuera de alcance.

## Zona horaria: la conversión vive en Postgres (2026-08-25)

**Contexto**: `horarios_semana` guarda reloj local (`time`) y `citas`
guarda instantes (`timestamptz`). El cálculo de slots tiene que cruzar
las dos, así que hay que convertir. Y de las dos direcciones posibles,
la que hace falta es la difícil.

| Dirección | Dificultad |
|---|---|
| Instante → reloj local | Fácil. `Intl` lo hace nativo. |
| **Reloj local → instante** | **Difícil.** JavaScript no trae nada nativo. |

**Verificado en el entorno de desarrollo (Node v22.17.1)**:
- `Temporal`, la API nueva que resolvería esto limpiamente, **no existe
  todavía** en Node 22. Descartada por disponibilidad, no por criterio.
- `new Date('2026-08-30').getDay()` devuelve **6** (sábado) cuando el 30
  de agosto de 2026 es **domingo**. La trampa que se había anotado como
  riesgo teórico está confirmada en la máquina real: el string ISO se
  interpreta como medianoche UTC y en México se corre un día. Un cliente
  que pidiera cita en domingo vería los horarios del sábado.

**Opciones consideradas**:
- `date-fns` + `date-fns-tz`, `Luxon`, o `dayjs` con plugins — resuelven
  la dirección difícil, pero agregan dependencias para hacer algo que
  Postgres ya hace de forma nativa. Descartadas.
- Un helper propio en TypeScript que sondee el offset con `Intl` — viable
  y sin dependencias, pero son ~15 líneas delicadas escritas a mano.
  Descartada frente a un operador nativo de la BD.
- **Función `bloques_del_dia(fecha, zona)` en Postgres** — elegida.

**Decisión**: la conversión ocurre en `docs/sql/08-bloques-del-dia.sql`,
con el operador `at time zone`, que usa la base de datos IANA completa. La
función devuelve los bloques de una fecha ya como `timestamptz`. Del lado
de TypeScript (`app/lib/disponibilidad.ts`) todo el cálculo queda como
aritmética sobre milisegundos, **donde las zonas horarias no existen y no
hay nada que equivocar**. La única conversión en JavaScript es instante →
texto para mostrar, que es la dirección fácil y la cubre `Intl`.

El día de la semana también sale de Postgres, con
`extract(dow from fecha)` sobre un `date` —que no tiene zona, así que no
hay ambigüedad posible—. Eso esquiva la trampa de `getDay()` por
completo, en vez de intentar sortearla.

### Por qué no se hardcodea el offset -06:00 (decisión de producto)

Se verificó que Monterrey tiene offset `GMT-06:00` tanto en enero como en
julio de 2026: **México abolió el horario de verano en 2022**. Eso hace
muy tentador hardcodear `-06:00` y ahorrarse toda esta pieza, porque hoy
funcionaría perfecto.

No se hizo, y la razón no es técnica sino de producto: **Baja California
sí observa horario de verano.** Los municipios de la frontera quedaron
exentos de la abolición. El día que este sistema se le venda a una
barbería en Tijuana o Mexicali, un offset fijo agendaría todas las citas
con una hora de diferencia durante medio año — y sería un bug carísimo de
encontrar, porque los otros seis meses funciona bien.

Por eso la zona es un **parámetro** de `bloques_del_dia`, con
`'America/Monterrey'` solo como valor por omisión. Cuando haya varios
negocios, la zona pasa a ser un dato de configuración de cada uno y la
función ya la acepta sin cambios.

**Que Monterrey no tenga horario de verano es una simplificación
agradable, no un cimiento.** El diseño no depende de ella.

### Constantes elegidas

- **Paso entre horarios: 30 minutos.** Con 15 la agenda se compacta más,
  pero se le presentan al cliente el doble de opciones.
- **Anticipación mínima: 30 minutos.** Que nadie agende para dentro de
  cinco minutos.

Las dos viven como constantes con nombre en `app/lib/disponibilidad.ts`,
no en la base de datos: no son datos por día, son política del negocio, y
cambiarlas es editar una línea.

### Distinguir "cerrado" de "error"

`getDisponibilidad` devuelve un estado de tres valores (`ok`, `cerrado`,
`error`) en vez de simplemente una lista vacía. Si una consulta falla y
lo reportáramos como "cerrado", le estaríamos diciendo al cliente que la
barbería no abre ese día. Es el mismo cuidado que ya se había tomado en
`Schedule.tsx` para no pintar los siete días como "Cerrado" ante un error
de red.
