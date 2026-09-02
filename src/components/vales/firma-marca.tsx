import {
  componerMarca,
  MARCA,
  palabrasDeMarca,
  PALETA,
  SELLO,
} from "@/lib/vale-plantilla";

/**
 * Firma del vale: el nombre de la tienda, compuesto en la serif del sistema.
 *
 * Es el respaldo del logotipo, no un adorno: mientras una tienda no haya
 * subido el suyo, esto es lo único que identifica su vale. Se compone con
 * `componerMarca`, la misma que usa el PNG del servidor —ver `Marca` en
 * `lib/vale-imagen.tsx`—, para que los dos partan el nombre por el mismo
 * sitio y lo encojan igual.
 */
export function FirmaMarca({
  cuerpo,
  ancho,
  nombre,
}: {
  /** Cuerpo máximo. Se encoge —y si hace falta se parte— para caber. */
  cuerpo: number;
  ancho: number;
  nombre?: string;
}) {
  const { lineas, cuerpo: c } = componerMarca(palabrasDeMarca(nombre), cuerpo, ancho);
  const ultima = lineas.length - 1;

  return (
    <span
      className="font-display flex flex-col items-center leading-none"
      style={{ fontSize: c, letterSpacing: `${MARCA.interletraje}em` }}
    >
      {lineas.map((linea, f) => (
        <span
          key={f}
          className="flex items-baseline"
          style={{ marginTop: f ? c * 0.28 : 0 }}
        >
          {linea.map((palabra, i) => (
            <span key={`${palabra}-${i}`} className="flex items-baseline">
              {/* El hueco va como elemento propio: con este interletraje, un
                  espacio normal se estira y aparta las palabras de más. */}
              {i ? <span style={{ width: c * MARCA.hueco }} /> : null}
              <span
                style={{
                  color:
                    f === ultima && i === linea.length - 1
                      ? PALETA.tinta
                      : PALETA.acento,
                }}
              >
                {palabra}
              </span>
            </span>
          ))}
        </span>
      ))}
    </span>
  );
}

/**
 * Sello «compártelo», arriba a la derecha de la tarjeta.
 *
 * Vectorial y no una imagen: la insignia PNG que había venía con su fondo
 * negro dentro y no se podía teñir, así que sobre el crema del vale era lo
 * más ruidoso de la tarjeta. Dibujado con reglas y tipografía sigue la
 * paleta sola. El PNG del servidor compone el mismo —ver `Sello` en
 * lib/vale-imagen.tsx—.
 */
export function SelloCompartir({ lado }: { lado: number }) {
  return (
    <div
      className="pointer-events-none absolute flex flex-col items-center justify-center rounded-full border text-center"
      style={{
        top: lado * 0.22,
        right: lado * 0.22,
        width: lado,
        height: lado,
        borderColor: PALETA.acento,
        boxShadow: `inset 0 0 0 ${Math.max(1, lado * 0.03)}px ${PALETA.fondo}, inset 0 0 0 ${Math.max(2, lado * 0.035)}px ${PALETA.acento}`,
      }}
    >
      <span
        className="font-semibold"
        style={{
          fontSize: lado * 0.108,
          letterSpacing: `${lado * 0.0135}px`,
          marginLeft: lado * 0.0135,
          color: PALETA.acento,
        }}
      >
        {SELLO.titulo}
      </span>
      <div
        className="opacity-50"
        style={{
          width: lado * 0.3,
          height: 1,
          backgroundColor: PALETA.acento,
          margin: `${lado * 0.05}px 0`,
        }}
      />
      {SELLO.pie.map((linea) => (
        <span
          key={linea}
          style={{
            fontSize: lado * 0.072,
            letterSpacing: `${lado * 0.006}px`,
            color: PALETA.gris,
            lineHeight: 1.35,
          }}
        >
          {linea}
        </span>
      ))}
    </div>
  );
}
