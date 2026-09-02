/**
 * Identificador de acceso.
 *
 * La columna se llama `correo` porque lo normal es que lo sea, pero el
 * sistema acepta también un nombre de usuario corto (`admin`, `caja1`):
 * en tienda no siempre hay un correo por persona, y obligar a inventarse
 * uno solo para entrar es fricción sin ganancia.
 *
 * Siempre se guarda y se compara en minúsculas y sin espacios, que es lo
 * que exige el CHECK de la tabla.
 */

const USUARIO = /^[a-z0-9][a-z0-9._+-]{1,63}$/;
const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizarIdentificador(valor: string) {
  return valor.trim().toLowerCase();
}

export function esIdentificadorValido(valor: string) {
  const v = normalizarIdentificador(valor);
  return CORREO.test(v) || USUARIO.test(v);
}

export const MENSAJE_IDENTIFICADOR =
  "Escribe tu correo o nombre de usuario (mínimo 2 caracteres, sin espacios).";
