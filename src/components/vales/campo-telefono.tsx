"use client";

import { useState, useSyncExternalStore } from "react";

import { Rotulo } from "@/components/ui/campo";
import { cn } from "@/lib/utils";

/**
 * Teléfono con clave de país.
 *
 * Se guarda como una sola cadena de dígitos porque es lo que consume el
 * enlace `wa.me` y lo que deduplica contactos. La clave se recuerda por
 * dispositivo: en el mostrador se capturan decenas de números del mismo país y no
 * tiene por qué elegirla cada vez.
 */

/** Guatemala primero: es donde opera GOLD HUB. El resto, por cercanía. */
const PAISES = [
  { clave: "502", nombre: "Guatemala" },
  { clave: "503", nombre: "El Salvador" },
  { clave: "504", nombre: "Honduras" },
  { clave: "505", nombre: "Nicaragua" },
  { clave: "506", nombre: "Costa Rica" },
  { clave: "507", nombre: "Panamá" },
  { clave: "52", nombre: "México" },
  { clave: "1", nombre: "EE. UU. / Canadá" },
];

const RECUERDO = "goldhub_clave_pais";

/**
 * La clave recordada se lee con `useSyncExternalStore` y no dentro de un
 * efecto: el servidor renderiza el valor por defecto y React sustituye el
 * guardado al hidratar, sin desajuste de marcado ni parpadeo.
 */
function suscribirAlmacen(alCambiar: () => void) {
  window.addEventListener("storage", alCambiar);
  return () => window.removeEventListener("storage", alCambiar);
}

function claveGuardada() {
  const v = window.localStorage.getItem(RECUERDO);
  return v && PAISES.some((p) => p.clave === v) ? v : null;
}

/**
 * Parte un número ya guardado —dígitos corridos, con clave incluida— en la
 * clave de país y el resto. Se prueban primero las claves largas para que
 * "502…" no case con "50" ni "5".
 */
function partir(completo: string | undefined) {
  const digitos = (completo ?? "").replace(/\D/g, "");
  if (!digitos) return null;

  const clave = [...PAISES]
    .map((p) => p.clave)
    .sort((a, b) => b.length - a.length)
    .find((c) => digitos.startsWith(c));

  return clave ? { clave, numero: digitos.slice(clave.length) } : null;
}

export function CampoTelefono({
  error,
  claveInicial = "502",
  defaultValue,
}: {
  error?: string;
  claveInicial?: string;
  /** Número completo con clave, para cuando ya se conoce al cliente. */
  defaultValue?: string;
}) {
  const recordada = useSyncExternalStore(
    suscribirAlmacen,
    claveGuardada,
    () => null, // en el servidor no hay almacenamiento
  );

  const inicial = partir(defaultValue);

  const [elegida, setElegida] = useState<string | null>(null);
  const [numero, setNumero] = useState(inicial?.numero ?? "");

  // Un número ya conocido manda sobre la clave recordada: si el cliente es
  // de otro país, cambiarla sería corromper su teléfono.
  const clave = elegida ?? inicial?.clave ?? recordada ?? claveInicial;

  function cambiarClave(nueva: string) {
    setElegida(nueva);
    window.localStorage.setItem(RECUERDO, nueva);
  }

  return (
    <div className="flex flex-col gap-[7px]">
      <Rotulo>TELÉFONO / WHATSAPP</Rotulo>

      {/* El valor que viaja al servidor es la concatenación ya limpia. */}
      <input type="hidden" name="telefono" value={`${clave}${numero}`} />

      <div
        className={cn(
          "border-ink/14 bg-paper rounded-field flex items-stretch overflow-hidden border transition-[border-color,box-shadow] duration-150",
          "focus-within:border-taupe focus-within:shadow-[0_0_0_3px_rgba(198,161,91,0.16)]",
          error && "border-clay",
        )}
      >
        <select
          aria-label="Clave del país"
          value={clave}
          onChange={(e) => cambiarClave(e.target.value)}
          className="border-ink/10 text-ink/70 cursor-pointer appearance-none border-r bg-transparent py-[13px] pr-2 pl-[14px] text-sm"
        >
          {PAISES.map((p) => (
            <option key={p.clave} value={p.clave}>
              +{p.clave}
            </option>
          ))}
        </select>

        <input
          type="tel"
          inputMode="numeric"
          autoComplete="tel-national"
          placeholder="5512 3456"
          value={numero}
          onChange={(e) => setNumero(e.target.value.replace(/\D/g, ""))}
          className="text-ink min-w-0 flex-1 border-none bg-transparent px-[14px] py-[13px] text-sm outline-none"
          required
        />
      </div>

      {error ? (
        <span className="text-clay text-[11px]">{error}</span>
      ) : (
        <span className="text-ink/40 text-[11px]">
          {PAISES.find((p) => p.clave === clave)?.nombre}. El QR y el envío por
          WhatsApp usan este número.
        </span>
      )}
    </div>
  );
}
