# GOLD HUB SMART VALE

Gestión, emisión y trazabilidad de **vales de descuento con código QR** para
una red de tiendas. Cada tienda emite sus vales con su propio prefijo y su
propio logotipo, los clientes los presentan en caja, y cada compra queda
registrada para medir la efectividad de la campaña.

Stack: **Next.js 16** (App Router, Turbopack) · **React 19** · **TypeScript** ·
**Tailwind v4** · **Supabase** (solo Postgres) · desplegado en **Vercel**.

---

## Estado

**El esquema y la aplicación están completos y verificados.** Falta aplicar
las migraciones a la base: no tengo forma de hacerlo desde aquí sin la
contraseña de Postgres.

```bash
npm run test:esquema   # ensaya las migraciones y las reglas, sin base de datos
npm run db:bundle      # genera supabase/aplicar.sql
# pega ese archivo en Supabase → SQL Editor → Run
npm run db:check       # confirma que quedó bien y que el esquema está cerrado
npm run admin:crear -- --nombre "Tu Nombre" --correo admin
```

### Cómo se aparta del modelo del que nace

Este proyecto se levantó desde el de ARIGA, que corre en el mismo proyecto de
Supabase pero en el esquema `smartvale`. Cuatro cambios de fondo:

| | ARIGA | GOLD HUB |
| --- | --- | --- |
| Actor | la vendedora | **la tienda**, una cuenta por tienda |
| Numeración | bloques de correlativos repartidos por el admin | **prefijo propio** por tienda, contador desde 1 |
| Tarifa | por material y por puerta | **15% en oro**, uno para todos |
| Identidad | un logotipo de marca | **el logotipo que sube cada tienda**, impreso en su vale |

De ahí se siguen dos cosas: no hay tabla `rangos` —el prefijo ya separa a las
tiendas, un bloque sería un tope artificial— y el tipo de vale deja de ir en
el código, que queda en `MZT-000045`. El tipo sigue en la fila y alimenta los
reportes de origen y la cadena de referidos.

### Las migraciones de ARIGA están fuera del camino

Viven en [`supabase/referencia-ariga/`](supabase/referencia-ariga/), no en
`supabase/migrations/`. Ahí el CLI las aplicaría con `npm run db:push` y
escribirían sobre la base de ARIGA, que está en producción con datos reales
en este mismo proyecto de Supabase. Se conservan solo como referencia.

## Puesta en marcha

```bash
npm install
cp .env.example .env.local      # y llena los valores
npm run test:esquema            # ensaya las migraciones sin tocar la base
npm run db:bundle               # genera supabase/aplicar.sql
# pega ese archivo en Supabase → SQL Editor → Run
npm run admin:crear -- --nombre "Tu Nombre" --correo admin
npm run dev                     # http://localhost:3003
```

El puerto es el **3003** y no el 3002, que es el de ARIGA: así los dos
proyectos pueden correr a la vez en la misma máquina.

Comprobaciones rápidas:

```bash
npm run test:esquema   # migraciones y reglas de negocio, sin base de datos
npm run db:check       # conexión, esquema y cierre de seguridad
npm run check          # TypeScript + ESLint
```

`test:esquema` levanta un Postgres 17 en WASM, le aplica las migraciones y
ejerce las reglas contra él. Existe porque el proyecto de Supabase está
compartido con la producción de ARIGA: una migración con un error a mitad se
aplica a medias y hay que deshacerla a mano sobre esa base. Aquí se ensaya
antes, cuantas veces haga falta.

Lo único que no cubre es la **concurrencia real**: PGlite tiene una sola
conexión, así que no puede demostrar que dos cajas emitiendo a la vez se
lleven correlativos distintos. La emisión se apoya en el cerrojo de fila de
`update … returning`, que es correcto bajo READ COMMITTED, pero conviene
comprobarlo contra la base real la primera vez que haya dos tiendas
operando.

---

## Cómo funciona

### Las cuatro puertas de entrada

| Tipo | Origen | Campo propio |
| --- | --- | --- |
| **A1** | Base histórica de la tienda | Clasificación: 30 / 60 / 90 días o VIP |
| **A2** | Prospección en frío | Empresa o centro comercial de origen |
| **A3** | Visitante que se registra solo | — |
| **A4** | Referido de otro portador | El vale que lo trajo |

El tipo **no va en el código**: se guarda en la fila y alimenta los reportes
de origen y la cadena de referidos. El código es `MZT-000045`, que es lo que
se dicta en caja.

### La tienda es el actor

Hay **una cuenta por tienda**. El administrador ve todas; una cuenta de tienda
ve solo la suya, y ese alcance no lo decide la interfaz: lo aplica
`fn_tienda_en_alcance` en la base, que es la única puerta por la que se
resuelve sobre qué tienda se escribe. Pedir otra tienda desde una cuenta de
tienda no es un descuido de la pantalla —es lo que haría alguien tocando la
petición a mano— y se rechaza ahí.

### Numeración

Cada tienda tiene un **prefijo propio** de dos a cinco letras y su propio
contador, que arranca en 1 y comparten las cuatro puertas. Dos tiendas nunca
emiten el mismo código porque el prefijo las separa, así que **no hay bloques
de correlativos que repartir**: un bloque sería un tope artificial que dejaría
a una tienda sin emitir sin que nada lo exija.

El correlativo se mueve con un `update … returning` sobre la fila de la
tienda. Ese UPDATE toma el cerrojo de fila, así que dos cajas emitiendo a la
vez se serializan solas y cada una se lleva un número distinto, sin huecos. Y
se mueve **al final**: todo lo que puede fallar se comprueba antes, porque un
correlativo gastado en un vale que no llega a nacer deja un hueco que luego
nadie sabe explicar.

### El logotipo de cada tienda

Cada tienda sube el suyo y sale impreso en sus vales, en la interfaz, en el
PNG que se manda por WhatsApp y en el PDF. Vive en Supabase Storage, en un
bucket **público de lectura y cerrado a escritura**: el logotipo va en la cara
pública del vale, donde no hay sesión que valga, y es material de marca, no un
dato de cliente. Las subidas pasan por una Server Action que comprueba la
sesión; nada del esquema se expone por ahí.

Mientras una tienda no haya subido logotipo, su vale firma con el nombre de la
tienda compuesto en tipografía.

### Descuento y redención

**Todos los vales son 15% en oro.** Es el único material que se vende, así que
no hay tarifa por puerta ni por material: un número en `configuracion`, que se
**congela dentro del vale al emitirlo**. Si mañana cambia, los vales ya
entregados siguen valiendo lo que se le prometió al cliente.

Un vale admite **compras ilimitadas mientras esté vigente**. Registrar una
nunca lo consume: cada compra es una fila aparte, con su propio comprador. Es
lo que hace medible el alcance de un vale que se comparte —y un vale emitido
en una tienda puede redimirse en otra, porque el descuento es del vale, no del
mostrador—.

---

## Seguridad

Esta aplicación **no usa Supabase Auth**, así que no existe `auth.uid()` y RLS
no puede identificar al usuario. La protección se mueve de la base de datos a
la capa de servidor:

- El esquema `smartvalehubgold` debe quedar con RLS activado **sin políticas**
  → inalcanzable para `anon` y `authenticated`. `npm run db:check` lo verifica
  en cada corrida.
- El único acceso es con `SUPABASE_SERVICE_ROLE_KEY`, que **nunca sale del
  servidor**. No hay cliente de Supabase para el navegador: todo dato pasa por
  Server Components, Server Actions o Route Handlers.
- **La autorización vive en [`src/lib/auth/guardas.ts`](src/lib/auth/guardas.ts).**
  Toda página o acción que toque datos debe empezar llamando a
  `requerirSesion()` o `requerirAdmin()`. No hay una segunda red de seguridad
  debajo.
- Contraseñas con **scrypt** (sal por usuario, comparación en tiempo constante).
- Sesiones con token opaco de 32 bytes; en la base solo se guarda su SHA-256,
  así que ni con acceso a la tabla se puede suplantar a nadie. La cookie es
  `goldhub_sesion`.
- El proxy hace una comprobación barata de cookie —corre en cada navegación—;
  la validación real la hace la guarda del layout.

Rutas públicas por diseño: `/login`, `/v/[token]` (la cara del vale que abre
quien recibe el WhatsApp), `/t/[token]` (el autorregistro del A3) y
`/api/v/[token]/imagen` (la imagen que pide el servidor de WhatsApp para la
vista previa). El **PDF del mismo vale sigue protegido**: es material interno.

---

## Cómo se entrega el vale

Tres salidas desde la ficha del vale:

| Salida | Cómo |
| --- | --- |
| **WhatsApp** | enlace `wa.me` con el mensaje precargado y la URL de `/v/[token]` |
| **Imagen** | PNG vertical 800×1200 que dibuja el servidor |
| **PDF** | documento A5 apaisado, exige sesión |

La imagen y la vista previa del enlace salen del mismo sitio,
`/api/v/[token]/imagen`, en dos formatos: `?formato=tarjeta` (vertical, para
compartir) y el apaisado 1200×630 por omisión, que es el que lee WhatsApp.

**Se dibujan en el servidor a propósito.** Capturar la tarjeta del DOM con
`html-to-image` parecía más simple, pero esa técnica clona el nodo dentro de
un `<foreignObject>` de SVG donde no llegan ni las fuentes de `next/font` ni
las variables de color de Tailwind: la imagen salía sin texto y sin fondo.
Dibujarla en el servidor da el mismo resultado en cualquier navegador.

---

## Estructura

```
src/
├─ app/
│  ├─ login/                     acceso
│  ├─ (interno)/                 todo lo que exige sesión
│  │  ├─ layout.tsx              frontera de autenticación
│  │  └─ panel/
│  │     ├─ page.tsx             resumen y accesos rápidos
│  │     ├─ emitir/              las cuatro puertas + formularios
│  │     ├─ redimir/             escáner y captura de compra
│  │     ├─ vales/ redenciones/  listados y ficha del vale
│  │     ├─ mi-tienda/           logotipo, datos y QR      (cuentas de tienda)
│  │     ├─ tiendas/             tiendas y sus cuentas     (admin)
│  │     ├─ contactos/ configuracion/                      (admin)
│  │     └─ reportes/            inteligencia comercial    (admin)
│  ├─ v/[token]/                 cara pública del vale
│  ├─ t/[token]/                 autorregistro desde el QR de la tienda
│  ├─ icon.svg                   favicon tipográfico
│  └─ api/                       imagen PNG, PDF, QR y exportaciones
├─ components/
│  ├─ marca/ layout/ ui/         identidad, armazón, primitivas
│  ├─ vales/                     tarjeta, firma, sello, escáner
│  └─ reportes/                  barras, medidor, serie temporal
├─ lib/
│  ├─ auth/                      contraseñas, sesiones, guardas
│  ├─ datos/                     lecturas por dominio
│  ├─ acciones/                  Server Actions (validadas con zod)
│  ├─ supabase/                  cliente de servicio, tipos, esquema
│  ├─ logos.ts                   el logotipo de cada tienda, en sus dos formas
│  ├─ qr.ts compartir.ts         QR, enlaces de WhatsApp
│  └─ pdf/                       plantilla del vale
└─ proxy.ts                      guarda barata de rutas
supabase/migrations/             el esquema de GOLD HUB
supabase/referencia-ariga/       ⚠ las de ARIGA, fuera del camino del CLI
design/panel.dc.html             mockup de referencia
```

### Comandos

| | |
| --- | --- |
| `npm run dev` | el panel en el puerto 3003 |
| `npm run check` | TypeScript + ESLint |
| `npm run test:esquema` | migraciones y reglas de negocio, sin base de datos |
| `npm run test:codigo` | lectura de códigos de vale, lógica pura |
| `npm run db:check` | conexión, esquema y cierre de seguridad |
| `npm run db:bundle` | empaqueta las migraciones para el SQL Editor |
| `npm run db:types` | regenera `src/lib/supabase/types.ts` |
| `npm run admin:crear` | la primera cuenta, para poder entrar |
| `npm run tiendas:sembrar` | alta en bloque de tiendas y sus cuentas |
| `npm run fuentes:generar` | reempotra las tipografías del PNG del vale |

---

## Base de datos

El proyecto de Supabase **está compartido**: `public` aloja el ERP, y el
esquema `smartvale` es el de ARIGA, en producción. GOLD HUB vive aislado en
**`smartvalehubgold`** y no lee ni escribe nada de los otros dos.

```bash
npm run db:bundle    # empaqueta las migraciones para el SQL Editor
npm run db:check     # verifica conexión y cierre de seguridad
npm run db:link      # enlaza el CLI (pide la contraseña de la base)
npm run db:push      # aplica migraciones si el CLI está enlazado
npm run db:types     # regenera src/lib/supabase/types.ts
```

Sin el CLI enlazado, los tipos de `src/lib/supabase/types.ts` se mantienen a
mano y deben seguir a las migraciones.

---

## Variables de entorno

| Variable | Notas |
| --- | --- |
| `SUPABASE_URL` | Project Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Única credencial de la app. En Vercel, marcar **Sensitive** |
| `NEXT_PUBLIC_SITE_URL` | Base de los enlaces del QR. En producción, el dominio real |

El esquema (`smartvalehubgold`) es una constante en
[`src/lib/supabase/env.ts`](src/lib/supabase/env.ts), no una variable: forma
parte de los tipos generados.

---

## Color de las gráficas

Los tipos de vale tienen colores de serie validados con el script de
comprobación de daltonismo, definidos como tokens en
[`globals.css`](src/app/globals.css):

| | | |
| --- | --- | --- |
| A1 | `#A17916` ámbar | ΔE bajo daltonismo **10.7** en el peor par |
| A2 | `#215BA3` azul | ΔE con visión normal **15.6** |
| A3 | `#9E3B24` arcilla | contraste sobre blanco ≥ 3:1 |
| A4 | `#17997A` verde | |

**No sustituir un valor sin volver a validarlos como conjunto**, y con
`--pairs all`: al ser cuatro ya no basta comprobar pares adyacentes. Los tonos
de marca que se probaron primero fallaban: salvia contra arcilla mide ΔE 3.9
en deuteranopía, es decir, indistinguibles para 1 de cada 12 hombres.

---

## Despliegue en Vercel

1. Subir el repositorio a GitHub e importarlo en Vercel (Next.js se detecta solo).
2. Cargar las tres variables de entorno en Production, Preview y Development.
   `SUPABASE_SERVICE_ROLE_KEY` marcada como **Sensitive**.
3. `NEXT_PUBLIC_SITE_URL` debe ser el dominio final: de ahí salen los enlaces
   que se codifican en cada QR y la imagen de la vista previa de WhatsApp.

El escáner de QR **exige HTTPS** para acceder a la cámara. En local funciona
por `localhost`; para probar desde un teléfono en la red hay que servir por
HTTPS o usar el campo manual.

---

## Región

GOLD HUB opera en **Guatemala**. Eso fija dos cosas:

- El prefijo telefónico por defecto es **+502**, en
  [`campo-telefono.tsx`](src/components/vales/campo-telefono.tsx). El número
  se guarda en dígitos con la clave incluida, que es lo que consume `wa.me`.
- Los importes se muestran en **quetzales** (`Q 12,400.00`). La región y la
  moneda son dos constantes en [`format.ts`](src/lib/format.ts): si el
  negocio pasara a cotizar en dólares, cambiarlas es todo lo que hace falta.
  En la base los montos son `numeric` sin unidad, así que esto solo afecta a
  cómo se presentan.

---

## Marca

**GOLD HUB no tiene logotipo: firma con tipografía.** El nombre se compone en
Cormorant Garamond con «GOLD» en oro y «HUB» en el tono claro de quien lo
dibuje. No hay PNG, ni favicon derivado, ni copia en base64 que mantener.

| Dónde | Qué lo dibuja |
| --- | --- |
| Interfaz | [`components/marca/marca.tsx`](src/components/marca/marca.tsx) |
| Tarjeta del vale y enlace del A3 | [`components/vales/firma-marca.tsx`](src/components/vales/firma-marca.tsx) |
| PNG del servidor | `Marca` en [`lib/vale-imagen.tsx`](src/lib/vale-imagen.tsx) |
| PDF | [`lib/pdf/vale-documento.tsx`](src/lib/pdf/vale-documento.tsx) |
| Favicon | [`app/icon.svg`](src/app/icon.svg), a mano |

Son cuatro motores de dibujo distintos —el DOM, Satori, react-pdf y el SVG del
favicon— que no comparten nada. Lo único que impide que la firma se separe con
el tiempo es la constante `MARCA` de
[`lib/vale-plantilla.ts`](src/lib/vale-plantilla.ts): de ahí salen las
palabras y las proporciones. Las tintas no, porque el PDF usa la paleta del
panel y el vale la suya; la regla común es que la primera palabra va en el oro
de cada paleta y la segunda en su tono claro.

**La Cormorant del PNG va recortada a los glifos que dibuja**, y esa lista
incluye las letras de `GOLDHUB` a propósito (ver
[`scripts/generar-fuentes.mjs`](scripts/generar-fuentes.mjs)). Si se cambia el
nombre de la marca hay que añadir sus letras ahí y correr
`npm run fuentes:generar`; si no, Satori cae a la Geist de reserva y el PNG
deja de parecerse a la tarjeta que ve la tienda.

El sello «compártelo» también se dibuja, en
[`components/vales/firma-marca.tsx`](src/components/vales/firma-marca.tsx) y en
`Sello` de [`lib/vale-imagen.tsx`](src/lib/vale-imagen.tsx). Era una insignia
PNG en negro y dorado: traía su propio fondo dentro, así que no se podía teñir
y sobre el crema del vale era lo más ruidoso de la tarjeta. **En el proyecto no
queda ninguna imagen de marca**, ni generada ni empotrada.
