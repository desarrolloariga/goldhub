import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
  type ScryptOptions,
} from "node:crypto";
import { promisify } from "node:util";

/**
 * Hash de contraseñas con scrypt, integrado en Node.
 *
 * No usamos Supabase Auth, así que la seguridad de las credenciales es
 * responsabilidad de la aplicación. scrypt es deliberadamente costoso en
 * memoria y CPU, que es justo lo que hace inviable un ataque por fuerza
 * bruta sobre los hashes si alguien llegara a leer la tabla.
 *
 * Formato almacenado: `scrypt$N$r$p$sal_hex$derivado_hex`
 * Guardar los parámetros junto al hash permite endurecerlos en el futuro
 * sin invalidar las contraseñas ya existentes.
 */

/**
 * `promisify` elige la sobrecarga de tres argumentos y deja fuera la que
 * acepta opciones, así que se tipa a mano la que sí necesitamos.
 */
const scrypt = promisify(scryptCallback) as (
  contrasena: string,
  sal: Buffer,
  bytes: number,
  opciones: ScryptOptions,
) => Promise<Buffer>;

const PARAMS = { N: 16384, r: 8, p: 1 } as const;
const BYTES_SAL = 16;
const BYTES_CLAVE = 64;

/** scrypt necesita memoria ≈ 128 · N · r bytes; con N=16384 y r=8 son ~16 MB. */
const MAX_MEMORIA = 64 * 1024 * 1024;

async function derivar(
  contrasena: string,
  sal: Buffer,
  { N, r, p }: { N: number; r: number; p: number },
) {
  return scrypt(contrasena.normalize("NFKC"), sal, BYTES_CLAVE, {
    N,
    r,
    p,
    maxmem: MAX_MEMORIA,
  });
}

export async function hashearContrasena(contrasena: string) {
  const sal = randomBytes(BYTES_SAL);
  const derivado = await derivar(contrasena, sal, PARAMS);

  return [
    "scrypt",
    PARAMS.N,
    PARAMS.r,
    PARAMS.p,
    sal.toString("hex"),
    derivado.toString("hex"),
  ].join("$");
}

/**
 * Verifica una contraseña contra su hash almacenado.
 * Nunca lanza por un hash malformado: devuelve `false`, para que un registro
 * corrupto se comporte como una credencial incorrecta y no como un error 500.
 */
export async function verificarContrasena(
  contrasena: string,
  almacenado: string,
) {
  try {
    const [algoritmo, n, r, p, salHex, derivadoHex] = almacenado.split("$");
    if (algoritmo !== "scrypt" || !salHex || !derivadoHex) return false;

    const esperado = Buffer.from(derivadoHex, "hex");
    const calculado = await derivar(contrasena, Buffer.from(salHex, "hex"), {
      N: Number(n),
      r: Number(r),
      p: Number(p),
    });

    if (esperado.length !== calculado.length) return false;
    return timingSafeEqual(esperado, calculado);
  } catch {
    return false;
  }
}

/**
 * Contraseña generada para una cuenta nueva o un restablecimiento.
 *
 * El alfabeto excluye los caracteres que se confunden al dictarlos por
 * teléfono (O/0, I/l/1): estas claves se comunican de viva voz.
 */
const ALFABETO = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

export function generarContrasena(largo = 12) {
  const bytes = randomBytes(largo);
  return Array.from(bytes, (b) => ALFABETO[b % ALFABETO.length]).join("");
}

/**
 * Reglas mínimas de contraseña. Se validan al crear o cambiar la clave,
 * nunca al iniciar sesión: ahí solo importa si coincide.
 */
export function revisarFortaleza(contrasena: string): string | null {
  if (contrasena.length < 8) {
    return "La contraseña debe tener al menos 8 caracteres.";
  }
  if (contrasena.length > 200) {
    return "La contraseña no puede pasar de 200 caracteres.";
  }
  if (!/[a-zA-Z]/.test(contrasena) || !/[0-9]/.test(contrasena)) {
    return "La contraseña debe combinar letras y números.";
  }
  return null;
}
