"use client";

import { useActionState } from "react";

import { Boton } from "@/components/ui/boton";
import { Campo } from "@/components/ui/campo";
import { iniciarSesion, type EstadoAuth } from "@/lib/acciones/auth";

/**
 * `redireccion` llega como prop desde el Server Component en lugar de leerse
 * con `useSearchParams`: así el formulario forma parte del HTML que manda el
 * servidor. Con el hook, React lo dejaba fuera del render de servidor y la
 * pantalla de acceso solo aparecía después de hidratar.
 */
export function FormularioAcceso({
  redireccion,
  expirada = false,
}: {
  redireccion: string;
  /** Llegó con cookie pero sin sesión válida: caducó o se revocó. */
  expirada?: boolean;
}) {
  const [estado, accion, enviando] = useActionState<EstadoAuth, FormData>(
    iniciarSesion,
    null,
  );

  return (
    <form
      action={accion}
      className="animate-rise flex w-full max-w-[378px] flex-col gap-[30px]"
    >
      <input type="hidden" name="redirect" value={redireccion} />

      <div className="flex flex-col gap-2">
        <span className="text-taupe-dark tracking-eyebrow text-[10px] leading-none font-medium">
          ACCESO INTERNO
        </span>
        <h1 className="font-display m-0 text-[34px] leading-[1.15] font-normal">
          Iniciar sesión
        </h1>
      </div>

      <div className="flex flex-col gap-[18px]">
        <Campo
          etiqueta="CORREO O USUARIO"
          name="correo"
          type="text"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="admin o nombre@goldhub.com"
          required
        />
        <Campo
          etiqueta="CONTRASEÑA"
          name="contrasena"
          type="password"
          autoComplete="current-password"
          placeholder="••••••••"
          className="tracking-[0.14em]"
          required
        />

        {expirada && !estado?.error ? (
          <p className="border-taupe/30 bg-taupe/8 text-taupe-deep rounded-field m-0 border px-3 py-[10px] text-[12px] leading-relaxed">
            Tu sesión terminó. Vuelve a entrar para continuar.
          </p>
        ) : null}

        {estado?.error ? (
          <p
            role="alert"
            className="border-clay/25 bg-clay/6 text-clay rounded-field m-0 border px-3 py-[10px] text-[12px] leading-relaxed"
          >
            {estado.error}
          </p>
        ) : null}
      </div>

      <Boton type="submit" tamano="lg" disabled={enviando}>
        {enviando ? "VERIFICANDO…" : "ENTRAR AL PANEL"}
      </Boton>

      <p className="text-ink/38 m-0 text-[11px] leading-[1.6]">
        Uso exclusivo del personal de GOLD HUB. Cada vale emitido queda
        registrado con tu nombre. Si olvidaste tu contraseña, el administrador
        la restablece.
      </p>
    </form>
  );
}
