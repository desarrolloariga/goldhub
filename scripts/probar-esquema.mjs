/**
 * Ensayo completo del esquema, sin base de datos.
 *
 *   npm run test:esquema
 *
 * Levanta un Postgres 17 en WASM (PGlite), le aplica `supabase/migrations/`
 * en orden y ejerce las reglas de negocio contra él. No toca la red ni
 * necesita credenciales: se puede correr en cualquier máquina y en CI.
 *
 * Por qué existe: el proyecto de Supabase está compartido con la aplicación
 * de ARIGA, que corre en producción en el esquema vecino. Una migración con
 * un error a mitad se aplica a medias y hay que deshacerla a mano sobre esa
 * base. Aquí se ensaya antes, cuantas veces haga falta, sin consecuencias.
 *
 * Las aplica DOS veces, y la segunda sobre un esquema al que se le ha
 * plantado una versión anterior de una función y de una vista. Reaplicar es
 * el caso real —la base ya está montada y hay que actualizarla— y es justo
 * donde `create or replace` se queda corto.
 *
 * Lo que NO cubre: la concurrencia real. PGlite tiene una sola conexión, así
 * que no puede probar que dos cajas emitiendo a la vez se lleven correlativos
 * distintos. Eso hay que verificarlo contra la base real.
 */

import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migraciones = path.join(raiz, "supabase", "migrations");

const db = await new PGlite();

// Postgres a secas no trae ni los roles de Supabase ni el esquema `storage`.
// Se levanta lo mínimo para que las migraciones se apliquen igual que allí.
await db.exec(`
  do $$ begin
    if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
    if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
    if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role; end if;
  end $$;
  create schema if not exists storage;
  create table if not exists storage.buckets (
    id text primary key,
    name text not null,
    public boolean default false,
    file_size_limit bigint,
    allowed_mime_types text[]
  );
`);

let ok = 0;
let mal = 0;

const afirmar = (nombre, condicion, detalle = "") => {
  if (condicion) {
    ok++;
    console.log(`  [ok] ${nombre}`);
  } else {
    mal++;
    console.log(`  [!!] ${nombre}${detalle ? ` — ${detalle}` : ""}`);
  }
};

/** Espera que la llamada reviente con ese SQLSTATE, y no con otro. */
async function rechaza(nombre, codigo, sql, params = []) {
  try {
    await db.query(sql, params);
    mal++;
    console.log(`  [!!] ${nombre} — no falló, y debía`);
  } catch (e) {
    const real = e.code ?? "(sin código)";
    if (real === codigo) {
      ok++;
      console.log(`  [ok] ${nombre} (${codigo})`);
    } else {
      mal++;
      console.log(`  [!!] ${nombre} — esperaba ${codigo}, dio ${real}: ${e.message}`);
    }
  }
}

const uno = async (sql, params = []) => (await db.query(sql, params)).rows[0];

console.log("\nGOLD HUB SMART VALE · ensayo del esquema (Postgres 17 en WASM)\n");

// ── Las migraciones se aplican ───────────────────────────────────────────

const ARCHIVOS = readdirSync(migraciones)
  .filter((f) => f.endsWith(".sql"))
  .sort();

/** Aplica las migraciones en orden. Devuelve el fallo, o `null` si entraron. */
async function aplicarMigraciones({ ruidoso = false } = {}) {
  for (const f of ARCHIVOS) {
    const sql = readFileSync(path.join(migraciones, f), "utf8");
    try {
      await db.exec(sql);
      if (ruidoso) {
        ok++;
        console.log(`  [ok] ${f}`);
      }
    } catch (e) {
      let detalle = "";
      if (e.position) {
        const n = sql.slice(0, Number(e.position)).split("\n").length;
        detalle = `\n       línea ~${n}: ${sql.split("\n")[n - 1]?.trim()}`;
      }
      return { archivo: f, mensaje: e.message + detalle };
    }
  }
  return null;
}

console.log("Migraciones");
const falloInicial = await aplicarMigraciones({ ruidoso: true });
if (falloInicial) {
  mal++;
  console.log(`  [!!] ${falloInicial.archivo}\n       ${falloInicial.mensaje}`);
  // Sin esquema no hay nada más que probar.
  process.exit(1);
}

// ── Alta ─────────────────────────────────────────────────────────────────
console.log("\nAlta de tiendas y cuentas");

const t1 = await uno(
  `insert into smartvalehubgold.tiendas (nombre, prefijo)
   values ('Gold Hub Mazate', 'MZT') returning *`);
const t2 = await uno(
  `insert into smartvalehubgold.tiendas (nombre, prefijo)
   values ('Gold Hub Pradera', 'PRA') returning *`);
afirmar("dos tiendas con prefijo propio", t1.prefijo === "MZT" && t2.prefijo === "PRA");
afirmar("cada tienda nace con su QR fijo", t1.token !== t2.token && t1.token.length === 22);

const admin = await uno(
  `insert into smartvalehubgold.usuarios (nombre, correo, contrasena_hash, rol)
   values ('Admin', 'admin', 'x', 'admin') returning *`);
const u1 = await uno(
  `insert into smartvalehubgold.usuarios (nombre, correo, contrasena_hash, rol, tienda_id)
   values ('Mazate', 'mazate', 'x', 'tienda', $1) returning *`, [t1.id]);
const u2 = await uno(
  `insert into smartvalehubgold.usuarios (nombre, correo, contrasena_hash, rol, tienda_id)
   values ('Pradera', 'pradera', 'x', 'tienda', $1) returning *`, [t2.id]);
afirmar("una cuenta por tienda, más el administrador", !!admin && !!u1 && !!u2);

await rechaza("un admin no puede llevar tienda", "23514",
  `insert into smartvalehubgold.usuarios (nombre, correo, contrasena_hash, rol, tienda_id)
   values ('Malo', 'malo', 'x', 'admin', $1)`, [t1.id]);
await rechaza("una cuenta de tienda necesita tienda", "23514",
  `insert into smartvalehubgold.usuarios (nombre, correo, contrasena_hash, rol)
   values ('Malo2', 'malo2', 'x', 'tienda')`);
await rechaza("no caben dos cuentas en la misma tienda", "23505",
  `insert into smartvalehubgold.usuarios (nombre, correo, contrasena_hash, rol, tienda_id)
   values ('Otra', 'otra', 'x', 'tienda', $1)`, [t1.id]);
await rechaza("el prefijo no admite dígitos", "23514",
  `insert into smartvalehubgold.tiendas (nombre, prefijo) values ('Mala', 'M1')`);
await rechaza("el prefijo no se repite", "23505",
  `insert into smartvalehubgold.tiendas (nombre, prefijo) values ('Otra', 'MZT')`);

// ── Emisión ──────────────────────────────────────────────────────────────
console.log("\nEmisión");

const emitir = (...a) =>
  uno(`select * from smartvalehubgold.fn_emitir_vale($1,$2,$3,$4,$5,$6,$7,$8,$9)`, a);

const v1 = await emitir(u1.id, "A1", "Ana Pérez", "50255512345", null, "A1-VIP", null, null, null);
afirmar("el primer vale de la tienda es MZT-000001", v1.codigo === "MZT-000001", v1.codigo);
afirmar("el descuento se congela al 15% en oro", Number(v1.descuento_oro_pct) === 15);

// Con fecha de corte configurada, todos los vales mueren ese día y la ventana
// de meses no se usa. Se comprueba contra lo que calcula el propio Postgres:
// el último instante del día EN GUATEMALA, que no es el mismo que en UTC.
{
  const esperado = (
    await uno(
      `select ((smartvalehubgold.fn_config_texto('vigencia_hasta')::date + 1)::timestamp
                at time zone 'America/Guatemala') - interval '1 second' as v`,
    )
  ).v;
  const diferencia = Math.abs(
    new Date(v1.fecha_vencimiento).getTime() - new Date(esperado).getTime(),
  );
  afirmar(
    "y vence el día de corte de la campaña, no a un mes",
    diferencia < 1000,
    `${v1.fecha_vencimiento} vs ${esperado}`,
  );
}

const v2 = await emitir(u1.id, "A2", "Beto Ruiz", "50255512346", null, null, "Centro comercial", null, null);
afirmar("las cuatro puertas comparten contador", v2.codigo === "MZT-000002", v2.codigo);

const v3 = await emitir(u2.id, "A1", "Carla Díaz", "50255512347", null, "A1-VIP", null, null, null);
afirmar("otra tienda arranca su propia serie", v3.codigo === "PRA-000001", v3.codigo);

const vAdmin = await emitir(admin.id, "A1", "Dora Gil", "50255512348", null, "A1-VIP", null, t1.id, null);
afirmar("el admin emite eligiendo tienda", vAdmin.codigo === "MZT-000003", vAdmin.codigo);

await rechaza("un A1 sin clasificación no pasa", "SV006",
  `select smartvalehubgold.fn_emitir_vale($1,'A1','X','50255500001')`, [u1.id]);
await rechaza("un A2 sin origen no pasa", "SV006",
  `select smartvalehubgold.fn_emitir_vale($1,'A2','X','50255500002')`, [u1.id]);
await rechaza("el admin tiene que decir en qué tienda", "SV001",
  `select smartvalehubgold.fn_emitir_vale($1,'A1','X','50255500003',null,'A1-VIP')`, [admin.id]);
await rechaza("una tienda no emite por otra", "SV012",
  `select smartvalehubgold.fn_emitir_vale($1,'A1','X','50255500004',null,'A1-VIP',null,$2)`,
  [u1.id, t2.id]);
await rechaza("una cuenta desactivada no emite", "SV005",
  `select smartvalehubgold.fn_emitir_vale(99999,'A1','X','50255500005',null,'A1-VIP')`);

// Un correlativo gastado en un vale que no nace deja un hueco que luego nadie
// sabe explicar. Todo lo que puede fallar se comprueba antes de moverlo.
const antes = await uno(`select correlativo from smartvalehubgold.tiendas where id = $1`, [t1.id]);
try {
  await db.query(`select smartvalehubgold.fn_emitir_vale($1,'A1','X','50255500006')`, [u1.id]);
} catch { /* se espera que falle */ }
const despues = await uno(`select correlativo from smartvalehubgold.tiendas where id = $1`, [t1.id]);
afirmar("una emisión rechazada no quema correlativo",
  antes.correlativo === despues.correlativo, `${antes.correlativo} → ${despues.correlativo}`);

// ── Autorregistro ────────────────────────────────────────────────────────
console.log("\nAutorregistro por el QR de la tienda");

const a3 = await uno(
  `select * from smartvalehubgold.fn_autorregistro($1,'Elena Mora','50255512350')`, [t1.token]);
afirmar("el visitante se lleva un A3", a3.tipo === "A3" && a3.autorregistro === true);
afirmar("sale sin cuenta emisora", a3.usuario_id === null);
afirmar("consume el correlativo de la tienda", a3.codigo === "MZT-000004", a3.codigo);

const a3bis = await uno(
  `select * from smartvalehubgold.fn_autorregistro($1,'Elena Mora','50255512350')`, [t1.token]);
afirmar("volver a escanear devuelve el mismo vale", a3bis.id === a3.id);

const a4 = await uno(
  `select * from smartvalehubgold.fn_autorregistro($1,'Fito Sosa','50255512351',null,$2)`,
  [t1.token, v2.codigo]);
afirmar("con código de referidor sale un A4", a4.tipo === "A4" && a4.vale_origen_id === v2.id);

await rechaza("un token de tienda inventado no sirve", "SV007",
  `select smartvalehubgold.fn_autorregistro('noexiste','X','50255500007')`);
await rechaza("un A4 no puede venir de otro A4", "SV009",
  `select smartvalehubgold.fn_autorregistro($1,'Y','50255500008',null,$2)`, [t1.token, a4.codigo]);

await db.query(`update smartvalehubgold.tiendas set autorregistro = false where id = $1`, [t2.id]);
await rechaza("con el autorregistro apagado no se registra nadie", "SV008",
  `select smartvalehubgold.fn_autorregistro($1,'Z','50255500009')`, [t2.token]);

// ── Redención ────────────────────────────────────────────────────────────
console.log("\nRedención");

// El porcentaje lo decide la forma de pago, no el vale: 1000 con visa al
// 20% son 200. Antes esto eran 150, el 15% de oro que iba dentro del vale.
const r1 = await uno(
  `select * from smartvalehubgold.fn_registrar_redencion($1,$2,'Ana Pérez','50255512345',null,1000,null,null,'visa')`,
  [v1.codigo, u1.id]);
afirmar("el descuento sale del % de la forma de pago", Number(r1.descuento_aplicado) === 200,
  String(r1.descuento_aplicado));
afirmar("y queda registrado con qué se pagó",
  r1.forma_pago === "visa" && Number(r1.descuento_pct) === 20,
  `${r1.forma_pago} ${r1.descuento_pct}`);

// La misma compra por transferencia descuenta más: 1000 al 25% son 250.
{
  const t = await uno(
    `select * from smartvalehubgold.fn_registrar_redencion($1,$2,'Ana Pérez','50255512345',null,1000,null,null,'transferencia')`,
    [v1.codigo, u1.id]);
  afirmar("y por transferencia descuenta más que con visa",
    Number(t.descuento_aplicado) === 250, String(t.descuento_aplicado));
}

const r2 = await uno(
  `select * from smartvalehubgold.fn_registrar_redencion($1,$2,'Ana Pérez','50255512345',null,500,null,null,'visa')`,
  [v1.codigo, u1.id]);
afirmar("el vale no se consume: admite otra compra", !!r2 && r2.id !== r1.id);

const r3 = await uno(
  `select * from smartvalehubgold.fn_registrar_redencion($1,$2,'Otro Comprador','50255599999',null,800,'Ana',null,'visa')`,
  [v2.codigo, u1.id]);
afirmar("una compra de alguien que no es el portador se registra igual", !!r3);

const porAdmin = await uno(
  `select * from smartvalehubgold.fn_registrar_redencion($1,$2,'Ana Pérez','50255512345',null,100,null,null,'visa')`,
  [v1.codigo, admin.id]);
afirmar("el admin redime sin elegir tienda: la pone el vale",
  porAdmin.tienda_id === t1.id);

await rechaza("un vale no se redime en otra tienda", "SV015",
  `select smartvalehubgold.fn_registrar_redencion($1,$2,'Ana Pérez','50255512345',null,300,null,null,'visa')`,
  [v1.codigo, u2.id]);

await rechaza("un monto de cero no es una compra", "SV006",
  `select smartvalehubgold.fn_registrar_redencion($1,$2,'Ana','50255512345',null,0,null,null,'visa')`,
  [v1.codigo, u1.id]);
await rechaza("un vale inexistente no se redime", "SV002",
  `select smartvalehubgold.fn_registrar_redencion('NADA-000001',$1,'Ana','50255512345',null,100,null,null,'visa')`,
  [u1.id]);

// Sin forma de pago no hay cálculo posible: el porcentaje sale de ella.
await rechaza("una compra sin forma de pago no se registra", "SV006",
  `select smartvalehubgold.fn_registrar_redencion($1,$2,'Ana','50255512345',null,100)`,
  [v1.codigo, u1.id]);
await rechaza("ni con una forma de pago inventada", "SV006",
  `select smartvalehubgold.fn_registrar_redencion($1,$2,'Ana','50255512345',null,100,null,null,'efectivo')`,
  [v1.codigo, u1.id]);

await db.query(`select smartvalehubgold.fn_anular_vale($1,$2,'prueba')`, [v3.codigo, admin.id]);
await rechaza("un vale anulado no se redime", "SV004",
  `select smartvalehubgold.fn_registrar_redencion($1,$2,'C','50255512347',null,100,null,null,'visa')`,
  [v3.codigo, u2.id]);

// ── Administración ───────────────────────────────────────────────────────
console.log("\nAcciones del administrador");

await rechaza("una tienda no anula vales", "SV012",
  `select smartvalehubgold.fn_anular_vale($1,$2,'porque sí')`, [v2.codigo, u1.id]);
await rechaza("anular sin motivo no vale", "SV006",
  `select smartvalehubgold.fn_anular_vale($1,$2,'  ')`, [v2.codigo, admin.id]);
await rechaza("no se elimina un vale con compras", "SV013",
  `select smartvalehubgold.fn_eliminar_vale($1,$2)`, [v1.codigo, admin.id]);
await rechaza("no se elimina un vale que trajo referidos", "SV013",
  `select smartvalehubgold.fn_eliminar_vale($1,$2)`, [v2.codigo, admin.id]);

const react = await uno(`select * from smartvalehubgold.fn_reactivar_vale($1,$2)`, [v3.codigo, admin.id]);
afirmar("el administrador reactiva un vale anulado", react.anulado === false);

const editada = await uno(
  `select * from smartvalehubgold.fn_editar_redencion($1,$2,2000)`, [r1.id, admin.id]);
// Con el porcentaje que se aplicó en ESA compra —visa, 20%—, no con el del
// vale ni con el de hoy: corregir el monto no cambia el trato ya cerrado.
afirmar("corregir el monto recalcula con el % de la compra",
  Number(editada.descuento_aplicado) === 400, String(editada.descuento_aplicado));
afirmar("y sin comprador nuevo conserva el que tenía",
  editada.contacto_id === r1.contacto_id);

const recomprador = await uno(
  `select * from smartvalehubgold.fn_editar_redencion($1,$2,2000,'Ana Pérez Corregida','50255512345')`,
  [r1.id, admin.id]);
const contactoAna = await uno(
  `select nombre from smartvalehubgold.contactos where id = $1`, [recomprador.contacto_id]);
afirmar("corregir el comprador reescribe el contacto, no crea otro",
  contactoAna.nombre === "Ana Pérez Corregida" &&
    recomprador.contacto_id === r1.contacto_id);

const limpio = await uno(`select * from smartvalehubgold.fn_eliminar_vale($1,$2)`,
  [vAdmin.codigo, admin.id]);
afirmar("un vale sin rastro sí se elimina", limpio.fn_eliminar_vale === true);

// ── Validación y métricas ────────────────────────────────────────────────
console.log("\nValidación y métricas");

const val = await uno(`select * from smartvalehubgold.fn_validar_vale($1)`, [v1.codigo]);
afirmar("la caja ve el vale con su tienda", val.tienda === "Gold Hub Mazate");
afirmar("y cuántas compras lleva", val.total_redenciones === 4, String(val.total_redenciones));

const valA3 = await uno(`select * from smartvalehubgold.fn_validar_vale($1)`, [a3.codigo]);
afirmar("un vale de autorregistro no desaparece de la caja", valA3?.codigo === a3.codigo);
afirmar("y su emisor es la propia tienda", valA3?.emisora === "Gold Hub Mazate");

const m = await uno(`select * from smartvalehubgold.fn_metricas()`);
afirmar("las métricas generales cuadran", m.vales_emitidos > 0 && Number(m.ingreso_total) > 0);

const mMzt = await uno(`select * from smartvalehubgold.fn_metricas($1)`, [t1.id]);
const mPra = await uno(`select * from smartvalehubgold.fn_metricas($1)`, [t2.id]);
afirmar("y se pueden acotar a una tienda",
  mMzt.vales_emitidos + mPra.vales_emitidos === m.vales_emitidos,
  `${mMzt.vales_emitidos} + ${mPra.vales_emitidos} vs ${m.vales_emitidos}`);

for (const v of [
  "vw_vales_detalle", "vw_metricas_generales", "vw_vales_por_tipo",
  "vw_desempeno_tiendas", "vw_ranking_tiendas", "vw_contactos_detalle",
  "vw_viralidad_a2", "vw_actividad_diaria", "vw_ventas",
]) {
  try {
    await db.query(`select * from smartvalehubgold.${v} limit 5`);
    ok++;
    console.log(`  [ok] ${v} responde`);
  } catch (e) {
    mal++;
    console.log(`  [!!] ${v} — ${e.message}`);
  }
}

const dif = await uno(`select * from smartvalehubgold.vw_viralidad_a2`);
afirmar("la difusión detecta la compra de un tercero",
  dif.redenciones_difundidas === 1, String(dif.redenciones_difundidas));

const desemp = await uno(
  `select * from smartvalehubgold.vw_desempeno_tiendas where tienda_id = $1`, [t1.id]);
afirmar("el desempeño enlaza tienda y cuenta", desemp.cuenta === "Mazate");
afirmar("y sabe si tiene logotipo", desemp.tiene_logo === false);

const ventas = await uno(`select * from smartvalehubgold.fn_ventas_resumen()`);
afirmar("el tablero de ventas suma solo oro",
  Number(ventas.venta) > 0 && ventas.tickets === 5, `tickets ${ventas.tickets}`);

const porTienda = (await db.query(`select * from smartvalehubgold.fn_ventas_por_tienda()`)).rows;
afirmar("y reparte por tienda de la compra", porTienda.length === 1, `${porTienda.length} filas`);

// ── Almacén de logotipos ─────────────────────────────────────────────────
console.log("\nAlmacén de logotipos");

const bucket = await uno(`select * from storage.buckets where id = 'logos-tiendas'`);
afirmar("el bucket existe y es público de lectura", bucket?.public === true);
afirmar("con tope de tamaño", Number(bucket?.file_size_limit) === 262144);

// ── Reaplicar sobre un esquema ya montado ────────────────────────────────
//
// Está aquí porque faltaba, y su ausencia costó un error en producción: el
// ensayo aplicaba las migraciones una sola vez, así que no veía que
// `create or replace` no puede cambiar el tipo de retorno de una función
// existente (42P13) ni reordenar las columnas de una vista. La base, ya
// montada con una versión anterior, rechazaba el archivo entero.
console.log("\nReaplicación sobre un esquema ya montado");

// Se planta a mano una versión ANTERIOR de las dos cosas que rompen.
await db.exec(`
  drop function smartvalehubgold.fn_vales_por_vencer(bigint, integer);
  create function smartvalehubgold.fn_vales_por_vencer(
    p_tienda_id bigint default null, p_dias integer default null)
  returns table (codigo text, dias_restantes integer)
  language sql stable set search_path = '' as $x$
    select v.codigo, 0 from smartvalehubgold.vales v;
  $x$;

  drop view smartvalehubgold.vw_vales_detalle cascade;
  create view smartvalehubgold.vw_vales_detalle as
    select v.id, v.codigo from smartvalehubgold.vales v;
`);

const valesAntes = (
  await db.query("select count(*)::int n from smartvalehubgold.vales")
).rows[0].n;

const falloAlReaplicar = await aplicarMigraciones();
afirmar(
  "la versión nueva entra sobre una anterior, sin tocar nada a mano",
  falloAlReaplicar === null,
  falloAlReaplicar ? `${falloAlReaplicar.archivo}: ${falloAlReaplicar.mensaje}` : "",
);

const columnas = (
  await db.query(`
    select column_name from information_schema.columns
     where table_schema = 'smartvalehubgold'
       and table_name = 'vw_vales_detalle'`)
).rows.map((r) => r.column_name);
afirmar(
  "y la vista queda con la forma nueva, no con la vieja",
  columnas.includes("tienda_logo_ruta"),
  `${columnas.length} columnas`,
);

const versiones = (
  await db.query(`
    select pg_get_function_result(p.oid) r
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'smartvalehubgold' and p.proname = 'fn_vales_por_vencer'`)
).rows;
afirmar(
  "la función también, y sin dejar una sobrecarga duplicada",
  versiones.length === 1 && versiones[0].r.includes("portador_telefono"),
  `${versiones.length} versión(es)`,
);

const valesDespues = (
  await db.query("select count(*)::int n from smartvalehubgold.vales")
).rows[0].n;
afirmar(
  "y los datos que ya había siguen ahí",
  valesAntes > 0 && valesDespues === valesAntes,
  `${valesAntes} → ${valesDespues}`,
);

// El corte de campaña alcanza también a los vales que ya estaban emitidos:
// la fecha va congelada dentro de cada uno, así que sin este `update` la
// campaña terminaría un día distinto para cada cliente.
{
  const fila = (
    await db.query(`
      select count(*)::int total,
             count(*) filter (
               where v.fecha_vencimiento
                     = ((date '2026-10-31' + 1)::timestamp
                        at time zone 'America/Guatemala') - interval '1 second'
             )::int alineados
        from smartvalehubgold.vales v
       where not v.anulado`)
  ).rows[0];
  afirmar(
    "los vales ya emitidos se amplían hasta el corte de campaña",
    fila.total > 0 && fila.alineados === fila.total,
    `${fila.alineados} de ${fila.total}`,
  );
}

// Y nunca al revés: a un cliente que ya tiene el vale en el teléfono no se le
// puede acortar lo prometido. Se planta uno que vence MÁS TARDE que el corte
// y se reaplica: tiene que quedarse como estaba.
{
  await db.exec(`
    update smartvalehubgold.vales
       set fecha_vencimiento = timestamptz '2027-06-30 12:00:00-06'
     where id = (select min(id) from smartvalehubgold.vales)`);

  const fallo = await aplicarMigraciones();
  const quedo = (
    await db.query(`
      select fecha_vencimiento f from smartvalehubgold.vales
       where id = (select min(id) from smartvalehubgold.vales)`)
  ).rows[0].f;

  afirmar(
    "y un vale que vence después del corte no se recorta",
    fallo === null && new Date(quedo).getUTCFullYear() === 2027,
    `${quedo}`,
  );
}

// ── Cierre ───────────────────────────────────────────────────────────────
console.log(`\n${ok} correctas, ${mal} fallo(s).\n`);
await db.close();
process.exit(mal ? 1 : 0);
