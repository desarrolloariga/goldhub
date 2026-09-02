-- ─────────────────────────────────────────────────────────────────────────
-- ARIGA SMART VALE — toda la campaña cierra el 31 de octubre
--
-- REQUIERE haber corrido antes 20260814240000_redencion_sin_ticket.sql.
--
-- La fecha de corte dejaba de ser cosa del A3: la campaña entera termina el
-- 31 de octubre, y eso vale para las cuatro puertas.
--
-- Se hace poniendo la clave general `vigencia_hasta`, que es la que heredan
-- los tipos sin fecha propia. Y se vacía `vigencia_hasta_a3`, que tenía la
-- misma fecha: dejarla habría dado dos sitios donde cambiar lo mismo, y el
-- día que alguien moviera el general el A3 se habría quedado atrás sin que
-- nada lo dijera.
--
--     vigencia_hasta_a3 (vacía)  →  vigencia_hasta  →  dias_vigencia_vale
--                                   2026-10-31
--
-- Los vales ya emitidos llevan su vencimiento congelado dentro, así que la
-- clave sola no los mueve: hay que ponerles la fecha una a una, y eso es lo
-- segundo que hace este archivo.
-- ─────────────────────────────────────────────────────────────────────────

-- ═══ La fecha de corte pasa a ser de toda la campaña ═════════════════════

insert into smartvale.configuracion (clave, valor, tipo_dato, grupo, descripcion)
values
  ('vigencia_hasta', '2026-10-31', 'texto', 'vales',
   'Último día de la campaña, en hora de Guatemala. Lo heredan los tipos sin fecha propia. Vacío = usar dias_vigencia_vale.')
on conflict (clave) do update set valor = excluded.valor;

-- El A3 vuelve a heredar: su tarifa sigue siendo propia, su vigencia no.
update smartvale.configuracion
   set valor = ''
 where clave = 'vigencia_hasta_a3';


-- ═══ Los vales que ya circulan ═══════════════════════════════════════════

do $$
declare
  v_corte  timestamptz;
  v_movidos integer;
begin
  v_corte := (('2026-10-31'::date + 1)::timestamp at time zone 'America/Guatemala')
             - interval '1 second';

  /*
   * Solo se ALARGA, nunca se acorta. Un vale cuya tarjeta promete una fecha
   * posterior al 31 de octubre seguirá valiendo hasta esa fecha: recortarlo
   * sería quitarle al cliente algo que ya lleva impreso y que no se puede
   * reimprimir.
   *
   * Los anulados se quedan fuera: revivir uno que se retiró a propósito
   * sería devolver a la calle un descuento que alguien decidió cancelar.
   */
  update smartvale.vales
     set fecha_vencimiento = v_corte
   where not anulado
     and fecha_vencimiento < v_corte;

  get diagnostics v_movidos = row_count;
  raise notice 'Vales alargados hasta el 31/10/2026: %', v_movidos;
end;
$$;
