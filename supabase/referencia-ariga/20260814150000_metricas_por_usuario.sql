-- ─────────────────────────────────────────────────────────────────────────
-- ARIGA SMART VALE — consultas con alcance por usuario
--
-- Las vistas de métricas son globales, pensadas para el tablero del
-- administrador. Estas dos funciones devuelven lo mismo acotado a una
-- vendedora: pasando NULL se obtiene el total, de modo que el panel usa una
-- sola consulta para los dos roles.
-- ─────────────────────────────────────────────────────────────────────────

create or replace function smartvale.fn_metricas(p_usuario_id bigint default null)
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
  from smartvale.vw_vales_detalle d
  where p_usuario_id is null or d.usuario_id = p_usuario_id;
$$;


-- Estado del cupo de una vendedora: cuántos vales le quedan por emitir.
-- Una fila por bloque activo, del más antiguo al más nuevo.
create or replace function smartvale.fn_resumen_rango(p_usuario_id bigint)
returns table (
  rango_id           bigint,
  rango_inicio       integer,
  rango_fin          integer,
  correlativo_actual integer,
  emitidos           integer,
  restantes          integer,
  agotado            boolean
)
language sql
stable
set search_path = ''
as $$
  select
    r.id,
    r.rango_inicio,
    r.rango_fin,
    r.correlativo_actual,
    (r.correlativo_actual - r.rango_inicio)::integer,
    greatest(r.rango_fin - r.correlativo_actual + 1, 0)::integer,
    r.correlativo_actual > r.rango_fin
  from smartvale.rangos r
  where r.usuario_id = p_usuario_id
    and r.activo
  order by r.rango_inicio;
$$;


revoke execute on function
  smartvale.fn_metricas(bigint),
  smartvale.fn_resumen_rango(bigint)
from public, anon, authenticated;

grant execute on function
  smartvale.fn_metricas(bigint),
  smartvale.fn_resumen_rango(bigint)
to service_role;
