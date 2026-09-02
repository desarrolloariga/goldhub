-- ─────────────────────────────────────────────────────────────────────────
-- ARIGA SMART VALE — la caja deja de pedir ticket y nota
--
-- REQUIERE haber corrido antes 20260814230000_vigencia_fija_a3.sql.
--
-- Capturar el número de factura frenaba la fila para un dato que la caja ya
-- tiene en su propio sistema. Se quita de la pantalla.
--
-- La columna NO se borra: las redenciones ya registradas llevan su ticket y
-- son las únicas que hoy se pueden cuadrar contra el punto de venta. Pasa a
-- admitir nulos, que es lo que significa «no se capturó», y queda lista por
-- si mañana se vuelve a pedir.
--
-- `nota` ya admitía nulos; solo desaparece del formulario.
-- ─────────────────────────────────────────────────────────────────────────

-- ═══ El ticket pasa a ser opcional ═══════════════════════════════════════

alter table smartvale.redenciones
  alter column ticket drop not null;

-- El CHECK exigía que no viniera vacío. Ahora la regla es más floja pero
-- sigue prohibiendo el ticket en blanco, que no es lo mismo que sin ticket:
-- una cadena vacía se leería como capturado y no lo está.
alter table smartvale.redenciones
  drop constraint if exists redenciones_ticket_check;

alter table smartvale.redenciones
  drop constraint if exists redenciones_ticket_no_vacio;
alter table smartvale.redenciones
  add constraint redenciones_ticket_no_vacio
  check (ticket is null or length(btrim(ticket)) > 0);

comment on column smartvale.redenciones.ticket is
  'Número de factura del punto de venta. Opcional desde que la caja dejó de pedirlo; nulo = no se capturó.';


-- ═══ Registro de la compra ═══════════════════════════════════════════════

-- Misma firma: solo cambia que un ticket vacío se guarda como nulo en vez
-- de reventar contra el CHECK.
create or replace function smartvale.fn_registrar_redencion(
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
  p_referido_por text default null,
  p_monto_oro    numeric default 0,
  p_monto_plata  numeric default 0
)
returns smartvale.redenciones
language plpgsql
set search_path = ''
as $$
declare
  v_vale        smartvale.vales%rowtype;
  v_contacto_id bigint;
  v_oro         numeric := coalesce(p_monto_oro, 0);
  v_plata       numeric := coalesce(p_monto_plata, 0);
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

  if v_oro + v_plata > p_monto then
    raise exception 'Lo de oro y plata suma más que el total de la compra.'
      using errcode = 'SV006';
  end if;

  v_contacto_id := smartvale.fn_obtener_o_crear_contacto(p_nombre, p_telefono, p_correo);

  -- Cada material con su tarifa congelada. Lo que no sea oro ni plata no
  -- lleva descuento.
  v_descuento := coalesce(
    p_descuento,
    round(v_oro   * v_vale.descuento_oro_pct   / 100, 2)
  + round(v_plata * v_vale.descuento_plata_pct / 100, 2)
  );

  insert into smartvale.redenciones (
    vale_id, usuario_id, tienda_id, contacto_id,
    monto_compra, monto_oro, monto_plata,
    descuento_aplicado, ticket, nota, referido_por
  )
  values (
    v_vale.id, p_usuario_id, p_tienda_id, v_contacto_id,
    p_monto, v_oro, v_plata,
    v_descuento,
    -- Vacío es nulo: «no se capturó», no «se capturó en blanco».
    nullif(btrim(coalesce(p_ticket, '')), ''),
    nullif(btrim(coalesce(p_nota, '')), ''),
    nullif(btrim(coalesce(p_referido_por, '')), '')
  )
  returning * into v_redencion;

  return v_redencion;
end;
$$;
