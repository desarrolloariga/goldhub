-- ─────────────────────────────────────────────────────────────────────────
-- El vale A3 descuenta menos
--
-- El A3 lo emite el propio visitante escaneando el QR del mostrador, sin que
-- nadie de la tienda lo invite: es tráfico frío y lleva 15/20 en vez de
-- 20/25.
--
-- La regla vive en `fn_descuento_pct`, que es de donde la leen tanto la caja
-- como lo que se anuncia: si cada una la resolviera por su cuenta, un vale
-- podría prometer un descuento y la caja aplicar otro.
--
-- Se puede volver a aplicar sin miedo.
-- ─────────────────────────────────────────────────────────────────────────

begin;

insert into smartvalehubgold.configuracion (clave, valor, tipo_dato, grupo, descripcion)
values
  ('descuento_visa_a3', '15', 'numero', 'vales',
   'Porcentaje por pago con visa en los vales A3, que se registran solos desde el QR.'),
  ('descuento_transferencia_a3', '20', 'numero', 'vales',
   'Porcentaje por pago con transferencia en los vales A3.')
on conflict (clave) do nothing;

-- El porcentaje que le toca a un vale según su tipo y cómo se pague.
--
-- Existe para que la caja y las pantallas no puedan discrepar: si cada una
-- resolviera la regla por su cuenta, un vale podría anunciar un descuento y
-- la caja aplicar otro. Aquí se decide una sola vez.
--
-- El A3 lleva el suyo porque lo emite el propio visitante escaneando el QR
-- del mostrador, sin que nadie de la tienda lo invite: es tráfico frío y
-- descuenta menos que un vale entregado a un cliente de la casa.
create or replace function smartvalehubgold.fn_descuento_pct(
  p_tipo       text,
  p_forma_pago text
)
returns numeric
language sql
stable
set search_path = ''
as $$
  select smartvalehubgold.fn_config(
    case
      when lower(btrim(p_forma_pago)) = 'visa' then
        case when upper(btrim(p_tipo)) = 'A3'
             then 'descuento_visa_a3' else 'descuento_visa' end
      else
        case when upper(btrim(p_tipo)) = 'A3'
             then 'descuento_transferencia_a3' else 'descuento_transferencia' end
    end,
    0);
$$;

comment on function smartvalehubgold.fn_descuento_pct is
  'Porcentaje que aplica a un vale según su tipo y la forma de pago. Fuente única para la caja y para lo que se anuncia.';


create or replace function smartvalehubgold.fn_registrar_redencion(
  p_codigo       text,
  p_usuario_id   bigint,
  p_nombre       text,
  p_telefono     text,
  p_correo       text default null,
  p_monto_oro    numeric default 0,
  p_referido_por text default null,
  p_tienda_id    bigint default null,
  -- Cómo paga, que es lo que decide el porcentaje. Va al final y con valor
  -- por omisión para no romper a quien ya llamaba a esta función con ocho
  -- argumentos posicionales.
  p_forma_pago   text default null
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
  v_forma       text;
  v_pct         numeric;
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

  -- El porcentaje lo decide la forma de pago: la red descuenta más por
  -- transferencia que con tarjeta.
  --
  -- Se lee de la configuración de hoy y no del vale, y esa es la diferencia
  -- con el descuento de oro que había antes: aquel iba congelado dentro de
  -- cada vale porque era la promesa que el cliente tenía escrita, mientras
  -- que estos son condiciones de la red que valen para todos los vales
  -- vivos. Lo que sí se congela es el resultado, en `descuento_pct`, para
  -- que una compra vieja siga explicando su propio descuento.
  v_forma := nullif(btrim(lower(coalesce(p_forma_pago, ''))), '');

  if v_forma is null then
    raise exception 'Falta indicar cómo se pagó la compra.'
      using errcode = 'SV006';
  end if;

  if v_forma not in ('visa', 'transferencia') then
    raise exception 'Forma de pago no reconocida: %.', p_forma_pago
      using errcode = 'SV006';
  end if;

  v_pct := smartvalehubgold.fn_descuento_pct(v_vale.tipo::text, v_forma);

  v_descuento := round(p_monto_oro * v_pct / 100, 2);

  insert into smartvalehubgold.redenciones (
    vale_id, tienda_id, usuario_id, contacto_id,
    monto_oro, descuento_aplicado, referido_por, forma_pago, descuento_pct
  )
  values (
    v_vale.id, v_tienda_id, p_usuario_id, v_contacto_id,
    p_monto_oro, v_descuento, nullif(btrim(coalesce(p_referido_por, '')), ''),
    v_forma, v_pct
  )
  returning * into v_redencion;

  -- El vale NO se marca como usado: admite redenciones ilimitadas mientras
  -- siga vigente. Esa es la regla del negocio, no un olvido.
  return v_redencion;
end;
$$;

commit;
