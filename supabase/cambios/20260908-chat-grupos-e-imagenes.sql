-- ─────────────────────────────────────────────────────────────────────────
-- Chat: administración de grupos e imágenes
--
-- Renombrar un grupo, añadir y quitar participantes, salirse, y el bucket
-- privado de los adjuntos.
--
-- El bucket NO es público, al revés que el de logotipos: lo que dos tiendas
-- se mandan por el chat no lo tiene que poder abrir cualquiera con la URL.
-- Se sirve por una ruta del servidor que comprueba la sesión y la
-- pertenencia a la conversación.
--
-- Se puede volver a aplicar sin miedo.
-- ─────────────────────────────────────────────────────────────────────────

begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'chat-adjuntos', 'chat-adjuntos', false, 8388608,
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif']
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;


do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as firma
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'smartvalehubgold'
       and p.proname in (
         'fn_renombrar_grupo', 'fn_agregar_participantes',
         'fn_quitar_participante', 'fn_participantes')
  loop
    execute format('drop function if exists %s', f.firma);
  end loop;
end $$;


-- Comprueba que la cuenta esté dentro y que sea un grupo. Se repite en las
-- tres funciones, así que va aparte.
create or replace function smartvalehubgold.fn_exigir_en_grupo(
  p_usuario_id      bigint,
  p_conversacion_id bigint
)
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if not exists (
    select 1 from smartvalehubgold.conversacion_participantes
     where conversacion_id = p_conversacion_id and usuario_id = p_usuario_id
  ) then
    raise exception 'No participas en ese grupo.' using errcode = 'SV012';
  end if;

  if not exists (
    select 1 from smartvalehubgold.conversaciones
     where id = p_conversacion_id and tipo = 'grupo'
  ) then
    -- Un directo no tiene nombre ni participantes que administrar: son dos
    -- personas y punto.
    raise exception 'Esa conversación no es un grupo.' using errcode = 'SV006';
  end if;
end;
$$;


create or replace function smartvalehubgold.fn_renombrar_grupo(
  p_usuario_id      bigint,
  p_conversacion_id bigint,
  p_nombre          text
)
returns smartvalehubgold.conversaciones
language plpgsql
set search_path = ''
as $$
declare
  v_nombre text := nullif(btrim(coalesce(p_nombre, '')), '');
  v_conv   smartvalehubgold.conversaciones%rowtype;
begin
  perform smartvalehubgold.fn_exigir_en_grupo(p_usuario_id, p_conversacion_id);

  if v_nombre is null then
    raise exception 'El grupo necesita un nombre.' using errcode = 'SV006';
  end if;

  update smartvalehubgold.conversaciones
     set nombre = v_nombre
   where id = p_conversacion_id
  returning * into v_conv;

  return v_conv;
end;
$$;


create or replace function smartvalehubgold.fn_agregar_participantes(
  p_usuario_id      bigint,
  p_conversacion_id bigint,
  p_nuevos          bigint[]
)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_antes integer;
  v_ahora integer;
begin
  perform smartvalehubgold.fn_exigir_en_grupo(p_usuario_id, p_conversacion_id);

  select count(*) into v_antes
    from smartvalehubgold.conversacion_participantes
   where conversacion_id = p_conversacion_id;

  -- Solo cuentas activas, y `on conflict` porque volver a añadir a quien ya
  -- está es un gesto normal cuando dos personas administran a la vez.
  insert into smartvalehubgold.conversacion_participantes (conversacion_id, usuario_id)
  select p_conversacion_id, u.id
    from smartvalehubgold.usuarios u
   where u.activo and u.id = any(coalesce(p_nuevos, '{}'))
  on conflict do nothing;

  select count(*) into v_ahora
    from smartvalehubgold.conversacion_participantes
   where conversacion_id = p_conversacion_id;

  return v_ahora - v_antes;
end;
$$;


-- Quitar a alguien, o salirse uno mismo: es la misma operación con distinto
-- destinatario, y separarlas en dos funciones duplicaría la comprobación.
create or replace function smartvalehubgold.fn_quitar_participante(
  p_usuario_id      bigint,
  p_conversacion_id bigint,
  p_objetivo_id     bigint
)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_quedan integer;
begin
  perform smartvalehubgold.fn_exigir_en_grupo(p_usuario_id, p_conversacion_id);

  delete from smartvalehubgold.conversacion_participantes
   where conversacion_id = p_conversacion_id
     and usuario_id = p_objetivo_id;

  select count(*) into v_quedan
    from smartvalehubgold.conversacion_participantes
   where conversacion_id = p_conversacion_id;

  /*
   * Un grupo sin nadie se borra, y con él sus mensajes. No es una pérdida:
   * ya no queda quien pudiera leerlos, y dejarlo ahí sería guardar una
   * conversación que nadie puede abrir nunca más.
   */
  if v_quedan = 0 then
    delete from smartvalehubgold.conversaciones where id = p_conversacion_id;
  end if;

  return v_quedan;
end;
$$;


-- Quiénes están en una conversación. Lo usa la pantalla del grupo, y también
-- el directo para saber con quién se habla.
create or replace function smartvalehubgold.fn_participantes(
  p_usuario_id      bigint,
  p_conversacion_id bigint
)
returns table (
  usuario_id bigint,
  nombre     text,
  rol        text,
  tienda     text,
  es_creador boolean
)
language sql
stable
set search_path = ''
as $$
  select u.id, u.nombre, u.rol::text, t.nombre, (c.creado_por = u.id)
    from smartvalehubgold.conversacion_participantes p
    join smartvalehubgold.usuarios u on u.id = p.usuario_id
    join smartvalehubgold.conversaciones c on c.id = p.conversacion_id
    left join smartvalehubgold.tiendas t on t.id = u.tienda_id
   where p.conversacion_id = p_conversacion_id
     -- Solo si quien pregunta está dentro: si no, la lista sale vacía en vez
     -- de revelar quiénes hablan en un grupo ajeno.
     and exists (
       select 1 from smartvalehubgold.conversacion_participantes q
        where q.conversacion_id = p_conversacion_id
          and q.usuario_id = p_usuario_id
     )
   order by u.nombre;
$$;

comment on function smartvalehubgold.fn_quitar_participante is
  'Saca a alguien de un grupo, o lo abandona uno mismo. Si queda vacío, el grupo se borra.';

commit;
