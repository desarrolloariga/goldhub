-- ─────────────────────────────────────────────────────────────────────────
-- ARIGA SMART VALE — tablero de ventas
--
-- REQUIERE haber corrido antes 20260814280000_editar_y_eliminar_redenciones.sql.
--
-- El tablero de inteligencia comercial mira la campaña —qué puerta trae
-- mejor gente, cuánto convierte cada vendedora—. Esto mira otra cosa: la
-- venta misma, con el eje puesto en el tiempo. Cuánto entró, qué día, a qué
-- hora, en qué tienda y de qué material.
--
-- Todo se agrupa EN HORA DE GUATEMALA. `fecha_creacion` es timestamptz y el
-- servidor corre en UTC: agrupar por su hora cruda movería seis horas cada
-- compra, y como la tienda cierra antes de medianoche, buena parte de la
-- venta de la tarde aparecería al día siguiente de madrugada. Un mapa de
-- calor construido así diría exactamente lo contrario de la verdad.
-- ─────────────────────────────────────────────────────────────────────────

-- ═══ Cada compra con su momento local ════════════════════════════════════

create or replace view smartvale.vw_ventas as
select
  r.id,
  r.vale_id,
  r.tienda_id,
  r.usuario_id,
  r.contacto_id,
  r.monto_compra,
  r.monto_oro,
  r.monto_plata,
  r.descuento_aplicado,
  r.fecha_creacion,

  -- El instante, ya traído a Guatemala. De aquí salen día, día de semana y
  -- hora, para que las tres cuenten la misma historia.
  (r.fecha_creacion at time zone 'America/Guatemala')            as momento_local,
  (r.fecha_creacion at time zone 'America/Guatemala')::date      as dia,
  -- 0 = domingo, como `extract(dow)`. La pantalla lo rota para empezar en
  -- lunes, que es como se lee una semana de trabajo.
  extract(dow  from r.fecha_creacion at time zone 'America/Guatemala')::integer as dia_semana,
  extract(hour from r.fecha_creacion at time zone 'America/Guatemala')::integer as hora,

  t.nombre  as tienda,
  u.nombre  as vendedora,
  v.codigo  as vale_codigo,
  v.tipo    as tipo_vale
from smartvale.redenciones r
join smartvale.tiendas  t on t.id = r.tienda_id
join smartvale.usuarios u on u.id = r.usuario_id
join smartvale.vales    v on v.id = r.vale_id;

comment on view smartvale.vw_ventas is
  'Una fila por compra con su día, día de semana y hora en horario de Guatemala.';


-- ═══ Resumen del periodo ═════════════════════════════════════════════════

create or replace function smartvale.fn_ventas_resumen(
  p_desde      date default null,
  p_hasta      date default null,
  p_tienda_id  bigint default null,
  p_usuario_id bigint default null
)
returns table (
  tickets          integer,
  venta            numeric,
  descuento        numeric,
  venta_oro        numeric,
  venta_plata      numeric,
  venta_otros      numeric,
  ticket_promedio  numeric,
  clientes         integer,
  vales_usados     integer,
  primer_dia       date,
  ultimo_dia       date
)
language sql
stable
set search_path = ''
as $$
  select
    count(*)::integer,
    coalesce(sum(v.monto_compra), 0),
    coalesce(sum(v.descuento_aplicado), 0),
    coalesce(sum(v.monto_oro), 0),
    coalesce(sum(v.monto_plata), 0),
    -- Lo que no fue ni oro ni plata: sin esta resta, las dos cifras de
    -- material parecerían no sumar el total y nadie sabría por qué.
    coalesce(sum(v.monto_compra - v.monto_oro - v.monto_plata), 0),
    round(coalesce(sum(v.monto_compra), 0) / nullif(count(*), 0), 2),
    count(distinct v.contacto_id)::integer,
    count(distinct v.vale_id)::integer,
    min(v.dia),
    max(v.dia)
  from smartvale.vw_ventas v
  where (p_desde      is null or v.dia >= p_desde)
    and (p_hasta      is null or v.dia <= p_hasta)
    and (p_tienda_id  is null or v.tienda_id = p_tienda_id)
    and (p_usuario_id is null or v.usuario_id = p_usuario_id);
$$;


-- ═══ Día a día ═══════════════════════════════════════════════════════════

create or replace function smartvale.fn_ventas_por_dia(
  p_desde      date default null,
  p_hasta      date default null,
  p_tienda_id  bigint default null,
  p_usuario_id bigint default null
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
    coalesce(sum(v.monto_compra), 0),
    coalesce(sum(v.descuento_aplicado), 0)
  from smartvale.vw_ventas v
  where (p_desde      is null or v.dia >= p_desde)
    and (p_hasta      is null or v.dia <= p_hasta)
    and (p_tienda_id  is null or v.tienda_id = p_tienda_id)
    and (p_usuario_id is null or v.usuario_id = p_usuario_id)
  group by v.dia
  order by v.dia;
$$;


-- ═══ Quién vendió ════════════════════════════════════════════════════════

create or replace function smartvale.fn_ventas_por_vendedora(
  p_desde      date default null,
  p_hasta      date default null,
  p_tienda_id  bigint default null,
  p_usuario_id bigint default null
)
returns table (
  usuario_id      bigint,
  vendedora       text,
  tickets         integer,
  venta           numeric,
  ticket_promedio numeric
)
language sql
stable
set search_path = ''
as $$
  select
    v.usuario_id,
    v.vendedora,
    count(*)::integer,
    coalesce(sum(v.monto_compra), 0),
    round(coalesce(sum(v.monto_compra), 0) / nullif(count(*), 0), 2)
  from smartvale.vw_ventas v
  where (p_desde      is null or v.dia >= p_desde)
    and (p_hasta      is null or v.dia <= p_hasta)
    and (p_tienda_id  is null or v.tienda_id = p_tienda_id)
    and (p_usuario_id is null or v.usuario_id = p_usuario_id)
  group by v.usuario_id, v.vendedora
  order by 4 desc;
$$;


-- ═══ Dónde se vendió ═════════════════════════════════════════════════════

create or replace function smartvale.fn_ventas_por_tienda(
  p_desde      date default null,
  p_hasta      date default null,
  p_tienda_id  bigint default null,
  p_usuario_id bigint default null
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
    coalesce(sum(v.monto_compra), 0),
    round(coalesce(sum(v.monto_compra), 0) / nullif(count(*), 0), 2)
  from smartvale.vw_ventas v
  where (p_desde      is null or v.dia >= p_desde)
    and (p_hasta      is null or v.dia <= p_hasta)
    and (p_tienda_id  is null or v.tienda_id = p_tienda_id)
    and (p_usuario_id is null or v.usuario_id = p_usuario_id)
  group by v.tienda_id, v.tienda
  order by 4 desc;
$$;


-- ═══ Mapa de calor: día de semana × hora ═════════════════════════════════

-- Devuelve solo las celdas con movimiento. Rellenar la rejilla de ceros aquí
-- serían 168 filas por consulta para decir «nada»; la pantalla completa los
-- huecos, que es donde ya sabe qué franja horaria quiere dibujar.
create or replace function smartvale.fn_ventas_mapa_calor(
  p_desde      date default null,
  p_hasta      date default null,
  p_tienda_id  bigint default null,
  p_usuario_id bigint default null
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
    coalesce(sum(v.monto_compra), 0)
  from smartvale.vw_ventas v
  where (p_desde      is null or v.dia >= p_desde)
    and (p_hasta      is null or v.dia <= p_hasta)
    and (p_tienda_id  is null or v.tienda_id = p_tienda_id)
    and (p_usuario_id is null or v.usuario_id = p_usuario_id)
  group by v.dia_semana, v.hora
  order by v.dia_semana, v.hora;
$$;


-- ═══ Índice para el filtro por fecha ═════════════════════════════════════

-- Las cinco funciones filtran por el día local. El índice va sobre la misma
-- expresión: uno sobre `fecha_creacion` a secas no serviría para esto.
create index if not exists redenciones_dia_local_idx
  on smartvale.redenciones (
    ((fecha_creacion at time zone 'America/Guatemala')::date)
  );


-- ═══ Privilegios ═════════════════════════════════════════════════════════

revoke all on smartvale.vw_ventas from public, anon, authenticated;
grant select on smartvale.vw_ventas to service_role;

revoke execute on function
  smartvale.fn_ventas_resumen(date, date, bigint, bigint),
  smartvale.fn_ventas_por_dia(date, date, bigint, bigint),
  smartvale.fn_ventas_por_vendedora(date, date, bigint, bigint),
  smartvale.fn_ventas_por_tienda(date, date, bigint, bigint),
  smartvale.fn_ventas_mapa_calor(date, date, bigint, bigint)
from public, anon, authenticated;

grant execute on function
  smartvale.fn_ventas_resumen(date, date, bigint, bigint),
  smartvale.fn_ventas_por_dia(date, date, bigint, bigint),
  smartvale.fn_ventas_por_vendedora(date, date, bigint, bigint),
  smartvale.fn_ventas_por_tienda(date, date, bigint, bigint),
  smartvale.fn_ventas_mapa_calor(date, date, bigint, bigint)
to service_role;
