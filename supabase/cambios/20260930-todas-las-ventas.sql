-- ─────────────────────────────────────────────────────────────────────────
-- Todas las ventas en una sola lista
--
-- Las dos fuentes —redenciones y ventas sin vale— juntas y ordenadas por
-- fecha, con una columna que dice de cuál viene cada línea.
--
-- Va como `union all` y no como tabla común: son cosas distintas y juntarlas
-- en el almacén dejaría medio registro vacío en cada fila. Aquí se juntan
-- solo para leerlas.
--
-- Se puede volver a aplicar sin miedo.
-- ─────────────────────────────────────────────────────────────────────────

begin;

do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as firma
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'smartvalehubgold'
       and p.proname = 'fn_todas_las_ventas'
  loop
    execute format('drop function if exists %s', f.firma);
  end loop;
end $$;

create or replace function smartvalehubgold.fn_todas_las_ventas(
  p_desde     date default null,
  p_hasta     date default null,
  p_tienda_id bigint default null,
  /** 'vale', 'normal' o nulo para las dos. */
  p_tipo      text default null
)
returns table (
  /*
   * Compuesta —'v:12' o 'n:34'— porque los ids de las dos tablas se pisan:
   * hay una redención 5 y una venta directa 5, y la pantalla necesita una
   * clave que no se repita.
   */
  clave        text,
  tipo         text,
  dia          date,
  fecha        timestamptz,
  tienda_id    bigint,
  tienda       text,
  /** El código del vale. Nulo en una venta normal. */
  codigo       text,
  /** Quién compró. Nulo en una venta normal: no se pide. */
  comprador    text,
  monto_oro    numeric,
  monto_plata  numeric,
  descuento    numeric,
  /** Lo que quedó en caja por esa línea. */
  neto         numeric,
  detalle      text
)
language sql
stable
set search_path = ''
as $$
  select * from (
    select
      'v:' || r.id,
      'vale'::text,
      (r.fecha_creacion at time zone 'America/Guatemala')::date,
      r.fecha_creacion,
      r.tienda_id,
      t.nombre,
      v.codigo,
      c.nombre,
      r.monto_oro,
      0::numeric,
      r.descuento_aplicado,
      r.monto_oro - r.descuento_aplicado,
      -- Con qué se pagó, que es lo que explica el porcentaje aplicado.
      coalesce(r.forma_pago, '')
    from smartvalehubgold.redenciones r
    join smartvalehubgold.tiendas t  on t.id = r.tienda_id
    join smartvalehubgold.vales v    on v.id = r.vale_id
    join smartvalehubgold.contactos c on c.id = r.contacto_id
    where (p_tipo is null or p_tipo = 'vale')

    union all

    select
      'n:' || d.id,
      'normal'::text,
      d.dia,
      d.fecha_creacion,
      d.tienda_id,
      t.nombre,
      null,
      null,
      d.monto_oro,
      d.monto_plata,
      0::numeric,
      -- Sin descuento: lo vendido es lo cobrado.
      d.monto_oro + d.monto_plata,
      coalesce(d.nota, '')
    from smartvalehubgold.ventas_directas d
    join smartvalehubgold.tiendas t on t.id = d.tienda_id
    where (p_tipo is null or p_tipo = 'normal')
  ) as todas(
    clave, tipo, dia, fecha, tienda_id, tienda, codigo, comprador,
    monto_oro, monto_plata, descuento, neto, detalle
  )
  where (p_desde     is null or todas.dia >= p_desde)
    and (p_hasta     is null or todas.dia <= p_hasta)
    and (p_tienda_id is null or todas.tienda_id = p_tienda_id)
  -- Por día y no por el instante de captura: una venta anotada al cierre va
  -- donde le toca, no al final de la lista.
  order by todas.dia desc, todas.fecha desc;
$$;

comment on function smartvalehubgold.fn_todas_las_ventas is
  'Las ventas con vale y sin vale en una sola lista, con el tipo de cada una.';

commit;
