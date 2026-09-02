-- ─────────────────────────────────────────────────────────────────────────
-- ARIGA SMART VALE — modelo de datos
--
-- Vales de descuento con código QR, emitidos por vendedoras dentro de rangos
-- correlativos asignados por el administrador, redimibles muchas veces por
-- personas distintas.
--
-- Convención: snake_case, `bigint generated always as identity`,
-- `fecha_creacion` / `fecha_actualizacion`, `activo boolean`.
-- ─────────────────────────────────────────────────────────────────────────

-- ═══ Enumeraciones ═══════════════════════════════════════════════════════

create type smartvale.tipo_vale as enum ('A1', 'A2', 'A3');

comment on type smartvale.tipo_vale is
  'A1 cliente existente por llamada · A2 empleados y referidos en frío · A3 visitante de tienda';

create type smartvale.segmento_a1 as enum ('A1-30', 'A1-60', 'A1-90', 'A1-VIP');

comment on type smartvale.segmento_a1 is
  'Clasificación manual del cliente A1 según cuándo compró por última vez.';

create type smartvale.rol_usuario as enum ('admin', 'vendedora');

-- ═══ Tiendas ═════════════════════════════════════════════════════════════

create table smartvale.tiendas (
  id                  bigint generated always as identity primary key,
  nombre              text not null unique check (length(btrim(nombre)) > 0),
  direccion           text,
  telefono            text,
  activo              boolean not null default true,
  fecha_creacion      timestamptz not null default now(),
  fecha_actualizacion timestamptz
);

create trigger tiendas_actualizacion
  before update on smartvale.tiendas
  for each row execute function smartvale.fn_marcar_actualizacion();

-- ═══ Usuarios ════════════════════════════════════════════════════════════
-- Administradores y vendedoras. Autenticación propia: `contrasena_hash`
-- guarda un derivado scrypt con sal, calculado en la capa de aplicación.

create table smartvale.usuarios (
  id                  bigint generated always as identity primary key,
  nombre              text not null check (length(btrim(nombre)) > 0),
  correo              text not null unique check (correo = lower(btrim(correo))),
  telefono            text,
  contrasena_hash     text not null,
  rol                 smartvale.rol_usuario not null default 'vendedora',
  tienda_id           bigint references smartvale.tiendas (id),
  activo              boolean not null default true,
  ultimo_acceso       timestamptz,
  fecha_creacion      timestamptz not null default now(),
  fecha_actualizacion timestamptz
);

create index usuarios_rol_idx on smartvale.usuarios (rol) where activo;

create trigger usuarios_actualizacion
  before update on smartvale.usuarios
  for each row execute function smartvale.fn_marcar_actualizacion();

comment on column smartvale.usuarios.correo is
  'Identificador de acceso. Siempre en minúsculas y sin espacios.';

-- ═══ Sesiones ════════════════════════════════════════════════════════════
-- Solo se guarda el SHA-256 del token: si alguien lee la tabla no puede
-- suplantar a nadie. El token en claro vive únicamente en la cookie.

create table smartvale.sesiones (
  id               bigint generated always as identity primary key,
  usuario_id       bigint not null references smartvale.usuarios (id) on delete cascade,
  token_hash       text not null unique,
  expira_en        timestamptz not null,
  ultima_actividad timestamptz not null default now(),
  user_agent       text,
  fecha_creacion   timestamptz not null default now()
);

create index sesiones_usuario_idx on smartvale.sesiones (usuario_id);
create index sesiones_expira_idx on smartvale.sesiones (expira_en);

-- ═══ Rangos correlativos ═════════════════════════════════════════════════
-- El administrador asigna bloques (0–99, 100–199, …). El correlativo es
-- compartido por los tres tipos de vale: cada emisión, sea A1, A2 o A3,
-- consume un número del bloque.

create table smartvale.rangos (
  id                  bigint generated always as identity primary key,
  usuario_id          bigint not null references smartvale.usuarios (id),
  rango_inicio        integer not null check (rango_inicio >= 0),
  rango_fin           integer not null,
  correlativo_actual  integer not null,
  activo              boolean not null default true,
  asignado_por        bigint references smartvale.usuarios (id),
  nota                text,
  fecha_creacion      timestamptz not null default now(),
  fecha_actualizacion timestamptz,

  constraint rangos_orden
    check (rango_fin >= rango_inicio),

  -- `correlativo_actual` es el PRÓXIMO número a asignar. Alcanzar
  -- `rango_fin + 1` es el estado legítimo de bloque agotado.
  constraint rangos_correlativo_en_bloque
    check (correlativo_actual between rango_inicio and rango_fin + 1),

  -- Los bloques no se solapan en todo el sistema, lo que hace que el
  -- correlativo sea único globalmente y el código del vale, irrepetible.
  constraint rangos_sin_solape
    exclude using gist (int4range(rango_inicio, rango_fin, '[]') with &&)
);

create index rangos_usuario_idx on smartvale.rangos (usuario_id) where activo;

create trigger rangos_actualizacion
  before update on smartvale.rangos
  for each row execute function smartvale.fn_marcar_actualizacion();

comment on column smartvale.rangos.correlativo_actual is
  'Próximo correlativo a asignar. Si supera rango_fin, el bloque está agotado.';

-- ═══ Contactos ═══════════════════════════════════════════════════════════
-- Portadores de vales (nivel 1) y compradores en caja (nivel 3).
-- Se deduplica por teléfono, que es el único dato siempre capturado.

create table smartvale.contactos (
  id                  bigint generated always as identity primary key,
  nombre              text not null check (length(btrim(nombre)) > 0),
  telefono            text not null unique check (telefono ~ '^[0-9]{7,15}$'),
  correo              text,
  fecha_creacion      timestamptz not null default now(),
  fecha_actualizacion timestamptz
);

create index contactos_nombre_idx on smartvale.contactos using gin (to_tsvector('spanish', nombre));

create trigger contactos_actualizacion
  before update on smartvale.contactos
  for each row execute function smartvale.fn_marcar_actualizacion();

comment on column smartvale.contactos.telefono is
  'Solo dígitos, con código de país. Es también lo que consume el enlace wa.me.';

-- ═══ Vales ═══════════════════════════════════════════════════════════════

create table smartvale.vales (
  id                bigint generated always as identity primary key,
  codigo            text not null unique,
  tipo              smartvale.tipo_vale not null,
  correlativo       integer not null unique,

  usuario_id        bigint not null references smartvale.usuarios (id),
  rango_id          bigint not null references smartvale.rangos (id),
  contacto_id       bigint not null references smartvale.contactos (id),

  -- Campos propios de cada puerta de entrada
  segmento          smartvale.segmento_a1,
  origen            text,
  tienda_id         bigint references smartvale.tiendas (id),

  -- Se congela al emitir: si mañana cambia la configuración, el vale ya
  -- entregado sigue valiendo lo que se le prometió al cliente.
  descuento_pct     numeric(5, 2) not null check (descuento_pct between 0 and 100),

  fecha_emision     timestamptz not null default now(),
  fecha_vencimiento timestamptz not null,

  anulado           boolean not null default false,
  motivo_anulacion  text,
  anulado_por       bigint references smartvale.usuarios (id),
  fecha_anulacion   timestamptz,

  fecha_creacion    timestamptz not null default now(),

  constraint vales_vigencia
    check (fecha_vencimiento > fecha_emision),

  -- El segmento es obligatorio en A1 y no existe en los demás tipos.
  constraint vales_segmento_solo_a1
    check ((tipo = 'A1') = (segmento is not null)),

  -- El origen de la prospección es obligatorio en A2 y no existe fuera de él.
  constraint vales_origen_solo_a2
    check ((tipo = 'A2') = (origen is not null)),

  -- A3 se emite dentro de una tienda, así que el punto de venta es obligatorio.
  constraint vales_tienda_en_a3
    check (tipo <> 'A3' or tienda_id is not null),

  constraint vales_anulacion_coherente
    check (anulado = (fecha_anulacion is not null))
);

create index vales_usuario_idx on smartvale.vales (usuario_id, fecha_creacion desc);
create index vales_tipo_idx on smartvale.vales (tipo);
create index vales_contacto_idx on smartvale.vales (contacto_id);
create index vales_tienda_idx on smartvale.vales (tienda_id);
create index vales_vencimiento_idx on smartvale.vales (fecha_vencimiento);

comment on column smartvale.vales.codigo is
  'AR-[TIPO]-[CORRELATIVO 6 dígitos]. Ejemplo: AR-A1-000045.';

-- ═══ Redenciones ═════════════════════════════════════════════════════════
-- Una fila por compra. Un vale admite redenciones ilimitadas mientras esté
-- vigente: registrar una nunca invalida el vale ni sobrescribe las anteriores.

create table smartvale.redenciones (
  id                 bigint generated always as identity primary key,
  vale_id            bigint not null references smartvale.vales (id),
  usuario_id         bigint not null references smartvale.usuarios (id),
  tienda_id          bigint not null references smartvale.tiendas (id),
  contacto_id        bigint not null references smartvale.contactos (id),

  monto_compra       numeric(12, 2) not null check (monto_compra > 0),
  descuento_aplicado numeric(12, 2) not null default 0 check (descuento_aplicado >= 0),
  ticket             text not null check (length(btrim(ticket)) > 0),
  nota               text,

  fecha_creacion     timestamptz not null default now(),

  constraint redenciones_descuento_coherente
    check (descuento_aplicado <= monto_compra)
);

create index redenciones_vale_idx on smartvale.redenciones (vale_id);
create index redenciones_tienda_idx on smartvale.redenciones (tienda_id, fecha_creacion desc);
create index redenciones_usuario_idx on smartvale.redenciones (usuario_id, fecha_creacion desc);
create index redenciones_contacto_idx on smartvale.redenciones (contacto_id);

comment on table smartvale.redenciones is
  'Historial de compras por vale. Nunca se actualiza ni se borra: es la trazabilidad.';

-- ═══ Configuración ═══════════════════════════════════════════════════════

create table smartvale.configuracion (
  id                  bigint generated always as identity primary key,
  clave               text not null unique,
  valor               text not null,
  tipo_dato           text not null default 'numero'
                        check (tipo_dato in ('numero', 'texto', 'booleano')),
  descripcion         text,
  grupo               text not null default 'general',
  fecha_actualizacion timestamptz
);

create trigger configuracion_actualizacion
  before update on smartvale.configuracion
  for each row execute function smartvale.fn_marcar_actualizacion();

insert into smartvale.configuracion (clave, valor, tipo_dato, grupo, descripcion) values
  ('descuento_a1_30',    '15', 'numero', 'descuentos', '% de descuento para clientes que compraron hace 30 días'),
  ('descuento_a1_60',    '20', 'numero', 'descuentos', '% de descuento para clientes que compraron hace 60 días'),
  ('descuento_a1_90',    '25', 'numero', 'descuentos', '% de descuento para clientes que compraron hace 90 días'),
  ('descuento_a1_vip',   '30', 'numero', 'descuentos', '% de descuento para clientes VIP'),
  ('descuento_a2',       '20', 'numero', 'descuentos', '% de descuento para empleados y referidos'),
  ('descuento_a3',       '10', 'numero', 'descuentos', '% de descuento para visitantes de tienda'),
  ('dias_vigencia_vale', '30', 'numero', 'vales',      'Días de vigencia desde la emisión del vale'),
  ('vales_por_rango',   '100', 'numero', 'rangos',     'Tamaño del bloque correlativo que se asigna a cada vendedora');

-- ═══ Cierre por RLS ══════════════════════════════════════════════════════
-- Sin políticas, ninguna fila es visible para `anon` ni `authenticated`.
-- El rol de servicio omite RLS: es el único que llega, y su clave nunca sale
-- del servidor de Next.js.

alter table smartvale.tiendas       enable row level security;
alter table smartvale.usuarios      enable row level security;
alter table smartvale.sesiones      enable row level security;
alter table smartvale.rangos        enable row level security;
alter table smartvale.contactos     enable row level security;
alter table smartvale.vales         enable row level security;
alter table smartvale.redenciones   enable row level security;
alter table smartvale.configuracion enable row level security;

revoke all on all tables in schema smartvale from anon, authenticated;
revoke all on all sequences in schema smartvale from anon, authenticated;
