-- ─────────────────────────────────────────────────────────────────────────
-- ARIGA SMART VALE — enlace público con token, cadena A2 y aviso de
-- vencimiento
--
-- 1. El correlativo es consecutivo por diseño, así que `/v/AR-A1-000045` se
--    puede recorrer a mano: cualquiera cosechaba descuentos válidos sin que
--    se los hubieran entregado, y de paso leía el nombre de la clienta. El
--    código se queda para dictarlo en caja; el enlace público pasa a llevar
--    un token aleatorio.
-- 2. Los vales A2 se comparten, pero no se sabía por quién. Cada redención
--    puede registrar quién pasó el vale.
-- 3. El correo del comprador deja de ser obligatorio: en caja frena la fila
--    y mucha gente no lo da.
-- ─────────────────────────────────────────────────────────────────────────

-- ═══ Token del enlace público ════════════════════════════════════════════

-- 22 caracteres seguros para URL a partir de un UUID aleatorio: 128 bits de
-- entropía, imposible de adivinar recorriendo números.
create or replace function smartvale.fn_token_vale()
returns text
language sql
volatile
set search_path = ''
as $$
  select translate(
    encode(uuid_send(gen_random_uuid()), 'base64'),
    '+/=', '-_'
  );
$$;

alter table smartvale.vales
  add column if not exists token text;

-- Los vales ya emitidos reciben el suyo antes de exigirlo.
update smartvale.vales
   set token = smartvale.fn_token_vale()
 where token is null;

alter table smartvale.vales
  alter column token set not null,
  alter column token set default smartvale.fn_token_vale();

create unique index if not exists vales_token_idx on smartvale.vales (token);

comment on column smartvale.vales.token is
  'Identificador del enlace público. El código es para dictarlo; esto para compartirlo.';


-- ═══ Cadena de difusión ══════════════════════════════════════════════════

alter table smartvale.redenciones
  add column if not exists referido_por text;

comment on column smartvale.redenciones.referido_por is
  'Quién le pasó el vale al comprador. Nulo = lo usó el propio portador.';


-- ═══ Aviso de vencimiento ════════════════════════════════════════════════

insert into smartvale.configuracion (clave, valor, tipo_dato, grupo, descripcion)
values ('dias_aviso_vencimiento', '7', 'numero', 'vales',
        'Días de antelación con que se avisa que un vale está por vencer')
on conflict (clave) do nothing;


-- ═══ Vista de detalle, con el token y la difusión ════════════════════════
--
-- Las tres columnas nuevas van al FINAL, no intercaladas. `create or replace
-- view` solo sabe añadir al final: mover o renombrar una existente obliga a
-- borrar la vista y con ella las cinco que dependen de esta.

create or replace view smartvale.vw_vales_detalle as
select
  v.id,
  v.codigo,
  v.tipo,
  v.correlativo,
  v.segmento,
  v.origen,
  v.descuento_pct,
  v.fecha_emision,
  v.fecha_vencimiento,
  v.anulado,
  v.motivo_anulacion,
  v.fecha_creacion,
  case
    when v.anulado                   then 'anulado'
    when now() > v.fecha_vencimiento then 'vencido'
    else 'activo'
  end as estado,
  v.usuario_id,
  u.nombre  as emisora,
  v.contacto_id,
  c.nombre   as portador,
  c.telefono as portador_telefono,
  c.correo   as portador_correo,
  v.tienda_id,
  t.nombre as tienda,
  coalesce(r.total, 0)     as total_redenciones,
  coalesce(r.monto, 0)     as ingreso_generado,
  coalesce(r.descuento, 0) as descuento_otorgado,
  r.ultima                 as ultima_redencion,

  -- ── Columnas nuevas, siempre al final ──
  v.token,
  -- Días que faltan para vencer. Negativo si ya venció.
  extract(
    day from (date_trunc('day', v.fecha_vencimiento) - date_trunc('day', now()))
  )::integer                as dias_restantes,
  coalesce(r.difundidas, 0) as redenciones_difundidas
from smartvale.vales v
join smartvale.contactos c on c.id = v.contacto_id
join smartvale.usuarios  u on u.id = v.usuario_id
left join smartvale.tiendas t on t.id = v.tienda_id
left join lateral (
  select
    count(*)::integer                                            as total,
    count(*) filter (where rd.referido_por is not null)::integer as difundidas,
    sum(rd.monto_compra)                                         as monto,
    sum(rd.descuento_aplicado)                                   as descuento,
    max(rd.fecha_creacion)                                       as ultima
  from smartvale.redenciones rd
  where rd.vale_id = v.id
) r on true;


-- ═══ Validación: ahora también devuelve el token ═════════════════════════

drop function if exists smartvale.fn_validar_vale(text);

create function smartvale.fn_validar_vale(p_codigo text)
returns table (
  vale_id            bigint,
  codigo             text,
  token              text,
  tipo               smartvale.tipo_vale,
  segmento           smartvale.segmento_a1,
  descuento_pct      numeric,
  portador           text,
  portador_telefono  text,
  emisora            text,
  fecha_emision      timestamptz,
  fecha_vencimiento  timestamptz,
  estado             text,
  redimible          boolean,
  total_redenciones  integer
)
language sql
stable
set search_path = ''
as $$
  select
    v.id, v.codigo, v.token, v.tipo, v.segmento, v.descuento_pct,
    c.nombre, c.telefono, u.nombre,
    v.fecha_emision, v.fecha_vencimiento,
    case
      when v.anulado                   then 'anulado'
      when now() > v.fecha_vencimiento then 'vencido'
      else 'activo'
    end,
    not v.anulado and now() <= v.fecha_vencimiento,
    (select count(*)::integer from smartvale.redenciones r where r.vale_id = v.id)
  from smartvale.vales v
  join smartvale.contactos c on c.id = v.contacto_id
  join smartvale.usuarios  u on u.id = v.usuario_id
  where upper(btrim(v.codigo)) = upper(btrim(p_codigo));
$$;


-- ═══ Redención: correo opcional y quién difundió el vale ═════════════════

drop function if exists smartvale.fn_registrar_redencion(
  text, bigint, bigint, text, text, text, numeric, text, numeric, text);

create function smartvale.fn_registrar_redencion(
  p_codigo       text,
  p_usuario_id   bigint,
  p_tienda_id    bigint,
  p_nombre       text,
  p_telefono     text,
  p_correo       text default null,
  p_monto        numeric default null,
  p_ticket       text default null,
  p_descuento    numeric default null,
  p_nota         text default null,
  p_referido_por text default null
)
returns smartvale.redenciones
language plpgsql
set search_path = ''
as $$
declare
  v_vale        smartvale.vales%rowtype;
  v_contacto_id bigint;
  v_descuento   numeric;
  v_redencion   smartvale.redenciones%rowtype;
begin
  select * into v_vale
    from smartvale.vales
   where upper(btrim(codigo)) = upper(btrim(p_codigo));

  if not found then
    raise exception 'El vale % no existe.', p_codigo using errcode = 'SV002';
  end if;

  if v_vale.anulado then
    raise exception 'El vale % está anulado.', v_vale.codigo using errcode = 'SV004';
  end if;

  if now() > v_vale.fecha_vencimiento then
    raise exception 'El vale % venció el %.',
      v_vale.codigo, to_char(v_vale.fecha_vencimiento, 'DD/MM/YYYY')
      using errcode = 'SV003';
  end if;

  if not exists (select 1 from smartvale.usuarios where id = p_usuario_id and activo) then
    raise exception 'La cuenta no existe o está desactivada.' using errcode = 'SV005';
  end if;

  v_contacto_id := smartvale.fn_obtener_o_crear_contacto(p_nombre, p_telefono, p_correo);

  -- Sin descuento capturado se calcula con el % congelado en el vale.
  v_descuento := coalesce(p_descuento, round(p_monto * v_vale.descuento_pct / 100, 2));

  insert into smartvale.redenciones (
    vale_id, usuario_id, tienda_id, contacto_id,
    monto_compra, descuento_aplicado, ticket, nota, referido_por
  )
  values (
    v_vale.id, p_usuario_id, p_tienda_id, v_contacto_id,
    p_monto, v_descuento, btrim(p_ticket),
    nullif(btrim(coalesce(p_nota, '')), ''),
    nullif(btrim(coalesce(p_referido_por, '')), '')
  )
  returning * into v_redencion;

  -- El vale NO se marca como usado: admite redenciones ilimitadas mientras
  -- siga vigente. Esa es la regla del negocio, no un olvido.
  return v_redencion;
end;
$$;


-- ═══ Contactos: el correo deja de ser obligatorio ════════════════════════
-- La función ya lo aceptaba nulo; se explicita que un contacto sin correo es
-- un estado legítimo y no un dato pendiente.

comment on column smartvale.contactos.correo is
  'Opcional. En caja frena la fila y mucha gente no lo da.';


-- ═══ Vales por vencer ════════════════════════════════════════════════════
-- Con `p_usuario_id` nulo devuelve los de toda la operación; con un id, los
-- de esa vendedora. Ordenados por urgencia.

create or replace function smartvale.fn_vales_por_vencer(
  p_usuario_id bigint default null,
  p_dias       integer default null
)
returns table (
  vale_id           bigint,
  codigo            text,
  token             text,
  tipo              smartvale.tipo_vale,
  descuento_pct     numeric,
  portador          text,
  portador_telefono text,
  emisora           text,
  usuario_id        bigint,
  fecha_vencimiento timestamptz,
  dias_restantes    integer,
  total_redenciones integer
)
language sql
stable
set search_path = ''
as $$
  select
    d.id, d.codigo, d.token, d.tipo, d.descuento_pct,
    d.portador, d.portador_telefono, d.emisora, d.usuario_id,
    d.fecha_vencimiento, d.dias_restantes, d.total_redenciones
  from smartvale.vw_vales_detalle d
  where d.estado = 'activo'
    and d.dias_restantes <= coalesce(
      p_dias,
      smartvale.fn_config('dias_aviso_vencimiento', 7)::integer
    )
    and (p_usuario_id is null or d.usuario_id = p_usuario_id)
  order by d.dias_restantes, d.total_redenciones, d.fecha_vencimiento;
$$;


-- ═══ Viralidad A2: cuánto salió del círculo del portador ═════════════════

-- Mismo motivo que arriba: lo nuevo va al final para no reordenar columnas.
create or replace view smartvale.vw_viralidad_a2 as
select
  count(*)::integer                                      as vales_a2,
  coalesce(sum(total_redenciones), 0)::integer           as redenciones_a2,
  round(
    coalesce(sum(total_redenciones), 0)::numeric / nullif(count(*), 0)
  , 2)                                                   as redenciones_por_vale,
  max(total_redenciones)                                 as alcance_maximo,
  count(*) filter (where total_redenciones > 1)::integer as vales_compartidos,
  coalesce(sum(ingreso_generado), 0)                     as ingreso_a2,

  -- ── Columnas nuevas ──
  coalesce(sum(redenciones_difundidas), 0)::integer      as redenciones_difundidas,
  round(
    100.0 * coalesce(sum(redenciones_difundidas), 0)
          / nullif(sum(total_redenciones), 0)
  , 2)                                                   as porcentaje_difusion
from smartvale.vw_vales_detalle
where tipo = 'A2';


-- ═══ Privilegios ═════════════════════════════════════════════════════════

revoke execute on function
  smartvale.fn_token_vale(),
  smartvale.fn_validar_vale(text),
  smartvale.fn_vales_por_vencer(bigint, integer)
from public, anon, authenticated;

grant execute on function
  smartvale.fn_token_vale(),
  smartvale.fn_validar_vale(text),
  smartvale.fn_vales_por_vencer(bigint, integer),
  smartvale.fn_registrar_redencion(text, bigint, bigint, text, text, text,
                                   numeric, text, numeric, text, text)
to service_role;

revoke all on smartvale.vw_vales_detalle, smartvale.vw_viralidad_a2
  from public, anon, authenticated;
grant select on smartvale.vw_vales_detalle, smartvale.vw_viralidad_a2
  to service_role;
