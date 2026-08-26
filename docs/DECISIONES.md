# Decisiones de arquitectura

## Caché de la landing: revalidate = 300 (2026-08-14) — ✅ migrada el 2026-08-26

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

**Hecho el 2026-08-26.** El editor de servicios del panel cerró la
condición que faltaba: los precios ya se editan dentro de la app. Se quitó
`export const revalidate = 300` de `app/(public)/page.tsx` y
`app/actions/servicios.ts` llama a `revalidatePath('/')` después de
guardar. La landing sigue siendo estática (`○` en el build), pero su
frescura pasó de "hasta 5 minutos tarde" a inmediata. Ver la entrada
"Editar servicios desde el panel".

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

## Flujo de reserva en tres pasos, sin JavaScript de cliente (2026-08-25)

**Contexto**: al verificar el Paso A se detectó un problema real de la
página de una sola pantalla: si el usuario cambia el desplegable de
servicio sin volver a enviar el formulario, los horarios de abajo siguen
siendo de la consulta anterior. En una página de verificación da igual,
pero en el formulario real **alguien podría reservar creyendo que pidió
otro servicio**.

**Opciones consideradas**:
- **Auto-enviar el formulario al cambiar el select.** Es el arreglo de UX
  más directo, pero obliga a convertir la página en Client Component
  (`"use client"`) solo para eso. Descartada: introduce JavaScript de
  cliente en un flujo que hasta ahora no lo necesita.
- **Campos ocultos con los valores de la URL**, dejando todo en una
  pantalla. Elimina el peligro (lo que se envía es lo que se calculó),
  pero no el desconcierto: el desplegable seguiría mostrando una cosa y
  la lista otra. Insuficiente por sí sola.
- **Flujo en tres pasos** — elegida.

**Decisión**: `/agendar` (elegir servicio y fecha, ver horarios) →
`/agendar/confirmar` (resumen y datos de contacto) → `/agendar/listo`.

Cada horario es un enlace que lleva el servicio y la fecha **de la URL**,
no del desplegable, así que el desajuste no puede llegar a la reserva. Y
la pantalla de confirmación muestra servicio, fecha, hora y precio
tomados de la URL, sin ningún control editable a la vista: el cliente ve
exactamente lo que va a agendar antes de dar sus datos.

Ventajas adicionales: es el patrón POST/Redirect/GET de toda la vida, así
que recargar la pantalla final no crea una segunda cita; y revalidar la
disponibilidad al entrar a `confirmar` evita que alguien escriba su
nombre y teléfono en un horario que ya se ocupó.

**Todo el flujo es HTML plano**: formularios `method="get"`, un
`<form action={serverAction}>`, y los errores viajan como `?error=` en la
URL en vez de por `useActionState`. Cero `"use client"` en el proyecto.

**Nota de privacidad**: los errores se devuelven por redirect, y en esas
URLs van solo servicio, fecha y hora. El nombre y el teléfono **nunca**
se ponen en un query string, porque quedarían en el historial del
navegador y en los logs del servidor. El costo es que ante un error el
cliente los reescribe; el `required` del HTML hace que sea raro.

## Jerarquía de acciones y color de acción (2026-08-25)

**Contexto**: con la Fase 3 en producción, la landing seguía empujando a
WhatsApp. El botón "Agendar cita" del Hero apuntaba a WhatsApp, y
`Contact.tsx` tenía un segundo botón ámbar idéntico. El sistema propio de
citas competía contra el canal manual que venía a reemplazar.

**Decisión — una sola acción primaria por pantalla**: agendar en línea es
la acción primaria y se ve como botón sólido; WhatsApp baja a enlace de
texto subrayado, sin fondo, en gris. Sigue disponible para quien prefiera
hablar con una persona, pero deja de disputar la atención.

**Decisión — `amber-700` como color de acción en todo el sitio.** El
`amber-600` que usaba la landing da **3.2:1** de contraste con texto
blanco. WCAG AA pide 4.5:1 para texto normal, así que no pasaba;
`amber-700` da **5.0:1** y sí. No es teórico: el cliente típico abre esto
en la calle, con sol, en un celular. Como el flujo de `/agendar` ya usaba
`amber-700`, el cambio además unificó landing y reserva, que hasta ahora
no combinaban.

**Nuevo `Header.tsx` en el layout**, con el nombre del negocio enlazando a
`/` y el botón de agendar. Cumple dos funciones: tener la acción primaria
siempre a un toque —es *sticky*—, y ser la vía de regreso a la landing
desde `/agendar`, que es donde la gente ya busca ese enlace.

**Trade-off aceptado**: el header también sale en `/agendar/confirmar`,
donde su botón funciona como "empezar de nuevo" y abandona la reserva a
medias. Ocultarlo requeriría `usePathname()`, que obliga a `"use client"`.
Se prefirió mantener el proyecto en cero componentes de cliente.

**Otros arreglos incluidos**: `lang="en"` → `lang="es-MX"` en el layout
(el sitio está íntegramente en español y un lector de pantalla lo
pronunciaba con fonética inglesa), y la descripción en `metadata`, que
decía "agenda tu cita por WhatsApp" — justo el mensaje que se quería
dejar atrás.

## Autenticación del panel: identidad separada de acceso (2026-08-25)

**Contexto**: la Fase 4 necesita proteger `/admin`. El proyecto ya tenía un
modelo de acceso a datos —`service_role` en el servidor, RLS cerrado en
`citas`— y había que decidir cómo encaja Supabase Auth con eso.

### La idea que ordena todo

**Supabase Auth responde "¿quién eres?". `service_role` responde "¿qué
puedes tocar?".** Son dos preguntas distintas y las resuelven piezas
distintas. Auth se usa aquí solo como proveedor de identidad, no como
mecanismo de autorización de la base de datos.

Flujo: `proxy.ts` ve la cookie → `verifySession()` valida el token y
confirma que es el dueño → recién entonces la página usa `supabaseAdmin`.

**`citas` no cambió: sigue con RLS activo y cero políticas.** El
`07-cerrar-citas.sql` sigue siendo correcto.

### El dueño NO necesita rol `authenticated` en las políticas

El panel pasa por el servidor, donde `service_role` ignora RLS. El rol
`authenticated` solo importaría si el navegador del dueño hablara directo
con Supabase con su propio token, y no lo hace.

**Cuándo revisar esta decisión**: cuando haya varias personas con permisos
distintos (un barbero que ve solo su agenda, un dueño que ve todo). Ahí la
autorización pertenece a la base de datos, porque un olvido en el código
falla *cerrado* en vez de dar acceso total. Hoy, con un único dueño,
agregar políticas `authenticated` sería mantener dos modelos de
autorización en paralelo sin ganar nada.

**Trade-off aceptado**: con `service_role`, quien autoriza es el código,
no el motor. Si se olvida `verifySession()` en una página del panel, esa
página tiene acceso total. Se mitiga con el patrón Data Access Layer que
recomiendan los docs de Next: la verificación vive en un solo archivo
(`app/lib/auth.ts`) y toda página del panel la llama en su primera línea,
lo que hace la regla auditable con un `grep`.

### El agujero del registro público

**El endpoint de registro de Supabase es público y funciona con la anon
key**, que va en el bundle del navegador. Si `verifySession()` solo
preguntara "¿hay un usuario logueado?", cualquiera podría registrarse por
su cuenta y entrar al panel.

Dos medidas, las dos:
1. Desactivar el registro en Supabase (Authentication > Providers > Email >
   Enable sign ups).
2. `verifySession()` compara contra `ADMIN_USER_ID`, el UUID del dueño en
   una variable de entorno. Se eligió el UUID y no el correo porque el
   correo puede cambiar. `iniciarSesion` hace la misma comprobación y cierra
   la sesión recién abierta si no coincide, para no dejar una cookie válida
   dando vueltas.

Si falta `ADMIN_USER_ID`, `verifySession()` lanza en vez de dejar pasar:
falla cerrado.

### Dos capas, no una

- **`proxy.ts`** — chequeo *optimista*: mira que exista la cookie y rebota
  a `/admin/login`. También renueva la sesión y escribe las cookies
  actualizadas, cosa obligatoria porque los Server Components no pueden
  escribir cookies y sin eso el dueño se desloguearía solo. Corre solo con
  `matcher: ["/admin/:path*"]`, para no pagar una llamada a Auth en cada
  visita pública.
- **`verifySession()`** — la protección real. Los docs de Next son
  explícitos: el proxy *"no debería ser tu única línea de defensa"*.

### Detalles de versión y de librería

- **`@supabase/ssr` 0.12.5**, dependencia nueva y justificada: hace que la
  sesión viva en cookies en vez de en el `localStorage` del navegador, que
  el servidor no puede ver. La alternativa era escribir a mano la rotación
  del refresh token, que es plomería sensible y fácil de equivocar.
- **En Next 16 `middleware.ts` está deprecado y se llama `proxy.ts`.** Casi
  todos los tutoriales de Supabase + Next todavía dicen "middleware".
- **`cookies()` es asíncrono** en Next 16: se usa `await cookies()`.
- **No se usa `getSession()` para autorizar.** La propia librería advierte
  que su resultado sale de la cookie sin verificar y no debe confiarse. Se
  usa `getUser()`, que valida contra el servidor de Auth. (`getClaims()`
  sería más rápido si el proyecto usa llaves de firma asimétricas; se puede
  cambiar más adelante.)

## Route groups: sitio público y panel separados (2026-08-25)

**Contexto**: con el panel en marcha, el layout raíz metía el Header y el
Footer de la barbería en `/admin` también. El panel mostraba el botón
"Agendar cita" —que al dueño no le sirve— y el pie de página de marketing.

**Decisión**: separar en dos route groups.

```
app/layout.tsx              solo <html>, <body>, fuentes y metadata
app/(public)/layout.tsx     Header + main + Footer
app/(public)/page.tsx       landing
app/(public)/agendar/…      flujo de reserva
app/admin/layout.tsx        barra sobria, sin CTA
app/admin/…                 panel
```

Los paréntesis de `(public)` hacen que la carpeta **no aparezca en la
URL**: la landing sigue siendo `/` y la reserva `/agendar`. El
`export const revalidate = 300` se movió con la página y sigue aplicando.

Se hizo ahora, con dos páginas de panel, precisamente porque mover
carpetas después —con ocho— obligaría a revisar cada una.

**Detalle de la mudanza**: Next genera validadores de rutas tipadas en
`.next/dev/types/`. Después de mover carpetas, esa caché queda apuntando a
las rutas viejas y el build falla con `TS2307: Cannot find module`. Se
resuelve borrando `.next` y reconstruyendo; no es un error del código.

**Lo que NO se hizo, a propósito: verificar la sesión en
`app/admin/layout.tsx`.** Es tentador, porque parece el lugar natural para
proteger todo el panel de una vez. Pero los layouts no se vuelven a
ejecutar en cada navegación entre páginas hijas, así que no son un punto
fiable de autorización. La regla sigue siendo la del patrón Data Access
Layer: **cada página del panel llama a `verifySession()` en su primera
línea**. El layout de admin, además, envuelve también a `/admin/login`, que
por definición no tiene sesión.

## Sin modo oscuro a medias (2026-08-25)

**Contexto**: al revisar la agenda en el celular, el dueño reportó que el
contraste estaba invertido — la hora, el nombre del cliente y el título se
veían en gris clarísimo, mientras que el servicio y el "Termina 15:30" se
leían bien. Justo los dos datos más importantes eran los que menos se
veían.

**La causa no eran las clases.** `globals.css` traía de la plantilla:

```css
@media (prefers-color-scheme: dark) {
  :root { --foreground: #ededed; }
}
body { color: var(--foreground); }
```

El `<main>` del panel fija `bg-white` pero no fijaba color de texto. Con el
celular en modo oscuro, todo elemento **sin** clase de color heredaba
`#ededed`: casi blanco sobre blanco. Los elementos que sí tenían clase
(`text-zinc-600`, `text-zinc-500`) se veían bien precisamente porque la
sobrescribían. De ahí la inversión.

**Decisión**: eliminar el bloque de `prefers-color-scheme: dark`. La app no
tiene tema oscuro — todas las secciones fijan fondos claros (`bg-white`,
`bg-zinc-50`) — así que ese bloque no implementaba un tema, solo dejaba una
trampa: cualquier elemento nuevo sin clase de color nacía invisible para
quien usa modo oscuro. Si algún día se hace tema oscuro de verdad, tiene
que ser en todas las superficies a la vez.

**Segunda medida**: `app/admin/layout.tsx` fija `text-zinc-900` en el
`<main>`. El color base no se hereda del `body`.

### Jerarquía de contraste del panel

Mismo criterio que llevó a `amber-700` en la landing: esto se lee en la
calle, con sol. Todos los tonos usados pasan WCAG AA (4.5:1) sobre blanco.

| Dato | Tono | Contraste |
|---|---|---|
| Hora de inicio, nombre del cliente, título | `zinc-900` | ~17:1 |
| Servicio, teléfono | `zinc-700` | 10.4:1 |
| "Termina", totales, controles de fecha | `zinc-600` | 7.7:1 |
| Huecos, canceladas | `zinc-500` | 4.8:1 |

`zinc-400` (2.6:1) y `zinc-300` (~1.5:1) quedan **prohibidos sobre fondo
claro**; sobre `bg-zinc-900` sí son correctos y ahí se conservan (Hero y
Contact). La auditoría encontró un caso más fuera del panel: la nota al pie
de `/agendar`, que estaba en `zinc-400` sobre blanco.

## Confirmar y cancelar: fricción asimétrica (2026-08-25)

**Contexto**: primeras acciones que escriben desde el panel. Se tocan en un
celular, con el cliente enfrente, y una de las dos es destructiva.

### Tres actions, no uno parametrizado

Un `cambiarEstado(citaId, estado)` recibiría el estado desde el formulario,
o sea desde fuera. El `CHECK` de la tabla limita los valores posibles, pero
no impide una transición sin sentido.

**Decisión**: `confirmarCita`, `cancelarCita` y `reactivarCita`, cada uno con
su lista de estados de origen fija en el código. El helper `aplicarCambio`
**no se exporta**: en un archivo `"use server"` cada función exportada es un
endpoint público, así que dejarlo privado es lo que impide llamarlo con
valores arbitrarios.

`verifySession()` va **dentro del action**, no solo en la página. La página
no protege nada: el action es un endpoint POST propio, alcanzable sin pasar
por `/admin`.

El filtro de estado va dentro del `UPDATE` (`.in("estado", desde)`), no en
una lectura previa: así comprobar y escribir son una sola operación atómica.
Si la cita cambió en el intermedio, no coincide, no se escribe, y las cero
filas afectadas se reportan como error de transición.

### ⚠️ Propiedad de la cita: el agujero que abre el multi-negocio

**Hoy `aplicarCambio` NO verifica de quién es la cita.** Recibe el `citaId`
del formulario —o sea, de fuera— y actúa sobre él sin más comprobación que
la sesión del dueño.

Hoy es correcto: hay un solo negocio y un solo dueño, así que todas las
citas son suyas y no existe "la cita de otro".

**Deja de ser correcto en el momento en que el sistema sirva a varios
negocios**, que es justamente el plan del producto. Ahí, `verifySession()`
seguiría diciendo "sí, es un dueño válido" —pero no *cuál*—, y el dueño de
la Barbería A podría cancelar citas de la Barbería B **simplemente
cambiando el número en el formulario**. No haría falta hackear nada: los
ids son consecutivos.

Es el tipo de agujero que no existe mientras el sistema es de un solo
inquilino y aparece completo el día que deja de serlo, sin que ninguna
línea de código haya cambiado. Por eso queda escrito aquí y como comentario
en `app/actions/agenda.ts`, y no solo en la cabeza de alguien.

**Qué habrá que hacer**: cuando exista el concepto de negocio, el action
tiene que leer la cita, resolver a qué negocio pertenece, y compararlo con
el negocio de la sesión antes de escribir. La comprobación va en el
servidor, nunca en el formulario.

### Cancelar vive en el detalle, no en la fila

| Acción | Dónde | Fricción |
|---|---|---|
| Confirmar | Botón en la fila de la agenda | Un toque. Es segura |
| Cancelar | `/admin/cita/[id]` | Entrar a la cita |

El botón dice **"Cancelar la cita de {nombre}"**, con el nombre adentro: no
se puede cancelar a la persona equivocada sin leer de quién es.

**Opción descartada: un `confirm()` del navegador.** Necesita
`"use client"` —el proyecto lleva cero componentes de cliente— y sobre todo
**un diálogo que sale siempre entrena a descartarlo**: a la tercera vez se
acepta sin leer. Una pantalla que nombra a la persona sí se lee.

### Reactivar usa maquinaria que ya existía

Reactivar una cancelada la devuelve al alcance de la restricción `EXCLUDE`,
que ignora las canceladas. Si alguien ya tomó ese horario, Postgres devuelve
**23P01** — el mismo código que la reserva pública ya traduce. Sin escribir
nada nuevo, reactivar queda protegido contra pisar una cita ajena.

### El revalidado: que la ruta sea dinámica NO basta

Se asumió que `/admin`, al ser `ƒ (Dynamic)`, se renderiza fresca siempre y
no haría falta nada. **Es falso**, y los docs de Next 16 lo dicen:

> *"An action that does none of the above carries only its return value, and
> the current route is not re-rendered."*

Sin llamar a algo, se muta la cita y la agenda sigue mostrando el estado
viejo. Dinámica significa que no hay caché en el servidor, no que el action
refresque la pantalla.

**Decisión: `refresh()` de `next/cache`**, no `revalidatePath('/admin')`.
La agenda vive en `/admin?fecha=2026-09-01`, y `refresh()` refresca *la ruta
actual* sin tener que adivinar el query string. Solo se puede llamar desde un
Server Action. El cambio se ve en el mismo viaje, sin recarga.

`/agendar` no necesita nada: también es dinámica, así que un horario
liberado por una cancelación aparece disponible de inmediato.

**Esto NO cierra el pendiente de `revalidate = 300`** de la primera entrada
de este archivo. Ese es de la landing, que muestra servicios y horarios, no
citas. Se resuelve al hacer "editar servicios, precios y horarios".

## Editar servicios desde el panel (2026-08-26)

**Contexto**: primera pieza de "editar servicios, precios y horarios". Se
partió en dos —servicios primero, horarios después— porque son dos formas
de datos que no se parecen: `servicios` es una lista plana de registros
independientes, y `horarios_semana` son siete días fijos con uno a tres
bloques cada uno. No comparten pantalla ni componente, y juntarlos habría
hecho un cambio grande de revisar.

### `refresh()` no bastaba: la landing es estática

`agenda.ts` sale con `refresh()` y con eso le alcanza, porque `/admin` es
una ruta dinámica. **La landing no lo es**: Next la sirve como HTML ya
generado. Un precio nuevo guardado desde el panel no aparecería ahí hasta
que algo avisara.

`revalidatePath('/')` es ese aviso: marca el HTML guardado como caduco para
que la siguiente visita lo regenere. Es lo que reemplaza al `revalidate =
300`, que en vez de enterarse del cambio esperaba a que pasaran cinco
minutos.

`/agendar` **no necesita nada**: es dinámica y calcula la disponibilidad en
cada petición, así que una duración nueva aplica al siguiente cálculo.

### Salir por `redirect`, no por `refresh`

Al revés que en `agenda.ts`. Confirmar una cita cambia una etiqueta a la
vista; **guardar un precio deja el formulario con el mismo aspecto**, así
que sin acuse de recibo el dueño no sabe si pasó algo. La acción sale con
`redirect('/admin/servicios?ok=<id>')` y ese id pinta una etiqueta
"guardado" junto al servicio. De paso es POST/Redirect/GET: recargar no
reenvía el formulario.

### Desactivar un servicio con citas futuras: avisar, no bloquear

`activo = false` **no toca las citas ya agendadas**, y es correcto que no
lo haga. Cada cita guarda `fin` y `precio_cobrado` como foto del momento, y
la fila del servicio sigue existiendo —solo cambió una columna—, así que la
agenda y el detalle se ven igual. Lo único que cambia es que deja de
ofrecerse en `/agendar`, porque tanto el formulario público como
`agendarCita` filtran por `activo = true`.

Se descartó **bloquear la desactivación**: obligaría al dueño a cancelar
citas reales de clientes solo para quitar un servicio del menú. Y se
descartó **cancelar en cascada** por lo mismo, con el agravante de que es
irreversible.

Lo que sí se hizo es que el panel muestre el número de citas futuras junto
al botón, con una frase que diga qué va a pasar con ellas. La acción es
reversible con un toque, así que no lleva pantalla de confirmación aparte
—a diferencia de cancelar una cita, que sí es destructiva.

**Borrar no existe ni va a existir**: el `on delete restrict` de
`citas.servicio_id` lo impide para cualquier servicio con historial, y
"dejar de ofrecer" es el mecanismo que ese `restrict` estaba empujando
desde el principio.

### Dos actions para el interruptor, no una con el valor de parámetro

`activarServicio` y `desactivarServicio`, con el booleano fijo en el
código; `cambiarActivo` no se exporta. Mismo criterio que las tres actions
de `agenda.ts`: en un archivo `"use server"` cada función exportada es un
endpoint público, y un valor que viene en el formulario viene de fuera.

### Detalles menores

- **El conteo de citas futuras se calcula en `app/lib/servicios.ts`, no en
  el componente.** Depende de `now()`, y leer el reloj durante el render
  rompe la regla de pureza de React. Es el mismo motivo por el que la marca
  "en curso" vive en `lib/agenda.ts`.
- **Una sola consulta de citas para toda la lista**, agrupada en un `Map`
  del lado de TypeScript, en vez de una consulta por servicio.
- **Se leen los servicios con el cliente público.** La política de select de
  `servicios` es `using (true)`, sin filtrar por `activo`, así que los
  apagados también se leen y no hace falta la llave maestra. Las citas sí la
  necesitan: esa tabla no tiene políticas.
- **`descripcion` no se edita todavía.** La columna existe pero no se
  muestra en ninguna parte del sitio; poner un campo para algo invisible
  confunde más de lo que sirve. Entra el día que la landing la muestre.
- **Topes de cordura en la duración**: entre 5 y 480 minutos. Un 0 rompería
  el cálculo de `fin` y un valor absurdo se comería el día. El precio se
  redondea a dos decimales antes de escribir, para que un "150.999" a mano
  no llegue a la columna `numeric(10,2)`.
- **La navegación del panel vive en `app/admin/page.tsx`, no en su
  layout**: ese layout envuelve también a `/admin/login`, donde todavía no
  hay sesión y esos enlaces no deben verse.
