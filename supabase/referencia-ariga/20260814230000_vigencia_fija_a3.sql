-- ─────────────────────────────────────────────────────────────────────────
-- ARIGA SMART VALE — vigencia con fecha de corte
--
-- REQUIERE haber corrido antes 20260814220000_a3_asesora_y_tarifa.sql.
--
-- Hasta ahora todo vale vivía 30 días desde que se emitía. Eso sirve para
-- una entrega continua, pero no para una campaña con fecha de cierre: el
-- A3 tiene que terminar el 31 de octubre, lo emita quien lo emita y el día
-- que lo emita. Un A3 dado el 30 de octubre dura un día, y así debe ser.
--
-- La fecha se resuelve por tipo con la misma cascada que las tarifas:
--
--     vigencia_hasta_a3   →   vigencia_hasta   →   dias_vigencia_vale
--     (la del tipo)           (la general)         (ventana rodante)
--
-- Vacía la clave, se vuelve a la ventana de días. Así apagar la campaña es
-- borrar un valor, no desplegar código.
--
-- La fecha se guarda como día suelto (2026-10-31) y se convierte al último
-- instante de ESE día en Guatemala. Guardarla como marca de tiempo invitaba
-- a que alguien escribiera la medianoche y dejara el vale muerto durante
-- toda su última jornada.
-- ─────────────────────────────────────────────────────────────────────────

-- ═══ Configuración ═══════════════════════════════════════════════════════

insert into smartvale.configuracion (clave, valor, tipo_dato, grupo, descripcion)
values
  ('vigencia_hasta_a3', '2026-10-31', 'texto', 'vales',
   'Último día de los vales A3, en hora de Guatemala. Vacío = usar dias_vigencia_vale.')
on conflict (clave) do update set valor = excluded.valor;


-- ═══ Lectura de una clave de texto ═══════════════════════════════════════

-- `fn_config` devuelve numeric y aquí hace falta una fecha. Se separa en vez
-- de tocar la existente, que la usan media docena de sitios.
create or replace function smartvale.fn_config_texto(
  p_clave   text,
  p_defecto text default null
)
returns text
language sql
stable
set search_path = ''
as $$
  select coalesce(
    nullif(btrim((select c.valor from smartvale.configuracion c where c.clave = p_clave)), ''),
    p_defecto
  );
$$;


-- ═══ Vencimiento de un vale que se emite ahora ═══════════════════════════

create or replace function smartvale.fn_vencimiento_de(p_tipo smartvale.tipo_vale)
returns timestamptz
language plpgsql
stable
set search_path = ''
as $$
declare
  v_texto text;
  v_dia   date;
  v_fin   timestamptz;
begin
  -- La clave del tipo manda; si no está, la general; si tampoco, días.
  v_texto := coalesce(
    smartvale.fn_config_texto('vigencia_hasta_' || lower(p_tipo::text)),
    smartvale.fn_config_texto('vigencia_hasta')
  );

  if v_texto is null then
    return now() + make_interval(
      days => smartvale.fn_config('dias_vigencia_vale', 30)::integer
    );
  end if;

  begin
    v_dia := v_texto::date;
  exception when others then
    raise exception
      'La fecha de vigencia configurada para % no es válida: %. Debe ser AAAA-MM-DD.',
      p_tipo, v_texto using errcode = 'SV011';
  end;

  -- El último instante de ese día EN GUATEMALA, no en UTC: el vale vale
  -- hasta que cierra la tienda, no hasta las seis de la tarde.
  v_fin := ((v_dia + 1)::timestamp at time zone 'America/Guatemala')
           - interval '1 second';

  -- Emitir un vale ya vencido no le sirve a nadie, y el CHECK de la tabla lo
  -- rechazaría con un mensaje ilegible. Mejor decir qué pasa y qué hacer.
  if v_fin <= now() then
    raise exception
      'La campaña de vales % terminó el %. Cambia la fecha en Configuración para seguir emitiendo.',
      p_tipo, to_char(v_dia, 'DD/MM/YYYY') using errcode = 'SV011';
  end if;

  return v_fin;
end;
$$;

comment on function smartvale.fn_vencimiento_de is
  'Vencimiento de un vale emitido ahora: fecha de corte del tipo si la hay; si no, la ventana de días.';


-- ═══ Emisión ═════════════════════════════════════════════════════════════

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
  v_vence       timestamptz;
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

  -- Antes de tocar ningún contador: si la campaña de ese tipo ya cerró, se
  -- corta aquí y no se quema un correlativo en un vale que no llega a nacer.
  v_vence := smartvale.fn_vencimiento_de(p_tipo);

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
  select oro, plata into v_oro, v_plata from smartvale.fn_tarifas_vigentes(p_tipo);
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
    v_vence, v_origen_id
  )
  returning * into v_vale;

  return v_vale;
end;
$$;


-- ═══ Autorregistro ═══════════════════════════════════════════════════════

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
  v_vence       timestamptz;
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
    if v_origen_id is not null and v_existente.vale_origen_id is null then
      update smartvale.vales
         set vale_origen_id = v_origen_id
       where id = v_existente.id
      returning * into v_existente;
    end if;

    if v_existente.usuario_id is null then
      update smartvale.vales
         set usuario_id = p_usuario_id
       where id = v_existente.id
      returning * into v_existente;
    end if;

    return v_existente;
  end if;

  -- Se pregunta antes de mover el correlativo de la tienda, por lo mismo que
  -- en la emisión: un correlativo gastado no vuelve.
  v_vence := smartvale.fn_vencimiento_de(v_tipo);

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
    v_vence, true, v_origen_id
  )
  returning * into v_vale;

  return v_vale;
end;
$$;


-- ═══ Privilegios ═════════════════════════════════════════════════════════

revoke execute on function
  smartvale.fn_config_texto(text, text),
  smartvale.fn_vencimiento_de(smartvale.tipo_vale)
from public, anon, authenticated;

grant execute on function
  smartvale.fn_config_texto(text, text),
  smartvale.fn_vencimiento_de(smartvale.tipo_vale)
to service_role;
