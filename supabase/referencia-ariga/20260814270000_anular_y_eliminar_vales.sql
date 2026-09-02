-- ─────────────────────────────────────────────────────────────────────────
-- ARIGA SMART VALE — anular y eliminar vales, solo el administrador
--
-- REQUIERE haber corrido antes 20260814260000_directorio_de_contactos.sql.
--
-- Un vale mal emitido —el teléfono equivocado, una prueba, el cliente que se
-- arrepiente— no tenía forma de retirarse desde la aplicación. Se añaden las
-- dos salidas, que no son la misma cosa:
--
--   ANULAR    lo deja muerto pero visible, con su motivo y quién lo hizo.
--             Es lo correcto casi siempre: si el vale circuló, alguien puede
--             presentarlo en caja y hay que poder explicarle por qué no vale.
--
--   ELIMINAR  lo borra. Solo para lo que nunca debió existir y no dejó
--             rastro: sin compras y sin haber traído a nadie. Si tiene
--             cualquiera de las dos cosas, se rechaza y se ofrece anular.
--
-- Las claves foráneas de `redenciones.vale_id` y `vales.vale_origen_id` ya
-- impedían el borrado por su cuenta, pero con un 23503 ilegible. Aquí se
-- comprueba antes para poder decir qué pasa y qué hacer en su lugar.
-- ─────────────────────────────────────────────────────────────────────────

-- ═══ Quién puede ═════════════════════════════════════════════════════════

-- La regla vive junto a los datos y no solo en la pantalla: retirar un vale
-- entregado es de las pocas cosas que no se pueden deshacer solas.
create or replace function smartvale.fn_es_admin(p_usuario_id bigint)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1 from smartvale.usuarios
     where id = p_usuario_id and rol = 'admin' and activo
  );
$$;


-- ═══ Anular ══════════════════════════════════════════════════════════════

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
  if not smartvale.fn_es_admin(p_usuario_id) then
    raise exception 'Solo un administrador puede anular vales.'
      using errcode = 'SV012';
  end if;

  if length(btrim(coalesce(p_motivo, ''))) < 4 then
    raise exception 'Escribe el motivo de la anulación: queda guardado en el vale.'
      using errcode = 'SV006';
  end if;

  update smartvale.vales
     set anulado          = true,
         motivo_anulacion = btrim(p_motivo),
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


-- ═══ Reactivar, por si la anulación fue el error ═════════════════════════

-- Anular es reversible mientras el vale no haya vencido; eliminar no. Tener
-- la vuelta atrás es justo lo que permite recomendar anular sin miedo.
create or replace function smartvale.fn_reactivar_vale(
  p_codigo     text,
  p_usuario_id bigint
)
returns smartvale.vales
language plpgsql
set search_path = ''
as $$
declare
  v_vale smartvale.vales%rowtype;
begin
  if not smartvale.fn_es_admin(p_usuario_id) then
    raise exception 'Solo un administrador puede reactivar vales.'
      using errcode = 'SV012';
  end if;

  select * into v_vale
    from smartvale.vales
   where upper(btrim(codigo)) = upper(btrim(p_codigo));

  if not found then
    raise exception 'El vale % no existe.', p_codigo using errcode = 'SV002';
  end if;

  if not v_vale.anulado then
    raise exception 'El vale % no está anulado.', v_vale.codigo
      using errcode = 'SV002';
  end if;

  -- Reactivar uno vencido daría un vale vivo con fecha pasada, que la
  -- vista volvería a marcar vencido: confunde sin arreglar nada.
  if now() > v_vale.fecha_vencimiento then
    raise exception
      'El vale % venció el %. Reactivarlo no lo devolvería al uso; emite uno nuevo.',
      v_vale.codigo, to_char(v_vale.fecha_vencimiento, 'DD/MM/YYYY')
      using errcode = 'SV003';
  end if;

  update smartvale.vales
     set anulado          = false,
         motivo_anulacion = null,
         anulado_por      = null,
         fecha_anulacion  = null
   where id = v_vale.id
  returning * into v_vale;

  return v_vale;
end;
$$;


-- ═══ Eliminar ════════════════════════════════════════════════════════════

create or replace function smartvale.fn_eliminar_vale(
  p_codigo     text,
  p_usuario_id bigint,
  -- No se llama `codigo` a secas: un parámetro OUT con el nombre de una
  -- columna la ensombrece dentro del cuerpo y el WHERE deja de decir lo que
  -- parece decir.
  out codigo_borrado   text,
  out contacto_borrado boolean
)
language plpgsql
set search_path = ''
as $$
declare
  v_vale        smartvale.vales%rowtype;
  v_compras     integer;
  v_referidos   integer;
  v_quedan      integer;
begin
  if not smartvale.fn_es_admin(p_usuario_id) then
    raise exception 'Solo un administrador puede eliminar vales.'
      using errcode = 'SV012';
  end if;

  select * into v_vale
    from smartvale.vales v
   where upper(btrim(v.codigo)) = upper(btrim(p_codigo));

  if not found then
    raise exception 'El vale % no existe.', p_codigo using errcode = 'SV002';
  end if;

  -- Una compra registrada es dinero que entró: borrar el vale se llevaría
  -- por delante de dónde salió ese descuento.
  select count(*) into v_compras
    from smartvale.redenciones r where r.vale_id = v_vale.id;

  if v_compras > 0 then
    raise exception
      'El vale % tiene % compra(s) registrada(s) y no se puede eliminar. Anúlalo: deja de servir pero conserva el historial.',
      v_vale.codigo, v_compras using errcode = 'SV013';
  end if;

  -- Y si trajo gente, borrarlo dejaría a esos A4 sin explicar de dónde
  -- vinieron, que es lo único que hace valiosa esa puerta.
  select count(*) into v_referidos
    from smartvale.vales hv where hv.vale_origen_id = v_vale.id;

  if v_referidos > 0 then
    raise exception
      'Con el vale % llegaron % persona(s) a tienda. Eliminarlo borraría de dónde vinieron; anúlalo en su lugar.',
      v_vale.codigo, v_referidos using errcode = 'SV013';
  end if;

  codigo_borrado := v_vale.codigo;

  delete from smartvale.vales v where v.id = v_vale.id;

  /*
   * El contacto se creó para este vale. Si no le queda ningún otro ni
   * compra alguna, se va con él: dejarlo sería sembrar el directorio de
   * personas fantasma nacidas de un error de captura.
   */
  select
    (select count(*) from smartvale.vales v where v.contacto_id = v_vale.contacto_id)
  + (select count(*) from smartvale.redenciones r where r.contacto_id = v_vale.contacto_id)
  into v_quedan;

  if v_quedan = 0 then
    delete from smartvale.contactos c where c.id = v_vale.contacto_id;
    contacto_borrado := true;
  else
    contacto_borrado := false;
  end if;
end;
$$;

comment on function smartvale.fn_eliminar_vale is
  'Borra un vale que no dejó rastro. Rechaza los que tienen compras o trajeron gente: esos se anulan.';


-- ═══ Privilegios ═════════════════════════════════════════════════════════

revoke execute on function
  smartvale.fn_es_admin(bigint),
  smartvale.fn_anular_vale(text, bigint, text),
  smartvale.fn_reactivar_vale(text, bigint),
  smartvale.fn_eliminar_vale(text, bigint)
from public, anon, authenticated;

grant execute on function
  smartvale.fn_es_admin(bigint),
  smartvale.fn_anular_vale(text, bigint, text),
  smartvale.fn_reactivar_vale(text, bigint),
  smartvale.fn_eliminar_vale(text, bigint)
to service_role;
