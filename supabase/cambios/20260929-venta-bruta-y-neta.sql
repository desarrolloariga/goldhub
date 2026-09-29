-- ─────────────────────────────────────────────────────────────────────────
-- Inteligencia comercial: venta bruta y venta neta
--
-- La bruta es lo que el cliente compró; la neta, lo que la tienda cobró
-- después del descuento. Antes solo se devolvía la bruta, rotulada «venta»
-- a secas, y el descuento por separado sin que nadie los restara: con
-- descuentos del 20% y 25% la diferencia entre una cifra y otra no es un
-- matiz.
--
-- La resta la hace la base y no cada pantalla, que es lo que evita que dos
-- sitios enseñen cifras distintas de lo mismo.
--
-- Las tres funciones cambian de forma —una columna más— y `create or
-- replace` no puede con eso (42P13), así que se borran antes.
--
-- Se puede volver a aplicar sin miedo.
-- ─────────────────────────────────────────────────────────────────────────

begin;

drop function if exists smartvalehubgold.fn_ventas_resumen(date, date, bigint);
drop function if exists smartvalehubgold.fn_ventas_por_dia(date, date, bigint);
drop function if exists smartvalehubgold.fn_ventas_por_tienda(date, date, bigint);

create or replace function smartvalehubgold.fn_ventas_resumen(
  p_desde     date default null,
  p_hasta     date default null,
  p_tienda_id bigint default null
)
returns table (
  tickets         integer,
  /*
   * La bruta es lo que el cliente compró; la neta, lo que la tienda cobró
   * después del descuento. Se devuelven las dos y también el descuento,
   * aunque `neta = venta - descuento`: que la resta la haga la base y no
   * cada pantalla es lo que evita que dos sitios enseñen cifras distintas.
   */
  venta           numeric,
  descuento       numeric,
  venta_neta      numeric,
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
    coalesce(sum(v.monto_oro), 0) - coalesce(sum(v.descuento_aplicado), 0),
    -- El ticket promedio va sobre la bruta: es el tamaño de la compra, no
    -- lo que quedó en caja.
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
  dia        date,
  tickets    integer,
  venta      numeric,
  descuento  numeric,
  venta_neta numeric
)
language sql
stable
set search_path = ''
as $$
  select
    v.dia,
    count(*)::integer,
    coalesce(sum(v.monto_oro), 0),
    coalesce(sum(v.descuento_aplicado), 0),
    coalesce(sum(v.monto_oro), 0) - coalesce(sum(v.descuento_aplicado), 0)
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
  -- Quién atiende esa tienda. No se agrupa por ella: hay una asesora por
  -- tienda, así que agrupar daría exactamente las mismas filas con otro
  -- encabezado. Va como columna al lado, que es lo que hace falta para
  -- leer el desempeño con nombre y apellido.
  asesora         text,
  tickets         integer,
  venta           numeric,
  descuento       numeric,
  venta_neta      numeric,
  ticket_promedio numeric
)
language sql
stable
set search_path = ''
as $$
  select
    v.tienda_id,
    v.tienda,
    t.asesora,
    count(*)::integer,
    coalesce(sum(v.monto_oro), 0),
    coalesce(sum(v.descuento_aplicado), 0),
    coalesce(sum(v.monto_oro), 0) - coalesce(sum(v.descuento_aplicado), 0),
    round(coalesce(sum(v.monto_oro), 0) / nullif(count(*), 0), 2)
  from smartvalehubgold.vw_ventas v
  join smartvalehubgold.tiendas t on t.id = v.tienda_id
  where (p_desde     is null or v.dia >= p_desde)
    and (p_hasta     is null or v.dia <= p_hasta)
    and (p_tienda_id is null or v.tienda_id = p_tienda_id)
  group by v.tienda_id, v.tienda, t.asesora
  -- Por venta bruta: es la que ordena por tamaño de operación.
  order by 5 desc;
$$;

commit;
