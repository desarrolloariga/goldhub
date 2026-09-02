-- ─────────────────────────────────────────────────────────────────────────
-- ARIGA SMART VALE — desempeño por vendedora
--
-- `vw_ranking_vendedoras` solo respondía "quién vendió más". Esta vista
-- responde a cómo va cada vendedora: qué emite y de qué tipo, cuánto de eso
-- se convierte en compra, qué venta genera, y cuánto cupo le queda —lo que
-- permite reponer bloques antes de que se quede parada.
--
-- Incluye a todas las cuentas, también a las que aún no han emitido nada:
-- una vendedora con cupo asignado y cero vales es justo lo que hay que ver.
-- ─────────────────────────────────────────────────────────────────────────

create or replace view smartvale.vw_desempeno_vendedoras as
with emision as (
  select
    d.usuario_id,
    count(*)::integer                                        as vales_emitidos,
    count(*) filter (where d.tipo = 'A1')::integer           as vales_a1,
    count(*) filter (where d.tipo = 'A2')::integer           as vales_a2,
    count(*) filter (where d.tipo = 'A3')::integer           as vales_a3,
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
  -- Solo los bloques activos: un bloque retirado ya no es cupo disponible.
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

  -- Adquisición
  coalesce(e.vales_emitidos, 0)          as vales_emitidos,
  coalesce(e.vales_a1, 0)                as vales_a1,
  coalesce(e.vales_a2, 0)                as vales_a2,
  coalesce(e.vales_a3, 0)                as vales_a3,
  coalesce(e.vales_vigentes, 0)          as vales_vigentes,
  coalesce(e.vales_vencidos, 0)          as vales_vencidos,
  coalesce(e.vales_anulados, 0)          as vales_anulados,

  -- Conversión
  coalesce(e.vales_con_compra, 0)        as vales_con_compra,
  coalesce(e.redenciones, 0)             as redenciones,
  round(
    100.0 * coalesce(e.vales_con_compra, 0) / nullif(e.vales_emitidos, 0)
  , 2)                                   as tasa_conversion,
  round(
    coalesce(e.redenciones, 0)::numeric / nullif(e.vales_emitidos, 0)
  , 2)                                   as redenciones_por_vale,

  -- Venta
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

  -- Control de entregas
  coalesce(c.bloques, 0)                 as bloques,
  coalesce(c.correlativos_asignados, 0)  as correlativos_asignados,
  coalesce(c.correlativos_usados, 0)     as correlativos_usados,
  coalesce(c.correlativos_restantes, 0)  as correlativos_restantes,

  -- Actividad
  e.ultima_emision,
  e.ultima_venta
from smartvale.usuarios u
left join smartvale.tiendas t on t.id = u.tienda_id
left join emision e on e.usuario_id = u.id
left join cupo    c on c.usuario_id = u.id;


comment on view smartvale.vw_desempeno_vendedoras is
  'Una fila por cuenta con su adquisición, conversión, venta y cupo restante.';


revoke all on smartvale.vw_desempeno_vendedoras from public, anon, authenticated;
grant select on smartvale.vw_desempeno_vendedoras to service_role;
