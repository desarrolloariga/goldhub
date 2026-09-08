-- ─────────────────────────────────────────────────────────────────────────
-- GOLD HUB SMART VALE — chat interno
--
-- Transversal a todo el sistema: cualquier cuenta puede escribirle a
-- cualquier otra, y además hay grupos. No cruza con los vales ni con las
-- tiendas: una tienda no puede ver los vales de otra, pero sí puede
-- escribirle, que es justo para lo que sirve tener un chat de red.
--
-- Dos tipos de conversación en una sola tabla y no dos:
--
--   `directo` — entre dos cuentas, sin nombre. Se crea sola la primera vez
--               que alguien escribe, y no se duplica: la pareja va normada
--               en `clave_directo`, con los dos ids ordenados, así que da
--               igual quién escriba primero.
--   `grupo`   — con nombre, con dueño y con participantes que entran y
--               salen.
--
-- Separarlas en dos tablas obligaría a duplicar mensajes, lecturas y todas
-- las consultas del listado; el precio de juntarlas es un par de CHECK que
-- impiden que un grupo se quede sin nombre o que un directo tenga uno.
--
-- Idempotente: se puede volver a aplicar sin efectos.
-- ─────────────────────────────────────────────────────────────────────────

do $$
begin
  create type smartvalehubgold.tipo_conversacion as enum ('directo', 'grupo');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type smartvalehubgold.tipo_mensaje as enum ('texto', 'imagen');
exception when duplicate_object then null;
end $$;


-- ── Conversaciones ───────────────────────────────────────────────────────

create table if not exists smartvalehubgold.conversaciones (
  id            bigint generated always as identity primary key,
  tipo          smartvalehubgold.tipo_conversacion not null,

  -- Solo los grupos. Un directo se titula con el nombre de la otra persona,
  -- que depende de quién mire: guardarlo aquí sería elegir uno de los dos.
  nombre        text,

  -- Quién lo creó. Es quien puede renombrarlo y sacar gente; si se borra la
  -- cuenta el grupo sigue vivo, solo se queda sin dueño.
  creado_por    bigint references smartvalehubgold.usuarios (id) on delete set null,

  /*
   * La pareja de un directo, normalizada: 'menor:mayor'. El índice único
   * sobre esta columna es lo que impide que existan dos conversaciones entre
   * las mismas dos personas, que es el error clásico de este modelo —cada
   * uno escribiendo en su propia copia sin ver al otro—.
   *
   * Nula en los grupos, y como el índice único ignora los nulos, no estorba.
   */
  clave_directo text,

  -- Se mueve con cada mensaje. Está aquí y no calculada para que el listado
  -- de conversaciones ordene por ella sin recorrer todos los mensajes.
  ultimo_mensaje_en timestamptz,

  fecha_creacion    timestamptz not null default now(),
  fecha_actualizacion timestamptz,

  constraint conversaciones_grupo_con_nombre check (
    (tipo = 'grupo'   and btrim(coalesce(nombre, '')) <> '' and clave_directo is null) or
    (tipo = 'directo' and nombre is null and clave_directo is not null)
  )
);

create unique index if not exists conversaciones_directo_idx
  on smartvalehubgold.conversaciones (clave_directo)
  where clave_directo is not null;

create index if not exists conversaciones_actividad_idx
  on smartvalehubgold.conversaciones (ultimo_mensaje_en desc nulls last);


-- ── Quién está en cada conversación ──────────────────────────────────────

create table if not exists smartvalehubgold.conversacion_participantes (
  conversacion_id bigint not null
    references smartvalehubgold.conversaciones (id) on delete cascade,
  usuario_id      bigint not null
    references smartvalehubgold.usuarios (id) on delete cascade,

  -- Hasta dónde ha leído. Se compara con `mensajes.id`, que es creciente:
  -- contar lo no leído es un `count` de lo que va por encima, sin marcar
  -- mensaje por mensaje.
  leido_hasta     bigint not null default 0,

  fecha_ingreso   timestamptz not null default now(),

  primary key (conversacion_id, usuario_id)
);

create index if not exists participantes_usuario_idx
  on smartvalehubgold.conversacion_participantes (usuario_id);


-- ── Mensajes ─────────────────────────────────────────────────────────────

create table if not exists smartvalehubgold.mensajes (
  id              bigint generated always as identity primary key,
  conversacion_id bigint not null
    references smartvalehubgold.conversaciones (id) on delete cascade,

  -- Quién lo escribió. Nulo si la cuenta se borró: el mensaje se queda, que
  -- borrar media conversación al dar de baja a alguien sería peor.
  autor_id        bigint references smartvalehubgold.usuarios (id) on delete set null,

  tipo            smartvalehubgold.tipo_mensaje not null default 'texto',

  -- El texto. En un mensaje de imagen es el pie, y puede ir vacío.
  cuerpo          text not null default '',

  -- Ruta dentro del bucket de adjuntos. Solo en los de tipo `imagen`.
  adjunto_ruta    text,
  adjunto_ancho   integer,
  adjunto_alto    integer,

  fecha_creacion  timestamptz not null default now(),

  constraint mensajes_texto_no_vacio check (
    tipo <> 'texto' or btrim(cuerpo) <> ''
  ),
  constraint mensajes_imagen_con_adjunto check (
    tipo <> 'imagen' or adjunto_ruta is not null
  )
);

-- El orden natural de una conversación, y el que usa la paginación.
create index if not exists mensajes_conversacion_idx
  on smartvalehubgold.mensajes (conversacion_id, id desc);


-- ── Cierre ───────────────────────────────────────────────────────────────
-- Mismo criterio que el resto del esquema: RLS encendido y sin políticas, de
-- forma que solo entra `service_role`. Quién puede leer qué conversación se
-- decide en la capa de servidor, donde sí se sabe quién es el usuario: la
-- aplicación no usa Supabase Auth, así que aquí `auth.uid()` no existe.

do $$
declare
  t text;
begin
  foreach t in array array[
    'conversaciones', 'conversacion_participantes', 'mensajes'
  ] loop
    execute format('alter table smartvalehubgold.%I enable row level security', t);
    execute format(
      'revoke all on smartvalehubgold.%I from anon, authenticated', t);
    execute format('grant all on smartvalehubgold.%I to service_role', t);
  end loop;
end
$$;

do $$
declare
  t text;
begin
  foreach t in array array['conversaciones'] loop
    execute format(
      'drop trigger if exists trg_%1$s_actualizacion on smartvalehubgold.%1$s', t);
    execute format(
      'create trigger trg_%1$s_actualizacion before update on smartvalehubgold.%1$s
         for each row execute function smartvalehubgold.fn_marcar_actualizacion()', t);
  end loop;
end
$$;

comment on table smartvalehubgold.conversaciones is
  'Chat interno: directos entre dos cuentas y grupos con nombre.';
comment on column smartvalehubgold.conversaciones.clave_directo is
  'La pareja de un directo como «menor:mayor». Su índice único impide dos conversaciones entre las mismas personas.';
comment on column smartvalehubgold.conversacion_participantes.leido_hasta is
  'Último `mensajes.id` leído. Lo no leído es lo que va por encima.';
