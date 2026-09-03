-- ─────────────────────────────────────────────────────────────────────────
-- Asesora por tienda
--
-- Añade `tiendas.asesora`, carga las dieciséis y la saca en el reporte de
-- ventas por tienda. Es dato interno: no se imprime en el vale.
--
-- Se puede volver a aplicar sin miedo: la columna va con `if not exists` y
-- la carga solo rellena las que estén vacías, así que una asesora corregida
-- desde el panel no vuelve a la de esta lista.
-- ─────────────────────────────────────────────────────────────────────────

begin;

-- La asesora llegó después de que la tabla estuviera publicada, y
-- `create table if not exists` no toca una tabla que ya existe.
alter table smartvalehubgold.tiendas
  add column if not exists asesora text;

-- Quién atiende cada tienda. Va por prefijo y no por nombre porque el nombre
-- se puede corregir desde el panel —y hay dos tiendas que se llaman casi
-- igual, ARIGA JOYERÍA y JOYERIA ARIGA—, mientras que el prefijo está dentro
-- de los códigos ya entregados y no cambia nunca.
--
-- Solo rellena las que estén vacías: si alguien ya la corrigió desde el
-- panel, reaplicar esto no debe devolverla al valor de esta lista.
update smartvalehubgold.tiendas t
   set asesora = v.asesora
  from (values
    ('ARI', 'RUTH ABIGAIL TUM AGUILAR'),
    ('INV', 'MEREDITH REBECA TUM AGUILAR'),
    ('TES', 'LOREINE YESSENIA CASTILLO CHAMALÉ'),
    ('GLA', 'KEYLA ABIGAIL AYFAN GARCIA'),
    ('LIN', 'MIRNA LIZETH JUAREZ MARROQUIN'),
    ('ELE', 'GLENDY AMARILIS CASTRO DE LEON'),
    ('RAY', 'KENIA ELICE LEWIS GARCIA'),
    ('COR', 'EMILY ADRIANA VASQUEZ ALARCON'),
    ('LUP', 'VASTY EUNICE SOTO VICENTE'),
    ('LDO', 'MARY EVELIN YESENIA TOJ XIRUM'),
    ('CRZ', 'LINDA MERELIN YUCUTE VELASCO'),
    ('LIR', 'GREGORIA DEL ROSARIO SOLIS CALDERON'),
    ('ANA', 'ADRIANA ALVAREZ'),
    ('STE', 'ABIGAIL PANIAGUA'),
    ('JA',  'ASHLEY MORALES'),
    ('LUJ', 'DAYANA ORDOÑEZ')
  ) as v(prefijo, asesora)
 where t.prefijo = v.prefijo
   and t.asesora is null;

-- El reporte cambia de forma —una columna más— y `create or replace` no
-- puede con eso (42P13): hay que borrar antes.
drop function if exists smartvalehubgold.fn_ventas_por_tienda(date, date, bigint);



commit;
