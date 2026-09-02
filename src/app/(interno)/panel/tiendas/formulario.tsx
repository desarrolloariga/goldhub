"use client";

import { useActionState, useState } from "react";
import { Check, Copy } from "lucide-react";

import { Boton } from "@/components/ui/boton";
import { Campo } from "@/components/ui/campo";
import { crearTienda, type EstadoTienda } from "@/lib/acciones/tiendas";

/**
 * Alta de una tienda y de su cuenta, en un solo paso.
 *
 * Van juntas porque la relación es uno a uno y una tienda sin cuenta no
 * puede emitir nada. En dos formularios distintos era cuestión de tiempo que
 * alguien creara la tienda y se olvidara de la cuenta.
 */
export function FormularioTienda({ prefijosOcupados }: { prefijosOcupados: string[] }) {
  const [estado, accion, enviando] = useActionState<EstadoTienda, FormData>(
    crearTienda,
    null,
  );
  const [nombre, setNombre] = useState("");
  const [prefijo, setPrefijo] = useState("");
  const [prefijoTocado, setPrefijoTocado] = useState(false);
  const [copiado, setCopiado] = useState(false);

  /**
   * Propone un prefijo libre a partir del nombre.
   *
   * Se toman las iniciales de las palabras con contenido —«Joyería Centro
   * Comercial Pradera» da JCCP— y, si el nombre es de una sola palabra, sus
   * tres primeras letras. Si ya está ocupado se prueban variantes antes que
   * dejar que el índice único lo rechace después de rellenarlo todo.
   */
  function proponer(valor: string) {
    const palabras = valor
      .toUpperCase()
      .normalize("NFD")
      // Los diacríticos, escritos como escape: en el fuente, un rango de
      // combinantes literales no se ve y nadie sabría qué toca.
      .replace(/[\u0300-\u036f]/g, "")
      .split(/\s+/)
      .filter((p) => p.length > 2 && !["DE", "DEL", "LA", "LAS", "LOS"].includes(p));

    if (palabras.length === 0) return "";

    const base =
      palabras.length >= 2
        ? palabras.map((p) => p[0]).join("").slice(0, 5)
        : palabras[0].slice(0, 3);

    const limpio = base.replace(/[^A-Z]/g, "");
    if (limpio.length < 2) return "";
    if (!prefijosOcupados.includes(limpio)) return limpio;

    // Ocupado: se prueba alargando con las letras de la primera palabra.
    for (const letra of palabras[0].slice(1)) {
      const variante = (limpio + letra).replace(/[^A-Z]/g, "").slice(0, 5);
      if (variante.length >= 2 && !prefijosOcupados.includes(variante)) {
        return variante;
      }
    }
    return limpio;
  }

  if (estado?.credencial) {
    const { tienda, acceso, clave } = estado.credencial;
    return (
      <div className="flex flex-col gap-4">
        <div className="border-taupe/35 bg-taupe/8 rounded-card flex flex-col gap-3 border p-4">
          <span className="text-ink/50 text-[11px]">
            Tienda «{tienda}» creada. Entrega estos datos a la tienda:
          </span>
          <div className="flex flex-col gap-1 font-mono text-[13px]">
            <span>{acceso}</span>
            <span className="tracking-[0.06em]">{clave}</span>
          </div>
          <button
            type="button"
            onClick={async () => {
              await navigator.clipboard.writeText(`${acceso} / ${clave}`);
              setCopiado(true);
              setTimeout(() => setCopiado(false), 2500);
            }}
            className="border-ink/14 text-ink/55 hover:border-taupe hover:text-ink rounded-field flex w-fit cursor-pointer items-center gap-[6px] border px-3 py-[6px] text-[11px] transition-colors"
          >
            {copiado ? <Check size={13} /> : <Copy size={13} />}
            {copiado ? "Copiado" : "Copiar acceso y clave"}
          </button>
          {/* No se guarda en claro en ningún sitio: si se pierde, hay que
              restablecerla, y eso deja fuera a quien esté dentro. */}
          <span className="text-ink/40 text-[11px] leading-relaxed">
            La contraseña no se puede volver a ver. Si se pierde, restablécela
            desde la lista.
          </span>
        </div>
        <Boton
          type="button"
          onClick={() => window.location.reload()}
          className="py-[14px]"
        >
          AGREGAR OTRA TIENDA
        </Boton>
      </div>
    );
  }

  return (
    <form action={accion} className="flex flex-col gap-4">
      <Campo
        etiqueta="NOMBRE"
        name="nombre"
        placeholder="Joyería Mazate"
        value={nombre}
        onChange={(e) => {
          const v = e.target.value;
          setNombre(v);
          if (!prefijoTocado) setPrefijo(proponer(v));
        }}
        error={estado?.campos?.nombre}
        required
      />

      <div className="flex flex-col gap-[7px]">
        <Campo
          etiqueta="PREFIJO DE SUS CÓDIGOS"
          name="prefijo"
          placeholder="MZT"
          value={prefijo}
          onChange={(e) => {
            setPrefijoTocado(true);
            setPrefijo(e.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 5));
          }}
          error={estado?.campos?.prefijo}
          required
        />
        <span className="text-ink/40 text-[11px] leading-relaxed">
          {prefijo.length >= 2
            ? `Sus vales serán ${prefijo}-000001, ${prefijo}-000002…`
            : "De dos a cinco letras. Encabeza todos los códigos de la tienda y no se puede cambiar después."}
        </span>
      </div>

      <Campo
        etiqueta="ACCESO DE LA TIENDA"
        name="acceso"
        placeholder="mazate"
        error={estado?.campos?.acceso}
        required
      />

      <Campo
        etiqueta="DIRECCIÓN (OPCIONAL)"
        name="direccion"
        placeholder="Calle y número"
      />
      <Campo
        etiqueta="TELÉFONO (OPCIONAL)"
        name="telefono"
        placeholder="2345 6789"
      />

      {estado?.error ? (
        <p
          role="alert"
          className="border-clay/25 bg-clay/6 text-clay rounded-field m-0 border px-3 py-[10px] text-[12px]"
        >
          {estado.error}
        </p>
      ) : null}

      <Boton type="submit" disabled={enviando} className="py-[14px]">
        {enviando ? "CREANDO…" : "CREAR TIENDA Y CUENTA"}
      </Boton>
    </form>
  );
}
