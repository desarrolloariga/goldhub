/**
 * Comprobación de la conexión y del cierre de seguridad de `smartvalehubgold`.
 *
 *   npm run db:check
 *
 * No escribe nada. Verifica que las variables estén, que el esquema esté
 * expuesto y poblado, y —lo más importante— que la API pública NO pueda
 * leerlo: toda la protección del esquema depende de eso.
 */

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const claveServicio = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Debe coincidir con ESQUEMA en src/lib/supabase/env.ts
const esquema = "smartvalehubgold";

const ok = (m) => console.log(`  [ok] ${m}`);
const mal = (m) => console.log(`  [!!] ${m}`);

if (!url || !claveServicio) {
  mal("Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local");
  process.exit(1);
}

const servicio = {
  apikey: claveServicio,
  Authorization: `Bearer ${claveServicio}`,
};

console.log(`\nProyecto: ${url}`);
console.log(`Esquema:  ${esquema}\n`);

let fallos = 0;

// ── 1. La API responde con la clave de servicio ──────────────────────────
console.log("Conexión");
let spec = null;
try {
  const r = await fetch(`${url}/rest/v1/`, {
    headers: { ...servicio, "Accept-Profile": esquema },
  });
  if (r.ok) {
    spec = await r.json();
    ok("PostgREST responde con la clave de servicio");
  } else {
    mal(`PostgREST respondió ${r.status}`);
    fallos++;
  }
} catch (e) {
  mal(`sin respuesta: ${e.message}`);
  fallos++;
}

// ── 2. El esquema está expuesto ──────────────────────────────────────────
console.log("\nEsquemas expuestos en la API");
try {
  const r = await fetch(`${url}/rest/v1/_sondeo?select=*`, {
    headers: { ...servicio, "Accept-Profile": "__sondeo__" },
  });
  const j = await r.json();
  const lista = /schemas are exposed: (.+)$/.exec(j.hint ?? "")?.[1];

  if (!lista) {
    ok("no se pudo enumerar (la API respondió distinto), continúa");
  } else if (lista.split(", ").includes(esquema)) {
    ok(lista);
  } else {
    mal(`'${esquema}' NO está expuesto. Expuestos: ${lista}`);
    mal("Habilítalo en Dashboard → Project Settings → API → Exposed schemas");
    fallos++;
  }
} catch (e) {
  mal(e.message);
  fallos++;
}

// ── 3. Contenido del esquema ─────────────────────────────────────────────
console.log(`\nContenido de '${esquema}'`);
if (spec) {
  const rutas = Object.keys(spec.paths ?? {}).filter((p) => p !== "/");
  const tablas = rutas.filter((p) => !p.startsWith("/rpc/"));
  const funciones = rutas.filter((p) => p.startsWith("/rpc/"));

  if (!rutas.length) {
    // No dice «aplica aplicar.sql»: lo que hay hoy en supabase/migrations/
    // crea el esquema de ARIGA, que vive en esta misma base y está en
    // producción. Ver el aviso del README.
    mal("el esquema está vacío — faltan las migraciones de GOLD HUB");
    fallos++;
  } else {
    ok(`${tablas.length} tablas y vistas, ${funciones.length} funciones`);
    for (const t of tablas) console.log(`       ${t.slice(1)}`);

    // Las siete del modelo. No hay `rangos`: el prefijo de cada tienda le da
    // su propio espacio de numeración, así que no hay bloques que repartir.
    const esperadas = [
      "tiendas",
      "usuarios",
      "sesiones",
      "contactos",
      "vales",
      "redenciones",
      "configuracion",
    ];
    const faltantes = esperadas.filter((t) => !tablas.includes(`/${t}`));
    if (faltantes.length) {
      mal(`faltan tablas: ${faltantes.join(", ")}`);
      fallos++;
    }
  }
} else {
  mal("no se pudo leer el catálogo");
}

// ── 4. El esquema NO es alcanzable sin la clave de servicio ──────────────
// Es la comprobación que sostiene todo el modelo de seguridad: si esto
// pasara, cualquiera podría leer los vales desde el navegador.
console.log("\nCierre de seguridad");
try {
  const r = await fetch(`${url}/rest/v1/usuarios?select=id&limit=1`, {
    headers: { "Accept-Profile": esquema },
  });

  if (r.status === 401 || r.status === 403) {
    ok(`sin credenciales la API responde ${r.status}: el esquema está cerrado`);
  } else if (r.status === 404) {
    ok("sin credenciales no hay acceso (404): el esquema está cerrado");
  } else {
    const cuerpo = await r.text();
    mal(`¡ALERTA! sin credenciales la API respondió ${r.status}`);
    mal(`respuesta: ${cuerpo.slice(0, 200)}`);
    fallos++;
  }
} catch (e) {
  mal(e.message);
  fallos++;
}

console.log(
  fallos ? `\n${fallos} problema(s) encontrados.\n` : "\nTodo correcto.\n",
);
process.exit(fallos ? 1 : 0);
