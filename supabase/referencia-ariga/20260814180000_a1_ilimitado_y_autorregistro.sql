-- ─────────────────────────────────────────────────────────────────────────
-- ARIGA SMART VALE — A1 sin límite y autorregistro A3 por tienda
--
-- 1. A1 es llamar a la base histórica: no se "entrega" nada numerado, así
--    que acotarlo a un bloque de 100 no tenía sentido. Pasa a numerarse con
--    una secuencia propia de cada vendedora, sin techo.
--
--    Nomenclatura:  AR-A1-V012-00045
--                          │    └── correlativo propio de esa vendedora
--                          └─────── V + id de la vendedora
--
--    A2 y A3 siguen consumiendo el bloque asignado: ahí el control de
--    entregas sí importa, porque son vales que se reparten en la calle.
--
-- 2. A3 gana un segundo camino: cada tienda tiene un QR general fijo. El
--    cliente lo escanea, se registra solo y el sistema le emite SU vale.
--
--    Nomenclatura:  AR-A3-T003-00012
--                          │    └── correlativo propio de esa tienda
--                          └─────── T + id de la tienda
--
--    Esos vales no tienen vendedora: los emite la tienda. Por eso
--    `vales.usuario_id` pasa a admitir nulos.
-- ─────────────────────────────────────────────────────────────────────────

-- ═══ Secuencias propias ══════════════════════════════════════════════════

alter table smartvale.usuarios
  add column if not exists correlativo_a1 integer not null default 0;

comment on column smartvale.usuarios.correlativo_a1 is
  'Secuencia propia de vales A1. Sin techo: A1 no consume bloque.';

alter table smartvale.tiendas
  add column if not exists token text,
  add column if not exists correlativo_a3 integer not null default 0,
  add column if not exists autorregistro boolean not null default true;

update smartvale.tiendas
   set token = smartvale.fn_token_vale()
 where token is null;

alter table smartvale.tiendas
  alter column token set not null,
  alter column token set default smartvale.fn_token_vale();

create unique index if not exists tiendas_token_idx on smartvale.tiendas (token);

comment on column smartvale.tiendas.token is
  'Identificador del QR fijo de la tienda, el que el cliente escanea para registrarse.';
comment on column smartvale.tiendas.autorregistro is
  'Si está apagado, el QR de la tienda deja de emitir vales.';


-- ═══ Vales sin vendedora ═════════════════════════════════════════════════

alter table smartvale.vales
  alter column usuario_id drop not null,
  add column if not exists autorregistro boolean not null default false;

-- El correlativo deja de ser único global: ahora hay tres secuencias
-- distintas —bloque, vendedora y tienda— y lo que identifica al vale es el
-- código, que sí sigue siendo único.
alter table smartvale.vales
  drop constraint if exists vales_correlativo_key;

-- Un vale sin vendedora es de autorregistro, y al revés.
alter table smartvale.vales
  drop constraint if exists vales_autorregistro_sin_vendedora;
alter table smartvale.vales
  add constraint vales_autorregistro_sin_vendedora
  check (autorregistro = (usuario_id is null));

-- El rango solo aplica a lo que sale de un bloque.
alter table smartvale.vales
  alter column rango_id drop not null;

comment on column smartvale.vales.autorregistro is
  'Lo creó el propio cliente desde el QR de la tienda, sin vendedora.';


-- ═══ Prefijos de las secuencias ══════════════════════════════════════════

create or replace function smartvale.fn_prefijo_vendedora(p_usuario_id bigint)
returns text language sql immutable set search_path = '' as $$
  select 'V' || lpad(p_usuario_id::text, 3, '0');
$$;

create or replace function smartvale.fn_prefijo_tienda(p_tienda_id bigint)
returns text language sql immutable set search_path = '' as $$
  select 'T' || lpad(p_tienda_id::text, 3, '0');
$$;


-- ═══ Emisión ═════════════════════════════════════════════════════════════

create or replace function smartvale.fn_emitir_vale(
  p_usuario_id bigint,
  p_tipo       smartvale.tipo_vale,
  p_nombre     text,
  p_telefono   text,
  p_correo     text default null,
  p_segmento   smartvale.segmento_a1 default null,
  p_origen     text default null,
  p_tienda_id  bigint default null
)
returns smartvale.vales
language plpgsql
set search_path = ''
as $$
declare
  v_usuario     smartvale.usuarios%rowtype;
  v_rango       smartvale.rangos%rowtype;
  v_rango_id    bigint;
  v_correlativo integer;
  v_codigo      text;
  v_contacto_id bigint;
  v_descuento   numeric;
  v_dias        integer;
  v_tienda_id   bigint;
  v_vale        smartvale.vales%rowtype;
begin
  select * into v_usuario
    from smartvale.usuarios
   where id = p_usuario_id and activo;

  if not found then
    raise exception 'La cuenta no existe o está desactivada.' using errcode = 'SV005';
  end if;

  -- Validar aquí y no solo con los CHECK: así el mensaje dice qué falta.
  if p_tipo = 'A1' and p_segmento is null then
    raise exception 'Un vale A1 necesita la clasificación del cliente (30, 60, 90 o VIP).'
      using errcode = 'SV006';
  end if;

  if p_tipo <> 'A1' and p_segmento is not null then
    raise exception 'La clasificación por segmento solo aplica a los vales A1.'
      using errcode = 'SV006';
  end if;

  if p_tipo = 'A2' and nullif(btrim(coalesce(p_origen, '')), '') is null then
    raise exception 'Un vale A2 necesita el origen de la prospección (empresa o centro comercial).'
      using errcode = 'SV006';
  end if;

  if p_tipo <> 'A2' and nullif(btrim(coalesce(p_origen, '')), '') is not null then
    raise exception 'El origen de prospección solo aplica a los vales A2.'
      using errcode = 'SV006';
  end if;

  -- Serializa las emisiones de esta vendedora durante la transacción: dos
  -- pestañas abiertas no pueden tomar el mismo número.
  perform pg_advisory_xact_lock(825001, p_usuario_id::integer);

  if p_tipo = 'A1' then
    -- Secuencia propia, sin techo: A1 es llamar a la base histórica y no
    -- hay nada numerado que repartir.
    update smartvale.usuarios
       set correlativo_a1 = correlativo_a1 + 1
     where id = p_usuario_id
    returning correlativo_a1 into v_correlativo;

    v_codigo := 'AR-A1-'
             || smartvale.fn_prefijo_vendedora(p_usuario_id)
             || '-' || lpad(v_correlativo::text, 5, '0');
    v_rango_id := null;
  else
    -- A2 y A3 se reparten en la calle: ahí el bloque sí controla entregas.
    select * into v_rango
      from smartvale.rangos
     where usuario_id = p_usuario_id
       and activo
       and correlativo_actual <= rango_fin
     order by rango_inicio
     limit 1;

    if not found then
      raise exception
        'Ha alcanzado el límite de su rango asignado. Contacte al administrador para asignar un nuevo bloque.'
        using errcode = 'SV001';
    end if;

    v_correlativo := v_rango.correlativo_actual;
    v_rango_id    := v_rango.id;

    update smartvale.rangos
       set correlativo_actual = correlativo_actual + 1
     where id = v_rango.id;

    v_codigo := 'AR-' || p_tipo::text || '-' || lpad(v_correlativo::text, 6, '0');
  end if;

  v_contacto_id := smartvale.fn_obtener_o_crear_contacto(p_nombre, p_telefono, p_correo);
  v_descuento   := smartvale.fn_descuento_de(p_tipo, p_segmento);
  v_dias        := smartvale.fn_config('dias_vigencia_vale', 30)::integer;
  v_tienda_id   := coalesce(p_tienda_id, v_usuario.tienda_id);

  if p_tipo = 'A3' and v_tienda_id is null then
    raise exception 'Un vale A3 necesita el punto de venta. Selecciónalo o asigna una tienda a la cuenta.'
      using errcode = 'SV006';
  end if;

  insert into smartvale.vales (
    codigo, tipo, correlativo, usuario_id, rango_id, contacto_id,
    segmento, origen, tienda_id, descuento_pct, fecha_vencimiento
  )
  values (
    v_codigo, p_tipo, v_correlativo, p_usuario_id, v_rango_id, v_contacto_id,
    p_segmento, nullif(btrim(coalesce(p_origen, '')), ''), v_tienda_id,
    v_descuento, now() + make_interval(days => v_dias)
  )
  returning * into v_vale;

  return v_vale;
end;
$$;


-- ═══ Autorregistro desde el QR de la tienda ══════════════════════════════
--
-- Lo llama una página pública, así que deduplica por teléfono: quien vuelve
-- a escanear recupera su vale en vez de generar uno nuevo. Eso es a la vez
-- lo que el cliente espera y el freno natural contra el abuso.

create or replace function smartvale.fn_autorregistro_a3(
  p_token    text,
  p_nombre   text,
  p_telefono text,
  p_correo   text default null
)
returns smartvale.vales
language plpgsql
set search_path = ''
as $$
declare
  v_tienda      smartvale.tiendas%rowtype;
  v_contacto_id bigint;
  v_existente   smartvale.vales%rowtype;
  v_correlativo integer;
  v_descuento   numeric;
  v_dias        integer;
  v_vale        smartvale.vales%rowtype;
begin
  select * into v_tienda
    from smartvale.tiendas
   where token = btrim(p_token) and activo;

  if not found then
    raise exception 'Este código de tienda no es válido.' using errcode = 'SV007';
  end if;

  if not v_tienda.autorregistro then
    raise exception 'El registro desde esta tienda está desactivado por el momento.'
      using errcode = 'SV008';
  end if;

  v_contacto_id := smartvale.fn_obtener_o_crear_contacto(p_nombre, p_telefono, p_correo);

  -- ¿Ya tiene un vale vigente de esta tienda? Se le devuelve el mismo.
  select * into v_existente
    from smartvale.vales
   where contacto_id = v_contacto_id
     and tienda_id = v_tienda.id
     and autorregistro
     and not anulado
     and fecha_vencimiento > now()
   order by fecha_emision desc
   limit 1;

  if found then
    return v_existente;
  end if;

  perform pg_advisory_xact_lock(825003, v_tienda.id::integer);

  update smartvale.tiendas
     set correlativo_a3 = correlativo_a3 + 1
   where id = v_tienda.id
  returning correlativo_a3 into v_correlativo;

  v_descuento := smartvale.fn_descuento_de('A3', null);
  v_dias      := smartvale.fn_config('dias_vigencia_vale', 30)::integer;

  insert into smartvale.vales (
    codigo, tipo, correlativo, usuario_id, rango_id, contacto_id,
    tienda_id, descuento_pct, fecha_vencimiento, autorregistro
  )
  values (
    'AR-A3-' || smartvale.fn_prefijo_tienda(v_tienda.id)
             || '-' || lpad(v_correlativo::text, 5, '0'),
    'A3', v_correlativo, null, null, v_contacto_id,
    v_tienda.id, v_descuento, now() + make_interval(days => v_dias), true
  )
  returning * into v_vale;

  return v_vale;
end;
$$;


-- ═══ Vista de detalle: la vendedora ahora puede faltar ═══════════════════
-- Mismas columnas y mismo orden; solo cambia el JOIN y se añade una al final.

create or replace view smartvale.vw_vales_detalle as
select
  v.id,
  v.codigo,
  v.tipo,
  v.correlativo,
  v.segmento,
  v.origen,
  v.descuento_pct,
  v.fecha_emision,
  v.fecha_vencimiento,
  v.anulado,
  v.motivo_anulacion,
  v.fecha_creacion,
  case
    when v.anulado                   then 'anulado'
    when now() > v.fecha_vencimiento then 'vencido'
    else 'activo'
  end as estado,
  v.usuario_id,
  u.nombre  as emisora,
  v.contacto_id,
  c.nombre   as portador,
  c.telefono as portador_telefono,
  c.correo   as portador_correo,
  v.tienda_id,
  t.nombre as tienda,
  coalesce(r.total, 0)     as total_redenciones,
  coalesce(r.monto, 0)     as ingreso_generado,
  coalesce(r.descuento, 0) as descuento_otorgado,
  r.ultima                 as ultima_redencion,
  v.token,
  extract(
    day from (date_trunc('day', v.fecha_vencimiento) - date_trunc('day', now()))
  )::integer                as dias_restantes,
  coalesce(r.difundidas, 0) as redenciones_difundidas,
  v.autorregistro
from smartvale.vales v
join smartvale.contactos c on c.id = v.contacto_id
left join smartvale.usuarios u on u.id = v.usuario_id
left join smartvale.tiendas  t on t.id = v.tienda_id
left join lateral (
  select
    count(*)::integer                                            as total,
    count(*) filter (where rd.referido_por is not null)::integer as difundidas,
    sum(rd.monto_compra)                                         as monto,
    sum(rd.descuento_aplicado)                                   as descuento,
    max(rd.fecha_creacion)                                       as ultima
  from smartvale.redenciones rd
  where rd.vale_id = v.id
) r on true;


-- ═══ Validación: la emisora puede faltar ═════════════════════════════════

drop function if exists smartvale.fn_validar_vale(text);

create function smartvale.fn_validar_vale(p_codigo text)
returns table (
  vale_id            bigint,
  codigo             text,
  token              text,
  tipo               smartvale.tipo_vale,
  segmento           smartvale.segmento_a1,
  descuento_pct      numeric,
  portador           text,
  portador_telefono  text,
  emisora            text,
  fecha_emision      timestamptz,
  fecha_vencimiento  timestamptz,
  estado             text,
  redimible          boolean,
  total_redenciones  integer
)
language sql
stable
set search_path = ''
as $$
  select
    d.id, d.codigo, d.token, d.tipo, d.segmento, d.descuento_pct,
    d.portador, d.portador_telefono,
    coalesce(d.emisora, 'Autorregistro'),
    d.fecha_emision, d.fecha_vencimiento, d.estado,
    d.estado = 'activo',
    d.total_redenciones
  from smartvale.vw_vales_detalle d
  where upper(btrim(d.codigo)) = upper(btrim(p_codigo));
$$;


-- ═══ Cupo: A1 ya no lo consume ═══════════════════════════════════════════

comment on column smartvale.rangos.correlativo_actual is
  'Próximo correlativo a asignar para A2 y A3. A1 usa la secuencia de la vendedora.';


-- ═══ Privilegios ═════════════════════════════════════════════════════════

revoke execute on function
  smartvale.fn_prefijo_vendedora(bigint),
  smartvale.fn_prefijo_tienda(bigint),
  smartvale.fn_autorregistro_a3(text, text, text, text),
  smartvale.fn_validar_vale(text)
from public, anon, authenticated;

grant execute on function
  smartvale.fn_prefijo_vendedora(bigint),
  smartvale.fn_prefijo_tienda(bigint),
  smartvale.fn_autorregistro_a3(text, text, text, text),
  smartvale.fn_validar_vale(text)
to service_role;

revoke all on smartvale.vw_vales_detalle from public, anon, authenticated;
grant select on smartvale.vw_vales_detalle to service_role;
