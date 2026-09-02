-- ─────────────────────────────────────────────────────────────────────────
-- ARIGA SMART VALE — funciones de negocio y vistas de métricas
--
-- Todo lo que necesita atomicidad real vive aquí, no en la capa de Node:
-- tomar un correlativo del rango es una carrera si se hace en dos viajes.
--
-- Códigos de error propios, para que la aplicación pueda ramificar sin
-- comparar cadenas de texto:
--   SV001  rango agotado o vendedora sin rango asignado
--   SV002  vale inexistente
--   SV003  vale vencido
--   SV004  vale anulado
--   SV005  usuario inactivo o inexistente
-- ─────────────────────────────────────────────────────────────────────────

-- ═══ Utilidades ══════════════════════════════════════════════════════════

create or replace function smartvale.fn_normalizar_telefono(p_telefono text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(regexp_replace(coalesce(p_telefono, ''), '[^0-9]', '', 'g'), '');
$$;

comment on function smartvale.fn_normalizar_telefono is
  'Deja solo dígitos. Es la forma que espera wa.me y la clave de deduplicación.';


create or replace function smartvale.fn_config(p_clave text, p_defecto numeric default null)
returns numeric
language sql
stable
set search_path = ''
as $$
  select coalesce(
    (select c.valor::numeric from smartvale.configuracion c where c.clave = p_clave),
    p_defecto
  );
$$;


-- Traduce tipo + segmento a la clave de configuración correspondiente.
create or replace function smartvale.fn_descuento_de(
  p_tipo     smartvale.tipo_vale,
  p_segmento smartvale.segmento_a1 default null
)
returns numeric
language sql
stable
set search_path = ''
as $$
  select smartvale.fn_config(
    case
      when p_tipo = 'A1' then 'descuento_' || lower(replace(p_segmento::text, '-', '_'))
      else 'descuento_' || lower(p_tipo::text)
    end,
    0
  );
$$;

comment on function smartvale.fn_descuento_de is
  'A1 usa el segmento (descuento_a1_vip…); A2 y A3 su clave directa.';


-- ═══ Contactos ═══════════════════════════════════════════════════════════

create or replace function smartvale.fn_obtener_o_crear_contacto(
  p_nombre   text,
  p_telefono text,
  p_correo   text default null
)
returns bigint
language plpgsql
set search_path = ''
as $$
declare
  v_telefono text := smartvale.fn_normalizar_telefono(p_telefono);
  v_nombre   text := btrim(coalesce(p_nombre, ''));
  v_correo   text := nullif(lower(btrim(coalesce(p_correo, ''))), '');
  v_id       bigint;
begin
  if v_telefono is null then
    raise exception 'El teléfono es obligatorio.' using errcode = 'SV006';
  end if;

  if v_nombre = '' then
    raise exception 'El nombre es obligatorio.' using errcode = 'SV006';
  end if;

  -- Si el contacto ya existe se conserva su historia y solo se completan
  -- los datos que antes faltaban.
  insert into smartvale.contactos (nombre, telefono, correo)
  values (v_nombre, v_telefono, v_correo)
  -- El nombre de la tabla sin esquema es la referencia correcta al destino
  -- dentro de ON CONFLICT; no depende de search_path.
  on conflict (telefono) do update
    set nombre = excluded.nombre,
        correo = coalesce(excluded.correo, contactos.correo)
  returning id into v_id;

  return v_id;
end;
$$;


-- ═══ Emisión ═════════════════════════════════════════════════════════════

create or replace function smartvale.fn_emitir_vale(
  p_usuario_id bigint,
  p_tipo       smartvale.tipo_vale,
  p_nombre     text,
  p_telefono   text,
  p_correo     text default null,
  p_segmento   smartvale.segmento_a1 default null,
  p_origen     text default null,
  p_tienda_id  bigint default null
)
returns smartvale.vales
language plpgsql
set search_path = ''
as $$
declare
  v_usuario     smartvale.usuarios%rowtype;
  v_rango       smartvale.rangos%rowtype;
  v_correlativo integer;
  v_contacto_id bigint;
  v_descuento   numeric;
  v_dias        integer;
  v_tienda_id   bigint;
  v_vale        smartvale.vales%rowtype;
begin
  select * into v_usuario
    from smartvale.usuarios
   where id = p_usuario_id and activo;

  if not found then
    raise exception 'La cuenta no existe o está desactivada.' using errcode = 'SV005';
  end if;

  -- Validar aquí y no solo con los CHECK de la tabla: así el mensaje que
  -- llega a la vendedora dice qué falta, en vez del nombre de una restricción.
  if p_tipo = 'A1' and p_segmento is null then
    raise exception 'Un vale A1 necesita la clasificación del cliente (30, 60, 90 o VIP).'
      using errcode = 'SV006';
  end if;

  if p_tipo <> 'A1' and p_segmento is not null then
    raise exception 'La clasificación por segmento solo aplica a los vales A1.'
      using errcode = 'SV006';
  end if;

  if p_tipo = 'A2' and nullif(btrim(coalesce(p_origen, '')), '') is null then
    raise exception 'Un vale A2 necesita el origen de la prospección (empresa o centro comercial).'
      using errcode = 'SV006';
  end if;

  if p_tipo <> 'A2' and nullif(btrim(coalesce(p_origen, '')), '') is not null then
    raise exception 'El origen de prospección solo aplica a los vales A2.'
      using errcode = 'SV006';
  end if;

  -- Serializa las emisiones de esta vendedora durante la transacción. Es la
  -- forma más simple de garantizar correlativos sin huecos ni repeticiones:
  -- dos pestañas abiertas no pueden tomar el mismo número.
  perform pg_advisory_xact_lock(825001, p_usuario_id::integer);

  select * into v_rango
    from smartvale.rangos
   where usuario_id = p_usuario_id
     and activo
     and correlativo_actual <= rango_fin
   order by rango_inicio
   limit 1;

  if not found then
    raise exception
      'Ha alcanzado el límite de su rango asignado. Contacte al administrador para asignar un nuevo bloque.'
      using errcode = 'SV001';
  end if;

  v_correlativo := v_rango.correlativo_actual;

  update smartvale.rangos
     set correlativo_actual = correlativo_actual + 1
   where id = v_rango.id;

  v_contacto_id := smartvale.fn_obtener_o_crear_contacto(p_nombre, p_telefono, p_correo);
  v_descuento   := smartvale.fn_descuento_de(p_tipo, p_segmento);
  v_dias        := smartvale.fn_config('dias_vigencia_vale', 30)::integer;

  -- En A3 el punto de venta es obligatorio; si no viene explícito se toma
  -- la tienda de la vendedora.
  v_tienda_id := coalesce(p_tienda_id, v_usuario.tienda_id);

  if p_tipo = 'A3' and v_tienda_id is null then
    raise exception 'Un vale A3 necesita el punto de venta. Selecciónalo o asigna una tienda a la cuenta.'
      using errcode = 'SV006';
  end if;

  insert into smartvale.vales (
    codigo, tipo, correlativo, usuario_id, rango_id, contacto_id,
    segmento, origen, tienda_id, descuento_pct, fecha_vencimiento
  )
  values (
    'AR-' || p_tipo::text || '-' || lpad(v_correlativo::text, 6, '0'),
    p_tipo,
    v_correlativo,
    p_usuario_id,
    v_rango.id,
    v_contacto_id,
    p_segmento,
    nullif(btrim(coalesce(p_origen, '')), ''),
    v_tienda_id,
    v_descuento,
    now() + make_interval(days => v_dias)
  )
  returning * into v_vale;

  return v_vale;
end;
$$;

comment on function smartvale.fn_emitir_vale is
  'Emite un vale consumiendo un correlativo del rango activo de la vendedora. Atómica.';


-- ═══ Validación (lo que consulta el escáner) ═════════════════════════════

create or replace function smartvale.fn_validar_vale(p_codigo text)
returns table (
  vale_id            bigint,
  codigo             text,
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
    v.id,
    v.codigo,
    v.tipo,
    v.segmento,
    v.descuento_pct,
    c.nombre,
    c.telefono,
    u.nombre,
    v.fecha_emision,
    v.fecha_vencimiento,
    case
      when v.anulado                      then 'anulado'
      when now() > v.fecha_vencimiento     then 'vencido'
      else 'activo'
    end,
    not v.anulado and now() <= v.fecha_vencimiento,
    (select count(*)::integer from smartvale.redenciones r where r.vale_id = v.id)
  from smartvale.vales v
  join smartvale.contactos c on c.id = v.contacto_id
  join smartvale.usuarios  u on u.id = v.usuario_id
  where upper(btrim(v.codigo)) = upper(btrim(p_codigo));
$$;


-- ═══ Redención ═══════════════════════════════════════════════════════════

create or replace function smartvale.fn_registrar_redencion(
  p_codigo     text,
  p_usuario_id bigint,
  p_tienda_id  bigint,
  p_nombre     text,
  p_telefono   text,
  p_correo     text,
  p_monto      numeric,
  p_ticket     text,
  p_descuento  numeric default null,
  p_nota       text default null
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

  -- Si no se captura el descuento se calcula con el % congelado en el vale.
  v_descuento := coalesce(p_descuento, round(p_monto * v_vale.descuento_pct / 100, 2));

  insert into smartvale.redenciones (
    vale_id, usuario_id, tienda_id, contacto_id,
    monto_compra, descuento_aplicado, ticket, nota
  )
  values (
    v_vale.id, p_usuario_id, p_tienda_id, v_contacto_id,
    p_monto, v_descuento, btrim(p_ticket), nullif(btrim(coalesce(p_nota, '')), '')
  )
  returning * into v_redencion;

  -- El vale NO se marca como usado: admite redenciones ilimitadas mientras
  -- siga vigente. Esa es la regla del negocio, no un olvido.
  return v_redencion;
end;
$$;


-- ═══ Anulación ═══════════════════════════════════════════════════════════

create or replace function smartvale.fn_anular_vale(
  p_codigo     text,
  p_usuario_id bigint,
  p_motivo     text
)
returns smartvale.vales
language plpgsql
set search_path = ''
as $$
declare
  v_vale smartvale.vales%rowtype;
begin
  update smartvale.vales
     set anulado          = true,
         motivo_anulacion = nullif(btrim(coalesce(p_motivo, '')), ''),
         anulado_por      = p_usuario_id,
         fecha_anulacion  = now()
   where upper(btrim(codigo)) = upper(btrim(p_codigo))
     and not anulado
  returning * into v_vale;

  if not found then
    raise exception 'El vale % no existe o ya estaba anulado.', p_codigo
      using errcode = 'SV002';
  end if;

  return v_vale;
end;
$$;


-- ═══ Asignación de rangos ════════════════════════════════════════════════

create or replace function smartvale.fn_asignar_rango(
  p_usuario_id  bigint,
  p_asignado_por bigint,
  p_tamano      integer default null,
  p_nota        text default null
)
returns smartvale.rangos
language plpgsql
set search_path = ''
as $$
declare
  v_tamano  integer := coalesce(p_tamano, smartvale.fn_config('vales_por_rango', 100)::integer);
  v_inicio  integer;
  v_rango   smartvale.rangos%rowtype;
begin
  if not exists (select 1 from smartvale.usuarios where id = p_usuario_id and activo) then
    raise exception 'La cuenta no existe o está desactivada.' using errcode = 'SV005';
  end if;

  -- Serializa la asignación para que dos administradores simultáneos no
  -- calculen el mismo bloque inicial.
  perform pg_advisory_xact_lock(825002);

  -- El siguiente bloque libre arranca justo después del último asignado.
  select coalesce(max(rango_fin) + 1, 0) into v_inicio from smartvale.rangos;

  insert into smartvale.rangos (
    usuario_id, rango_inicio, rango_fin, correlativo_actual, asignado_por, nota
  )
  values (
    p_usuario_id, v_inicio, v_inicio + v_tamano - 1, v_inicio, p_asignado_por,
    nullif(btrim(coalesce(p_nota, '')), '')
  )
  returning * into v_rango;

  return v_rango;
end;
$$;

comment on function smartvale.fn_asignar_rango is
  'Asigna el siguiente bloque libre. Los bloques nunca se solapan (ver rangos_sin_solape).';


-- ═══ Limpieza de sesiones vencidas ═══════════════════════════════════════

create or replace function smartvale.fn_purgar_sesiones()
returns integer
language sql
set search_path = ''
as $$
  with borradas as (
    delete from smartvale.sesiones where expira_en < now() returning 1
  )
  select count(*)::integer from borradas;
$$;


-- ═══════════════════════════════════════════════════════════════════════════
-- VISTAS DE MÉTRICAS (sección 7 de la especificación)
-- ═══════════════════════════════════════════════════════════════════════════

-- Base: un vale con su estado derivado y su desempeño acumulado.
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
    when v.anulado                  then 'anulado'
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
  r.ultima                 as ultima_redencion
from smartvale.vales v
join smartvale.contactos c on c.id = v.contacto_id
join smartvale.usuarios  u on u.id = v.usuario_id
left join smartvale.tiendas t on t.id = v.tienda_id
left join lateral (
  select
    count(*)::integer          as total,
    sum(rd.monto_compra)       as monto,
    sum(rd.descuento_aplicado) as descuento,
    max(rd.fecha_creacion)     as ultima
  from smartvale.redenciones rd
  where rd.vale_id = v.id
) r on true;


-- Tarjeta única de indicadores globales.
create or replace view smartvale.vw_metricas_generales as
select
  count(*)::integer                                              as vales_emitidos,
  count(*) filter (where estado = 'activo')::integer             as vales_activos,
  count(*) filter (where estado = 'vencido')::integer            as vales_vencidos,
  count(*) filter (where estado = 'anulado')::integer            as vales_anulados,
  coalesce(sum(total_redenciones), 0)::integer                   as redenciones,
  count(*) filter (where total_redenciones > 0)::integer         as vales_con_compra,
  round(
    100.0 * count(*) filter (where total_redenciones > 0)
          / nullif(count(*), 0)
  , 2)                                                           as tasa_conversion,
  coalesce(sum(ingreso_generado), 0)                             as ingreso_total,
  round(
    coalesce(sum(ingreso_generado), 0)
    / nullif(sum(total_redenciones), 0)
  , 2)                                                           as ticket_promedio,
  coalesce(sum(descuento_otorgado), 0)                           as descuento_total,
  round(
    100.0 * coalesce(sum(descuento_otorgado), 0)
          / nullif(sum(ingreso_generado), 0)
  , 2)                                                           as descuento_sobre_venta
from smartvale.vw_vales_detalle;


-- Adquisición por puerta de entrada.
create or replace view smartvale.vw_vales_por_tipo as
select
  tipo,
  count(*)::integer                                      as vales,
  coalesce(sum(total_redenciones), 0)::integer           as redenciones,
  count(*) filter (where total_redenciones > 0)::integer as vales_con_compra,
  round(
    100.0 * count(*) filter (where total_redenciones > 0) / nullif(count(*), 0)
  , 2)                                                   as tasa_conversion,
  coalesce(sum(ingreso_generado), 0)                     as ingreso,
  coalesce(sum(descuento_otorgado), 0)                   as descuento
from smartvale.vw_vales_detalle
group by tipo;


-- Ranking de vendedoras: emisión, conversión y venta generada.
create or replace view smartvale.vw_ranking_vendedoras as
select
  d.usuario_id,
  d.emisora,
  count(*)::integer                                        as vales_emitidos,
  coalesce(sum(d.total_redenciones), 0)::integer           as redenciones,
  count(*) filter (where d.total_redenciones > 0)::integer as vales_con_compra,
  round(
    100.0 * count(*) filter (where d.total_redenciones > 0) / nullif(count(*), 0)
  , 2)                                                     as tasa_conversion,
  coalesce(sum(d.ingreso_generado), 0)                     as ingreso_generado,
  coalesce(sum(d.descuento_otorgado), 0)                   as descuento_otorgado
from smartvale.vw_vales_detalle d
group by d.usuario_id, d.emisora;


-- Ranking de tiendas: se mide dónde se COMPRA, no dónde se emitió el vale.
create or replace view smartvale.vw_ranking_tiendas as
select
  t.id as tienda_id,
  t.nombre as tienda,
  count(r.id)::integer                        as redenciones,
  count(distinct r.vale_id)::integer          as vales_distintos,
  coalesce(sum(r.monto_compra), 0)            as ingreso,
  coalesce(sum(r.descuento_aplicado), 0)      as descuento,
  round(avg(r.monto_compra), 2)               as ticket_promedio
from smartvale.tiendas t
left join smartvale.redenciones r on r.tienda_id = t.id
group by t.id, t.nombre;


-- Viralidad de A2: cuántas veces se comparte y se usa cada vale en frío.
create or replace view smartvale.vw_viralidad_a2 as
select
  count(*)::integer                                      as vales_a2,
  coalesce(sum(total_redenciones), 0)::integer           as redenciones_a2,
  round(
    coalesce(sum(total_redenciones), 0)::numeric / nullif(count(*), 0)
  , 2)                                                   as redenciones_por_vale,
  max(total_redenciones)                                 as alcance_maximo,
  count(*) filter (where total_redenciones > 1)::integer as vales_compartidos,
  coalesce(sum(ingreso_generado), 0)                     as ingreso_a2
from smartvale.vw_vales_detalle
where tipo = 'A2';


-- Serie diaria para las gráficas del tablero.
create or replace view smartvale.vw_actividad_diaria as
select
  dia,
  sum(vales_emitidos)::integer as vales_emitidos,
  sum(redenciones)::integer    as redenciones,
  sum(ingreso)                 as ingreso
from (
  select date_trunc('day', fecha_creacion)::date as dia,
         count(*) as vales_emitidos, 0 as redenciones, 0::numeric as ingreso
    from smartvale.vales
   group by 1
  union all
  select date_trunc('day', fecha_creacion)::date,
         0, count(*), coalesce(sum(monto_compra), 0)
    from smartvale.redenciones
   group by 1
) s
group by dia;


-- ═══ Privilegios ═════════════════════════════════════════════════════════
-- Solo el rol de servicio. `anon` y `authenticated` no tocan nada.

-- Postgres concede EXECUTE a PUBLIC por defecto en cada función nueva, y
-- `anon` hereda de PUBLIC. Revocarlo explícitamente evita que la API pública
-- pueda invocar las funciones de negocio por RPC.
revoke execute on all functions in schema smartvale from public;
revoke all on all functions in schema smartvale from anon, authenticated;
revoke all on all tables in schema smartvale from anon, authenticated;

grant all on all tables in schema smartvale to service_role;
grant all on all sequences in schema smartvale to service_role;
grant execute on all functions in schema smartvale to service_role;
