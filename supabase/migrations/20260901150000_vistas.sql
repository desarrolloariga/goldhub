-- ─────────────────────────────────────────────────────────────────────────
-- GOLD HUB SMART VALE — vistas de métricas e inteligencia comercial
--
-- El eje es la tienda, no la persona: aquí no hay vendedoras que comparar
-- entre sí, hay tiendas. El administrador las ve todas; una cuenta de tienda
-- filtra por la suya, y ese filtro lo pone la capa de servidor a partir de la
-- sesión —la base no puede, porque sin Supabase Auth no sabe quién pregunta—.
--
-- Todo importe es de oro: es el único material que se vende.
-- ─────────────────────────────────────────────────────────────────────────

-- ═══ Las vistas se rehacen desde cero ════════════════════════════════════
--
-- Por lo mismo que las funciones: `create or replace view` solo admite
-- AÑADIR columnas al final. Cambiar el orden, el nombre o el tipo de una que
-- ya estaba —como pasó al colgar el logotipo de la tienda en el vale— falla
-- con «cannot change name of view column».
--
-- Van con CASCADE porque unas leen de otras: `vw_metricas_generales` sale de
-- `vw_vales_detalle`. Todas se recrean unas líneas más abajo, así que el
-- CASCADE no se lleva nada que no vuelva.

do $$
declare
  v record;
begin
  for v in
    select table_name
      from information_schema.views
     where table_schema = 'smartvalehubgold'
  loop
    execute format('drop view if exists smartvalehubgold.%I cascade', v.table_name);
  end loop;
end
$$;


-- ═══ El vale, con todo lo que se le ha colgado ═══════════════════════════
--
-- Es la vista de la que cuelga casi todo lo demás. Los agregados van como
-- subconsultas laterales y no como joins con group by: un vale con tres
-- compras aparecería tres veces y todas las cuentas saldrían infladas.

create or replace view smartvalehubgold.vw_vales_detalle as
select
  v.id,
  v.codigo,
  v.token,
  v.tipo,
  v.correlativo,
  v.segmento,
  v.origen,
  v.descuento_oro_pct,
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
  -- Negativo si ya venció: la pantalla lo lee tal cual para decir «hace N».
  ceil(extract(epoch from v.fecha_vencimiento - now()) / 86400)::integer as dias_restantes,

  v.usuario_id,
  u.nombre as emisora,
  v.autorregistro,

  v.contacto_id,
  c.nombre   as portador,
  c.telefono as portador_telefono,
  c.correo   as portador_correo,

  v.tienda_id,
  t.nombre  as tienda,
  t.prefijo as tienda_prefijo,
  -- El logotipo viaja con el vale porque lo lleva impreso: el PNG y el PDF
  -- lo componen en el mismo render en el que leen el vale, y una segunda
  -- consulta por cada tarjeta compartida no la paga nadie.
  -- El teléfono con el que el cliente contacta a su asesora: va impreso en
  -- el segundo paso del vale. Nulo mientras la tienda no lo cargue, y
  -- entonces el paso se imprime con su texto de siempre.
  t.telefono            as tienda_telefono,
  t.logo_ruta           as tienda_logo_ruta,
  t.logo_actualizado_en as tienda_logo_actualizado_en,
  -- Cuándo cambió la tienda por última vez. El trigger de
  -- `fecha_actualizacion` salta con cualquier UPDATE, así que esta marca se
  -- mueve tanto al subir un logotipo como al renombrarla. De ella sale la
  -- versión que lleva la URL de la imagen del vale: sin algo así, la imagen
  -- se queda cacheada un día con el aspecto viejo.
  coalesce(t.fecha_actualizacion, t.fecha_creacion) as tienda_actualizada_en,

  coalesce(r.total, 0)::integer      as total_redenciones,
  coalesce(r.difundidas, 0)::integer as redenciones_difundidas,
  coalesce(r.ingreso, 0)             as ingreso_generado,
  coalesce(r.descuento, 0)           as descuento_otorgado,
  r.ultima                           as ultima_redencion,

  v.vale_origen_id,
  o.codigo   as origen_codigo,
  o.tipo     as origen_tipo,
  oc.nombre  as referidor,

  coalesce(ref.total, 0)::integer       as referidos,
  coalesce(ref.convertidos, 0)::integer as referidos_convertidos,
  -- Un A4 convertido ya tiene su A1 emitido a partir de él.
  exists (
    select 1 from smartvalehubgold.vales cv
     where cv.vale_origen_id = v.id and cv.tipo = 'A1'
  ) as convertido

from smartvalehubgold.vales v
join smartvalehubgold.contactos c on c.id = v.contacto_id
join smartvalehubgold.tiendas   t on t.id = v.tienda_id
left join smartvalehubgold.usuarios u on u.id = v.usuario_id
left join smartvalehubgold.vales     o  on o.id = v.vale_origen_id
left join smartvalehubgold.contactos oc on oc.id = o.contacto_id

left join lateral (
  select
    count(*)                                                as total,
    -- Compras que llegaron por difusión: las hizo alguien que no es el
    -- portador. Es lo que mide si un vale se está compartiendo.
    count(*) filter (where rr.contacto_id <> v.contacto_id) as difundidas,
    sum(rr.monto_oro)                                       as ingreso,
    sum(rr.descuento_aplicado)                              as descuento,
    max(rr.fecha_creacion)                                  as ultima
  from smartvalehubgold.redenciones rr
  where rr.vale_id = v.id
) r on true

left join lateral (
  select
    count(*) as total,
    count(*) filter (
      where exists (
        select 1 from smartvalehubgold.vales cv2
         where cv2.vale_origen_id = rv.id and cv2.tipo = 'A1'
      )
    ) as convertidos
  from smartvalehubgold.vales rv
  where rv.vale_origen_id = v.id
) ref on true;


-- ═══ Resumen general ═════════════════════════════════════════════════════

create or replace view smartvalehubgold.vw_metricas_generales as
select
  count(*)::integer                                          as vales_emitidos,
  count(*) filter (where d.estado = 'activo')::integer       as vales_activos,
  count(*) filter (where d.estado = 'vencido')::integer      as vales_vencidos,
  count(*) filter (where d.estado = 'anulado')::integer      as vales_anulados,
  coalesce(sum(d.total_redenciones), 0)::integer             as redenciones,
  count(*) filter (where d.total_redenciones > 0)::integer   as vales_con_compra,
  round(100.0 * count(*) filter (where d.total_redenciones > 0)
              / nullif(count(*), 0), 2)                      as tasa_conversion,
  coalesce(sum(d.ingreso_generado), 0)                       as ingreso_total,
  round(coalesce(sum(d.ingreso_generado), 0)
        / nullif(sum(d.total_redenciones), 0), 2)            as ticket_promedio,
  coalesce(sum(d.descuento_otorgado), 0)                     as descuento_total,
  round(100.0 * coalesce(sum(d.descuento_otorgado), 0)
              / nullif(sum(d.ingreso_generado), 0), 2)       as descuento_sobre_venta
from smartvalehubgold.vw_vales_detalle d;


-- Lo mismo, pero acotable a una tienda. La vista de arriba se queda porque
-- la portada del administrador la lee sin filtro y sale más barata.
create or replace function smartvalehubgold.fn_metricas(p_tienda_id bigint default null)
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
  descuento_sobre_venta numeric
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
                / nullif(sum(d.ingreso_generado), 0), 2)
  from smartvalehubgold.vw_vales_detalle d
  where p_tienda_id is null or d.tienda_id = p_tienda_id;
$$;


-- ═══ Por puerta de entrada ═══════════════════════════════════════════════

create or replace view smartvalehubgold.vw_vales_por_tipo as
select
  d.tipo,
  count(*)::integer                                        as vales,
  coalesce(sum(d.total_redenciones), 0)::integer           as redenciones,
  count(*) filter (where d.total_redenciones > 0)::integer as vales_con_compra,
  round(100.0 * count(*) filter (where d.total_redenciones > 0)
              / nullif(count(*), 0), 2)                    as tasa_conversion,
  coalesce(sum(d.ingreso_generado), 0)                     as ingreso,
  coalesce(sum(d.descuento_otorgado), 0)                   as descuento
from smartvalehubgold.vw_vales_detalle d
group by d.tipo
order by d.tipo;


-- ═══ Desempeño por tienda ════════════════════════════════════════════════
--
-- La ficha completa de una tienda: qué emitió, cuánto convirtió y cuánto
-- vendió. Sustituye al desempeño por vendedora del modelo del que nace, y no
-- lleva cupos: sin bloques de correlativos no hay nada que se agote.

create or replace view smartvalehubgold.vw_desempeno_tiendas as
select
  t.id      as tienda_id,
  t.nombre  as tienda,
  t.prefijo,
  t.activo,
  t.logo_ruta is not null as tiene_logo,
  u.nombre  as cuenta,
  u.correo  as cuenta_correo,
  u.ultimo_acceso,
  t.correlativo as correlativo_actual,

  count(d.id)::integer                                   as vales_emitidos,
  count(*) filter (where d.tipo = 'A1')::integer         as vales_a1,
  count(*) filter (where d.tipo = 'A2')::integer         as vales_a2,
  count(*) filter (where d.tipo = 'A3')::integer         as vales_a3,
  count(*) filter (where d.tipo = 'A4')::integer         as vales_a4,
  count(*) filter (where d.estado = 'activo')::integer   as vales_vigentes,
  count(*) filter (where d.estado = 'vencido')::integer  as vales_vencidos,
  count(*) filter (where d.estado = 'anulado')::integer  as vales_anulados,

  count(*) filter (where d.total_redenciones > 0)::integer as vales_con_compra,
  coalesce(sum(d.total_redenciones), 0)::integer           as redenciones,
  round(100.0 * count(*) filter (where d.total_redenciones > 0)
              / nullif(count(d.id), 0), 2)                 as tasa_conversion,
  round(coalesce(sum(d.total_redenciones), 0)::numeric
        / nullif(count(d.id), 0), 2)                       as redenciones_por_vale,

  coalesce(sum(d.ingreso_generado), 0)                     as ingreso_generado,
  round(coalesce(sum(d.ingreso_generado), 0)
        / nullif(sum(d.total_redenciones), 0), 2)          as ticket_promedio,
  coalesce(sum(d.descuento_otorgado), 0)                   as descuento_otorgado,
  round(100.0 * coalesce(sum(d.descuento_otorgado), 0)
              / nullif(sum(d.ingreso_generado), 0), 2)     as descuento_sobre_venta,
  round(coalesce(sum(d.ingreso_generado), 0)
        / nullif(count(d.id), 0), 2)                       as venta_por_vale,

  max(d.fecha_emision)    as ultima_emision,
  max(d.ultima_redencion) as ultima_venta

from smartvalehubgold.tiendas t
left join smartvalehubgold.usuarios u
       on u.tienda_id = t.id and u.rol = 'tienda'
left join smartvalehubgold.vw_vales_detalle d on d.tienda_id = t.id
group by t.id, t.nombre, t.prefijo, t.activo, t.logo_ruta, t.correlativo,
         u.nombre, u.correo, u.ultimo_acceso;


-- ═══ Dónde se compró ═════════════════════════════════════════════════════
--
-- Por tienda de la COMPRA, que no tiene por qué ser la que emitió el vale:
-- un cliente puede recibirlo en una y redimirlo en otra, y ese cruce es
-- justo lo que interesa medir en una red de tiendas.

create or replace view smartvalehubgold.vw_ranking_tiendas as
select
  t.id     as tienda_id,
  t.nombre as tienda,
  count(r.id)::integer               as redenciones,
  count(distinct r.vale_id)::integer as vales_distintos,
  coalesce(sum(r.monto_oro), 0)      as ingreso,
  coalesce(sum(r.descuento_aplicado), 0) as descuento,
  round(coalesce(sum(r.monto_oro), 0) / nullif(count(r.id), 0), 2) as ticket_promedio
from smartvalehubgold.tiendas t
left join smartvalehubgold.redenciones r on r.tienda_id = t.id
group by t.id, t.nombre
order by 5 desc;


-- ═══ Contactos ═══════════════════════════════════════════════════════════
--
-- Una fila por persona, con su puerta de entrada —el primer vale— y todo lo
-- que ha hecho después, haya sido con ese vale o con otro.

create or replace view smartvalehubgold.vw_contactos_detalle as
select
  c.id       as contacto_id,
  c.nombre,
  c.telefono,
  c.correo,
  c.fecha_creacion as fecha_alta,

  pv.tipo,
  pv.codigo   as vale_codigo,
  pv.segmento,
  pv.origen,
  pv.tienda_id,
  pv.tienda,
  pv.usuario_id,
  pv.emisora,
  coalesce(pv.autorregistro, false) as autorregistro,
  pv.referidor,
  pv.origen_codigo,

  coalesce(v.total, 0)::integer     as vales,
  coalesce(v.a1, 0)::integer        as vales_a1,
  coalesce(v.a2, 0)::integer        as vales_a2,
  coalesce(v.a3, 0)::integer        as vales_a3,
  coalesce(v.a4, 0)::integer        as vales_a4,
  coalesce(v.vigentes, 0)::integer  as vales_vigentes,
  v.primero as primer_vale,
  v.ultimo  as ultimo_vale,

  coalesce(r.compras, 0)::integer as compras,
  coalesce(r.gastado, 0)          as gastado,
  coalesce(r.ahorrado, 0)         as ahorrado,
  r.ultima                        as ultima_compra,
  r.tienda_compra,

  coalesce(ref.total, 0)::integer as referidos

from smartvalehubgold.contactos c

-- La puerta de entrada: el primer vale que se le emitió. Nulo si solo
-- aparece como comprador del vale de otra persona.
left join lateral (
  select d.*
    from smartvalehubgold.vw_vales_detalle d
   where d.contacto_id = c.id
   order by d.fecha_emision
   limit 1
) pv on true

left join lateral (
  select
    count(*)                                       as total,
    count(*) filter (where vv.tipo = 'A1')         as a1,
    count(*) filter (where vv.tipo = 'A2')         as a2,
    count(*) filter (where vv.tipo = 'A3')         as a3,
    count(*) filter (where vv.tipo = 'A4')         as a4,
    count(*) filter (
      where not vv.anulado and vv.fecha_vencimiento > now()
    )                                              as vigentes,
    min(vv.fecha_emision)                          as primero,
    max(vv.fecha_emision)                          as ultimo
  from smartvalehubgold.vales vv
  where vv.contacto_id = c.id
) v on true

left join lateral (
  select
    count(*)                   as compras,
    sum(rr.monto_oro)          as gastado,
    sum(rr.descuento_aplicado) as ahorrado,
    max(rr.fecha_creacion)     as ultima,
    -- Dónde compró la última vez; puede no ser la tienda que lo captó.
    (select tt.nombre
       from smartvalehubgold.redenciones r2
       join smartvalehubgold.tiendas tt on tt.id = r2.tienda_id
      where r2.contacto_id = c.id
      order by r2.fecha_creacion desc
      limit 1) as tienda_compra
  from smartvalehubgold.redenciones rr
  where rr.contacto_id = c.id
) r on true

left join lateral (
  select count(*) as total
    from smartvalehubgold.vales rv
    join smartvalehubgold.vales ov on ov.id = rv.vale_origen_id
   where ov.contacto_id = c.id
) ref on true;


-- ═══ Difusión de los A2 ══════════════════════════════════════════════════
--
-- El A2 se reparte en frío para que se comparta. Esto mide si eso pasa: qué
-- parte de las compras vino de alguien distinto al portador, y cuántos
-- referidos acabaron con vale propio.

create or replace view smartvalehubgold.vw_viralidad_a2 as
select
  count(*) filter (where d.tipo = 'A2')::integer as vales_a2,
  coalesce(sum(d.total_redenciones) filter (where d.tipo = 'A2'), 0)::integer
    as redenciones_a2,
  coalesce(sum(d.redenciones_difundidas) filter (where d.tipo = 'A2'), 0)::integer
    as redenciones_difundidas,
  round(100.0 * coalesce(sum(d.redenciones_difundidas) filter (where d.tipo = 'A2'), 0)
              / nullif(sum(d.total_redenciones) filter (where d.tipo = 'A2'), 0), 2)
    as porcentaje_difusion,
  round(coalesce(sum(d.total_redenciones) filter (where d.tipo = 'A2'), 0)::numeric
        / nullif(count(*) filter (where d.tipo = 'A2'), 0), 2)
    as redenciones_por_vale,
  max(d.total_redenciones) filter (where d.tipo = 'A2') as alcance_maximo,
  count(*) filter (where d.tipo = 'A2' and d.redenciones_difundidas > 0)::integer
    as vales_compartidos,
  coalesce(sum(d.ingreso_generado) filter (where d.tipo = 'A2'), 0) as ingreso_a2,

  count(*) filter (where d.tipo = 'A4')::integer as referidos_a4,
  count(*) filter (where d.tipo = 'A4' and d.convertido)::integer as referidos_convertidos,
  coalesce(sum(d.ingreso_generado) filter (where d.tipo = 'A4'), 0) as ingreso_a4,
  count(*) filter (where d.tipo = 'A4' and d.origen_tipo = 'A2')::integer as referidos_desde_a2,
  count(*) filter (where d.tipo = 'A4' and d.origen_tipo = 'A1')::integer as referidos_desde_a1
from smartvalehubgold.vw_vales_detalle d;


-- ═══ Actividad diaria ════════════════════════════════════════════════════

create or replace view smartvalehubgold.vw_actividad_diaria as
with dias as (
  select (fecha_emision at time zone 'America/Guatemala')::date as dia,
         1 as emitido, 0 as redimido, 0::numeric as ingreso
    from smartvalehubgold.vales
  union all
  select (fecha_creacion at time zone 'America/Guatemala')::date,
         0, 1, monto_oro
    from smartvalehubgold.redenciones
)
select
  dia,
  sum(emitido)::integer  as vales_emitidos,
  sum(redimido)::integer as redenciones,
  coalesce(sum(ingreso), 0) as ingreso
from dias
group by dia
order by dia;


-- ═══ Tablero de ventas ═══════════════════════════════════════════════════
--
-- Una fila por compra, con el día, la hora y el día de semana ya resueltos en
-- hora de Guatemala. Las cuatro funciones de abajo se apoyan en ella y solo
-- cambian en cómo agrupan.

create or replace view smartvalehubgold.vw_ventas as
select
  r.id,
  r.vale_id,
  r.contacto_id,
  r.tienda_id,
  t.nombre as tienda,
  r.monto_oro,
  r.descuento_aplicado,
  r.fecha_creacion,
  (r.fecha_creacion at time zone 'America/Guatemala')::date            as dia,
  extract(dow  from r.fecha_creacion at time zone 'America/Guatemala')::integer as dia_semana,
  extract(hour from r.fecha_creacion at time zone 'America/Guatemala')::integer as hora
from smartvalehubgold.redenciones r
join smartvalehubgold.tiendas t on t.id = r.tienda_id;


create or replace function smartvalehubgold.fn_ventas_resumen(
  p_desde     date default null,
  p_hasta     date default null,
  p_tienda_id bigint default null
)
returns table (
  tickets         integer,
  venta           numeric,
  descuento       numeric,
  ticket_promedio numeric,
  clientes        integer,
  vales_usados    integer,
  primer_dia      date,
  ultimo_dia      date
)
language sql
stable
set search_path = ''
as $$
  select
    count(*)::integer,
    coalesce(sum(v.monto_oro), 0),
    coalesce(sum(v.descuento_aplicado), 0),
    round(coalesce(sum(v.monto_oro), 0) / nullif(count(*), 0), 2),
    count(distinct v.contacto_id)::integer,
    count(distinct v.vale_id)::integer,
    min(v.dia),
    max(v.dia)
  from smartvalehubgold.vw_ventas v
  where (p_desde     is null or v.dia >= p_desde)
    and (p_hasta     is null or v.dia <= p_hasta)
    and (p_tienda_id is null or v.tienda_id = p_tienda_id);
$$;


create or replace function smartvalehubgold.fn_ventas_por_dia(
  p_desde     date default null,
  p_hasta     date default null,
  p_tienda_id bigint default null
)
returns table (
  dia       date,
  tickets   integer,
  venta     numeric,
  descuento numeric
)
language sql
stable
set search_path = ''
as $$
  select
    v.dia,
    count(*)::integer,
    coalesce(sum(v.monto_oro), 0),
    coalesce(sum(v.descuento_aplicado), 0)
  from smartvalehubgold.vw_ventas v
  where (p_desde     is null or v.dia >= p_desde)
    and (p_hasta     is null or v.dia <= p_hasta)
    and (p_tienda_id is null or v.tienda_id = p_tienda_id)
  group by v.dia
  order by v.dia;
$$;


create or replace function smartvalehubgold.fn_ventas_por_tienda(
  p_desde     date default null,
  p_hasta     date default null,
  p_tienda_id bigint default null
)
returns table (
  tienda_id       bigint,
  tienda          text,
  tickets         integer,
  venta           numeric,
  ticket_promedio numeric
)
language sql
stable
set search_path = ''
as $$
  select
    v.tienda_id,
    v.tienda,
    count(*)::integer,
    coalesce(sum(v.monto_oro), 0),
    round(coalesce(sum(v.monto_oro), 0) / nullif(count(*), 0), 2)
  from smartvalehubgold.vw_ventas v
  where (p_desde     is null or v.dia >= p_desde)
    and (p_hasta     is null or v.dia <= p_hasta)
    and (p_tienda_id is null or v.tienda_id = p_tienda_id)
  group by v.tienda_id, v.tienda
  order by 4 desc;
$$;


-- Devuelve solo las celdas con movimiento. Rellenar la rejilla de ceros aquí
-- serían 168 filas por consulta para decir «nada»; la pantalla completa los
-- huecos, que es donde ya sabe qué franja horaria quiere dibujar.
create or replace function smartvalehubgold.fn_ventas_mapa_calor(
  p_desde     date default null,
  p_hasta     date default null,
  p_tienda_id bigint default null
)
returns table (
  dia_semana integer,
  hora       integer,
  tickets    integer,
  venta      numeric
)
language sql
stable
set search_path = ''
as $$
  select
    v.dia_semana,
    v.hora,
    count(*)::integer,
    coalesce(sum(v.monto_oro), 0)
  from smartvalehubgold.vw_ventas v
  where (p_desde     is null or v.dia >= p_desde)
    and (p_hasta     is null or v.dia <= p_hasta)
    and (p_tienda_id is null or v.tienda_id = p_tienda_id)
  group by v.dia_semana, v.hora
  order by v.dia_semana, v.hora;
$$;


-- Las cuatro funciones filtran por el día local. El índice va sobre la misma
-- expresión: uno sobre `fecha_creacion` a secas no serviría para esto.
create index if not exists redenciones_dia_local_idx
  on smartvalehubgold.redenciones (
    ((fecha_creacion at time zone 'America/Guatemala')::date)
  );


-- ═══ Privilegios ═════════════════════════════════════════════════════════
--
-- Una vista no hereda el RLS de sus tablas si se creó con `security_invoker`
-- desactivado, que es lo que hace Postgres por omisión. Se cierran a mano:
-- ninguna de estas debe ser alcanzable sin la clave de servicio.

do $$
declare
  v text;
begin
  foreach v in array array[
    'vw_vales_detalle', 'vw_metricas_generales', 'vw_vales_por_tipo',
    'vw_desempeno_tiendas', 'vw_ranking_tiendas', 'vw_contactos_detalle',
    'vw_viralidad_a2', 'vw_actividad_diaria', 'vw_ventas'
  ] loop
    execute format('revoke all on smartvalehubgold.%I from public, anon, authenticated', v);
    execute format('grant select on smartvalehubgold.%I to service_role', v);
  end loop;
end
$$;

revoke execute on all functions in schema smartvalehubgold from public, anon, authenticated;
grant execute on all functions in schema smartvalehubgold to service_role;
