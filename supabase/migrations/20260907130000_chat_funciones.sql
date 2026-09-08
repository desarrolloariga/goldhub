-- ─────────────────────────────────────────────────────────────────────────
-- GOLD HUB SMART VALE — funciones del chat
--
-- Las reglas que no pueden vivir en la capa de servidor porque necesitan
-- pasar entre varias tablas sin que nadie se cuele en medio: abrir un
-- directo sin duplicarlo, enviar un mensaje y mover la conversación, y
-- sacar la bandeja con lo no leído ya contado.
--
-- Se borran antes de crearse: `create or replace` no puede cambiar el tipo
-- de retorno de una función (42P13) ni sus columnas de salida, y estas van a
-- crecer.
-- ─────────────────────────────────────────────────────────────────────────

do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as firma
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'smartvalehubgold'
       and p.proname in (
         'fn_abrir_directo', 'fn_enviar_mensaje', 'fn_bandeja',
         'fn_marcar_leido', 'fn_crear_grupo')
  loop
    execute format('drop function if exists %s', f.firma);
  end loop;
end $$;


-- ── Abrir un directo ─────────────────────────────────────────────────────
--
-- Devuelve la conversación entre dos cuentas, creándola si es la primera
-- vez. Es idempotente a propósito: la pantalla la llama cada vez que alguien
-- abre un chat, y llamarla mil veces tiene que dar siempre la misma fila.
--
-- La pareja se normaliza ordenando los dos ids, así que da igual quién
-- escriba primero. Sin eso, dos personas escribiéndose a la vez crearían dos
-- conversaciones y cada una vería solo sus propios mensajes.

create or replace function smartvalehubgold.fn_abrir_directo(
  p_usuario_id bigint,
  p_otro_id    bigint
)
returns smartvalehubgold.conversaciones
language plpgsql
set search_path = ''
as $$
declare
  v_clave text;
  v_conv  smartvalehubgold.conversaciones%rowtype;
begin
  if p_usuario_id is null or p_otro_id is null then
    raise exception 'Falta indicar con quién es la conversación.'
      using errcode = 'SV006';
  end if;

  if p_usuario_id = p_otro_id then
    raise exception 'No puedes abrir una conversación contigo.'
      using errcode = 'SV006';
  end if;

  if not exists (
    select 1 from smartvalehubgold.usuarios
     where id = p_otro_id and activo
  ) then
    raise exception 'Esa cuenta no existe o está desactivada.'
      using errcode = 'SV005';
  end if;

  v_clave := least(p_usuario_id, p_otro_id) || ':' || greatest(p_usuario_id, p_otro_id);

  select * into v_conv
    from smartvalehubgold.conversaciones
   where clave_directo = v_clave;

  if found then
    return v_conv;
  end if;

  /*
   * El `on conflict` no sobra aunque acabemos de mirar: dos personas
   * abriendo el chat en el mismo instante pasan las dos por el `select`
   * vacío. El índice único decide, y quien pierda se lleva la fila que ganó
   * en vez de un error.
   */
  insert into smartvalehubgold.conversaciones (tipo, clave_directo)
  values ('directo', v_clave)
  on conflict (clave_directo) where clave_directo is not null do nothing
  returning * into v_conv;

  if v_conv.id is null then
    select * into v_conv
      from smartvalehubgold.conversaciones
     where clave_directo = v_clave;
  end if;

  insert into smartvalehubgold.conversacion_participantes (conversacion_id, usuario_id)
  values (v_conv.id, p_usuario_id), (v_conv.id, p_otro_id)
  on conflict do nothing;

  return v_conv;
end;
$$;


-- ── Crear un grupo ───────────────────────────────────────────────────────

create or replace function smartvalehubgold.fn_crear_grupo(
  p_usuario_id    bigint,
  p_nombre        text,
  p_participantes bigint[]
)
returns smartvalehubgold.conversaciones
language plpgsql
set search_path = ''
as $$
declare
  v_nombre text := nullif(btrim(coalesce(p_nombre, '')), '');
  v_conv   smartvalehubgold.conversaciones%rowtype;
begin
  if v_nombre is null then
    raise exception 'El grupo necesita un nombre.' using errcode = 'SV006';
  end if;

  insert into smartvalehubgold.conversaciones (tipo, nombre, creado_por)
  values ('grupo', v_nombre, p_usuario_id)
  returning * into v_conv;

  -- Quien lo crea entra siempre, aunque no se haya incluido en la lista.
  insert into smartvalehubgold.conversacion_participantes (conversacion_id, usuario_id)
  select v_conv.id, u.id
    from smartvalehubgold.usuarios u
   where u.activo
     and (u.id = p_usuario_id or u.id = any(coalesce(p_participantes, '{}')))
  on conflict do nothing;

  return v_conv;
end;
$$;


-- ── Enviar ───────────────────────────────────────────────────────────────
--
-- Comprueba que quien escribe esté dentro, guarda el mensaje y mueve la
-- conversación al principio de la bandeja. Va junto en una función para que
-- no pueda quedar un mensaje guardado con la conversación sin actualizar.

create or replace function smartvalehubgold.fn_enviar_mensaje(
  p_usuario_id     bigint,
  p_conversacion_id bigint,
  p_cuerpo         text default '',
  p_tipo           text default 'texto',
  p_adjunto_ruta   text default null,
  p_adjunto_ancho  integer default null,
  p_adjunto_alto   integer default null
)
returns smartvalehubgold.mensajes
language plpgsql
set search_path = ''
as $$
declare
  v_mensaje smartvalehubgold.mensajes%rowtype;
begin
  if not exists (
    select 1 from smartvalehubgold.conversacion_participantes
     where conversacion_id = p_conversacion_id and usuario_id = p_usuario_id
  ) then
    raise exception 'No participas en esa conversación.' using errcode = 'SV012';
  end if;

  insert into smartvalehubgold.mensajes (
    conversacion_id, autor_id, tipo, cuerpo,
    adjunto_ruta, adjunto_ancho, adjunto_alto
  )
  values (
    p_conversacion_id, p_usuario_id, p_tipo::smartvalehubgold.tipo_mensaje,
    coalesce(p_cuerpo, ''), p_adjunto_ruta, p_adjunto_ancho, p_adjunto_alto
  )
  returning * into v_mensaje;

  update smartvalehubgold.conversaciones
     set ultimo_mensaje_en = v_mensaje.fecha_creacion
   where id = p_conversacion_id;

  -- Quien escribe ya ha leído lo suyo: si no, su propio mensaje le contaría
  -- como no leído en cuanto vuelva a la bandeja.
  update smartvalehubgold.conversacion_participantes
     set leido_hasta = v_mensaje.id
   where conversacion_id = p_conversacion_id
     and usuario_id = p_usuario_id;

  return v_mensaje;
end;
$$;


-- ── Marcar leído ─────────────────────────────────────────────────────────
--
-- Nunca hacia atrás: la pantalla puede llamar con un id viejo al reordenar
-- mensajes, y eso volvería a marcar como no leído lo que ya se vio.

create or replace function smartvalehubgold.fn_marcar_leido(
  p_usuario_id      bigint,
  p_conversacion_id bigint,
  p_hasta           bigint
)
returns void
language sql
set search_path = ''
as $$
  update smartvalehubgold.conversacion_participantes
     set leido_hasta = greatest(leido_hasta, coalesce(p_hasta, 0))
   where conversacion_id = p_conversacion_id
     and usuario_id = p_usuario_id;
$$;


-- ── La bandeja ───────────────────────────────────────────────────────────
--
-- Las conversaciones de alguien, con su último mensaje y cuántos le faltan
-- por leer. Un directo se titula con el nombre de la otra persona, que se
-- resuelve aquí: guardarlo en la fila sería elegir uno de los dos nombres.

create or replace function smartvalehubgold.fn_bandeja(p_usuario_id bigint)
returns table (
  id                bigint,
  tipo              text,
  titulo            text,
  /** Con quién es, en los directos. Nulo en los grupos. */
  otro_id           bigint,
  otro_activo       boolean,
  participantes     integer,
  ultimo_cuerpo     text,
  ultimo_tipo       text,
  ultimo_autor      text,
  ultimo_mensaje_en timestamptz,
  no_leidos         integer
)
language sql
stable
set search_path = ''
as $$
  with mias as (
    select c.*, p.leido_hasta
      from smartvalehubgold.conversaciones c
      join smartvalehubgold.conversacion_participantes p
        on p.conversacion_id = c.id
     where p.usuario_id = p_usuario_id
  ),
  otro as (
    select m.id as conv_id, u.id as usuario_id, u.nombre, u.activo
      from mias m
      join smartvalehubgold.conversacion_participantes p
        on p.conversacion_id = m.id and p.usuario_id <> p_usuario_id
      join smartvalehubgold.usuarios u on u.id = p.usuario_id
     where m.tipo = 'directo'
  ),
  ultimo as (
    select distinct on (x.conversacion_id)
           x.conversacion_id, x.cuerpo, x.tipo, x.fecha_creacion, a.nombre as autor
      from smartvalehubgold.mensajes x
      left join smartvalehubgold.usuarios a on a.id = x.autor_id
     where x.conversacion_id in (select id from mias)
     order by x.conversacion_id, x.id desc
  )
  select
    m.id,
    m.tipo::text,
    coalesce(m.nombre, o.nombre, 'Conversación'),
    o.usuario_id,
    o.activo,
    (select count(*)::integer from smartvalehubgold.conversacion_participantes
      where conversacion_id = m.id),
    coalesce(u.cuerpo, ''),
    coalesce(u.tipo::text, 'texto'),
    u.autor,
    m.ultimo_mensaje_en,
    (select count(*)::integer from smartvalehubgold.mensajes x
      where x.conversacion_id = m.id
        and x.id > m.leido_hasta
        and x.autor_id is distinct from p_usuario_id)
  from mias m
  left join otro o   on o.conv_id = m.id
  left join ultimo u on u.conversacion_id = m.id
  -- Las que nunca han tenido mensaje van al final, no al principio.
  order by m.ultimo_mensaje_en desc nulls last, m.id desc;
$$;

comment on function smartvalehubgold.fn_bandeja is
  'Conversaciones de una cuenta, con su último mensaje y lo que le falta por leer.';
