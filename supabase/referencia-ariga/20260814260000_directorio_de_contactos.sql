-- ─────────────────────────────────────────────────────────────────────────
-- ARIGA SMART VALE — directorio de contactos
--
-- REQUIERE haber corrido antes 20260814250000_vigencia_general_31_octubre.sql.
--
-- La campaña lleva meses generando personas y no había dónde verlas juntas.
-- Estaban repartidas entre `vales` —quien recibió el vale— y `redenciones`
-- —quien pagó—, que no siempre son la misma, y no se podían cruzar.
--
-- Esta vista da una fila por persona con todo lo que sabemos de ella:
--
--   · por qué puerta entró (A1, A2, A3, A4) y con qué vale
--   · en qué tienda y con qué vendedora
--   · el origen de su prospección, su clasificación o quién la refirió
--   · si compró, cuánto, en qué material y cuándo
--
-- Entran también quienes nunca tuvieron vale propio y solo aparecieron al
-- pagar con el de otro: son clientes igual, y hoy no los veía nadie.
-- ─────────────────────────────────────────────────────────────────────────

create or replace view smartvale.vw_contactos_detalle as
with vales as (
  select
    d.contacto_id,
    count(*)::integer                                    as vales,
    count(*) filter (where d.tipo = 'A1')::integer       as vales_a1,
    count(*) filter (where d.tipo = 'A2')::integer       as vales_a2,
    count(*) filter (where d.tipo = 'A3')::integer       as vales_a3,
    count(*) filter (where d.tipo = 'A4')::integer       as vales_a4,
    count(*) filter (where d.estado = 'activo')::integer as vales_vigentes,
    min(d.fecha_emision)                                 as primer_vale,
    max(d.fecha_emision)                                 as ultimo_vale
  from smartvale.vw_vales_detalle d
  group by d.contacto_id
),
entrada as (
  -- La puerta por la que entró: la de su PRIMER vale. Alguien que llegó como
  -- visitante y después recibió un A1 sigue siendo, en origen, un A3; contarlo
  -- por el último vale borraría de dónde salió cada cliente.
  select distinct on (d.contacto_id)
    d.contacto_id,
    d.tipo          as tipo,
    d.codigo        as codigo,
    d.segmento      as segmento,
    d.origen        as origen,
    d.tienda_id     as tienda_id,
    d.tienda        as tienda,
    d.usuario_id    as usuario_id,
    d.emisora       as emisora,
    d.autorregistro as autorregistro,
    d.referidor     as referidor,
    d.origen_codigo as origen_codigo
  from smartvale.vw_vales_detalle d
  order by d.contacto_id, d.fecha_emision, d.id
),
compras as (
  select
    r.contacto_id,
    count(*)::integer               as compras,
    coalesce(sum(r.monto_compra), 0) as gastado,
    coalesce(sum(r.monto_oro), 0)    as gastado_oro,
    coalesce(sum(r.monto_plata), 0)  as gastado_plata,
    coalesce(sum(r.descuento_aplicado), 0) as ahorrado,
    max(r.fecha_creacion)            as ultima_compra
  from smartvale.redenciones r
  group by r.contacto_id
),
-- Dónde compró. Puede no coincidir con la tienda que lo captó.
tienda_compra as (
  select distinct on (r.contacto_id)
    r.contacto_id, t.nombre as tienda_compra
  from smartvale.redenciones r
  join smartvale.tiendas t on t.id = r.tienda_id
  order by r.contacto_id, r.fecha_creacion desc
)
select
  c.id                              as contacto_id,
  c.nombre,
  c.telefono,
  c.correo,
  c.fecha_creacion                  as fecha_alta,

  -- Puerta de entrada. Nulo = nunca tuvo vale propio: llegó pagando con el
  -- de otra persona, y se etiqueta aparte en la pantalla.
  e.tipo,
  e.codigo                          as vale_codigo,
  e.segmento,
  e.origen,
  e.tienda_id,
  e.tienda,
  e.usuario_id,
  e.emisora,
  coalesce(e.autorregistro, false)  as autorregistro,
  e.referidor,
  e.origen_codigo,

  coalesce(v.vales, 0)              as vales,
  coalesce(v.vales_a1, 0)           as vales_a1,
  coalesce(v.vales_a2, 0)           as vales_a2,
  coalesce(v.vales_a3, 0)           as vales_a3,
  coalesce(v.vales_a4, 0)           as vales_a4,
  coalesce(v.vales_vigentes, 0)     as vales_vigentes,
  v.primer_vale,
  v.ultimo_vale,

  coalesce(p.compras, 0)            as compras,
  coalesce(p.gastado, 0)            as gastado,
  coalesce(p.gastado_oro, 0)        as gastado_oro,
  coalesce(p.gastado_plata, 0)      as gastado_plata,
  coalesce(p.ahorrado, 0)           as ahorrado,
  p.ultima_compra,
  tc.tienda_compra,

  -- Cuántas personas trajo: los A4 que apuntan a alguno de sus vales. Es lo
  -- que distingue a un cliente que compra de uno que además mueve la marca.
  (
    select count(*)::integer
    from smartvale.vales hv
    join smartvale.vales sv on sv.id = hv.vale_origen_id
    where sv.contacto_id = c.id
  )                                 as referidos
from smartvale.contactos c
left join vales         v  on v.contacto_id  = c.id
left join entrada       e  on e.contacto_id  = c.id
left join compras       p  on p.contacto_id  = c.id
left join tienda_compra tc on tc.contacto_id = c.id;

comment on view smartvale.vw_contactos_detalle is
  'Una fila por persona: su puerta de entrada, quién la captó, si compró y cuánto. Incluye a quienes solo aparecen como compradores.';


-- ═══ Índices que esta vista hace rentables ═══════════════════════════════

-- La vista agrupa redenciones por contacto y no había índice por esa
-- columna: se buscaba por vale, por tienda y por usuario, nunca por quién
-- compró.
create index if not exists redenciones_contacto_idx
  on smartvale.redenciones (contacto_id);

-- El recuento de referidos entra por `vale_origen_id` y sube al contacto del
-- vale de origen.
create index if not exists vales_contacto_idx
  on smartvale.vales (contacto_id);


-- ═══ Privilegios ═════════════════════════════════════════════════════════

revoke all on smartvale.vw_contactos_detalle from public, anon, authenticated;
grant select on smartvale.vw_contactos_detalle to service_role;
