-- ─────────────────────────────────────────────────────────────────────────
-- GOLD HUB SMART VALE — suscripciones de notificación push
--
-- Lo que permite avisar con el navegador cerrado. Cada dispositivo que da
-- permiso genera una suscripción —una URL del servicio de push del navegador
-- más dos claves de cifrado— y el servidor le manda ahí los avisos.
--
-- Una cuenta tiene varias: el teléfono, la computadora del mostrador, la de
-- casa. Todas reciben, que es lo que se espera de un chat.
--
-- Las claves que se guardan aquí son del NAVEGADOR, no del servidor: sirven
-- para cifrar el aviso de forma que solo ese dispositivo pueda leerlo. La
-- clave privada VAPID, que es la que firma, vive en la variable de entorno y
-- nunca toca la base.
--
-- Idempotente.
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists smartvalehubgold.push_suscripciones (
  id             bigint generated always as identity primary key,
  usuario_id     bigint not null
    references smartvalehubgold.usuarios (id) on delete cascade,

  -- La dirección del servicio de push del navegador. Identifica el
  -- dispositivo: si se repite, es el mismo y hay que actualizarlo, no añadir
  -- otro.
  endpoint       text not null,

  -- Claves del navegador para cifrar el mensaje.
  clave_p256dh   text not null,
  clave_auth     text not null,

  -- Para saber qué dispositivo es al listarlos, y para depurar.
  user_agent     text,

  /*
   * Cuándo falló por última vez. Un servicio de push responde 404 o 410
   * cuando la suscripción ya no vale —el navegador se desinstaló, se limpiaron
   * los datos—, y esas se borran solas. Este campo es para los fallos
   * pasajeros: si uno se repite mucho, la suscripción está muerta aunque no
   * lo diga.
   */
  ultimo_fallo   timestamptz,
  fallos         integer not null default 0,

  fecha_creacion timestamptz not null default now()
);

-- El mismo dispositivo no se registra dos veces. Si alguien entra con otra
-- cuenta en el mismo navegador, la suscripción cambia de dueño en vez de
-- duplicarse y mandar el aviso a quien ya no está.
create unique index if not exists push_endpoint_idx
  on smartvalehubgold.push_suscripciones (endpoint);

create index if not exists push_usuario_idx
  on smartvalehubgold.push_suscripciones (usuario_id);

do $$
begin
  execute 'alter table smartvalehubgold.push_suscripciones enable row level security';
  execute 'revoke all on smartvalehubgold.push_suscripciones from anon, authenticated';
  execute 'grant all on smartvalehubgold.push_suscripciones to service_role';
end
$$;


-- ── A quién avisar de un mensaje ─────────────────────────────────────────
--
-- Los dispositivos de todos los participantes de una conversación menos el
-- de quien escribe. Va como función y no como consulta suelta porque decide
-- algo del negocio: a quién le corresponde enterarse.

do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as firma
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'smartvalehubgold'
       and p.proname in ('fn_destinos_push', 'fn_guardar_push', 'fn_borrar_push')
  loop
    execute format('drop function if exists %s', f.firma);
  end loop;
end $$;

create or replace function smartvalehubgold.fn_destinos_push(
  p_conversacion_id bigint,
  p_autor_id        bigint
)
returns table (
  id           bigint,
  usuario_id   bigint,
  endpoint     text,
  clave_p256dh text,
  clave_auth   text
)
language sql
stable
set search_path = ''
as $$
  select s.id, s.usuario_id, s.endpoint, s.clave_p256dh, s.clave_auth
    from smartvalehubgold.conversacion_participantes p
    join smartvalehubgold.push_suscripciones s on s.usuario_id = p.usuario_id
   where p.conversacion_id = p_conversacion_id
     -- A quien escribe no se le avisa de lo suyo.
     and p.usuario_id is distinct from p_autor_id;
$$;


-- Guarda —o actualiza— la suscripción de un dispositivo.
create or replace function smartvalehubgold.fn_guardar_push(
  p_usuario_id   bigint,
  p_endpoint     text,
  p_clave_p256dh text,
  p_clave_auth   text,
  p_user_agent   text default null
)
returns bigint
language plpgsql
set search_path = ''
as $$
declare
  v_id bigint;
begin
  insert into smartvalehubgold.push_suscripciones (
    usuario_id, endpoint, clave_p256dh, clave_auth, user_agent
  )
  values (p_usuario_id, p_endpoint, p_clave_p256dh, p_clave_auth, p_user_agent)
  on conflict (endpoint) do update
    set usuario_id   = excluded.usuario_id,
        clave_p256dh = excluded.clave_p256dh,
        clave_auth   = excluded.clave_auth,
        user_agent   = excluded.user_agent,
        -- Vuelve a estar viva: el contador de fallos se pone a cero.
        fallos       = 0,
        ultimo_fallo = null
  returning id into v_id;

  return v_id;
end;
$$;


create or replace function smartvalehubgold.fn_borrar_push(p_endpoint text)
returns void
language sql
set search_path = ''
as $$
  delete from smartvalehubgold.push_suscripciones where endpoint = p_endpoint;
$$;

comment on table smartvalehubgold.push_suscripciones is
  'Dispositivos suscritos a los avisos del chat. Las claves guardadas son del navegador, no del servidor.';
