-- ─────────────────────────────────────────────────────────────────────────
-- GOLD HUB SMART VALE — reportes con venta sin vale
--
-- Los cuatro totales que pide el tablero:
--
--   · con vale, bruta   — lo que el cliente compró presentando un vale
--   · con vale, neta    — lo anterior menos el descuento de la campaña
--   · sin vale          — lo que la tienda vendió por su cuenta (oro y plata)
--   · gran total        — la neta con vale más la venta sin vale
--
-- El gran total va contra la NETA y no contra la bruta: es lo que de verdad
-- entró en caja por las dos vías. Sumar la bruta daría una cifra que nadie
-- cobró, porque el descuento todavía estaba por descontar.
--
-- Idempotente.
-- ─────────────────────────────────────────────────────────────────────────

do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as firma
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'smartvalehubgold'
       and p.proname in (
         'fn_registrar_venta_directa', 'fn_eliminar_venta_directa',
         'fn_ventas_directas', 'fn_ventas_consolidado',
         'fn_consolidado_por_tienda')
  loop
    execute format('drop function if exists %s', f.firma);
  end loop;
end $$;


-- ── Registrar ───────────────────────────────────────────────────────────

create or replace function smartvalehubgold.fn_registrar_venta_directa(
  p_usuario_id  bigint,
  p_tienda_id   bigint default null,
  p_dia         date default null,
  p_monto_oro   numeric default 0,
  p_monto_plata numeric default 0,
  p_nota        text default null
)
returns smartvalehubgold.ventas_directas
language plpgsql
set search_path = ''
as $$
declare
  v_tienda_id bigint;
  v_dia       date;
  v_venta     smartvalehubgold.ventas_directas%rowtype;
begin
  -- La tienda la pone la cuenta; el administrador, que no tiene una, la
  -- elige. Mismo criterio que al emitir un vale.
  v_tienda_id := smartvalehubgold.fn_tienda_en_alcance(p_usuario_id, p_tienda_id);

  -- Sin fecha, hoy en Guatemala. No `current_date`, que es la del servidor y
  -- a última hora del día cae en el siguiente.
  v_dia := coalesce(
    p_dia,
    (now() at time zone 'America/Guatemala')::date
  );

  if coalesce(p_monto_oro, 0) < 0 or coalesce(p_monto_plata, 0) < 0 then
    raise exception 'Los montos no pueden ser negativos.' using errcode = 'SV006';
  end if;

  if coalesce(p_monto_oro, 0) + coalesce(p_monto_plata, 0) <= 0 then
    raise exception 'Escribe al menos un monto en oro o en plata.'
      using errcode = 'SV006';
  end if;

  -- Una venta con fecha futura es siempre un error de tecleo, y descuadra
  -- cualquier reporte que la incluya.
  if v_dia > (now() at time zone 'America/Guatemala')::date then
    raise exception 'La fecha de la venta no puede ser futura.'
      using errcode = 'SV006';
  end if;

  insert into smartvalehubgold.ventas_directas (
    tienda_id, usuario_id, dia, monto_oro, monto_plata, nota, registrada_por
  )
  values (
    v_tienda_id, p_usuario_id, v_dia,
    coalesce(p_monto_oro, 0), coalesce(p_monto_plata, 0),
    nullif(btrim(coalesce(p_nota, '')), ''), p_usuario_id
  )
  returning * into v_venta;

  return v_venta;
end;
$$;


create or replace function smartvalehubgold.fn_eliminar_venta_directa(
  p_usuario_id bigint,
  p_venta_id   bigint
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_tienda_id bigint;
begin
  select tienda_id into v_tienda_id
    from smartvalehubgold.ventas_directas where id = p_venta_id;

  if not found then
    raise exception 'Esa venta no existe.' using errcode = 'SV006';
  end if;

  -- Que la cuenta pueda operar sobre esa tienda. Sin esto, una tienda
  -- borraría las cifras de otra cambiando el número en la petición.
  perform smartvalehubgold.fn_tienda_en_alcance(p_usuario_id, v_tienda_id);

  delete from smartvalehubgold.ventas_directas where id = p_venta_id;
end;
$$;


-- ── Listado ─────────────────────────────────────────────────────────────

create or replace function smartvalehubgold.fn_ventas_directas(
  p_tienda_id bigint default null,
  p_desde     date default null,
  p_hasta     date default null
)
returns table (
  id           bigint,
  tienda_id    bigint,
  tienda       text,
  dia          date,
  monto_oro    numeric,
  monto_plata  numeric,
  total        numeric,
  nota         text,
  registrada   text,
  fecha_creacion timestamptz
)
language sql
stable
set search_path = ''
as $$
  select
    v.id, v.tienda_id, t.nombre, v.dia,
    v.monto_oro, v.monto_plata, v.monto_oro + v.monto_plata,
    v.nota, u.nombre, v.fecha_creacion
  from smartvalehubgold.ventas_directas v
  join smartvalehubgold.tiendas t on t.id = v.tienda_id
  left join smartvalehubgold.usuarios u on u.id = v.registrada_por
  where (p_tienda_id is null or v.tienda_id = p_tienda_id)
    and (p_desde     is null or v.dia >= p_desde)
    and (p_hasta     is null or v.dia <= p_hasta)
  order by v.dia desc, v.id desc;
$$;


-- ── Los cuatro totales ──────────────────────────────────────────────────
--
-- Las dos fuentes se suman por separado y se cruzan al final. Con un `join`
-- entre ellas, una tienda con ventas sin vale pero sin ninguna redención
-- —o al revés— desaparecería del reporte.

create or replace function smartvalehubgold.fn_ventas_consolidado(
  p_desde     date default null,
  p_hasta     date default null,
  p_tienda_id bigint default null
)
returns table (
  vale_bruta       numeric,
  vale_descuento   numeric,
  vale_neta        numeric,
  directa_oro      numeric,
  directa_plata    numeric,
  directa_total    numeric,
  gran_total       numeric,
  tickets_vale     integer,
  registros_directa integer
)
language sql
stable
set search_path = ''
as $$
  with v as (
    select
      coalesce(sum(x.monto_oro), 0)           as bruta,
      coalesce(sum(x.descuento_aplicado), 0)  as descuento,
      count(*)::integer                       as tickets
    from smartvalehubgold.vw_ventas x
    where (p_desde     is null or x.dia >= p_desde)
      and (p_hasta     is null or x.dia <= p_hasta)
      and (p_tienda_id is null or x.tienda_id = p_tienda_id)
  ),
  d as (
    select
      coalesce(sum(y.monto_oro), 0)   as oro,
      coalesce(sum(y.monto_plata), 0) as plata,
      count(*)::integer               as registros
    from smartvalehubgold.ventas_directas y
    where (p_desde     is null or y.dia >= p_desde)
      and (p_hasta     is null or y.dia <= p_hasta)
      and (p_tienda_id is null or y.tienda_id = p_tienda_id)
  )
  select
    v.bruta,
    v.descuento,
    v.bruta - v.descuento,
    d.oro,
    d.plata,
    d.oro + d.plata,
    -- Contra la neta: es lo que entró en caja por las dos vías.
    (v.bruta - v.descuento) + d.oro + d.plata,
    v.tickets,
    d.registros
  from v, d;
$$;


-- Lo mismo, tienda por tienda. El `full join` es lo que deja ver a una
-- tienda que solo vendió por una de las dos vías.
create or replace function smartvalehubgold.fn_consolidado_por_tienda(
  p_desde date default null,
  p_hasta date default null
)
returns table (
  tienda_id      bigint,
  tienda         text,
  asesora        text,
  vale_bruta     numeric,
  vale_descuento numeric,
  vale_neta      numeric,
  directa_oro    numeric,
  directa_plata  numeric,
  directa_total  numeric,
  gran_total     numeric
)
language sql
stable
set search_path = ''
as $$
  select
    t.id,
    t.nombre,
    t.asesora,
    coalesce(v.bruta, 0),
    coalesce(v.descuento, 0),
    coalesce(v.bruta, 0) - coalesce(v.descuento, 0),
    coalesce(d.oro, 0),
    coalesce(d.plata, 0),
    coalesce(d.oro, 0) + coalesce(d.plata, 0),
    (coalesce(v.bruta, 0) - coalesce(v.descuento, 0))
      + coalesce(d.oro, 0) + coalesce(d.plata, 0)
  from smartvalehubgold.tiendas t
  left join (
    select x.tienda_id,
           sum(x.monto_oro)          as bruta,
           sum(x.descuento_aplicado) as descuento
      from smartvalehubgold.vw_ventas x
     where (p_desde is null or x.dia >= p_desde)
       and (p_hasta is null or x.dia <= p_hasta)
     group by x.tienda_id
  ) v on v.tienda_id = t.id
  left join (
    select y.tienda_id,
           sum(y.monto_oro)   as oro,
           sum(y.monto_plata) as plata
      from smartvalehubgold.ventas_directas y
     where (p_desde is null or y.dia >= p_desde)
       and (p_hasta is null or y.dia <= p_hasta)
     group by y.tienda_id
  ) d on d.tienda_id = t.id
  -- Las tiendas sin nada en el periodo no salen: una tabla de cuadre con
  -- diez filas en cero se lee peor que una con las que sí vendieron.
  where coalesce(v.bruta, 0) + coalesce(d.oro, 0) + coalesce(d.plata, 0) > 0
  order by 10 desc;
$$;

comment on function smartvalehubgold.fn_ventas_consolidado is
  'Los cuatro totales: bruta y neta con vale, venta sin vale, y el gran total contra la neta.';
