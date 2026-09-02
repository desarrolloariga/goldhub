-- ─────────────────────────────────────────────────────────────────────────
-- GOLD HUB SMART VALE — funciones de negocio
--
-- Toda regla que no pueda romperse vive aquí y no en la capa de servidor: la
-- base es el único sitio por el que pasan todas las escrituras, y el único
-- que puede serializar dos cajas que emiten a la vez.
--
-- Códigos de error. La interfaz distingue por código cuáles traen un mensaje
-- escrito para quien está delante y cuáles no:
--
--   SV001  no se pudo resolver la tienda, o está inactiva
--   SV002  el vale no existe
--   SV003  el vale venció
--   SV004  el vale está anulado
--   SV005  la cuenta no existe o está desactivada
--   SV006  falta un dato obligatorio, o no encaja con la puerta
--   SV007  el token de tienda no es válido
--   SV008  el autorregistro de esa tienda está desactivado
--   SV009  el vale del referidor no sirve
--   SV011  la fecha de vigencia configurada no es válida
--   SV012  la acción es solo del administrador
--   SV013  no se puede eliminar: tiene rastro
--   SV014  esa compra ya no existe
--   SV015  el vale es de otra tienda
--
-- SV010 quedó retirado: señalaba el campo «quién te atendió» del
-- autorregistro, que desapareció al pasar de vendedoras a tiendas.
-- ─────────────────────────────────────────────────────────────────────────

-- ═══ Utilidades ══════════════════════════════════════════════════════════

create or replace function smartvalehubgold.fn_normalizar_telefono(p_telefono text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(regexp_replace(coalesce(p_telefono, ''), '[^0-9]', '', 'g'), '');
$$;

comment on function smartvalehubgold.fn_normalizar_telefono is
  'Deja solo dígitos. Es la forma que espera wa.me y la clave de deduplicación de contactos.';


create or replace function smartvalehubgold.fn_config(
  p_clave   text,
  p_defecto numeric default null
)
returns numeric
language sql
stable
set search_path = ''
as $$
  select coalesce(
    (select c.valor::numeric from smartvalehubgold.configuracion c where c.clave = p_clave),
    p_defecto
  );
$$;


-- `fn_config` devuelve numeric y la fecha de vigencia es texto. Van separadas
-- para no tener que decidir el tipo en cada llamada.
create or replace function smartvalehubgold.fn_config_texto(
  p_clave   text,
  p_defecto text default null
)
returns text
language sql
stable
set search_path = ''
as $$
  select coalesce(
    nullif(btrim((select c.valor from smartvalehubgold.configuracion c where c.clave = p_clave)), ''),
    p_defecto
  );
$$;


-- El único descuento del sistema. Aquí solo se vende oro, así que no hay
-- tarifa por material ni por puerta: un solo número para todos los vales.
create or replace function smartvalehubgold.fn_descuento_oro()
returns numeric
language sql
stable
set search_path = ''
as $$
  select smartvalehubgold.fn_config('descuento_oro', 15);
$$;


-- El código tal como se dicta en caja: PREFIJO-CORRELATIVO.
create or replace function smartvalehubgold.fn_codigo_vale(
  p_prefijo     text,
  p_correlativo integer
)
returns text
language sql
immutable
set search_path = ''
as $$
  select p_prefijo || '-' || lpad(p_correlativo::text, 6, '0');
$$;


create or replace function smartvalehubgold.fn_es_admin(p_usuario_id bigint)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1 from smartvalehubgold.usuarios
     where id = p_usuario_id and activo and rol = 'admin'
  );
$$;


-- ═══ Vencimiento ═════════════════════════════════════════════════════════

create or replace function smartvalehubgold.fn_vencimiento_vale()
returns timestamptz
language plpgsql
stable
set search_path = ''
as $$
declare
  v_texto text := smartvalehubgold.fn_config_texto('vigencia_hasta');
  v_dia   date;
  v_fin   timestamptz;
begin
  -- Sin fecha de corte configurada, la ventana de días desde hoy.
  if v_texto is null then
    return now() + make_interval(
      days => smartvalehubgold.fn_config('dias_vigencia_vale', 30)::integer
    );
  end if;

  begin
    v_dia := v_texto::date;
  exception when others then
    raise exception
      'La fecha de vigencia configurada no es válida: %. Debe ser AAAA-MM-DD.',
      v_texto using errcode = 'SV011';
  end;

  -- El último instante de ese día EN GUATEMALA, no en UTC: el vale vale
  -- hasta que cierra la tienda, no hasta las seis de la tarde.
  v_fin := ((v_dia + 1)::timestamp at time zone 'America/Guatemala') - interval '1 second';

  -- Emitir un vale ya vencido no le sirve a nadie, y el CHECK de la tabla lo
  -- rechazaría con un mensaje ilegible. Mejor decir qué pasa y qué hacer.
  if v_fin <= now() then
    raise exception
      'La campaña terminó el %. Cambia la fecha en Configuración para seguir emitiendo.',
      to_char(v_dia, 'DD/MM/YYYY') using errcode = 'SV011';
  end if;

  return v_fin;
end;
$$;

comment on function smartvalehubgold.fn_vencimiento_vale is
  'Vencimiento de un vale emitido ahora: la fecha de corte si la hay; si no, la ventana de días.';


-- ═══ Contactos ═══════════════════════════════════════════════════════════

create or replace function smartvalehubgold.fn_obtener_o_crear_contacto(
  p_nombre   text,
  p_telefono text,
  p_correo   text default null
)
returns bigint
language plpgsql
set search_path = ''
as $$
declare
  v_telefono text := smartvalehubgold.fn_normalizar_telefono(p_telefono);
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

  -- Si el contacto ya existe se conserva su historia y solo se completan los
  -- datos que antes faltaban: el correo no se borra por no volver a darlo.
  insert into smartvalehubgold.contactos (nombre, telefono, correo)
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


-- ═══ Alcance: de qué tienda es esta operación ════════════════════════════
--
-- Es la única puerta por la que se decide sobre qué tienda se escribe, y por
-- eso está aquí y no repartida por cada función. Una cuenta de tienda opera
-- sobre la suya y sobre ninguna otra; el administrador tiene que decir cuál,
-- porque no tiene una propia.

-- La tienda de una cuenta: la suya, o NULL si es de administración. De paso
-- comprueba que la cuenta existe y está activa, que es lo primero que hay
-- que saber en cualquier escritura.
create or replace function smartvalehubgold.fn_tienda_de_cuenta(p_usuario_id bigint)
returns bigint
language plpgsql
stable
set search_path = ''
as $$
declare
  v_usuario smartvalehubgold.usuarios%rowtype;
begin
  select * into v_usuario
    from smartvalehubgold.usuarios
   where id = p_usuario_id and activo;

  if not found then
    raise exception 'La cuenta no existe o está desactivada.' using errcode = 'SV005';
  end if;

  return v_usuario.tienda_id;
end;
$$;


create or replace function smartvalehubgold.fn_tienda_en_alcance(
  p_usuario_id bigint,
  p_tienda_id  bigint default null
)
returns bigint
language plpgsql
stable
set search_path = ''
as $$
declare
  v_propia bigint := smartvalehubgold.fn_tienda_de_cuenta(p_usuario_id);
  v_tienda smartvalehubgold.tiendas%rowtype;
  v_id     bigint;
begin
  if v_propia is null then
    v_id := p_tienda_id;
    if v_id is null then
      raise exception 'Elige la tienda: una cuenta de administración no tiene una propia.'
        using errcode = 'SV001';
    end if;
  else
    v_id := v_propia;
    -- Pedir otra tienda desde una cuenta de tienda no es un descuido de la
    -- interfaz: es lo que haría alguien tocando la petición a mano.
    if p_tienda_id is not null and p_tienda_id <> v_id then
      raise exception 'Esta cuenta solo puede operar sobre su propia tienda.'
        using errcode = 'SV012';
    end if;
  end if;

  select * into v_tienda from smartvalehubgold.tiendas where id = v_id;

  if not found then
    raise exception 'Esa tienda no existe.' using errcode = 'SV001';
  end if;

  if not v_tienda.activo then
    raise exception 'La tienda % está desactivada.', v_tienda.nombre using errcode = 'SV001';
  end if;

  return v_id;
end;
$$;


-- ═══ El vale del referidor ═══════════════════════════════════════════════

create or replace function smartvalehubgold.fn_vale_referidor(
  p_codigo text,
  p_para   smartvalehubgold.tipo_vale
)
returns smartvalehubgold.vales
language plpgsql
stable
set search_path = ''
as $$
declare
  v_origen smartvalehubgold.vales%rowtype;
begin
  select * into v_origen
    from smartvalehubgold.vales
   where upper(btrim(codigo)) = upper(btrim(p_codigo));

  if not found then
    raise exception 'El vale % del referidor no existe. Revisa el código.', btrim(p_codigo)
      using errcode = 'SV009';
  end if;

  if v_origen.anulado then
    raise exception 'El vale % está anulado y no sirve como referencia.', v_origen.codigo
      using errcode = 'SV009';
  end if;

  if p_para = 'A4' and v_origen.tipo not in ('A1', 'A2') then
    raise exception 'Un A4 solo puede venir de un vale A1 o A2. El % es %.',
      v_origen.codigo, v_origen.tipo using errcode = 'SV009';
  end if;

  if p_para = 'A1' and v_origen.tipo <> 'A4' then
    raise exception 'Solo un vale A4 se convierte en cliente. El % es %.',
      v_origen.codigo, v_origen.tipo using errcode = 'SV009';
  end if;

  return v_origen;
end;
$$;


-- ═══ Emisión ═════════════════════════════════════════════════════════════
--
-- El correlativo sale de un `update ... returning` sobre la fila de la
-- tienda. No hace falta cerrojo consultivo: ese UPDATE toma el cerrojo de
-- fila, así que dos cajas emitiendo a la vez se serializan solas y cada una
-- se lleva un número distinto, sin huecos. Lo verifica `npm run test:negocio`.
--
-- Todo lo que puede fallar se comprueba ANTES de mover el contador: un
-- correlativo gastado en un vale que no llega a nacer deja un hueco que luego
-- nadie sabe explicar.

create or replace function smartvalehubgold.fn_emitir_vale(
  p_usuario_id  bigint,
  p_tipo        smartvalehubgold.tipo_vale,
  p_nombre      text,
  p_telefono    text,
  p_correo      text default null,
  p_segmento    smartvalehubgold.segmento_a1 default null,
  p_origen      text default null,
  p_tienda_id   bigint default null,
  p_vale_origen text default null
)
returns smartvalehubgold.vales
language plpgsql
set search_path = ''
as $$
declare
  v_tienda_id   bigint;
  v_prefijo     text;
  v_referidor   smartvalehubgold.vales%rowtype;
  v_origen_id   bigint;
  v_correlativo integer;
  v_contacto_id bigint;
  v_descuento   numeric;
  v_vence       timestamptz;
  v_vale        smartvalehubgold.vales%rowtype;
begin
  -- ── Cada dato en su puerta ─────────────────────────────────────────────
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
    v_referidor := smartvalehubgold.fn_vale_referidor(p_vale_origen, p_tipo);
    v_origen_id := v_referidor.id;
  end if;

  -- ── Nada de esto toca el contador ──────────────────────────────────────
  v_tienda_id   := smartvalehubgold.fn_tienda_en_alcance(p_usuario_id, p_tienda_id);
  v_vence       := smartvalehubgold.fn_vencimiento_vale();
  v_descuento   := smartvalehubgold.fn_descuento_oro();
  v_contacto_id := smartvalehubgold.fn_obtener_o_crear_contacto(p_nombre, p_telefono, p_correo);

  -- ── Y ahora sí ─────────────────────────────────────────────────────────
  update smartvalehubgold.tiendas
     set correlativo = correlativo + 1
   where id = v_tienda_id
  returning correlativo, prefijo into v_correlativo, v_prefijo;

  insert into smartvalehubgold.vales (
    codigo, tipo, correlativo, tienda_id, usuario_id, contacto_id,
    segmento, origen, vale_origen_id, descuento_oro_pct, fecha_vencimiento
  )
  values (
    smartvalehubgold.fn_codigo_vale(v_prefijo, v_correlativo),
    p_tipo, v_correlativo, v_tienda_id, p_usuario_id, v_contacto_id,
    p_segmento, nullif(btrim(coalesce(p_origen, '')), ''), v_origen_id,
    v_descuento, v_vence
  )
  returning * into v_vale;

  return v_vale;
end;
$$;


-- ═══ Autorregistro ═══════════════════════════════════════════════════════
--
-- El cliente escanea el QR fijo de la tienda y se registra solo, sin que
-- nadie inicie sesión. Por eso el vale sale con `usuario_id` nulo: no lo
-- emitió una cuenta, lo pidió el propio cliente.
--
-- Si trae el código de quien le enseñó su vale, la puerta es A4; si no, A3.

create or replace function smartvalehubgold.fn_autorregistro(
  p_token            text,
  p_nombre           text,
  p_telefono         text,
  p_correo           text default null,
  p_codigo_referidor text default null
)
returns smartvalehubgold.vales
language plpgsql
set search_path = ''
as $$
declare
  v_tienda      smartvalehubgold.tiendas%rowtype;
  v_contacto_id bigint;
  v_existente   smartvalehubgold.vales%rowtype;
  v_referidor   smartvalehubgold.vales%rowtype;
  v_origen_id   bigint;
  v_tipo        smartvalehubgold.tipo_vale;
  v_correlativo integer;
  v_prefijo     text;
  v_descuento   numeric;
  v_vence       timestamptz;
  v_vale        smartvalehubgold.vales%rowtype;
begin
  select * into v_tienda
    from smartvalehubgold.tiendas
   where token = btrim(p_token) and activo;

  if not found then
    raise exception 'Este código de tienda no es válido.' using errcode = 'SV007';
  end if;

  if not v_tienda.autorregistro then
    raise exception 'El registro desde esta tienda está desactivado por el momento.'
      using errcode = 'SV008';
  end if;

  if nullif(btrim(coalesce(p_codigo_referidor, '')), '') is not null then
    v_referidor := smartvalehubgold.fn_vale_referidor(p_codigo_referidor, 'A4');
    v_origen_id := v_referidor.id;
    v_tipo      := 'A4';
  else
    v_tipo := 'A3';
  end if;

  v_contacto_id := smartvalehubgold.fn_obtener_o_crear_contacto(p_nombre, p_telefono, p_correo);

  -- Volver a escanear el mismo QR no da un vale nuevo: devuelve el que ya
  -- tiene. Sin esto, un cliente que recarga la página se lleva dos.
  select * into v_existente
    from smartvalehubgold.vales
   where contacto_id = v_contacto_id
     and tienda_id = v_tienda.id
     and autorregistro
     and not anulado
     and fecha_vencimiento > now()
   order by fecha_emision desc
   limit 1;

  if found then
    -- Si ahora sí trae referidor y el de antes no lo tenía, se completa: es
    -- información que solo se puede recuperar en este momento.
    if v_origen_id is not null and v_existente.vale_origen_id is null
       and v_existente.tipo = 'A4' then
      update smartvalehubgold.vales
         set vale_origen_id = v_origen_id
       where id = v_existente.id
      returning * into v_existente;
    end if;

    return v_existente;
  end if;

  v_vence     := smartvalehubgold.fn_vencimiento_vale();
  v_descuento := smartvalehubgold.fn_descuento_oro();

  update smartvalehubgold.tiendas
     set correlativo = correlativo + 1
   where id = v_tienda.id
  returning correlativo, prefijo into v_correlativo, v_prefijo;

  insert into smartvalehubgold.vales (
    codigo, tipo, correlativo, tienda_id, usuario_id, contacto_id,
    autorregistro, vale_origen_id, descuento_oro_pct, fecha_vencimiento
  )
  values (
    smartvalehubgold.fn_codigo_vale(v_prefijo, v_correlativo),
    v_tipo, v_correlativo, v_tienda.id, null, v_contacto_id,
    true, v_origen_id, v_descuento, v_vence
  )
  returning * into v_vale;

  return v_vale;
end;
$$;


-- ═══ Validación ══════════════════════════════════════════════════════════
--
-- Lo que la caja necesita saber antes de aplicar un descuento. El join con
-- usuarios es por la izquierda a propósito: los vales de autorregistro no
-- tienen cuenta emisora, y con un join interno desaparecerían justo de la
-- pantalla donde hay que redimirlos.

create or replace function smartvalehubgold.fn_validar_vale(p_codigo text)
returns table (
  vale_id            bigint,
  codigo             text,
  token              text,
  tipo               smartvalehubgold.tipo_vale,
  segmento           smartvalehubgold.segmento_a1,
  descuento_oro_pct  numeric,
  portador           text,
  portador_telefono  text,
  tienda_id          bigint,
  tienda             text,
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
    v.token,
    v.tipo,
    v.segmento,
    v.descuento_oro_pct,
    c.nombre,
    c.telefono,
    v.tienda_id,
    t.nombre,
    coalesce(u.nombre, t.nombre),
    v.fecha_emision,
    v.fecha_vencimiento,
    case
      when v.anulado                   then 'anulado'
      when now() > v.fecha_vencimiento then 'vencido'
      else 'activo'
    end,
    not v.anulado and now() <= v.fecha_vencimiento,
    (select count(*)::integer from smartvalehubgold.redenciones r where r.vale_id = v.id)
  from smartvalehubgold.vales v
  join smartvalehubgold.contactos c on c.id = v.contacto_id
  join smartvalehubgold.tiendas   t on t.id = v.tienda_id
  left join smartvalehubgold.usuarios u on u.id = v.usuario_id
  where upper(btrim(v.codigo)) = upper(btrim(p_codigo));
$$;


-- ═══ Redención ═══════════════════════════════════════════════════════════
--
-- Un solo monto: aquí solo se vende oro.
--
-- Y un solo mostrador: el vale se redime en la tienda que lo emitió y en
-- ninguna otra. Cada tienda honra lo suyo, así que la comprobación va aquí y
-- no en la pantalla: en caja se teclea un código, y el que llega de otra
-- tienda tiene que rebotar en la base.

create or replace function smartvalehubgold.fn_registrar_redencion(
  p_codigo       text,
  p_usuario_id   bigint,
  p_nombre       text,
  p_telefono     text,
  p_correo       text default null,
  p_monto_oro    numeric default 0,
  p_referido_por text default null,
  p_tienda_id    bigint default null
)
returns smartvalehubgold.redenciones
language plpgsql
set search_path = ''
as $$
declare
  v_vale        smartvalehubgold.vales%rowtype;
  v_tienda_id   bigint;
  v_tienda_vale text;
  v_contacto_id bigint;
  v_descuento   numeric;
  v_redencion   smartvalehubgold.redenciones%rowtype;
begin
  select * into v_vale
    from smartvalehubgold.vales
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

  if coalesce(p_monto_oro, 0) <= 0 then
    raise exception 'El monto de la compra tiene que ser mayor que cero.'
      using errcode = 'SV006';
  end if;

  -- Aquí no se elige dónde se redime: lo dice el vale. Una cuenta de tienda
  -- opera sobre la suya; el administrador, sobre la del vale, sin tener que
  -- escogerla —sería pedirle un dato que ya está decidido—.
  --
  -- El orden importa. Comprobar primero de qué tienda es el vale deja el
  -- mensaje útil en caja («este vale es de Mazate») en vez del genérico de
  -- alcance, que ahí no le dice nada a nadie.
  v_tienda_id := coalesce(
    smartvalehubgold.fn_tienda_de_cuenta(p_usuario_id),
    p_tienda_id,
    v_vale.tienda_id);

  if v_tienda_id <> v_vale.tienda_id then
    select nombre into v_tienda_vale
      from smartvalehubgold.tiendas where id = v_vale.tienda_id;
    raise exception 'El vale % es de %. Solo puede redimirse ahí.',
      v_vale.codigo, v_tienda_vale using errcode = 'SV015';
  end if;

  -- Y ahora sí, que la cuenta pueda operar sobre esa tienda y que esté activa.
  perform smartvalehubgold.fn_tienda_en_alcance(p_usuario_id, v_tienda_id);

  v_contacto_id := smartvalehubgold.fn_obtener_o_crear_contacto(p_nombre, p_telefono, p_correo);

  -- Con el porcentaje congelado en el vale, no con el de hoy.
  v_descuento := round(p_monto_oro * v_vale.descuento_oro_pct / 100, 2);

  insert into smartvalehubgold.redenciones (
    vale_id, tienda_id, usuario_id, contacto_id,
    monto_oro, descuento_aplicado, referido_por
  )
  values (
    v_vale.id, v_tienda_id, p_usuario_id, v_contacto_id,
    p_monto_oro, v_descuento, nullif(btrim(coalesce(p_referido_por, '')), '')
  )
  returning * into v_redencion;

  -- El vale NO se marca como usado: admite redenciones ilimitadas mientras
  -- siga vigente. Esa es la regla del negocio, no un olvido.
  return v_redencion;
end;
$$;


-- ═══ Acciones del administrador ══════════════════════════════════════════

create or replace function smartvalehubgold.fn_anular_vale(
  p_codigo     text,
  p_usuario_id bigint,
  p_motivo     text
)
returns smartvalehubgold.vales
language plpgsql
set search_path = ''
as $$
declare
  v_vale smartvalehubgold.vales%rowtype;
begin
  if not smartvalehubgold.fn_es_admin(p_usuario_id) then
    raise exception 'Solo el administrador puede anular vales.' using errcode = 'SV012';
  end if;

  if nullif(btrim(coalesce(p_motivo, '')), '') is null then
    raise exception 'Escribe el motivo de la anulación.' using errcode = 'SV006';
  end if;

  update smartvalehubgold.vales
     set anulado          = true,
         motivo_anulacion = btrim(p_motivo),
         anulado_por      = p_usuario_id,
         fecha_anulacion  = now()
   where upper(btrim(codigo)) = upper(btrim(p_codigo))
  returning * into v_vale;

  if not found then
    raise exception 'El vale % no existe.', p_codigo using errcode = 'SV002';
  end if;

  return v_vale;
end;
$$;


create or replace function smartvalehubgold.fn_reactivar_vale(
  p_codigo     text,
  p_usuario_id bigint
)
returns smartvalehubgold.vales
language plpgsql
set search_path = ''
as $$
declare
  v_vale smartvalehubgold.vales%rowtype;
begin
  if not smartvalehubgold.fn_es_admin(p_usuario_id) then
    raise exception 'Solo el administrador puede reactivar vales.' using errcode = 'SV012';
  end if;

  select * into v_vale
    from smartvalehubgold.vales
   where upper(btrim(codigo)) = upper(btrim(p_codigo));

  if not found then
    raise exception 'El vale % no existe.', p_codigo using errcode = 'SV002';
  end if;

  -- Reactivar un vale caducado devuelve algo que sigue sin poder usarse; el
  -- mensaje dice qué hacer en su lugar.
  if now() > v_vale.fecha_vencimiento then
    raise exception 'El vale % venció el %. Emite uno nuevo en vez de reactivarlo.',
      v_vale.codigo, to_char(v_vale.fecha_vencimiento, 'DD/MM/YYYY')
      using errcode = 'SV003';
  end if;

  update smartvalehubgold.vales
     set anulado          = false,
         motivo_anulacion = null,
         anulado_por      = null,
         fecha_anulacion  = null
   where id = v_vale.id
  returning * into v_vale;

  return v_vale;
end;
$$;


create or replace function smartvalehubgold.fn_eliminar_vale(
  p_codigo     text,
  p_usuario_id bigint
)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  v_vale      smartvalehubgold.vales%rowtype;
  v_compras   integer;
  v_referidos integer;
begin
  if not smartvalehubgold.fn_es_admin(p_usuario_id) then
    raise exception 'Solo el administrador puede eliminar vales.' using errcode = 'SV012';
  end if;

  select * into v_vale
    from smartvalehubgold.vales
   where upper(btrim(codigo)) = upper(btrim(p_codigo));

  if not found then
    raise exception 'El vale % no existe.', p_codigo using errcode = 'SV002';
  end if;

  -- Eliminar es para el vale que nunca debió existir. Uno con historia se
  -- anula: borrarlo se llevaría por delante compras que sí ocurrieron.
  select count(*) into v_compras
    from smartvalehubgold.redenciones where vale_id = v_vale.id;

  if v_compras > 0 then
    raise exception
      'El vale % tiene % compra(s) registradas. Anúlalo en vez de eliminarlo.',
      v_vale.codigo, v_compras using errcode = 'SV013';
  end if;

  select count(*) into v_referidos
    from smartvalehubgold.vales where vale_origen_id = v_vale.id;

  if v_referidos > 0 then
    raise exception
      'Del vale % salieron % vale(s) por referido. Anúlalo en vez de eliminarlo.',
      v_vale.codigo, v_referidos using errcode = 'SV013';
  end if;

  delete from smartvalehubgold.vales where id = v_vale.id;
  return true;
end;
$$;


-- La tienda no se corrige: es la del vale, y el vale solo se redime ahí.
-- El comprador sí, porque un teléfono mal tecleado en caja crea un contacto
-- falso y parte en dos el historial de una persona.
create or replace function smartvalehubgold.fn_editar_redencion(
  p_redencion_id bigint,
  p_usuario_id   bigint,
  p_monto_oro    numeric,
  p_nombre       text default null,
  p_telefono     text default null,
  p_correo       text default null,
  p_referido_por text default null
)
returns smartvalehubgold.redenciones
language plpgsql
set search_path = ''
as $$
declare
  v_redencion   smartvalehubgold.redenciones%rowtype;
  v_vale        smartvalehubgold.vales%rowtype;
  v_contacto_id bigint;
begin
  if not smartvalehubgold.fn_es_admin(p_usuario_id) then
    raise exception 'Solo el administrador puede corregir compras.' using errcode = 'SV012';
  end if;

  select * into v_redencion
    from smartvalehubgold.redenciones where id = p_redencion_id;

  if not found then
    raise exception 'Esa compra ya no existe.' using errcode = 'SV014';
  end if;

  if coalesce(p_monto_oro, 0) <= 0 then
    raise exception 'El monto de la compra tiene que ser mayor que cero.'
      using errcode = 'SV006';
  end if;

  -- Sin comprador nuevo se queda el que tenía: corregir solo el monto es lo
  -- más común, y obligar a reescribir el nombre invitaría a equivocarse.
  if nullif(btrim(coalesce(p_nombre, '')), '') is not null then
    v_contacto_id := smartvalehubgold.fn_obtener_o_crear_contacto(
      p_nombre, p_telefono, p_correo);
  else
    v_contacto_id := v_redencion.contacto_id;
  end if;

  select * into v_vale from smartvalehubgold.vales where id = v_redencion.vale_id;

  -- Se recalcula con el porcentaje del vale, no con el de hoy: corregir el
  -- monto no debe cambiar lo que se le prometió al cliente.
  update smartvalehubgold.redenciones
     set monto_oro          = p_monto_oro,
         descuento_aplicado = round(p_monto_oro * v_vale.descuento_oro_pct / 100, 2),
         contacto_id        = v_contacto_id,
         referido_por       = nullif(btrim(coalesce(p_referido_por, '')), ''),
         editada_por        = p_usuario_id,
         fecha_edicion      = now()
   where id = p_redencion_id
  returning * into v_redencion;

  return v_redencion;
end;
$$;


create or replace function smartvalehubgold.fn_eliminar_redencion(
  p_redencion_id bigint,
  p_usuario_id   bigint
)
returns boolean
language plpgsql
set search_path = ''
as $$
begin
  if not smartvalehubgold.fn_es_admin(p_usuario_id) then
    raise exception 'Solo el administrador puede eliminar compras.' using errcode = 'SV012';
  end if;

  if not exists (select 1 from smartvalehubgold.redenciones where id = p_redencion_id) then
    raise exception 'Esa compra ya no existe.' using errcode = 'SV014';
  end if;

  delete from smartvalehubgold.redenciones where id = p_redencion_id;
  return true;
end;
$$;


-- ═══ Avisos y mantenimiento ══════════════════════════════════════════════

create or replace function smartvalehubgold.fn_vales_por_vencer(
  p_tienda_id bigint default null,
  p_dias      integer default null
)
returns table (
  vale_id           bigint,
  codigo            text,
  token             text,
  tipo              smartvalehubgold.tipo_vale,
  portador          text,
  portador_telefono text,
  tienda            text,
  descuento_oro_pct numeric,
  fecha_vencimiento timestamptz,
  dias_restantes    integer
)
language sql
stable
set search_path = ''
as $$
  -- Lleva lo que necesita el recordatorio de WhatsApp ya escrito: el
  -- teléfono, el descuento congelado y el enlace público. Sin eso, la
  -- pantalla tendría que ir a buscar cada vale por separado.
  select
    v.id,
    v.codigo,
    v.token,
    v.tipo,
    c.nombre,
    c.telefono,
    t.nombre,
    v.descuento_oro_pct,
    v.fecha_vencimiento,
    ceil(extract(epoch from v.fecha_vencimiento - now()) / 86400)::integer
  from smartvalehubgold.vales v
  join smartvalehubgold.contactos c on c.id = v.contacto_id
  join smartvalehubgold.tiendas   t on t.id = v.tienda_id
  where not v.anulado
    and v.fecha_vencimiento > now()
    and v.fecha_vencimiento <= now() + make_interval(
          days => coalesce(p_dias, smartvalehubgold.fn_config('dias_aviso_vencimiento', 7)::integer)
        )
    -- Nulo = todas las tiendas. Solo el administrador llega con nulo.
    and (p_tienda_id is null or v.tienda_id = p_tienda_id)
    -- Un vale ya usado no necesita que se le recuerde al cliente.
    and not exists (select 1 from smartvalehubgold.redenciones r where r.vale_id = v.id)
  order by v.fecha_vencimiento;
$$;


create or replace function smartvalehubgold.fn_purgar_sesiones()
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_borradas integer;
begin
  delete from smartvalehubgold.sesiones where expira_en < now();
  get diagnostics v_borradas = row_count;
  return v_borradas;
end;
$$;
