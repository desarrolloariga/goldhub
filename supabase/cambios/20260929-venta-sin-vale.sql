-- ─────────────────────────────────────────────────────────────────────────
-- Venta sin vale, y los cuatro totales del reporte
--
-- Lo que la tienda vende por su cuenta, sin vale ni descuento de campaña.
-- Tabla propia y no una fila más en `redenciones`: una redención es el uso
-- de un vale —con código, portador y porcentaje congelado— y esto es una
-- cifra de caja. Juntarlas dejaría medio registro vacío en cada fila.
--
-- Aquí sí hay dos metales: el descuento de la campaña solo aplica a oro,
-- pero lo que la tienda despacha normalmente incluye plata.
--
-- Los cuatro totales del tablero: bruta con vale, neta con vale, venta sin
-- vale y el gran total, que va contra la NETA porque es lo que de verdad
-- entró en caja.
--
-- Se puede volver a aplicar sin miedo.
-- ─────────────────────────────────────────────────────────────────────────

begin;

create table if not exists smartvalehubgold.ventas_directas (
  id             bigint generated always as identity primary key,
  tienda_id      bigint not null
    references smartvalehubgold.tiendas (id) on delete restrict,

  -- Quién la registró. Nula si la cuenta se borró: la venta se queda, que
  -- perder cifras de caja al dar de baja a alguien sería peor.
  usuario_id     bigint references smartvalehubgold.usuarios (id) on delete set null,

  -- El día de la venta, no el de la captura. Se puede anotar al cierre lo
  -- vendido por la mañana, y el reporte tiene que contarlo donde toca.
  dia            date not null,

  monto_oro      numeric(12,2) not null default 0,
  monto_plata    numeric(12,2) not null default 0,

  -- Para distinguir dos registros del mismo día al revisarlos.
  nota           text,

  registrada_por bigint references smartvalehubgold.usuarios (id) on delete set null,
  editada_por    bigint references smartvalehubgold.usuarios (id) on delete set null,
  fecha_edicion  timestamptz,
  fecha_creacion timestamptz not null default now(),

  constraint ventas_directas_montos_no_negativos check (
    monto_oro >= 0 and monto_plata >= 0
  ),
  -- Una venta de cero en los dos metales no es una venta: sería una fila que
  -- ensucia el conteo sin aportar nada.
  constraint ventas_directas_algo_vendido check (monto_oro + monto_plata > 0)
);

create index if not exists ventas_directas_tienda_idx
  on smartvalehubgold.ventas_directas (tienda_id, dia desc);
create index if not exists ventas_directas_dia_idx
  on smartvalehubgold.ventas_directas (dia);

do $$
begin
  execute 'alter table smartvalehubgold.ventas_directas enable row level security';
  execute 'revoke all on smartvalehubgold.ventas_directas from anon, authenticated';
  execute 'grant all on smartvalehubgold.ventas_directas to service_role';
end
$$;

comment on table smartvalehubgold.ventas_directas is
  'Venta que la tienda hace sin vale: oro y plata, sin descuento de campaña.';
comment on column smartvalehubgold.ventas_directas.dia is
  'El día de la venta, que puede no ser el de la captura.';


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

commit;
