-- ─────────────────────────────────────────────────────────────────────────
-- ARIGA SMART VALE — A4: el referido que llega a tienda
--
-- REQUIERE haber corrido antes 20260814200000_tipo_a4.sql, en su propia
-- ejecución. Si no, todo lo de aquí falla al comparar contra 'A4'.
--
-- La cuarta puerta de entrada es el cliente que se presenta en tienda
-- porque alguien le enseñó su vale. Ese alguien tiene un A1 o un A2, y es
-- justo lo que hay que registrar: de quién viene.
--
-- Nomenclatura, igual que A1 —la campaña es boca en boca y no tiene sentido
-- que el referido consuma el bloque de la vendedora:
--
--     AR-A4-V012-00045     lo emite la vendedora en el mostrador
--     AR-A4-T003-00012     lo emitió el propio cliente desde el QR de tienda
--
-- El ciclo se cierra convirtiéndolo en cliente: una vez que compra, se le
-- emite su A1 y ese A1 apunta de vuelta al A4. Así queda toda la cadena:
--
--     A2 de Regina  →  A4 de Marta  →  A1 de Marta
--     (quien refirió)  (el referido)   (ya es cliente)
-- ─────────────────────────────────────────────────────────────────────────

-- ═══ Secuencias propias del A4 ═══════════════════════════════════════════

alter table smartvale.usuarios
  add column if not exists correlativo_a4 integer not null default 0;

alter table smartvale.tiendas
  add column if not exists correlativo_a4 integer not null default 0;

comment on column smartvale.usuarios.correlativo_a4 is
  'Secuencia propia de vales A4. Sin techo: el referido no consume bloque.';
comment on column smartvale.tiendas.correlativo_a4 is
  'Secuencia de A4 nacidos del QR de la tienda, cuando el cliente trae código.';


-- ═══ De qué vale viene este cliente ══════════════════════════════════════

alter table smartvale.vales
  add column if not exists vale_origen_id bigint references smartvale.vales (id);

comment on column smartvale.vales.vale_origen_id is
  'El vale que trajo a este cliente. Obligatorio en A4 (apunta al A1 o A2 del referidor) y opcional en A1 (apunta al A4 que se convirtió).';

create index if not exists vales_origen_idx
  on smartvale.vales (vale_origen_id)
  where vale_origen_id is not null;

-- Un A4 sin referidor sería un A3: el origen es lo que lo define.
alter table smartvale.vales
  drop constraint if exists vales_origen_obligatorio_en_a4;
alter table smartvale.vales
  add constraint vales_origen_obligatorio_en_a4
  check (tipo <> 'A4' or vale_origen_id is not null);

-- Y nunca puede referirse a sí mismo.
alter table smartvale.vales
  drop constraint if exists vales_origen_no_circular;
alter table smartvale.vales
  add constraint vales_origen_no_circular
  check (vale_origen_id is null or vale_origen_id <> id);

-- El A4 ocurre en el mostrador, así que siempre hay punto de venta.
alter table smartvale.vales
  drop constraint if exists vales_tienda_en_a4;
alter table smartvale.vales
  add constraint vales_tienda_en_a4
  check (tipo <> 'A4' or tienda_id is not null);


-- ═══ Resolver el vale del referidor ══════════════════════════════════════

-- Devuelve el vale al que apunta un código, comprobando que sirva como
-- origen. Un vale anulado no vale como referencia; uno vencido sí, porque
-- el referido ya ocurrió aunque la vigencia se haya acabado después.
create or replace function smartvale.fn_vale_referidor(
  p_codigo   text,
  p_para     smartvale.tipo_vale
)
returns smartvale.vales
language plpgsql
stable
set search_path = ''
as $$
declare
  v_origen smartvale.vales%rowtype;
begin
  select * into v_origen
    from smartvale.vales
   where upper(btrim(codigo)) = upper(btrim(p_codigo));

  if not found then
    raise exception 'El vale % del referidor no existe. Revisa el código.', btrim(p_codigo)
      using errcode = 'SV009';
  end if;

  if v_origen.anulado then
    raise exception 'El vale % está anulado y no sirve como referencia.', v_origen.codigo
      using errcode = 'SV009';
  end if;

  if p_para = 'A4' and v_origen.tipo not in ('A1', 'A2') then
    raise exception 'Un A4 solo puede venir de un vale A1 o A2. El % es %.',
      v_origen.codigo, v_origen.tipo
      using errcode = 'SV009';
  end if;

  if p_para = 'A1' and v_origen.tipo <> 'A4' then
    raise exception 'Solo un vale A4 se convierte en cliente. El % es %.',
      v_origen.codigo, v_origen.tipo
      using errcode = 'SV009';
  end if;

  return v_origen;
end;
$$;


-- ═══ Emisión: la vendedora registra al referido ══════════════════════════

create or replace function smartvale.fn_emitir_vale(
  p_usuario_id  bigint,
  p_tipo        smartvale.tipo_vale,
  p_nombre      text,
  p_telefono    text,
  p_correo      text default null,
  p_segmento    smartvale.segmento_a1 default null,
  p_origen      text default null,
  p_tienda_id   bigint default null,
  p_vale_origen text default null
)
returns smartvale.vales
language plpgsql
set search_path = ''
as $$
declare
  v_usuario     smartvale.usuarios%rowtype;
  v_rango       smartvale.rangos%rowtype;
  v_referidor   smartvale.vales%rowtype;
  v_origen_id   bigint;
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

  -- El referidor: obligatorio en A4, opcional en A1 (la conversión), y
  -- fuera de lugar en cualquier otro caso.
  if p_tipo = 'A4' and nullif(btrim(coalesce(p_vale_origen, '')), '') is null then
    raise exception 'Un vale A4 necesita el código del vale de quien lo refirió.'
      using errcode = 'SV006';
  end if;

  if p_tipo not in ('A1', 'A4')
     and nullif(btrim(coalesce(p_vale_origen, '')), '') is not null then
    raise exception 'Solo los vales A4 —y los A1 que nacen de convertir uno— llevan vale de origen.'
      using errcode = 'SV006';
  end if;

  if nullif(btrim(coalesce(p_vale_origen, '')), '') is not null then
    v_referidor := smartvale.fn_vale_referidor(p_vale_origen, p_tipo);
    v_origen_id := v_referidor.id;
  end if;

  perform pg_advisory_xact_lock(825001, p_usuario_id::integer);

  if p_tipo in ('A1', 'A4') then
    -- Secuencia propia de la vendedora, sin techo: ni la llamada a la base
    -- histórica ni el boca en boca se reparten en bloques numerados.
    if p_tipo = 'A1' then
      update smartvale.usuarios
         set correlativo_a1 = correlativo_a1 + 1
       where id = p_usuario_id
      returning correlativo_a1 into v_correlativo;
    else
      update smartvale.usuarios
         set correlativo_a4 = correlativo_a4 + 1
       where id = p_usuario_id
      returning correlativo_a4 into v_correlativo;
    end if;

    v_codigo := 'AR-' || p_tipo::text || '-'
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

  if p_tipo in ('A3', 'A4') and v_tienda_id is null then
    raise exception 'Un vale % necesita el punto de venta. Selecciónalo o asigna una tienda a la cuenta.',
      p_tipo using errcode = 'SV006';
  end if;

  insert into smartvale.vales (
    codigo, tipo, correlativo, usuario_id, rango_id, contacto_id,
    segmento, origen, tienda_id,
    descuento_pct, descuento_oro_pct, descuento_plata_pct,
    fecha_vencimiento, vale_origen_id
  )
  values (
    v_codigo, p_tipo, v_correlativo, p_usuario_id, v_rango_id, v_contacto_id,
    p_segmento, nullif(btrim(coalesce(p_origen, '')), ''), v_tienda_id,
    v_oro, v_oro, v_plata,
    now() + make_interval(days => v_dias), v_origen_id
  )
  returning * into v_vale;

  return v_vale;
end;
$$;


-- ═══ Autorregistro: con código sale A4, sin código sale A3 ═══════════════

create or replace function smartvale.fn_autorregistro_a3(
  p_token            text,
  p_nombre           text,
  p_telefono         text,
  p_correo           text default null,
  p_codigo_referidor text default null
)
returns smartvale.vales
language plpgsql
set search_path = ''
as $$
declare
  v_tienda      smartvale.tiendas%rowtype;
  v_contacto_id bigint;
  v_existente   smartvale.vales%rowtype;
  v_referidor   smartvale.vales%rowtype;
  v_origen_id   bigint;
  v_tipo        smartvale.tipo_vale;
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

  -- Lo que decide la puerta: si el cliente escribió el código del vale que
  -- le enseñaron, entra como referido; si no, como visitante.
  if nullif(btrim(coalesce(p_codigo_referidor, '')), '') is not null then
    v_referidor := smartvale.fn_vale_referidor(p_codigo_referidor, 'A4');
    v_origen_id := v_referidor.id;
    v_tipo      := 'A4';
  else
    v_tipo := 'A3';
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
    -- Ya tiene un vale vivo en esta tienda: darle otro sería regalarle dos
    -- descuentos por el mismo registro. Pero si esta vez sí trajo código y
    -- el vale que tiene no sabía de dónde venía, se le anota el origen: el
    -- dato del referidor es lo que da valor a la puerta.
    if v_origen_id is not null and v_existente.vale_origen_id is null then
      update smartvale.vales
         set vale_origen_id = v_origen_id
       where id = v_existente.id
      returning * into v_existente;
    end if;

    return v_existente;
  end if;

  perform pg_advisory_xact_lock(825003, v_tienda.id::integer);

  if v_tipo = 'A4' then
    update smartvale.tiendas
       set correlativo_a4 = correlativo_a4 + 1
     where id = v_tienda.id
    returning correlativo_a4 into v_correlativo;
  else
    update smartvale.tiendas
       set correlativo_a3 = correlativo_a3 + 1
     where id = v_tienda.id
    returning correlativo_a3 into v_correlativo;
  end if;

  select oro, plata into v_oro, v_plata from smartvale.fn_tarifas_vigentes();
  v_dias := smartvale.fn_config('dias_vigencia_vale', 30)::integer;

  insert into smartvale.vales (
    codigo, tipo, correlativo, usuario_id, rango_id, contacto_id,
    tienda_id, descuento_pct, descuento_oro_pct, descuento_plata_pct,
    fecha_vencimiento, autorregistro, vale_origen_id
  )
  values (
    'AR-' || v_tipo::text || '-' || smartvale.fn_prefijo_tienda(v_tienda.id)
          || '-' || lpad(v_correlativo::text, 5, '0'),
    v_tipo, v_correlativo, null, null, v_contacto_id,
    v_tienda.id, v_oro, v_oro, v_plata,
    now() + make_interval(days => v_dias), true, v_origen_id
  )
  returning * into v_vale;

  return v_vale;
end;
$$;


-- ═══ Vistas: quién refirió y qué salió de ahí ════════════════════════════

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
  coalesce(r.plata, 0) as ingreso_plata,

  -- ── Cadena de referidos ──
  v.vale_origen_id,
  o.codigo   as origen_codigo,
  o.tipo     as origen_tipo,
  oc.nombre  as referidor,
  coalesce(h.referidos, 0)  as referidos,
  coalesce(h.convertidos, 0) as referidos_convertidos,
  -- Un A4 está "convertido" cuando ya se le emitió su A1.
  coalesce(h.convertidos, 0) > 0 as convertido
from smartvale.vales v
join smartvale.contactos c on c.id = v.contacto_id
left join smartvale.usuarios u on u.id = v.usuario_id
left join smartvale.tiendas  t on t.id = v.tienda_id
left join smartvale.vales    o on o.id = v.vale_origen_id
left join smartvale.contactos oc on oc.id = o.contacto_id
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
) r on true
left join lateral (
  select
    count(*)::integer                                  as referidos,
    count(*) filter (where hv.tipo = 'A1')::integer    as convertidos
  from smartvale.vales hv
  where hv.vale_origen_id = v.id
) h on true;


-- Desempeño por vendedora: el A4 al final, que es donde se puede añadir.
create or replace view smartvale.vw_desempeno_vendedoras as
with emision as (
  select
    d.usuario_id,
    count(*)::integer                                        as vales_emitidos,
    count(*) filter (where d.tipo = 'A1')::integer           as vales_a1,
    count(*) filter (where d.tipo = 'A2')::integer           as vales_a2,
    count(*) filter (where d.tipo = 'A3')::integer           as vales_a3,
    count(*) filter (where d.tipo = 'A4')::integer           as vales_a4,
    count(*) filter (where d.estado = 'activo')::integer     as vales_vigentes,
    count(*) filter (where d.estado = 'vencido')::integer    as vales_vencidos,
    count(*) filter (where d.estado = 'anulado')::integer    as vales_anulados,
    count(*) filter (where d.total_redenciones > 0)::integer as vales_con_compra,
    coalesce(sum(d.total_redenciones), 0)::integer           as redenciones,
    coalesce(sum(d.ingreso_generado), 0)                     as ingreso_generado,
    coalesce(sum(d.descuento_otorgado), 0)                   as descuento_otorgado,
    max(d.fecha_creacion)                                    as ultima_emision,
    max(d.ultima_redencion)                                  as ultima_venta
  from smartvale.vw_vales_detalle d
  group by d.usuario_id
),
cupo as (
  select
    r.usuario_id,
    count(*)::integer                                                     as bloques,
    coalesce(sum(r.rango_fin - r.rango_inicio + 1), 0)::integer           as correlativos_asignados,
    coalesce(sum(r.correlativo_actual - r.rango_inicio), 0)::integer      as correlativos_usados,
    coalesce(sum(greatest(r.rango_fin - r.correlativo_actual + 1, 0)), 0)::integer as correlativos_restantes
  from smartvale.rangos r
  where r.activo
  group by r.usuario_id
)
select
  u.id                                   as usuario_id,
  u.nombre                               as vendedora,
  u.correo,
  u.rol::text                            as rol,
  u.activo,
  t.nombre                               as tienda,
  u.ultimo_acceso,

  coalesce(e.vales_emitidos, 0)          as vales_emitidos,
  coalesce(e.vales_a1, 0)                as vales_a1,
  coalesce(e.vales_a2, 0)                as vales_a2,
  coalesce(e.vales_a3, 0)                as vales_a3,
  coalesce(e.vales_vigentes, 0)          as vales_vigentes,
  coalesce(e.vales_vencidos, 0)          as vales_vencidos,
  coalesce(e.vales_anulados, 0)          as vales_anulados,

  coalesce(e.vales_con_compra, 0)        as vales_con_compra,
  coalesce(e.redenciones, 0)             as redenciones,
  round(
    100.0 * coalesce(e.vales_con_compra, 0) / nullif(e.vales_emitidos, 0)
  , 2)                                   as tasa_conversion,
  round(
    coalesce(e.redenciones, 0)::numeric / nullif(e.vales_emitidos, 0)
  , 2)                                   as redenciones_por_vale,

  coalesce(e.ingreso_generado, 0)        as ingreso_generado,
  round(
    coalesce(e.ingreso_generado, 0) / nullif(e.redenciones, 0)
  , 2)                                   as ticket_promedio,
  coalesce(e.descuento_otorgado, 0)      as descuento_otorgado,
  round(
    100.0 * coalesce(e.descuento_otorgado, 0) / nullif(e.ingreso_generado, 0)
  , 2)                                   as descuento_sobre_venta,
  round(
    coalesce(e.ingreso_generado, 0) / nullif(e.vales_emitidos, 0)
  , 2)                                   as venta_por_vale,

  coalesce(c.bloques, 0)                 as bloques,
  coalesce(c.correlativos_asignados, 0)  as correlativos_asignados,
  coalesce(c.correlativos_usados, 0)     as correlativos_usados,
  coalesce(c.correlativos_restantes, 0)  as correlativos_restantes,

  e.ultima_emision,
  e.ultima_venta,

  -- ── Columna nueva, al final ──
  coalesce(e.vales_a4, 0)                as vales_a4
from smartvale.usuarios u
left join smartvale.tiendas t on t.id = u.tienda_id
left join emision e on e.usuario_id = u.id
left join cupo    c on c.usuario_id = u.id;


-- Las ocho columnas de siempre, calculadas igual pero con `filter` en vez
-- del `where tipo = 'A2'`: la vista ya no puede acotarse a los A2 porque
-- las columnas nuevas cuentan A4. Lo nuevo va al final, que es lo único
-- que `create or replace view` permite añadir.
create or replace view smartvale.vw_viralidad_a2 as
select
  count(*) filter (where d.tipo = 'A2')::integer                as vales_a2,
  coalesce(sum(d.total_redenciones)
           filter (where d.tipo = 'A2'), 0)::integer            as redenciones_a2,
  round(
    coalesce(sum(d.total_redenciones) filter (where d.tipo = 'A2'), 0)::numeric
    / nullif(count(*) filter (where d.tipo = 'A2'), 0)
  , 2)                                                          as redenciones_por_vale,
  max(d.total_redenciones) filter (where d.tipo = 'A2')         as alcance_maximo,
  count(*) filter (where d.tipo = 'A2'
                     and d.total_redenciones > 1)::integer      as vales_compartidos,
  coalesce(sum(d.ingreso_generado)
           filter (where d.tipo = 'A2'), 0)                     as ingreso_a2,
  coalesce(sum(d.redenciones_difundidas)
           filter (where d.tipo = 'A2'), 0)::integer            as redenciones_difundidas,
  round(
    100.0 * coalesce(sum(d.redenciones_difundidas) filter (where d.tipo = 'A2'), 0)
          / nullif(sum(d.total_redenciones) filter (where d.tipo = 'A2'), 0)
  , 2)                                                          as porcentaje_difusion,

  -- ── Columnas nuevas: el A4 es la señal fuerte. Compartir el vale deja
  --    una redención; traer a alguien que se registra deja una persona. ──
  count(*) filter (where d.tipo = 'A4')::integer                as referidos_a4,
  count(*) filter (where d.tipo = 'A4'
                     and d.convertido)::integer                 as referidos_convertidos,
  coalesce(sum(d.ingreso_generado)
           filter (where d.tipo = 'A4'), 0)                     as ingreso_a4,
  -- De los A4, cuántos vienen de un A2 y cuántos de un A1.
  count(*) filter (where d.tipo = 'A4'
                     and d.origen_tipo = 'A2')::integer         as referidos_desde_a2,
  count(*) filter (where d.tipo = 'A4'
                     and d.origen_tipo = 'A1')::integer         as referidos_desde_a1
from smartvale.vw_vales_detalle d;


-- ═══ Validación: la caja ve de quién viene ═══════════════════════════════

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
  descuento_plata_pct numeric,
  referidor           text,
  origen_codigo       text
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
    d.descuento_oro_pct, d.descuento_plata_pct,
    d.referidor, d.origen_codigo
  from smartvale.vw_vales_detalle d
  where upper(btrim(d.codigo)) = upper(btrim(p_codigo));
$$;


-- ═══ Privilegios ═════════════════════════════════════════════════════════

revoke execute on function
  smartvale.fn_vale_referidor(text, smartvale.tipo_vale),
  smartvale.fn_emitir_vale(bigint, smartvale.tipo_vale, text, text, text,
                           smartvale.segmento_a1, text, bigint, text),
  smartvale.fn_autorregistro_a3(text, text, text, text, text),
  smartvale.fn_validar_vale(text)
from public, anon, authenticated;

grant execute on function
  smartvale.fn_vale_referidor(text, smartvale.tipo_vale),
  smartvale.fn_emitir_vale(bigint, smartvale.tipo_vale, text, text, text,
                           smartvale.segmento_a1, text, bigint, text),
  smartvale.fn_autorregistro_a3(text, text, text, text, text),
  smartvale.fn_validar_vale(text)
to service_role;

revoke all on
  smartvale.vw_vales_detalle,
  smartvale.vw_desempeno_vendedoras,
  smartvale.vw_viralidad_a2
from public, anon, authenticated;

grant select on
  smartvale.vw_vales_detalle,
  smartvale.vw_desempeno_vendedoras,
  smartvale.vw_viralidad_a2
to service_role;


-- ═══ Las firmas viejas quedan huérfanas ══════════════════════════════════

-- `create or replace function` con un parámetro nuevo al final crea una
-- sobrecarga en vez de sustituir. Si se quedan las dos, PostgREST no sabe
-- cuál llamar y responde 300 Multiple Choices.
drop function if exists smartvale.fn_emitir_vale(
  bigint, smartvale.tipo_vale, text, text, text,
  smartvale.segmento_a1, text, bigint);

drop function if exists smartvale.fn_autorregistro_a3(text, text, text, text);
