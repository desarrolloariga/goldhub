/**
 * Empotra en base64 las tipografías que necesita la imagen del vale.
 *
 *   npm run fuentes:generar
 *
 * Produce:
 *   src/lib/fuentes-datos.ts
 *
 * Hace falta porque el PNG del vale lo dibuja `next/og`, y su motor —Satori—
 * no ve las fuentes de `next/font`: necesita el binario del tipo. Son las
 * mismas familias que carga la interfaz (Cormorant Garamond, Geist y Geist
 * Mono), que es lo que hace que la tarjeta en pantalla y la imagen que se
 * comparte salgan idénticas.
 *
 * Se empotran por la misma razón que el sello —ver generar-sello.mjs—: leer
 * de disco o pedirlo por red desde una función serverless es frágil.
 *
 * Google sirve el formato según el User-Agent, y Satori no lee WOFF2. El de
 * Firefox 3.5 es el que devuelve TrueType.
 */

import { writeFile } from "node:fs/promises";
import path from "node:path";

const UA_TRUETYPE =
  "Mozilla/5.0 (Windows NT 6.1; rv:3.5) Gecko/20091102 Firefox/3.5";

/**
 * `texto` recorta la fuente a los glifos que se dibujan. Solo se usa donde el
 * contenido es cerrado: los porcentajes, la firma de la marca y el código del
 * vale nunca traen caracteres fuera de esa lista. Las dos Geist van completas
 * porque imprimen el nombre del portador, que es libre y lleva acentos.
 */
const FUENTES = [
  {
    constante: "SERIF_600",
    familia: "Cormorant Garamond",
    consulta: "Cormorant+Garamond:wght@600",
    // El alfabeto completo en mayúsculas, y no solo las letras de la marca:
    // el vale firma con el NOMBRE DE CADA TIENDA, que puede ser cualquiera.
    // Recortada a `GOLDHUB`, Satori dibujaba «JOYERÍA MAZATE» con la Geist de
    // reserva y la firma salía en otra tipografía que el resto del vale.
    // Las minúsculas no hacen falta: el nombre se compone en versales.
    texto: "ABCDEFGHIJKLMNOPQRSTUVWXYZÁÉÍÓÚÜÑ0123456789%&.,-' ",
    para: "los porcentajes y la firma de la tienda",
  },
  {
    constante: "MONO_500",
    familia: "Geist Mono",
    consulta: "Geist+Mono:wght@500",
    texto: "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-",
    para: "el código del vale",
  },
  {
    constante: "SANS_400",
    familia: "Geist",
    consulta: "Geist:wght@400",
    texto: null,
    para: "el texto corrido",
  },
  {
    constante: "SANS_600",
    familia: "Geist",
    consulta: "Geist:wght@600",
    texto: null,
    para: "rótulos y títulos de sección",
  },
];

async function descargar({ consulta, texto }) {
  const url =
    `https://fonts.googleapis.com/css2?family=${consulta}` +
    (texto ? `&text=${encodeURIComponent(texto)}` : "");

  const css = await fetch(url, { headers: { "User-Agent": UA_TRUETYPE } });
  if (!css.ok) throw new Error(`CSS ${css.status} en ${consulta}`);

  const fuente = (await css.text()).match(/src:\s*url\(([^)]+)\)/);
  if (!fuente) throw new Error(`Sin src en el CSS de ${consulta}`);

  const binario = await fetch(fuente[1], {
    headers: { "User-Agent": UA_TRUETYPE },
  });
  if (!binario.ok) throw new Error(`Binario ${binario.status} en ${consulta}`);

  const bytes = Buffer.from(await binario.arrayBuffer());

  // Firma TrueType (0x00010000) u OpenType ("OTTO"). Si Google cambia lo que
  // sirve para este User-Agent, mejor romper aquí que producir un PNG mudo.
  const firma = bytes.readUInt32BE(0);
  if (firma !== 0x00010000 && firma !== 0x4f54544f) {
    throw new Error(
      `${consulta} no es TrueType ni OpenType (firma 0x${firma.toString(16)}). ` +
        `Revisa el User-Agent: Satori no lee WOFF2 ni EOT.`,
    );
  }

  return bytes;
}

const descargadas = [];
for (const fuente of FUENTES) {
  descargadas.push({ ...fuente, bytes: await descargar(fuente) });
}

const modulo = `/**
 * Tipografías del vale en base64.
 *
 * GENERADO por scripts/generar-fuentes.mjs. No editar a mano: se regenera
 * con \`npm run fuentes:generar\`.
 *
 * Las consume la imagen del vale (\`next/og\`), cuyo motor no ve las fuentes
 * de \`next/font\` y necesita el binario. Son las mismas familias que usa la
 * interfaz, así que la tarjeta en pantalla y el PNG salen idénticos.
 *
 * Las dos primeras van recortadas a los glifos que dibujan; no sirven para
 * texto libre.
 */

${descargadas
  .map(
    ({ constante, familia, para, texto, bytes }) =>
      `/** ${familia} — ${para}.${texto ? ` Solo los glifos \`${texto}\`.` : ""} */\n` +
      `export const ${constante} =\n  "${bytes.toString("base64")}";`,
  )
  .join("\n\n")}
`;

const salida = path.join(process.cwd(), "src", "lib", "fuentes-datos.ts");
await writeFile(salida, modulo, "utf8");

console.log("\nGenerado: src/lib/fuentes-datos.ts\n");
for (const { constante, familia, bytes, texto } of descargadas) {
  console.log(
    `  ${constante.padEnd(10)} ${String(Math.round(bytes.length / 1024)).padStart(4)} KB  ` +
      `${familia}${texto ? " (recortada)" : ""}`,
  );
}
console.log();
