-- ─────────────────────────────────────────────────────────────────────────
-- ARIGA SMART VALE — descuento por material
--
-- La campaña pasa a ser de boca en boca, con la misma oferta para todos: no
-- hay razón para que un A1-VIP lleve más descuento que un visitante. Lo que
-- ahora diferencia el descuento no es el cliente sino la pieza:
--
--     20% en oro      ·      40% en plata
--
-- Eso cambia el modelo en dos sitios. El vale congela DOS porcentajes en vez
-- de uno, y la caja captura cuánto de la compra fue oro y cuánto plata, para
-- poder calcular el descuento y —sobre todo— para saber después qué material
-- movió la campaña.
--
-- La clasificación A1-30/60/90/VIP se conserva: sigue siendo información
-- comercial útil aunque ya no cambie el descuento.
-- ─────────────────────────────────────────────────────────────────────────

-- ═══ Tarifas globales ════════════════════════════════════════════════════

insert into smartvale.configuracion (clave, valor, tipo_dato, grupo, descripcion)
values
  ('descuento_oro',   '20', 'numero', 'descuentos', '% de descuento sobre piezas de oro'),
  ('descuento_plata', '40', 'numero', 'descuentos', '% de descuento sobre piezas de plata')
on conflict (clave) do update set valor = excluded.valor;

-- Las tarifas por tipo y segmento dejan de usarse: la oferta es la misma
-- para todos. Se retiran para que la pantalla de configuración no muestre
-- números que ya no gobiernan nada.
delete from smartvale.configuracion
 where clave in ('descuento_a1_30', 'descuento_a1_60', 'descuento_a1_90',
                 'descuento_a1_vip', 'descuento_a2', 'descuento_a3');


-- ═══ El vale congela las dos tarifas ═════════════════════════════════════

alter table smartvale.vales
  add column if not exists descuento_oro_pct   numeric(5, 2),
  add column if not exists descuento_plata_pct numeric(5, 2);

-- Los vales ya emitidos prometieron un único porcentaje en su tarjeta: se
-- respeta para los dos materiales, que es lo que el cliente leyó.
update smartvale.vales
   set descuento_oro_pct   = coalesce(descuento_oro_pct, descuento_pct),
       descuento_plata_pct = coalesce(descuento_plata_pct, descuento_pct)
 where descuento_oro_pct is null or descuento_plata_pct is null;

alter table smartvale.vales
  alter column descuento_oro_pct   set not null,
  alter column descuento_plata_pct set not null;

alter table smartvale.vales
  drop constraint if exists vales_descuentos_en_rango;
alter table smartvale.vales
  add constraint vales_descuentos_en_rango
  check (descuento_oro_pct between 0 and 100
     and descuento_plata_pct between 0 and 100);

comment on column smartvale.vales.descuento_pct is
  'Tarifa base heredada. Se mantiene igual a la de oro; los dos porcentajes vivos son descuento_oro_pct y descuento_plata_pct.';


-- ═══ La caja reparte la compra por material ══════════════════════════════

alter table smartvale.redenciones
  add column if not exists monto_oro   numeric(12, 2) not null default 0,
  add column if not exists monto_plata numeric(12, 2) not null default 0;

alter table smartvale.redenciones
  drop constraint if exists redenciones_materiales_coherentes;
alter table smartvale.redenciones
  add constraint redenciones_materiales_coherentes
  check (
    monto_oro >= 0
    and monto_plata >= 0
    -- Una compra puede llevar piezas que no son ni oro ni plata: la suma de
    -- ambas partes no tiene por qué llegar al total, pero nunca pasarlo.
    and monto_oro + monto_plata <= monto_compra
  );

comment on column smartvale.redenciones.monto_oro is
  'Parte de la compra en piezas de oro, la que recibe el descuento de oro.';
comment on column smartvale.redenciones.monto_plata is
  'Parte de la compra en piezas de plata. El resto del total no lleva descuento.';


-- ═══ Tarifas vigentes ════════════════════════════════════════════════════

-- Sustituye a fn_descuento_de, que resolvía por tipo y segmento.
create or replace function smartvale.fn_tarifas_vigentes(
  out oro numeric,
  out plata numeric
)
language sql
stable
set search_path = ''
as $$
  select
    smartvale.fn_config('descuento_oro', 20),
    smartvale.fn_config('descuento_plata', 40);
$$;


-- ═══ Emisión: congela las dos ════════════════════════════════════════════

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
  v_oro         numeric;
  v_plata       numeric;
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

  perform pg_advisory_xact_lock(825001, p_usuario_id::integer);

  if p_tipo = 'A1' then
    update smartvale.usuarios
       set correlativo_a1 = correlativo_a1 + 1
     where id = p_usuario_id
    returning correlativo_a1 into v_correlativo;

    v_codigo := 'AR-A1-'
             || smartvale.fn_prefijo_vendedora(p_usuario_id)
             || '-' || lpad(v_correlativo::text, 5, '0');
    v_rango_id := null;
  else
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
  select oro, plata into v_oro, v_plata from smartvale.fn_tarifas_vigentes();
  v_dias      := smartvale.fn_config('dias_vigencia_vale', 30)::integer;
  v_tienda_id := coalesce(p_tienda_id, v_usuario.tienda_id);

  if p_tipo = 'A3' and v_tienda_id is null then
    raise exception 'Un vale A3 necesita el punto de venta. Selecciónalo o asigna una tienda a la cuenta.'
      using errcode = 'SV006';
  end if;

  insert into smartvale.vales (
    codigo, tipo, correlativo, usuario_id, rango_id, contacto_id,
    segmento, origen, tienda_id,
    descuento_pct, descuento_oro_pct, descuento_plata_pct,
    fecha_vencimiento
  )
  values (
    v_codigo, p_tipo, v_correlativo, p_usuario_id, v_rango_id, v_contacto_id,
    p_segmento, nullif(btrim(coalesce(p_origen, '')), ''), v_tienda_id,
    v_oro, v_oro, v_plata,
    now() + make_interval(days => v_dias)
  )
  returning * into v_vale;

  return v_vale;
end;
$$;


-- ═══ Autorregistro: mismas tarifas ═══════════════════════════════════════

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
  v_oro         numeric;
  v_plata       numeric;
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

  select oro, plata into v_oro, v_plata from smartvale.fn_tarifas_vigentes();
  v_dias := smartvale.fn_config('dias_vigencia_vale', 30)::integer;

  insert into smartvale.vales (
    codigo, tipo, correlativo, usuario_id, rango_id, contacto_id,
    tienda_id, descuento_pct, descuento_oro_pct, descuento_plata_pct,
    fecha_vencimiento, autorregistro
  )
  values (
    'AR-A3-' || smartvale.fn_prefijo_tienda(v_tienda.id)
             || '-' || lpad(v_correlativo::text, 5, '0'),
    'A3', v_correlativo, null, null, v_contacto_id,
    v_tienda.id, v_oro, v_oro, v_plata,
    now() + make_interval(days => v_dias), true
  )
  returning * into v_vale;

  return v_vale;
end;
$$;


-- ═══ Redención: reparto por material ═════════════════════════════════════

drop function if exists smartvale.fn_registrar_redencion(
  text, bigint, bigint, text, text, text, numeric, text, numeric, text, text);

create function smartvale.fn_registrar_redencion(
  p_codigo       text,
  p_usuario_id   bigint,
  p_tienda_id    bigint,
  p_nombre       text,
  p_telefono     text,
  p_correo       text default null,
  p_monto        numeric default null,
  p_ticket       text default null,
  p_descuento    numeric default null,
  p_nota         text default null,
  p_referido_por text default null,
  p_monto_oro    numeric default 0,
  p_monto_plata  numeric default 0
)
returns smartvale.redenciones
language plpgsql
set search_path = ''
as $$
declare
  v_vale        smartvale.vales%rowtype;
  v_contacto_id bigint;
  v_oro         numeric := coalesce(p_monto_oro, 0);
  v_plata       numeric := coalesce(p_monto_plata, 0);
  v_descuento   numeric;
  v_redencion   smartvale.redenciones%rowtype;
begin
  select * into v_vale
    from smartvale.vales
   where upper(btrim(codigo)) = upper(btrim(p_codigo));

  if not found then
    raise exception 'El vale % no existe.', p_codigo using errcode = 'SV002';
  end if;

  if v_vale.anulado then
    raise exception 'El vale % está anulado.', v_vale.codigo using errcode = 'SV004';
  end if;

  if now() > v_vale.fecha_vencimiento then
    raise exception 'El vale % venció el %.',
      v_vale.codigo, to_char(v_vale.fecha_vencimiento, 'DD/MM/YYYY')
      using errcode = 'SV003';
  end if;

  if not exists (select 1 from smartvale.usuarios where id = p_usuario_id and activo) then
    raise exception 'La cuenta no existe o está desactivada.' using errcode = 'SV005';
  end if;

  if v_oro + v_plata > p_monto then
    raise exception 'Lo de oro y plata suma más que el total de la compra.'
      using errcode = 'SV006';
  end if;

  v_contacto_id := smartvale.fn_obtener_o_crear_contacto(p_nombre, p_telefono, p_correo);

  -- Cada material con su tarifa congelada. Lo que no sea oro ni plata no
  -- lleva descuento.
  v_descuento := coalesce(
    p_descuento,
    round(v_oro   * v_vale.descuento_oro_pct   / 100, 2)
  + round(v_plata * v_vale.descuento_plata_pct / 100, 2)
  );

  insert into smartvale.redenciones (
    vale_id, usuario_id, tienda_id, contacto_id,
    monto_compra, monto_oro, monto_plata,
    descuento_aplicado, ticket, nota, referido_por
  )
  values (
    v_vale.id, p_usuario_id, p_tienda_id, v_contacto_id,
    p_monto, v_oro, v_plata,
    v_descuento, btrim(p_ticket),
    nullif(btrim(coalesce(p_nota, '')), ''),
    nullif(btrim(coalesce(p_referido_por, '')), '')
  )
  returning * into v_redencion;

  return v_redencion;
end;
$$;


-- ═══ Vistas: se añaden las columnas al final ═════════════════════════════

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
  v.autorregistro,
  v.descuento_oro_pct,
  v.descuento_plata_pct,
  coalesce(r.oro, 0)   as ingreso_oro,
  coalesce(r.plata, 0) as ingreso_plata
from smartvale.vales v
join smartvale.contactos c on c.id = v.contacto_id
left join smartvale.usuarios u on u.id = v.usuario_id
left join smartvale.tiendas  t on t.id = v.tienda_id
left join lateral (
  select
    count(*)::integer                                            as total,
    count(*) filter (where rd.referido_por is not null)::integer as difundidas,
    sum(rd.monto_compra)                                         as monto,
    sum(rd.monto_oro)                                            as oro,
    sum(rd.monto_plata)                                          as plata,
    sum(rd.descuento_aplicado)                                   as descuento,
    max(rd.fecha_creacion)                                       as ultima
  from smartvale.redenciones rd
  where rd.vale_id = v.id
) r on true;


-- La vista equivalente, para que función y vista digan lo mismo. Las dos
-- columnas van al final: `create or replace view` solo permite añadir.
create or replace view smartvale.vw_metricas_generales as
select
  count(*)::integer                                              as vales_emitidos,
  count(*) filter (where estado = 'activo')::integer             as vales_activos,
  count(*) filter (where estado = 'vencido')::integer            as vales_vencidos,
  count(*) filter (where estado = 'anulado')::integer            as vales_anulados,
  coalesce(sum(total_redenciones), 0)::integer                   as redenciones,
  count(*) filter (where total_redenciones > 0)::integer         as vales_con_compra,
  round(
    100.0 * count(*) filter (where total_redenciones > 0)
          / nullif(count(*), 0)
  , 2)                                                           as tasa_conversion,
  coalesce(sum(ingreso_generado), 0)                             as ingreso_total,
  round(
    coalesce(sum(ingreso_generado), 0)
    / nullif(sum(total_redenciones), 0)
  , 2)                                                           as ticket_promedio,
  coalesce(sum(descuento_otorgado), 0)                           as descuento_total,
  round(
    100.0 * coalesce(sum(descuento_otorgado), 0)
          / nullif(sum(ingreso_generado), 0)
  , 2)                                                           as descuento_sobre_venta,
  coalesce(sum(ingreso_oro), 0)                                  as ingreso_oro,
  coalesce(sum(ingreso_plata), 0)                                as ingreso_plata
from smartvale.vw_vales_detalle;


-- Métricas generales: se añade el reparto por material al final.
-- Con `create or replace` no basta: cambiar las columnas de un `returns
-- table` cambia el tipo de retorno y Postgres lo rechaza (42P13).
drop function if exists smartvale.fn_metricas(bigint);

create function smartvale.fn_metricas(p_usuario_id bigint default null)
returns table (
  vales_emitidos        integer,
  vales_activos         integer,
  vales_vencidos        integer,
  vales_anulados        integer,
  redenciones           integer,
  vales_con_compra      integer,
  tasa_conversion       numeric,
  ingreso_total         numeric,
  ticket_promedio       numeric,
  descuento_total       numeric,
  descuento_sobre_venta numeric,
  ingreso_oro           numeric,
  ingreso_plata         numeric
)
language sql
stable
set search_path = ''
as $$
  select
    count(*)::integer,
    count(*) filter (where d.estado = 'activo')::integer,
    count(*) filter (where d.estado = 'vencido')::integer,
    count(*) filter (where d.estado = 'anulado')::integer,
    coalesce(sum(d.total_redenciones), 0)::integer,
    count(*) filter (where d.total_redenciones > 0)::integer,
    round(100.0 * count(*) filter (where d.total_redenciones > 0)
                / nullif(count(*), 0), 2),
    coalesce(sum(d.ingreso_generado), 0),
    round(coalesce(sum(d.ingreso_generado), 0)
          / nullif(sum(d.total_redenciones), 0), 2),
    coalesce(sum(d.descuento_otorgado), 0),
    round(100.0 * coalesce(sum(d.descuento_otorgado), 0)
                / nullif(sum(d.ingreso_generado), 0), 2),
    coalesce(sum(d.ingreso_oro), 0),
    coalesce(sum(d.ingreso_plata), 0)
  from smartvale.vw_vales_detalle d
  where p_usuario_id is null or d.usuario_id = p_usuario_id;
$$;


-- ═══ Validación: la caja necesita las dos tarifas ════════════════════════

-- En caja se teclea cuánto fue de oro y cuánto de plata, así que la pantalla
-- de redención tiene que saber los dos porcentajes congelados en el vale.

drop function if exists smartvale.fn_validar_vale(text);

create function smartvale.fn_validar_vale(p_codigo text)
returns table (
  vale_id             bigint,
  codigo              text,
  token               text,
  tipo                smartvale.tipo_vale,
  segmento            smartvale.segmento_a1,
  descuento_pct       numeric,
  portador            text,
  portador_telefono   text,
  emisora             text,
  fecha_emision       timestamptz,
  fecha_vencimiento   timestamptz,
  estado              text,
  redimible           boolean,
  total_redenciones   integer,
  descuento_oro_pct   numeric,
  descuento_plata_pct numeric
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
    d.total_redenciones,
    d.descuento_oro_pct, d.descuento_plata_pct
  from smartvale.vw_vales_detalle d
  where upper(btrim(d.codigo)) = upper(btrim(p_codigo));
$$;


-- ═══ Aviso de vencimiento: el recordatorio lleva las dos ═════════════════

drop function if exists smartvale.fn_vales_por_vencer(bigint, integer);

create function smartvale.fn_vales_por_vencer(
  p_usuario_id bigint default null,
  p_dias       integer default null
)
returns table (
  vale_id             bigint,
  codigo              text,
  token               text,
  tipo                smartvale.tipo_vale,
  descuento_pct       numeric,
  portador            text,
  portador_telefono   text,
  emisora             text,
  usuario_id          bigint,
  fecha_vencimiento   timestamptz,
  dias_restantes      integer,
  total_redenciones   integer,
  descuento_oro_pct   numeric,
  descuento_plata_pct numeric
)
language sql
stable
set search_path = ''
as $$
  select
    d.id, d.codigo, d.token, d.tipo, d.descuento_pct,
    d.portador, d.portador_telefono,
    -- Un A3 de autorregistro no tiene vendedora detrás.
    coalesce(d.emisora, 'Autorregistro'), d.usuario_id,
    d.fecha_vencimiento, d.dias_restantes, d.total_redenciones,
    d.descuento_oro_pct, d.descuento_plata_pct
  from smartvale.vw_vales_detalle d
  where d.estado = 'activo'
    and d.dias_restantes <= coalesce(
      p_dias,
      smartvale.fn_config('dias_aviso_vencimiento', 7)::integer
    )
    and (p_usuario_id is null or d.usuario_id = p_usuario_id)
  order by d.dias_restantes, d.total_redenciones, d.fecha_vencimiento;
$$;


-- ═══ Privilegios ═════════════════════════════════════════════════════════

revoke execute on function
  smartvale.fn_tarifas_vigentes(),
  smartvale.fn_metricas(bigint),
  smartvale.fn_validar_vale(text),
  smartvale.fn_vales_por_vencer(bigint, integer)
from public, anon, authenticated;

grant execute on function
  smartvale.fn_tarifas_vigentes(),
  smartvale.fn_metricas(bigint),
  smartvale.fn_validar_vale(text),
  smartvale.fn_vales_por_vencer(bigint, integer),
  smartvale.fn_registrar_redencion(text, bigint, bigint, text, text, text,
                                   numeric, text, numeric, text, text,
                                   numeric, numeric)
to service_role;

revoke all on smartvale.vw_vales_detalle, smartvale.vw_metricas_generales
  from public, anon, authenticated;
grant select on smartvale.vw_vales_detalle, smartvale.vw_metricas_generales
  to service_role;
