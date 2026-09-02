-- ─────────────────────────────────────────────────────────────────────────
-- GOLD HUB SMART VALE — modelo de datos
--
-- Siete tablas: tiendas, usuarios, sesiones, contactos, vales, redenciones y
-- configuracion.
--
-- En qué se aparta del modelo del que nace (el de ARIGA, en
-- `supabase/referencia-ariga/`), y por qué:
--
--   · **La tienda es el actor, no la vendedora.** Hay una cuenta por tienda.
--     El correlativo, el prefijo del código y el logotipo cuelgan de la
--     tienda, no de una persona.
--
--   · **No hay tabla `rangos`.** Servía para repartir bloques de correlativos
--     entre vendedoras y que dos no emitieran el mismo número. Aquí cada
--     tienda tiene su propio prefijo, así que ya tiene su propio espacio de
--     numeración: un bloque sería un tope artificial que dejaría a la tienda
--     sin emitir sin que nada lo exija.
--
--   · **Un solo contador por tienda**, compartido por las cuatro puertas. El
--     tipo se guarda en la fila y alimenta los reportes, pero no entra en el
--     código: `MZT-000045` se dicta en caja mejor que `MZT-A1-000045`.
--
--   · **Un solo material.** Todos los vales son 15% en oro. Desaparecen
--     `descuento_plata_pct` y el `descuento_pct` heredado, y la redención
--     captura un único monto.
--
--   · **El logotipo vive en Supabase Storage**, no en la fila: aquí solo va
--     la ruta del objeto. Ver la migración del almacén.
-- ─────────────────────────────────────────────────────────────────────────

-- ═══ Enumerados ══════════════════════════════════════════════════════════

do $$
begin
  if not exists (select 1 from pg_type t
                   join pg_namespace n on n.oid = t.typnamespace
                  where n.nspname = 'smartvalehubgold' and t.typname = 'rol_usuario') then
    create type smartvalehubgold.rol_usuario as enum ('admin', 'tienda');
  end if;

  if not exists (select 1 from pg_type t
                   join pg_namespace n on n.oid = t.typnamespace
                  where n.nspname = 'smartvalehubgold' and t.typname = 'tipo_vale') then
    create type smartvalehubgold.tipo_vale as enum ('A1', 'A2', 'A3', 'A4');
  end if;

  if not exists (select 1 from pg_type t
                   join pg_namespace n on n.oid = t.typnamespace
                  where n.nspname = 'smartvalehubgold' and t.typname = 'segmento_a1') then
    create type smartvalehubgold.segmento_a1 as enum ('A1-30', 'A1-60', 'A1-90', 'A1-VIP');
  end if;
end
$$;

comment on type smartvalehubgold.tipo_vale is
  'Las cuatro puertas de entrada: A1 base histórica de la tienda, A2 prospección, A3 visitante que se registra solo, A4 referido de otro portador.';

comment on type smartvalehubgold.rol_usuario is
  'admin ve todas las tiendas; tienda ve solo la suya. Una cuenta por tienda.';


-- ═══ Tiendas ═════════════════════════════════════════════════════════════

create table if not exists smartvalehubgold.tiendas (
  id                  bigint generated always as identity primary key,
  nombre              text not null,

  -- El espacio de numeración de la tienda. Dos tiendas nunca emiten el mismo
  -- código porque el prefijo las separa; por eso no hacen falta bloques.
  prefijo             text not null,

  -- Contador propio, compartido por las cuatro puertas. Arranca en 0 y el
  -- primer vale se lleva el 1.
  correlativo         integer not null default 0,

  -- Ruta del objeto dentro del bucket de logotipos. Nula mientras la tienda
  -- no haya subido el suyo: la interfaz y el vale caen entonces al nombre
  -- de la tienda compuesto en tipografía.
  logo_ruta           text,
  -- Cambia en cada sustitución del logotipo. Va en la URL como parámetro
  -- para que el navegador no siga enseñando el anterior desde su caché.
  logo_actualizado_en timestamptz,

  direccion           text,
  telefono            text,

  -- QR fijo de la tienda: el que el cliente escanea para registrarse solo.
  token               text not null default smartvalehubgold.fn_token_publico(),
  autorregistro       boolean not null default true,

  activo              boolean not null default true,
  fecha_creacion      timestamptz not null default now(),
  fecha_actualizacion timestamptz,

  -- De dos a cinco letras mayúsculas. Corto para dictarlo, y sin dígitos
  -- para que nunca se confunda con el correlativo que va detrás.
  constraint tiendas_prefijo_forma check (prefijo ~ '^[A-Z]{2,5}$'),
  constraint tiendas_nombre_no_vacio check (btrim(nombre) <> ''),
  constraint tiendas_correlativo_no_negativo check (correlativo >= 0)
);

create unique index if not exists tiendas_prefijo_idx
  on smartvalehubgold.tiendas (prefijo);
create unique index if not exists tiendas_token_idx
  on smartvalehubgold.tiendas (token);
create unique index if not exists tiendas_nombre_idx
  on smartvalehubgold.tiendas (lower(btrim(nombre)));

comment on column smartvalehubgold.tiendas.prefijo is
  'Dos a cinco letras propias de la tienda. Encabeza todos sus códigos: MZT-000045.';
comment on column smartvalehubgold.tiendas.correlativo is
  'Último correlativo consumido. Lo mueve fn_emitir_vale bajo cerrojo; no tocar a mano.';
comment on column smartvalehubgold.tiendas.logo_ruta is
  'Ruta dentro del bucket `logos-tiendas`. Nula = la tienda aún no subió logotipo.';
comment on column smartvalehubgold.tiendas.token is
  'QR fijo de la tienda, para el autorregistro. No es el código de ningún vale.';


-- ═══ Usuarios ════════════════════════════════════════════════════════════
--
-- Una cuenta por tienda, más las cuentas de administración. No hay Supabase
-- Auth: la contraseña se guarda con scrypt (ver src/lib/auth/contrasena.ts) y
-- la sesión es un token opaco del que aquí solo vive el SHA-256.

create table if not exists smartvalehubgold.usuarios (
  id                  bigint generated always as identity primary key,
  nombre              text not null,
  -- Lo que se teclea para entrar. Puede ser un correo o un nombre corto.
  correo              text not null,
  telefono            text,
  contrasena_hash     text not null,
  rol                 smartvalehubgold.rol_usuario not null default 'tienda',
  tienda_id           bigint references smartvalehubgold.tiendas (id) on delete restrict,
  activo              boolean not null default true,
  ultimo_acceso       timestamptz,
  fecha_creacion      timestamptz not null default now(),
  fecha_actualizacion timestamptz,

  -- El rol y la tienda no son independientes: una cuenta de tienda sin
  -- tienda no podría emitir nada, y un administrador atado a una tienda
  -- dejaría de ver el resto —que es justo lo que lo hace administrador—.
  constraint usuarios_rol_y_tienda check (
    (rol = 'tienda' and tienda_id is not null) or
    (rol = 'admin'  and tienda_id is null)
  ),
  constraint usuarios_nombre_no_vacio check (btrim(nombre) <> '')
);

create unique index if not exists usuarios_correo_idx
  on smartvalehubgold.usuarios (lower(btrim(correo)));

-- Una cuenta por tienda, y no más: es la decisión de negocio, no una
-- casualidad de los datos.
create unique index if not exists usuarios_una_cuenta_por_tienda_idx
  on smartvalehubgold.usuarios (tienda_id)
  where tienda_id is not null;

comment on table smartvalehubgold.usuarios is
  'Cuentas de acceso: una por tienda, más las de administración.';
comment on column smartvalehubgold.usuarios.correo is
  'Identificador de acceso. Se compara en minúsculas y sin espacios.';


-- ═══ Sesiones ════════════════════════════════════════════════════════════
--
-- Solo el SHA-256 del token: ni con acceso a esta tabla se puede suplantar a
-- nadie.

create table if not exists smartvalehubgold.sesiones (
  id               bigint generated always as identity primary key,
  usuario_id       bigint not null references smartvalehubgold.usuarios (id) on delete cascade,
  token_hash       text not null,
  expira_en        timestamptz not null,
  ultima_actividad timestamptz not null default now(),
  user_agent       text,
  fecha_creacion   timestamptz not null default now()
);

create unique index if not exists sesiones_token_idx
  on smartvalehubgold.sesiones (token_hash);
create index if not exists sesiones_usuario_idx
  on smartvalehubgold.sesiones (usuario_id);
create index if not exists sesiones_expira_idx
  on smartvalehubgold.sesiones (expira_en);


-- ═══ Contactos ═══════════════════════════════════════════════════════════
--
-- Directorio único de personas. El teléfono es la clave: es lo que se pide
-- siempre y lo único que llega completo. Un mismo contacto puede tener varios
-- vales y comprar en varias tiendas, y eso es lo que hace medible el alcance.

create table if not exists smartvalehubgold.contactos (
  id                  bigint generated always as identity primary key,
  nombre              text not null,
  telefono            text not null,
  correo              text,
  fecha_creacion      timestamptz not null default now(),
  fecha_actualizacion timestamptz,

  constraint contactos_telefono_digitos check (telefono ~ '^[0-9]{6,20}$'),
  constraint contactos_nombre_no_vacio check (btrim(nombre) <> '')
);

create unique index if not exists contactos_telefono_idx
  on smartvalehubgold.contactos (telefono);
create index if not exists contactos_nombre_idx
  on smartvalehubgold.contactos (lower(nombre));

comment on column smartvalehubgold.contactos.telefono is
  'Solo dígitos, con la clave de país incluida. Es lo que consume wa.me y la clave de deduplicación.';


-- ═══ Vales ═══════════════════════════════════════════════════════════════

create table if not exists smartvalehubgold.vales (
  id               bigint generated always as identity primary key,

  -- Para dictarlo en caja: PREFIJO-CORRELATIVO, p. ej. MZT-000045.
  codigo           text not null,
  -- Para compartirlo: 22 caracteres aleatorios. El QR lleva esto, no el
  -- código, para que nadie llegue a un vale ajeno probando números.
  token            text not null default smartvalehubgold.fn_token_publico(),

  tipo             smartvalehubgold.tipo_vale not null,
  correlativo      integer not null,

  -- La tienda a la que pertenece el vale. Obligatoria: es de quien es el
  -- correlativo, el prefijo y el logotipo impreso.
  tienda_id        bigint not null references smartvalehubgold.tiendas (id) on delete restrict,
  -- La cuenta que lo emitió. Nula en los de autorregistro: los crea el
  -- propio cliente desde el QR de la tienda, sin que nadie inicie sesión.
  usuario_id       bigint references smartvalehubgold.usuarios (id) on delete set null,
  contacto_id      bigint not null references smartvalehubgold.contactos (id) on delete restrict,
  autorregistro    boolean not null default false,

  -- Propios de una puerta: el segmento solo en A1, el origen solo en A2.
  segmento         smartvalehubgold.segmento_a1,
  origen           text,
  -- El vale que trajo a este cliente. Obligatorio en A4.
  vale_origen_id   bigint references smartvalehubgold.vales (id) on delete set null,

  -- Congelado al emitir. Si mañana cambia la configuración, los vales ya
  -- entregados siguen valiendo lo que se le prometió al cliente.
  descuento_oro_pct numeric(5,2) not null,

  fecha_emision    timestamptz not null default now(),
  fecha_vencimiento timestamptz not null,

  anulado          boolean not null default false,
  motivo_anulacion text,
  anulado_por      bigint references smartvalehubgold.usuarios (id) on delete set null,
  fecha_anulacion  timestamptz,

  fecha_creacion   timestamptz not null default now(),

  constraint vales_vence_despues check (fecha_vencimiento > fecha_emision),
  constraint vales_descuento_rango check (descuento_oro_pct >= 0 and descuento_oro_pct <= 100),
  -- Cada dato en su puerta. Sin esto, un A2 con segmento o un A1 con origen
  -- entran sin protesta y ensucian los reportes en silencio.
  constraint vales_segmento_solo_a1 check (
    (tipo = 'A1' and segmento is not null) or (tipo <> 'A1' and segmento is null)
  ),
  constraint vales_origen_solo_a2 check (
    tipo = 'A2' or origen is null
  ),
  -- El A4 nace de un referido, y un A1 puede nacer de convertir a ese
  -- referido en cliente. Ninguna otra puerta arrastra un vale de origen.
  constraint vales_a4_con_referidor check (
    tipo <> 'A4' or vale_origen_id is not null
  ),
  constraint vales_origen_solo_a1_a4 check (
    vale_origen_id is null or tipo in ('A1', 'A4')
  )
);

create unique index if not exists vales_codigo_idx
  on smartvalehubgold.vales (upper(btrim(codigo)));
create unique index if not exists vales_token_idx
  on smartvalehubgold.vales (token);
create unique index if not exists vales_correlativo_por_tienda_idx
  on smartvalehubgold.vales (tienda_id, correlativo);
create index if not exists vales_tienda_idx on smartvalehubgold.vales (tienda_id);
create index if not exists vales_contacto_idx on smartvalehubgold.vales (contacto_id);
create index if not exists vales_tipo_idx on smartvalehubgold.vales (tipo);
create index if not exists vales_emision_idx on smartvalehubgold.vales (fecha_emision);
create index if not exists vales_origen_idx on smartvalehubgold.vales (vale_origen_id);

comment on column smartvalehubgold.vales.codigo is
  'PREFIJO-CORRELATIVO, seis cifras. Ejemplo: MZT-000045. El tipo no va en el código.';
comment on column smartvalehubgold.vales.token is
  'Identificador del enlace público. El código es para dictarlo; esto para compartirlo.';
comment on column smartvalehubgold.vales.descuento_oro_pct is
  'Congelado al emitir. Único material: aquí solo se vende oro.';


-- ═══ Redenciones ═════════════════════════════════════════════════════════
--
-- Una fila por compra. El vale NO se consume: admite compras ilimitadas
-- mientras siga vigente, y cada una puede ser de otra persona. Es lo que hace
-- medible el alcance de un vale que se comparte.

create table if not exists smartvalehubgold.redenciones (
  id                 bigint generated always as identity primary key,
  vale_id            bigint not null references smartvalehubgold.vales (id) on delete cascade,
  tienda_id          bigint not null references smartvalehubgold.tiendas (id) on delete restrict,
  -- La cuenta que registró la compra. Nula si la borraron después.
  usuario_id         bigint references smartvalehubgold.usuarios (id) on delete set null,
  -- Quién compró. No tiene por qué ser el portador del vale.
  contacto_id        bigint not null references smartvalehubgold.contactos (id) on delete restrict,

  -- Un solo material: aquí solo se vende oro.
  monto_oro          numeric(12,2) not null,
  descuento_aplicado numeric(12,2) not null,

  -- Quién le pasó el vale. Nulo = lo usó el propio portador.
  referido_por       text,

  -- Administrador que corrigió la compra. Nulo = tal como se capturó.
  editada_por        bigint references smartvalehubgold.usuarios (id) on delete set null,
  fecha_edicion      timestamptz,

  fecha_creacion     timestamptz not null default now(),

  constraint redenciones_monto_positivo check (monto_oro > 0),
  constraint redenciones_descuento_no_negativo check (descuento_aplicado >= 0),
  constraint redenciones_descuento_no_supera check (descuento_aplicado <= monto_oro)
);

create index if not exists redenciones_vale_idx on smartvalehubgold.redenciones (vale_id);
create index if not exists redenciones_tienda_idx on smartvalehubgold.redenciones (tienda_id);
create index if not exists redenciones_contacto_idx on smartvalehubgold.redenciones (contacto_id);
create index if not exists redenciones_fecha_idx on smartvalehubgold.redenciones (fecha_creacion);

comment on table smartvalehubgold.redenciones is
  'Una fila por compra. El vale no se consume: admite compras ilimitadas mientras esté vigente.';
comment on column smartvalehubgold.redenciones.monto_oro is
  'Importe de la compra, en la moneda de la región. Solo oro.';


-- ═══ Configuración ═══════════════════════════════════════════════════════

create table if not exists smartvalehubgold.configuracion (
  id                  bigint generated always as identity primary key,
  clave               text not null,
  valor               text not null,
  tipo_dato           text not null default 'numero',
  descripcion         text,
  grupo               text not null default 'general',
  fecha_actualizacion timestamptz,

  constraint configuracion_tipo_dato check (tipo_dato in ('numero', 'texto', 'booleano'))
);

create unique index if not exists configuracion_clave_idx
  on smartvalehubgold.configuracion (clave);

insert into smartvalehubgold.configuracion (clave, valor, tipo_dato, grupo, descripcion)
values
  ('descuento_oro', '15', 'numero', 'vales',
   'Porcentaje en oro de todos los vales. Se congela dentro de cada vale al emitirlo.'),
  ('dias_vigencia_vale', '30', 'numero', 'vales',
   'Días que dura un vale desde que se emite. Se ignora si hay vigencia_hasta.'),
  ('vigencia_hasta', '', 'texto', 'vales',
   'Fecha de corte de la campaña (AAAA-MM-DD), en hora de Guatemala. Vacío = usar dias_vigencia_vale.'),
  ('dias_aviso_vencimiento', '7', 'numero', 'vales',
   'Con cuántos días de antelación se avisa de un vale por vencer.'),
  ('horas_sesion', '12', 'numero', 'seguridad',
   'Duración de una sesión sin actividad.')
on conflict (clave) do nothing;


-- ═══ Marca de actualización ══════════════════════════════════════════════

do $$
declare
  t text;
begin
  foreach t in array array['tiendas', 'usuarios', 'contactos', 'configuracion'] loop
    execute format(
      'drop trigger if exists trg_%1$s_actualizacion on smartvalehubgold.%1$s', t);
    execute format(
      'create trigger trg_%1$s_actualizacion before update on smartvalehubgold.%1$s
         for each row execute function smartvalehubgold.fn_marcar_actualizacion()', t);
  end loop;
end
$$;


-- ═══ Cierre por RLS ══════════════════════════════════════════════════════
--
-- Activado y sin políticas: inalcanzable para `anon` y `authenticated`. No
-- hay `auth.uid()` que pueda identificar al usuario, así que la base no
-- puede autorizar nada; lo hace la capa de servidor. `service_role` salta
-- RLS, y es la única credencial con la que habla la aplicación.

do $$
declare
  t text;
begin
  foreach t in array array[
    'tiendas', 'usuarios', 'sesiones', 'contactos',
    'vales', 'redenciones', 'configuracion'
  ] loop
    execute format('alter table smartvalehubgold.%I enable row level security', t);
    execute format('revoke all on smartvalehubgold.%I from anon, authenticated', t);
  end loop;
end
$$;
