-- ─────────────────────────────────────────────────────────────────────────
-- ARIGA SMART VALE — corregir y eliminar compras registradas
--
-- REQUIERE haber corrido antes 20260814270000_anular_y_eliminar_vales.sql.
--
-- En caja se teclea con prisa y con gente esperando: un monto con un cero de
-- más, la tienda equivocada, el reparto oro/plata al revés. Hasta ahora una
-- redención mal capturada se quedaba así para siempre, y como de ella salen
-- la venta generada, la conversión y el reparto por material, un error de
-- dedo torcía el tablero entero sin forma de arreglarlo.
--
-- Se añaden dos operaciones, las dos de administrador:
--
--   EDITAR    corrige los datos de la compra. Deja constancia de quién la
--             tocó y cuándo: es un registro de dinero, y un cambio sin
--             firma es indistinguible de un dato que siempre fue así.
--
--   ELIMINAR  la borra. Para la compra que nunca ocurrió —una prueba, un
--             doble registro—, no para la que salió mal: esa se corrige.
--
-- El vale no se puede cambiar de sitio: una compra pertenece al vale con el
-- que se pagó, y moverla sería inventar historia. Si se registró contra el
-- vale equivocado, se elimina y se vuelve a capturar donde toca.
-- ─────────────────────────────────────────────────────────────────────────

-- ═══ Rastro de la corrección ═════════════════════════════════════════════

alter table smartvale.redenciones
  add column if not exists editada_por    bigint references smartvale.usuarios (id),
  add column if not exists fecha_edicion  timestamptz;

comment on column smartvale.redenciones.editada_por is
  'Administrador que corrigió la compra. Nulo = está tal como se capturó en caja.';


-- ═══ Editar ══════════════════════════════════════════════════════════════

create or replace function smartvale.fn_editar_redencion(
  p_id           bigint,
  p_usuario_id   bigint,
  p_tienda_id    bigint,
  p_nombre       text,
  p_telefono     text,
  p_correo       text default null,
  p_monto        numeric default null,
  p_monto_oro    numeric default 0,
  p_monto_plata  numeric default 0,
  p_descuento    numeric default null,
  p_ticket       text default null,
  p_nota         text default null,
  p_referido_por text default null
)
returns smartvale.redenciones
language plpgsql
set search_path = ''
as $$
declare
  v_redencion   smartvale.redenciones%rowtype;
  v_vale        smartvale.vales%rowtype;
  v_contacto_id bigint;
  v_anterior    bigint;
  v_oro         numeric := coalesce(p_monto_oro, 0);
  v_plata       numeric := coalesce(p_monto_plata, 0);
  v_descuento   numeric;
  v_quedan      integer;
begin
  if not smartvale.fn_es_admin(p_usuario_id) then
    raise exception 'Solo un administrador puede corregir una compra.'
      using errcode = 'SV012';
  end if;

  select * into v_redencion
    from smartvale.redenciones r where r.id = p_id;

  if not found then
    raise exception 'Esa compra ya no existe.' using errcode = 'SV014';
  end if;

  if p_monto is null or p_monto <= 0 then
    raise exception 'El monto de la compra debe ser mayor que cero.'
      using errcode = 'SV006';
  end if;

  if v_oro < 0 or v_plata < 0 then
    raise exception 'Los montos por material no pueden ser negativos.'
      using errcode = 'SV006';
  end if;

  if v_oro + v_plata > p_monto then
    raise exception 'Lo de oro y plata suma más que el total de la compra.'
      using errcode = 'SV006';
  end if;

  if not exists (select 1 from smartvale.tiendas t where t.id = p_tienda_id and t.activo) then
    raise exception 'Esa tienda no existe o está desactivada.' using errcode = 'SV006';
  end if;

  select * into v_vale
    from smartvale.vales v where v.id = v_redencion.vale_id;

  -- Sin descuento explícito se recalcula con las tarifas congeladas EN EL
  -- VALE, no con las vigentes hoy: la campaña puede haber cambiado desde
  -- que se hizo la compra, y esa compra se pagó con las de entonces.
  v_descuento := coalesce(
    p_descuento,
    round(v_oro   * v_vale.descuento_oro_pct   / 100, 2)
  + round(v_plata * v_vale.descuento_plata_pct / 100, 2)
  );

  if v_descuento > p_monto then
    raise exception 'El descuento no puede ser mayor que el monto de la compra.'
      using errcode = 'SV006';
  end if;

  -- El comprador se vuelve a resolver por teléfono, igual que al registrar:
  -- corregir un número mal tecleado mueve la compra a la persona correcta.
  v_contacto_id := smartvale.fn_obtener_o_crear_contacto(p_nombre, p_telefono, p_correo);
  v_anterior    := v_redencion.contacto_id;

  update smartvale.redenciones r
     set tienda_id          = p_tienda_id,
         contacto_id        = v_contacto_id,
         monto_compra       = p_monto,
         monto_oro          = v_oro,
         monto_plata        = v_plata,
         descuento_aplicado = v_descuento,
         ticket             = nullif(btrim(coalesce(p_ticket, '')), ''),
         nota               = nullif(btrim(coalesce(p_nota, '')), ''),
         referido_por       = nullif(btrim(coalesce(p_referido_por, '')), ''),
         editada_por        = p_usuario_id,
         fecha_edicion      = now()
   where r.id = p_id
  returning * into v_redencion;

  -- Si la compra cambió de persona y a la anterior no le queda nada, se va:
  -- se había dado de alta solo por este error de captura.
  if v_anterior <> v_contacto_id then
    select
      (select count(*) from smartvale.vales v where v.contacto_id = v_anterior)
    + (select count(*) from smartvale.redenciones r where r.contacto_id = v_anterior)
    into v_quedan;

    if v_quedan = 0 then
      delete from smartvale.contactos c where c.id = v_anterior;
    end if;
  end if;

  return v_redencion;
end;
$$;


-- ═══ Eliminar ════════════════════════════════════════════════════════════

create or replace function smartvale.fn_eliminar_redencion(
  p_id         bigint,
  p_usuario_id bigint,
  out vale_codigo      text,
  out contacto_borrado boolean
)
language plpgsql
set search_path = ''
as $$
declare
  v_redencion smartvale.redenciones%rowtype;
  v_quedan    integer;
begin
  if not smartvale.fn_es_admin(p_usuario_id) then
    raise exception 'Solo un administrador puede eliminar una compra.'
      using errcode = 'SV012';
  end if;

  select * into v_redencion
    from smartvale.redenciones r where r.id = p_id;

  if not found then
    raise exception 'Esa compra ya no existe.' using errcode = 'SV014';
  end if;

  select v.codigo into vale_codigo
    from smartvale.vales v where v.id = v_redencion.vale_id;

  delete from smartvale.redenciones r where r.id = p_id;

  -- El comprador que solo existía por esta compra se va con ella. Si además
  -- tiene vale propio, se queda: es un cliente por derecho propio.
  select
    (select count(*) from smartvale.vales v where v.contacto_id = v_redencion.contacto_id)
  + (select count(*) from smartvale.redenciones r where r.contacto_id = v_redencion.contacto_id)
  into v_quedan;

  if v_quedan = 0 then
    delete from smartvale.contactos c where c.id = v_redencion.contacto_id;
    contacto_borrado := true;
  else
    contacto_borrado := false;
  end if;
end;
$$;

comment on function smartvale.fn_eliminar_redencion is
  'Borra una compra registrada. Para la que nunca ocurrió; la que salió mal se corrige con fn_editar_redencion.';


-- ═══ Privilegios ═════════════════════════════════════════════════════════

revoke execute on function
  smartvale.fn_editar_redencion(bigint, bigint, bigint, text, text, text,
                                numeric, numeric, numeric, numeric, text, text, text),
  smartvale.fn_eliminar_redencion(bigint, bigint)
from public, anon, authenticated;

grant execute on function
  smartvale.fn_editar_redencion(bigint, bigint, bigint, text, text, text,
                                numeric, numeric, numeric, numeric, text, text, text),
  smartvale.fn_eliminar_redencion(bigint, bigint)
to service_role;
