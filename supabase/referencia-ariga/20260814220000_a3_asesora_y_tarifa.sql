-- ─────────────────────────────────────────────────────────────────────────
-- ARIGA SMART VALE — A3: tarifa propia y asesora en el autorregistro
--
-- REQUIERE haber corrido antes 20260814210000_puerta_a4_referidos.sql.
--
-- 1. El A3 deja de compartir la tarifa con los demás: baja a 15% en oro y
--    35% en plata. Las tarifas pasan a resolverse por tipo, con las claves
--    `descuento_oro_a3` / `descuento_plata_a3`, y lo que no tenga clave
--    propia sigue cayendo a la tarifa general. A1, A2 y A4 no se mueven.
--
--    Como el descuento se congela dentro del vale al emitirlo, esto solo
--    afecta a los A3 nuevos: los ya entregados siguen valiendo lo que
--    prometieron.
--
-- 2. El vale que el cliente genera solo desde el QR de la tienda pasa a
--    llevar **asesora obligatoria**: quien lo atendió en el mostrador. Antes
--    no podía tenerla —un CHECK ataba `autorregistro` a `usuario_id is
--    null`—, así que esas ventas no se le acreditaban a nadie.
--
--    El crédito es de reporte, no de numeración: el vale se sigue numerando
--    con la secuencia de la tienda (AR-A3-T003-00012) y **no consume el
--    bloque** de la vendedora. Si consumiera bloque, un QR pegado en el
--    mostrador podría agotárselo sin que ella emitiera nada.
-- ─────────────────────────────────────────────────────────────────────────


-- ═══ Tarifa propia del A3 ════════════════════════════════════════════════

insert into smartvale.configuracion (clave, valor, tipo_dato, grupo, descripcion)
values
  ('descuento_oro_a3',   '15', 'numero', 'descuentos',
   '% sobre piezas de oro en los vales A3. Sin esta clave se usa descuento_oro.'),
  ('descuento_plata_a3', '35', 'numero', 'descuentos',
   '% sobre piezas de plata en los vales A3. Sin esta clave se usa descuento_plata.')
on conflict (clave) do update set valor = excluded.valor;


-- La firma vieja no se puede sustituir con `create or replace`: los
-- parámetros OUT no cuentan para identificar la función, así que añadir
-- `p_tipo` crearía una sobrecarga y `fn_tarifas_vigentes()` quedaría
-- ambigua.
drop function if exists smartvale.fn_tarifas_vigentes();

create function smartvale.fn_tarifas_vigentes(
  p_tipo smartvale.tipo_vale,
  out oro numeric,
  out plata numeric
)
language sql
stable
set search_path = ''
as $$
  -- Con p_tipo nulo la clave concatenada también sale nula, no encuentra
  -- fila y cae a la tarifa general: es la lectura "sin tipo".
  select
    smartvale.fn_config(
      'descuento_oro_' || lower(p_tipo::text),
      smartvale.fn_config('descuento_oro', 20)
    ),
    smartvale.fn_config(
      'descuento_plata_' || lower(p_tipo::text),
      smartvale.fn_config('descuento_plata', 40)
    );
$$;

comment on function smartvale.fn_tarifas_vigentes(smartvale.tipo_vale) is
  'Tarifa vigente del tipo. Cae a la general si el tipo no tiene clave propia.';


-- ═══ Un vale de autorregistro ya puede llevar asesora ════════════════════

alter table smartvale.vales
  drop constraint if exists vales_autorregistro_sin_vendedora;

-- Lo que sigue siendo cierto: si NO es autorregistro, lo emitió alguien y
-- tiene que constar. Lo que deja de serlo: que el autorregistro no tenga
-- vendedora. `autorregistro` sigue distinguiendo los dos caminos.
alter table smartvale.vales
  drop constraint if exists vales_emision_con_vendedora;
alter table smartvale.vales
  add constraint vales_emision_con_vendedora
  check (autorregistro or usuario_id is not null);

comment on column smartvale.vales.autorregistro is
  'Lo creó el propio cliente desde el QR de la tienda. Lleva asesora, pero no consume su bloque.';


-- ═══ Emisión: la tarifa se pide por tipo ═════════════════════════════════

create or replace function smartvale.fn_emitir_vale(
  p_usuario_id  bigint,
  p_tipo        smartvale.tipo_vale,
  p_nombre      text,
  p_telefono    text,
  p_correo      text default null,
  p_segmento    smartvale.segmento_a1 default null,
  p_origen      text default null,
  p_tienda_id   bigint default null,
  p_vale_origen text default null
)
returns smartvale.vales
language plpgsql
set search_path = ''
as $$
declare
  v_usuario     smartvale.usuarios%rowtype;
  v_rango       smartvale.rangos%rowtype;
  v_referidor   smartvale.vales%rowtype;
  v_origen_id   bigint;
  v_rango_id    bigint;
  v_correlativo integer;
  v_codigo      text;
  v_contacto_id bigint;
  v_oro         numeric;
  v_plata       numeric;
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

  -- El referidor: obligatorio en A4, opcional en A1 (la conversión), y
  -- fuera de lugar en cualquier otro caso.
  if p_tipo = 'A4' and nullif(btrim(coalesce(p_vale_origen, '')), '') is null then
    raise exception 'Un vale A4 necesita el código del vale de quien lo refirió.'
      using errcode = 'SV006';
  end if;

  if p_tipo not in ('A1', 'A4')
     and nullif(btrim(coalesce(p_vale_origen, '')), '') is not null then
    raise exception 'Solo los vales A4 —y los A1 que nacen de convertir uno— llevan vale de origen.'
      using errcode = 'SV006';
  end if;

  if nullif(btrim(coalesce(p_vale_origen, '')), '') is not null then
    v_referidor := smartvale.fn_vale_referidor(p_vale_origen, p_tipo);
    v_origen_id := v_referidor.id;
  end if;

  perform pg_advisory_xact_lock(825001, p_usuario_id::integer);

  if p_tipo in ('A1', 'A4') then
    -- Secuencia propia de la vendedora, sin techo: ni la llamada a la base
    -- histórica ni el boca en boca se reparten en bloques numerados.
    if p_tipo = 'A1' then
      update smartvale.usuarios
         set correlativo_a1 = correlativo_a1 + 1
       where id = p_usuario_id
      returning correlativo_a1 into v_correlativo;
    else
      update smartvale.usuarios
         set correlativo_a4 = correlativo_a4 + 1
       where id = p_usuario_id
      returning correlativo_a4 into v_correlativo;
    end if;

    v_codigo := 'AR-' || p_tipo::text || '-'
             || smartvale.fn_prefijo_vendedora(p_usuario_id)
             || '-' || lpad(v_correlativo::text, 5, '0');
    v_rango_id := null;
  else
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
    v_rango_id    := v_rango.id;

    update smartvale.rangos
       set correlativo_actual = correlativo_actual + 1
     where id = v_rango.id;

    v_codigo := 'AR-' || p_tipo::text || '-' || lpad(v_correlativo::text, 6, '0');
  end if;

  v_contacto_id := smartvale.fn_obtener_o_crear_contacto(p_nombre, p_telefono, p_correo);
  -- Por tipo: el A3 tiene tarifa propia desde esta migración.
  select oro, plata into v_oro, v_plata from smartvale.fn_tarifas_vigentes(p_tipo);
  v_dias      := smartvale.fn_config('dias_vigencia_vale', 30)::integer;
  v_tienda_id := coalesce(p_tienda_id, v_usuario.tienda_id);

  if p_tipo in ('A3', 'A4') and v_tienda_id is null then
    raise exception 'Un vale % necesita el punto de venta. Selecciónalo o asigna una tienda a la cuenta.',
      p_tipo using errcode = 'SV006';
  end if;

  insert into smartvale.vales (
    codigo, tipo, correlativo, usuario_id, rango_id, contacto_id,
    segmento, origen, tienda_id,
    descuento_pct, descuento_oro_pct, descuento_plata_pct,
    fecha_vencimiento, vale_origen_id
  )
  values (
    v_codigo, p_tipo, v_correlativo, p_usuario_id, v_rango_id, v_contacto_id,
    p_segmento, nullif(btrim(coalesce(p_origen, '')), ''), v_tienda_id,
    v_oro, v_oro, v_plata,
    now() + make_interval(days => v_dias), v_origen_id
  )
  returning * into v_vale;

  return v_vale;
end;
$$;


-- ═══ Autorregistro: ahora con asesora ════════════════════════════════════

create or replace function smartvale.fn_autorregistro_a3(
  p_token            text,
  p_nombre           text,
  p_telefono         text,
  p_correo           text default null,
  p_codigo_referidor text default null,
  p_usuario_id       bigint default null
)
returns smartvale.vales
language plpgsql
set search_path = ''
as $$
declare
  v_tienda      smartvale.tiendas%rowtype;
  v_asesora     smartvale.usuarios%rowtype;
  v_contacto_id bigint;
  v_existente   smartvale.vales%rowtype;
  v_referidor   smartvale.vales%rowtype;
  v_origen_id   bigint;
  v_tipo        smartvale.tipo_vale;
  v_correlativo integer;
  v_oro         numeric;
  v_plata       numeric;
  v_dias        integer;
  v_vale        smartvale.vales%rowtype;
begin
  select * into v_tienda
    from smartvale.tiendas
   where token = btrim(p_token) and activo;

  if not found then
    raise exception 'Este código de tienda no es válido.' using errcode = 'SV007';
  end if;

  if not v_tienda.autorregistro then
    raise exception 'El registro desde esta tienda está desactivado por el momento.'
      using errcode = 'SV008';
  end if;

  -- La asesora es obligatoria: es lo que convierte el registro en una venta
  -- atribuible. SV010 señala ese campo y no la pantalla entera, porque es lo
  -- único que el cliente puede corregir.
  if p_usuario_id is null then
    raise exception 'Elige quién te atendió en la tienda.' using errcode = 'SV010';
  end if;

  select * into v_asesora
    from smartvale.usuarios
   where id = p_usuario_id and activo;

  if not found then
    raise exception 'Esa asesora ya no está disponible. Elige otra de la lista.'
      using errcode = 'SV010';
  end if;

  -- Lo que decide la puerta: si el cliente escribió el código del vale que
  -- le enseñaron, entra como referido; si no, como visitante. El formulario
  -- público dejó de preguntarlo, así que hoy siempre sale A3; el camino se
  -- queda montado porque volver a abrirlo es cosa de la interfaz.
  if nullif(btrim(coalesce(p_codigo_referidor, '')), '') is not null then
    v_referidor := smartvale.fn_vale_referidor(p_codigo_referidor, 'A4');
    v_origen_id := v_referidor.id;
    v_tipo      := 'A4';
  else
    v_tipo := 'A3';
  end if;

  v_contacto_id := smartvale.fn_obtener_o_crear_contacto(p_nombre, p_telefono, p_correo);

  select * into v_existente
    from smartvale.vales
   where contacto_id = v_contacto_id
     and tienda_id = v_tienda.id
     and autorregistro
     and not anulado
     and fecha_vencimiento > now()
   order by fecha_emision desc
   limit 1;

  if found then
    -- Ya tiene un vale vivo en esta tienda: darle otro sería regalarle dos
    -- descuentos por el mismo registro. Pero si esta vez sí trajo código y
    -- el vale que tiene no sabía de dónde venía, se le anota el origen: el
    -- dato del referidor es lo que da valor a la puerta.
    if v_origen_id is not null and v_existente.vale_origen_id is null then
      update smartvale.vales
         set vale_origen_id = v_origen_id
       where id = v_existente.id
      returning * into v_existente;
    end if;

    -- Lo mismo con la asesora: si el vale venía sin acreditar —de antes de
    -- esta migración— se le pone ahora. Si ya tenía una, no se le quita.
    if v_existente.usuario_id is null then
      update smartvale.vales
         set usuario_id = p_usuario_id
       where id = v_existente.id
      returning * into v_existente;
    end if;

    return v_existente;
  end if;

  perform pg_advisory_xact_lock(825003, v_tienda.id::integer);

  if v_tipo = 'A4' then
    update smartvale.tiendas
       set correlativo_a4 = correlativo_a4 + 1
     where id = v_tienda.id
    returning correlativo_a4 into v_correlativo;
  else
    update smartvale.tiendas
       set correlativo_a3 = correlativo_a3 + 1
     where id = v_tienda.id
    returning correlativo_a3 into v_correlativo;
  end if;

  select oro, plata into v_oro, v_plata from smartvale.fn_tarifas_vigentes(v_tipo);
  v_dias := smartvale.fn_config('dias_vigencia_vale', 30)::integer;

  insert into smartvale.vales (
    codigo, tipo, correlativo, usuario_id, rango_id, contacto_id,
    tienda_id, descuento_pct, descuento_oro_pct, descuento_plata_pct,
    fecha_vencimiento, autorregistro, vale_origen_id
  )
  values (
    'AR-' || v_tipo::text || '-' || smartvale.fn_prefijo_tienda(v_tienda.id)
          || '-' || lpad(v_correlativo::text, 5, '0'),
    -- La asesora consta, pero `rango_id` va nulo: el QR no gasta su bloque.
    v_tipo, v_correlativo, p_usuario_id, null, v_contacto_id,
    v_tienda.id, v_oro, v_oro, v_plata,
    now() + make_interval(days => v_dias), true, v_origen_id
  )
  returning * into v_vale;

  return v_vale;
end;
$$;


-- ═══ Privilegios ═════════════════════════════════════════════════════════

revoke execute on function
  smartvale.fn_tarifas_vigentes(smartvale.tipo_vale),
  smartvale.fn_emitir_vale(bigint, smartvale.tipo_vale, text, text, text,
                           smartvale.segmento_a1, text, bigint, text),
  smartvale.fn_autorregistro_a3(text, text, text, text, text, bigint)
from public, anon, authenticated;

grant execute on function
  smartvale.fn_tarifas_vigentes(smartvale.tipo_vale),
  smartvale.fn_emitir_vale(bigint, smartvale.tipo_vale, text, text, text,
                           smartvale.segmento_a1, text, bigint, text),
  smartvale.fn_autorregistro_a3(text, text, text, text, text, bigint)
to service_role;


-- ═══ La firma vieja queda huérfana ═══════════════════════════════════════

-- `create or replace function` con un parámetro nuevo al final crea una
-- sobrecarga en vez de sustituir. Si se quedan las dos, PostgREST no sabe
-- cuál llamar y responde 300 Multiple Choices.
drop function if exists smartvale.fn_autorregistro_a3(text, text, text, text, text);
