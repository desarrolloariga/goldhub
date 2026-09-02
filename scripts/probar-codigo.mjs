/**
 * Comprueba la lectura de códigos de vale.
 *
 *   npm run test:codigo
 *
 * No toca la base ni la red: `src/lib/codigo-vale.ts` es lógica pura, y es
 * justo la que decide si una cajera puede redimir tecleando el código cuando
 * la cámara no coopera. Se rompió una vez en el proyecto del que nace —el
 * patrón estaba fijado a los tipos que existían entonces—, y el fallo solo se
 * veía en caja.
 *
 * El formato es `PREFIJO-CORRELATIVO`: de dos a cinco letras propias de la
 * tienda y seis cifras. El prefijo no se valida contra una lista porque
 * aparecen tiendas nuevas sin que el módulo se entere; lo que se comprueba
 * aquí es la forma.
 *
 * El módulo se transpila al vuelo porque es TypeScript.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const raiz = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

/** Le quita los tipos para poder importarlo como JavaScript. */
async function cargarModulo() {
  const ts = readFileSync(path.join(raiz, "src/lib/codigo-vale.ts"), "utf8");

  const js = ts
    .replace(/^import .*$/gm, "")
    .replace(/: string \| null/g, "")
    .replace(/\(([a-zA-Z]+): string\)/g, "($1)");

  const url =
    "data:text/javascript;base64," + Buffer.from(js, "utf8").toString("base64");
  return import(url);
}

const { extraerCodigo } = await cargarModulo();

const CASOS = [
  // [entrada, esperado, qué prueba]
  ["MZT-000045", "MZT-000045", "el formato canónico"],
  ["mzt-000045", "MZT-000045", "en minúsculas"],
  ["  MZT-000045  ", "MZT-000045", "con espacios"],
  ["mzt000045", "MZT-000045", "dictado sin guion"],
  ["MZT 000045", "MZT-000045", "dictado con espacio"],
  ["https://x.app/v/MZT-000045", "MZT-000045", "dentro de una URL"],
  ["PR-000001", "PR-000001", "prefijo de dos letras"],
  ["JCCPR-000001", "JCCPR-000001", "prefijo de cinco letras"],
  ["NAR-00045", "NAR-00045", "correlativo de cinco cifras"],
  // Una tienda nueva se da de alta sin tocar este archivo: cualquier prefijo
  // con la forma correcta tiene que pasar, y es la base quien dice si existe.
  ["XYZ-000001", "XYZ-000001", "prefijo que este módulo no conoce"],
  ["M-000045", null, "prefijo de una sola letra"],
  ["MZTABC-000045", null, "prefijo de seis letras"],
  ["MZT-0045", null, "correlativo corto"],
  ["MZ7-000045", null, "prefijo con dígito"],
  ["hola qué tal", null, "texto suelto"],
  ["", null, "vacío"],
];

let fallos = 0;
console.log("\nLectura de códigos de vale");

for (const [entrada, esperado, nota] of CASOS) {
  const obtenido = extraerCodigo(entrada);
  const ok = obtenido === esperado;
  if (!ok) fallos++;
  console.log(
    `  [${ok ? "ok" : "!!"}] ${nota.padEnd(32)} ${JSON.stringify(entrada).padEnd(30)} → ${JSON.stringify(obtenido)}` +
      (ok ? "" : `   se esperaba ${JSON.stringify(esperado)}`),
  );
}

console.log(`\n${CASOS.length - fallos} de ${CASOS.length}\n`);
process.exit(fallos ? 1 : 0);
