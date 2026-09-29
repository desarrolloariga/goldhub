-- ─────────────────────────────────────────────────────────────────────────
-- GOLD HUB SMART VALE — ventas sin vale
--
-- Lo que la tienda vende por su cuenta, sin que medie ningún vale ni
-- descuento de la campaña. No cruza con `redenciones` y es deliberado: una
-- redención es el uso de un vale —tiene código, portador y porcentaje
-- congelado— y esto es una cifra de caja. Meterlas en la misma tabla
-- obligaría a dejar medio registro vacío en cada fila y a recordar en cada
-- consulta cuál de los dos casos se está mirando.
--
-- Aquí sí hay dos metales. La venta con vale es solo oro porque el descuento
-- de la campaña solo aplica a oro; la venta normal es lo que la tienda
-- despacha, y ahí hay plata.
--
-- Idempotente.
-- ─────────────────────────────────────────────────────────────────────────

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
