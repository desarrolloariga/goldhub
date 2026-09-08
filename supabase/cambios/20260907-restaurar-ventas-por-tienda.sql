-- ─────────────────────────────────────────────────────────────────────────
-- Restaura fn_ventas_por_tienda
--
-- El cambio de la asesora la borraba para recrearla con una columna más
-- —`create or replace` no puede cambiar la forma de una función, 42P13— pero
-- el `create` no llegó a escribirse en aquel archivo. La función quedó
-- borrada en la base y el módulo de ventas dejó de abrir: la pantalla la
-- llama, la llamada falla y la aplicación enseña el error genérico.
--
-- Aquí va entera. Aplicar esto deja el reporte funcionando otra vez.
-- ─────────────────────────────────────────────────────────────────────────

begin;

drop function if exists smartvalehubgold.fn_ventas_por_tienda(date, date, bigint);

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
    round(coalesce(sum(v.monto_oro), 0) / nullif(count(*), 0), 2)
  from smartvalehubgold.vw_ventas v
  join smartvalehubgold.tiendas t on t.id = v.tienda_id
  where (p_desde     is null or v.dia >= p_desde)
    and (p_hasta     is null or v.dia <= p_hasta)
    and (p_tienda_id is null or v.tienda_id = p_tienda_id)
  group by v.tienda_id, v.tienda, t.asesora
  order by 5 desc;
$$;

commit;
