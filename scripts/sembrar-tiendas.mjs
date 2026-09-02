/**
 * Alta en bloque de tiendas y sus cuentas.
 *
 *   npm run tiendas:sembrar -- --dry              ver qué haría, sin tocar nada
 *   npm run tiendas:sembrar                       crearlo
 *   npm run tiendas:sembrar -- --csv tiendas.csv  guardar las credenciales
 *   npm run tiendas:sembrar -- --sql alta.sql     generar el .sql y no tocar la base
 *
 * Para el arranque, cuando hay que dar de alta veinte tiendas de golpe. De
 * una en una se hace mejor desde el panel, que propone el prefijo y avisa si
 * está ocupado.
 *
 * Es idempotente: se puede volver a correr. Las tiendas se identifican por
 * nombre y las cuentas por su acceso. Lo que ya existe se deja como está y
 * NUNCA se le cambia la contraseña, para que reejecutarlo no deje a media
 * red sin poder entrar.
 *
 * Con `--sql` no escribe en la base: deja un archivo listo para pegar en el
 * SQL Editor de Supabase, con los hashes ya calculados. Postgres no sabe
 * hacer scrypt —no lo trae ni pgcrypto—, así que el hash tiene que salir de
 * aquí sí o sí; lo que el .sql lleva dentro es el resultado, nunca la
 * contraseña.
 *
 * Reimplementa el hash de src/lib/auth/contrasena.ts porque corre fuera de
 * Next y no puede importar TypeScript. Los dos formatos deben coincidir:
 * `scrypt$N$r$p$sal$derivado`.
 */

import { randomBytes, scrypt as scryptCb } from "node:crypto";
import { writeFileSync } from "node:fs";
import { promisify } from "node:util";

/* ── Los datos ───────────────────────────────────────────────────────────
 *
 * Para cambiar la red se edita esta lista y se vuelve a correr.
 *
 *   nombre   como debe aparecer en el panel y en los vales
 *   prefijo  de dos a cinco letras. Encabeza todos sus códigos y NO se puede
 *            cambiar después: iría impreso en vales ya entregados
 *   acceso   lo que se teclea para entrar. Sin espacios ni mayúsculas
 *
 * Nace vacía a propósito: este proyecto se levantó desde el de ARIGA, y
 * arrastrar su plantilla habría dado de alta tiendas que no son de esta red.
 */
const TIENDAS = [
  // { nombre: "Joyería Mazate", prefijo: "MZT", acceso: "mazate" },
];

/* ── Contraseñas ─────────────────────────────────────────────────────────
 *
 * El acceso y cuatro cifras: `mazate4821`. Es lo más fácil de dictar y de
 * teclear en un mostrador.
 *
 * Conviene saber lo que implica: quien vea la lista de tiendas conoce ya la
 * mitad de cada contraseña, así que lo único que la protege son las cuatro
 * cifras. Sirve para arrancar; no para dejarlas puestas un año.
 */
const LARGO_MINIMO = 8;

function claveFacil(acceso) {
  const base = acceso.replace(/[^a-z0-9]/gi, "");
  const b = randomBytes(2);
  const cifras = String((((b[0] << 8) | b[1]) % 9000) + 1000);
  const clave = `${base}${cifras}`;

  // Las mismas reglas que aplica la aplicación al cambiar una contraseña.
  if (clave.length < LARGO_MINIMO || !/[a-zA-Z]/.test(clave) || !/[0-9]/.test(clave)) {
    throw new Error(
      `La clave de "${acceso}" quedaría en "${clave}", que no cumple el mínimo de ${LARGO_MINIMO} caracteres.`,
    );
  }
  return clave;
}

/* ── Infraestructura ─────────────────────────────────────────────────── */

const scrypt = promisify(scryptCb);
const PARAMS = { N: 16384, r: 8, p: 1 };

async function hashear(contrasena) {
  const sal = randomBytes(16);
  const derivado = await scrypt(contrasena.normalize("NFKC"), sal, 64, {
    ...PARAMS,
    maxmem: 64 * 1024 * 1024,
  });
  return [
    "scrypt",
    PARAMS.N,
    PARAMS.r,
    PARAMS.p,
    sal.toString("hex"),
    derivado.toString("hex"),
  ].join("$");
}

function argumentos() {
  const args = {};
  const lista = process.argv.slice(2);
  for (let i = 0; i < lista.length; i++) {
    if (!lista[i].startsWith("--")) continue;
    args[lista[i].slice(2)] =
      lista[i + 1]?.startsWith("--") || lista[i + 1] === undefined
        ? "true"
        : lista[++i];
  }
  return args;
}

const args = argumentos();
const ensayo = args.dry === "true";
const rutaSql = args.sql && args.sql !== "true" ? args.sql : null;
const rutaCsv = args.csv && args.csv !== "true" ? args.csv : null;

/* ── Comprobaciones antes de escribir nada ───────────────────────────── */

if (TIENDAS.length === 0) {
  console.error(`
No hay tiendas en la lista.

Edita TIENDAS en scripts/sembrar-tiendas.mjs y vuelve a correrlo. Para dar de
alta una sola, el panel es mejor: propone el prefijo y avisa si está ocupado.
`);
  process.exit(1);
}

const ES_PREFIJO = /^[A-Z]{2,5}$/;
const ES_ACCESO = /^[a-z0-9][a-z0-9._+-]{1,63}$/;

const problemas = [];
for (const t of TIENDAS) {
  if (!t.nombre?.trim()) problemas.push(`Una tienda no tiene nombre.`);
  if (!ES_PREFIJO.test(t.prefijo ?? "")) {
    problemas.push(`"${t.nombre}": el prefijo "${t.prefijo}" no son de dos a cinco letras mayúsculas.`);
  }
  if (!ES_ACCESO.test(t.acceso ?? "")) {
    problemas.push(`"${t.nombre}": el acceso "${t.acceso}" lleva mayúsculas, espacios o acentos.`);
  }
}

const repetido = (clave) => {
  const vistos = TIENDAS.map((t) => t[clave]);
  return [...new Set(vistos.filter((v, i) => vistos.indexOf(v) !== i))];
};

for (const clave of ["nombre", "prefijo", "acceso"]) {
  const dobles = repetido(clave);
  if (dobles.length) problemas.push(`${clave} repetido: ${dobles.join(", ")}`);
}

if (problemas.length) {
  console.error(`\nLa lista tiene problemas:\n  ${problemas.join("\n  ")}\n`);
  process.exit(1);
}

console.log(
  `\nGOLD HUB SMART VALE · alta de tiendas${ensayo ? "  (ENSAYO: no se escribe nada)" : ""}`,
);

/* ── Salida en SQL ───────────────────────────────────────────────────────
 *
 * Para quien prefiere pegarlo en el SQL Editor, como las migraciones. No
 * consulta ni escribe en la base: las inserciones son idempotentes por sí
 * solas, así que el archivo se puede correr dos veces sin duplicar nada ni
 * pisar contraseñas ya entregadas.
 */
const credenciales = [];

if (rutaSql) {
  const comilla = (t) => `'${String(t).replace(/'/g, "''")}'`;
  const guion = "-".repeat(70);
  const lineas = [
    `-- ${guion}`,
    "-- GOLD HUB SMART VALE — alta de tiendas",
    "--",
    "-- GENERADO por scripts/sembrar-tiendas.mjs. No editar a mano.",
    "--",
    "-- Se puede correr dos veces sin miedo: `on conflict do nothing` deja",
    "-- intactas las tiendas y las cuentas que ya existan, así que nadie se",
    "-- queda fuera por reejecutarlo.",
    "--",
    "-- Las contraseñas NO están aquí, solo su hash scrypt, que no se puede",
    "-- deshacer. Las claves en claro salieron por la terminal al generar el",
    "-- archivo, y esa es la única vez que se muestran.",
    `-- ${guion}`,
    "",
    "begin;",
    "",
  ];

  for (const t of TIENDAS) {
    const clave = claveFacil(t.acceso);
    credenciales.push({ ...t, clave });

    lineas.push(
      `-- ═══ ${t.nombre} (${t.prefijo}) ═══`,
      "insert into smartvalehubgold.tiendas (nombre, prefijo) values",
      `  (${comilla(t.nombre)}, ${comilla(t.prefijo)})`,
      "on conflict (prefijo) do nothing;",
      "",
      "insert into smartvalehubgold.usuarios (nombre, correo, rol, tienda_id, contrasena_hash)",
      "select",
      `  ${comilla(t.nombre)}, ${comilla(t.acceso)}, 'tienda', id, ${comilla(await hashear(clave))}`,
      `  from smartvalehubgold.tiendas where prefijo = ${comilla(t.prefijo)}`,
      // El índice único de `correo` es sobre una expresión —lo compara en
      // minúsculas y sin espacios—, así que ON CONFLICT tiene que nombrar la
      // expresión y no la columna. Con `(correo)` a secas, Postgres responde
      // «no unique or exclusion constraint matching» y el alta entera aborta.
      "on conflict (lower(btrim(correo))) do nothing;",
      "",
    );
  }

  lineas.push("commit;", "");
  writeFileSync(rutaSql, lineas.join("\n"), "utf8");

  console.log(`\nGenerado ${rutaSql}`);
  console.log(`  ${TIENDAS.length} tiendas con su cuenta`);
  console.log("  Pégalo en Supabase → SQL Editor → Run.");
  imprimirCredenciales();
  process.exit(0);
}

/* ── Contra la base ──────────────────────────────────────────────────── */

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const servicio = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !servicio) {
  console.error("Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local");
  process.exit(1);
}

console.log(`${url}\n`);

async function rest(ruta, opciones = {}) {
  const r = await fetch(`${url}/rest/v1/${ruta}`, {
    ...opciones,
    headers: {
      apikey: servicio,
      Authorization: `Bearer ${servicio}`,
      "Content-Type": "application/json",
      "Accept-Profile": "smartvalehubgold",
      "Content-Profile": "smartvalehubgold",
      Prefer: "return=representation",
      ...(opciones.headers ?? {}),
    },
  });

  const texto = await r.text();
  const cuerpo = texto ? JSON.parse(texto) : null;

  if (!r.ok) {
    const e = new Error(cuerpo?.message ?? `HTTP ${r.status}`);
    e.code = cuerpo?.code;
    throw e;
  }
  return cuerpo;
}

const existentes = await rest("tiendas?select=id,nombre,prefijo");
const porPrefijo = new Map(existentes.map((t) => [t.prefijo, t]));

const cuentas = await rest("usuarios?select=id,correo,tienda_id");
const porAcceso = new Map(cuentas.map((u) => [u.correo, u]));
const conCuenta = new Set(cuentas.map((u) => u.tienda_id).filter(Boolean));

for (const t of TIENDAS) {
  const ya = porPrefijo.get(t.prefijo);

  if (ya) {
    console.log(`  ya existía   ${t.prefijo.padEnd(6)} ${t.nombre}`);
  } else if (ensayo) {
    console.log(`  se crearía   ${t.prefijo.padEnd(6)} ${t.nombre}`);
  } else {
    const [creada] = await rest("tiendas", {
      method: "POST",
      body: JSON.stringify({ nombre: t.nombre, prefijo: t.prefijo }),
    });
    porPrefijo.set(t.prefijo, creada);
    console.log(`  creada       ${t.prefijo.padEnd(6)} ${t.nombre}`);
  }

  const tienda = porPrefijo.get(t.prefijo);

  // La cuenta va aparte porque una tienda puede existir de una corrida
  // anterior que se cortó a medias, y quedarse sin ella la deja inservible.
  if (porAcceso.has(t.acceso) || (tienda && conCuenta.has(tienda.id))) {
    console.log(`               cuenta ya existía, no se toca su contraseña`);
    continue;
  }

  const clave = claveFacil(t.acceso);

  if (ensayo || !tienda) {
    console.log(`               se crearía la cuenta ${t.acceso}`);
    credenciales.push({ ...t, clave });
    continue;
  }

  await rest("usuarios", {
    method: "POST",
    body: JSON.stringify({
      nombre: t.nombre,
      correo: t.acceso,
      rol: "tienda",
      tienda_id: tienda.id,
      contrasena_hash: await hashear(clave),
    }),
  });
  credenciales.push({ ...t, clave });
  console.log(`               cuenta ${t.acceso} creada`);
}

imprimirCredenciales();

function imprimirCredenciales() {
  if (credenciales.length === 0) {
    console.log("\nNo se creó ninguna cuenta nueva.\n");
    return;
  }

  console.log("\nCredenciales — no se vuelven a mostrar\n");
  console.log(`  ${"ACCESO".padEnd(16)} ${"CONTRASEÑA".padEnd(16)} TIENDA`);
  for (const c of credenciales) {
    console.log(`  ${c.acceso.padEnd(16)} ${c.clave.padEnd(16)} ${c.nombre}`);
  }
  console.log("\n  Entran en /login con el acceso, sin correo ni arroba.\n");

  if (rutaCsv) {
    const filas = [
      "tienda,prefijo,acceso,contrasena",
      ...credenciales.map((c) =>
        [c.nombre, c.prefijo, c.acceso, c.clave]
          .map((v) => `"${String(v).replace(/"/g, '""')}"`)
          .join(","),
      ),
    ];
    writeFileSync(rutaCsv, `${filas.join("\n")}\n`, "utf8");
    console.log(`  Guardadas en ${rutaCsv} — bórralo cuando las hayas repartido.\n`);
  }
}
