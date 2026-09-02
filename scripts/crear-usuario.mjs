/**
 * Alta del administrador desde la terminal.
 *
 *   npm run admin:crear -- --nombre "Admin" --correo admin
 *   npm run admin:crear -- --nombre "Admin" --correo admin --clave "GoldHub2026"
 *
 * Es el arranque en frío: sin una cuenta no se puede entrar al panel, y sin
 * entrar al panel no se puede crear ninguna. Solo sirve para eso. Las tiendas
 * —y su cuenta, que va con ellas— se dan de alta desde el panel, que es donde
 * se elige el prefijo y se ve cuáles están libres.
 *
 * Si no se pasa `--clave` se genera una y se imprime una sola vez.
 *
 * Reimplementa el hash de src/lib/auth/contrasena.ts porque este script corre
 * fuera de Next y no puede importar módulos TypeScript. Los dos formatos
 * deben coincidir: `scrypt$N$r$p$sal$derivado`.
 */

import { randomBytes, scrypt as scryptCb } from "node:crypto";
import { promisify } from "node:util";

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
    const clave = lista[i].slice(2);
    const valor = lista[i + 1]?.startsWith("--") ? "true" : lista[++i];
    args[clave] = valor;
  }
  return args;
}

const args = argumentos();
const nombre = args.nombre?.trim();
const correo = args.correo?.trim().toLowerCase();
const telefono = args.telefono?.trim() ?? null;

if (!nombre || !correo) {
  console.error(`
Faltan datos.

  npm run admin:crear -- --nombre "Nombre Apellido" --correo admin [--clave "..."] [--telefono "..."]
`);
  process.exit(1);
}

// Acepta correo o nombre de usuario corto. Debe coincidir con
// src/lib/auth/identificador.ts.
const ES_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ES_USUARIO = /^[a-z0-9][a-z0-9._+-]{1,63}$/;

if (!ES_CORREO.test(correo) && !ES_USUARIO.test(correo)) {
  console.error(
    `Identificador inválido: "${correo}". Usa un correo o un nombre de usuario sin espacios.`,
  );
  process.exit(1);
}

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const clave = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !clave) {
  console.error("Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local");
  process.exit(1);
}

// Contraseña generada: legible al dictarla por teléfono, sin caracteres ambiguos.
const ALFABETO = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
function generarClave(largo = 12) {
  const bytes = randomBytes(largo);
  return Array.from(bytes, (b) => ALFABETO[b % ALFABETO.length]).join("");
}

const contrasena = args.clave ?? generarClave();
const generada = !args.clave;

if (contrasena.length < 8) {
  console.error("La contraseña debe tener al menos 8 caracteres.");
  process.exit(1);
}

const respuesta = await fetch(`${url}/rest/v1/usuarios`, {
  method: "POST",
  headers: {
    apikey: clave,
    Authorization: `Bearer ${clave}`,
    "Content-Type": "application/json",
    "Content-Profile": "smartvalehubgold",
    Prefer: "return=representation",
  },
  body: JSON.stringify({
    nombre,
    correo,
    telefono,
    // Solo administración: una cuenta de tienda necesita tienda, y el CHECK
    // de la tabla la rechazaría sin ella.
    rol: "admin",
    contrasena_hash: await hashear(contrasena),
  }),
});

const cuerpo = await respuesta.text();

if (!respuesta.ok) {
  let mensaje = cuerpo;
  try {
    const j = JSON.parse(cuerpo);
    mensaje = j.message ?? cuerpo;
    if (j.code === "23505") {
      mensaje = `Ya existe una cuenta con el correo ${correo}.`;
    }
    if (j.code === "42P01") {
      mensaje =
        "La tabla smartvalehubgold.usuarios no existe. Aplica primero las migraciones en el SQL Editor (npm run db:bundle).";
    }
  } catch {
    /* la respuesta no era JSON; se muestra tal cual */
  }
  console.error(`\nNo se pudo crear el usuario:\n  ${mensaje}\n`);
  process.exit(1);
}

const [creado] = JSON.parse(cuerpo);

console.log(`
Administrador creado

  id       ${creado.id}
  nombre   ${creado.nombre}
  correo   ${creado.correo}
  rol      ${creado.rol}
${
  generada
    ? `  clave    ${contrasena}\n\n  Esta contraseña no se vuelve a mostrar. Cópiala ahora.`
    : ""
}
`);
