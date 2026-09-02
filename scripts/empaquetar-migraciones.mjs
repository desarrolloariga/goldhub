/**
 * Concatena las migraciones en un solo archivo listo para pegar en el
 * SQL Editor de Supabase.
 *
 *   npm run db:bundle
 *
 * Se genera desde supabase/migrations/, así que nunca se desincroniza.
 * El archivo de salida está en .gitignore: es un artefacto, no fuente.
 */

import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const raizMigraciones = path.join(process.cwd(), "supabase", "migrations");
const salida = path.join(process.cwd(), "supabase", "aplicar.sql");

const archivos = (await readdir(raizMigraciones))
  .filter((f) => f.endsWith(".sql"))
  .sort();

if (!archivos.length) {
  console.error("No hay migraciones en supabase/migrations/");
  process.exit(1);
}

/**
 * Postgres no permite usar un valor de enum en la misma transacción en que
 * se añadió. Una migración que hace `alter type … add value` tiene que ir
 * en una transacción propia, y la siguiente ya puede usar el valor.
 */
const anadeValorDeEnum = (sql) =>
  /alter\s+type[\s\S]{0,200}?add\s+value/i.test(sql);

const separador = "-".repeat(73);
const partes = [
  `-- ${separador}`,
  "-- GOLD HUB SMART VALE — migraciones consolidadas",
  "--",
  "-- GENERADO AUTOMÁTICAMENTE por scripts/empaquetar-migraciones.mjs.",
  "-- No editar a mano: los cambios van en supabase/migrations/.",
  "--",
  "-- Se puede aplicar sobre una base vacía o sobre una que ya tenga una",
  "-- versión anterior: las tablas y los tipos van guardados con `if not",
  "-- exists`, y las funciones y las vistas se borran y se rehacen. Eso",
  "-- último hace falta porque `create or replace` no puede cambiar el tipo",
  "-- de retorno de una función (42P13) ni reordenar las columnas de una",
  "-- vista. Los datos no se tocan.",
  "--",
  "-- Cómo aplicarlo: Supabase → SQL Editor → pegar todo → Run.",
  "--",
  "-- Va partido en varias transacciones y no en una sola: las migraciones",
  "-- que añaden un valor a un enum tienen que confirmarse antes de que otra",
  "-- lo use. Dentro de cada bloque sigue siendo todo o nada.",
  `-- ${separador}`,
  "",
];

let abierta = false;
let transacciones = 0;

function abrir() {
  if (abierta) return;
  partes.push("begin;", "");
  abierta = true;
  transacciones += 1;
}

function cerrar() {
  if (!abierta) return;
  partes.push("commit;", "");
  abierta = false;
}

for (const archivo of archivos) {
  const contenido = await readFile(path.join(raizMigraciones, archivo), "utf8");
  const aislar = anadeValorDeEnum(contenido);

  // La que toca el enum va sola: se cierra lo anterior y se vuelve a abrir
  // después, para que el valor nuevo quede confirmado antes de usarse.
  if (aislar) cerrar();
  abrir();

  partes.push(`-- ${separador}`);
  partes.push(`-- ARCHIVO: ${archivo}`);
  partes.push(`-- ${separador}`);
  partes.push("");
  partes.push(contenido.trimEnd());
  partes.push("");

  if (aislar) cerrar();
}

cerrar();

await writeFile(salida, partes.join("\n"), "utf8");

const lineas = partes.join("\n").split("\n").length;
console.log(`\nGenerado: supabase/aplicar.sql`);
console.log(
  `  ${archivos.length} migraciones, ${lineas} líneas, ${transacciones} transacciones\n`,
);
for (const a of archivos) console.log(`  · ${a}`);
console.log(
  "\nSirve para una base vacía y para una que ya tenga una versión anterior:" +
    "\nlas funciones y las vistas se rehacen, los datos se quedan. Pégalo en" +
    "\nSupabase → SQL Editor → Run." +
    "\n\nEnsáyalo antes con `npm run test:esquema`, que lo aplica dos veces" +
    "\nseguidas contra un Postgres real sin tocar la base.\n",
);
