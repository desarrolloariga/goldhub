import type { ReactElement } from "react";

import {
  MONO_500,
  SANS_400,
  SANS_600,
  SERIF_600,
} from "@/lib/fuentes-datos";
import {
  AVISO_LEGAL,
  notaFormasPago,
  MARCA,
  componerMarca,
  palabrasDeMarca,
  SELLO,
  PALETA,
  pasos,
  TITULO_PASOS,
  type TrazoIcono,
  leyendaVigencia,
  notaEstatus,
} from "@/lib/vale-plantilla";
import type { EstadoVale } from "@/lib/supabase/types";

/**
 * Las dos composiciones del vale que dibuja el servidor.
 *
 * Están fuera de la ruta a propósito: son funciones puras de sus datos, así
 * que se pueden renderizar sin tocar la base —útil para revisar el diseño— y
 * la ruta se queda con lo suyo, que es buscar el vale y elegir cabeceras.
 *
 * Se dibujan en el servidor y no capturando el DOM con `html-to-image`: esa
 * técnica clona el nodo dentro de un `<foreignObject>` de SVG, donde no llegan
 * las fuentes de `next/font` ni las variables CSS de Tailwind, así que la
 * tarjeta salía sin texto y sin fondo.
 */

export type DatosImagenVale = {
  codigo: string;
  /** La tienda que lo emitió: es su identidad la que firma el vale. */
  tienda?: string;
  /**
   * Teléfono de la tienda, para el segundo paso. Sin él, ese paso se imprime
   * con su texto de siempre en vez de con un contacto vacío.
   */
  telefono?: string | null;
  /**
   * Los descuentos por forma de pago, ya compuestos. Nulo = no se anuncian.
   * Llega hecho y no como dos números porque el mismo texto se imprime en el
   * PNG y en la tarjeta, y componerlo dos veces los dejaría desalineados.
   */
  formasPago?: string | null;
  /**
   * Su logotipo como data URL, ya empotrado (ver `logoEmpotrado` en
   * lib/logos.ts). Nulo = la tienda no tiene, y firma con su nombre.
   */
  logo?: string | null;
  portador: string;
  tipoEtiqueta: string;
  estado: EstadoVale;
  descuentoOro: number;
  /** Ya formateada, p. ej. "16 sep 2026". */
  vigencia: string;
  /** PNG del QR como data URL. */
  qr: string;
};

/* ── Tipografías ──────────────────────────────────────────────────────────
 * Satori no ve las fuentes de `next/font`: hay que darle el binario. Son las
 * mismas familias que carga la interfaz, que es lo que hace que el PNG y la
 * tarjeta en pantalla salgan iguales. Ver scripts/generar-fuentes.mjs.
 */

function binario(base64: string) {
  const buf = Buffer.from(base64, "base64");
  // `buf.buffer` es un pool compartido: sin recortar, Satori recibiría bytes
  // de otras asignaciones y no reconocería el tipo.
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

export const FUENTES = [
  { name: "Cormorant", data: binario(SERIF_600), weight: 600, style: "normal" },
  { name: "Geist", data: binario(SANS_400), weight: 400, style: "normal" },
  { name: "Geist", data: binario(SANS_600), weight: 600, style: "normal" },
  { name: "GeistMono", data: binario(MONO_500), weight: 500, style: "normal" },
] as const;

const SERIF = "Cormorant";
const SANS = "Geist";
const MONO = "GeistMono";

/* ── Piezas compartidas ─────────────────────────────────────────────────── */

/**
 * Textura de líneas diagonales finas. Satori no aplica `background-image`, así
 * que se dibuja como un SVG de fondo con un patrón repetido.
 */
function Textura({ opacidad = 1 }: { opacidad?: number }) {
  const patron = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14"><path d="M-4 4 L4 -4 M0 14 L14 0 M10 18 L18 10" stroke="${PALETA.trama}" stroke-width="1.4"/></svg>`;

  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        display: "flex",
        opacity: opacidad,
        backgroundImage: `url("data:image/svg+xml;base64,${Buffer.from(patron).toString("base64")}")`,
        backgroundRepeat: "repeat",
      }}
    />
  );
}

/**
 * Trazos geométricos en las esquinas: dos ángulos dorados muy finos.
 *
 * Van dentro de un contenedor propio y con el borde en forma abreviada: Satori
 * saca los fragmentos del posicionamiento absoluto —los dos ángulos acababan
 * dibujados en el flujo, arriba— y descarta `borderTopWidth` y compañía si
 * antes se declaró `borderWidth: 0`.
 */
function Esquinas({ margen, lado }: { margen: number; lado: number }) {
  const trazo = `1px solid ${PALETA.acento}`;

  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        display: "flex",
      }}
    >
      <div
        style={{
          position: "absolute",
          display: "flex",
          top: margen,
          left: margen,
          width: lado,
          height: lado,
          borderTop: trazo,
          borderLeft: trazo,
        }}
      />
      <div
        style={{
          position: "absolute",
          display: "flex",
          bottom: margen,
          right: margen,
          width: lado,
          height: lado,
          borderBottom: trazo,
          borderRight: trazo,
        }}
      />
    </div>
  );
}

/**
 * Firma de la marca.
 *
 * Donde antes iba un logotipo circular va el nombre compuesto, en la misma
 * serif que la tarjeta en pantalla. La subred de Cormorant lleva las letras
 * de `MARCA` a propósito —ver scripts/generar-fuentes.mjs—: sin ellas, Satori
 * caía a la Geist de reserva y el PNG dejaba de ser la tarjeta que la
 * tienda acaba de ver.
 */
function Marca({
  cuerpo,
  ancho,
  nombre,
  logo,
}: {
  /** Cuerpo máximo. Se encoge —y si hace falta se parte— para caber. */
  cuerpo: number;
  ancho: number;
  nombre?: string;
  logo?: string | null;
}) {
  // El logotipo manda cuando lo hay: es la identidad que la tienda eligió.
  //
  // Su caja es más estrecha que la del nombre: el texto se lee bien ocupando
  // todo el ancho, pero una imagen a esa medida deja de parecer un logotipo y
  // pasa a parecer un banner. Se limita también el alto, porque los logotipos
  // de las tiendas no vienen todos con la misma proporción.
  //
  // Debajo va el nombre igualmente, y no como respaldo: durante un tiempo el
  // logotipo lo sustituía, y un vale de una tienda con logotipo pequeño
  // llegaba al cliente sin decir en ninguna parte de qué joyería era. Un
  // logotipo se reconoce si ya conoces la marca; el nombre se lee siempre.
  // Aquí va en pequeño y en gris, que es lo que corresponde a un pie: quien
  // reconoce el logotipo no lo necesita, y quien no, lo encuentra.
  if (logo) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={logo}
          alt=""
          style={{
            maxWidth: ancho * 0.62,
            /*
              El alto que se le deja a la imagen baja de 2.1 a 1.5 cuando
              lleva nombre debajo, porque el bloque entero tiene que seguir
              midiendo lo que medía. La vertical apila con márgenes fijos y
              sin holgura que ceder: al añadir el nombre sin descontarlo de
              algún sitio, el pie —código, portador y fecha— se salía de la
              página y acababa impreso uno encima de otro.
            */
            maxHeight: nombre ? cuerpo * 1.7 : cuerpo * 2.1,
            objectFit: "contain",
          }}
        />
        {nombre ? (
          <span
            style={{
              marginTop: cuerpo * 0.26,
              fontFamily: SERIF,
              fontWeight: 600,
              fontSize: cuerpo * 0.42,
              letterSpacing: cuerpo * 0.42 * MARCA.interletraje,
              color: PALETA.gris,
              textAlign: "center",
            }}
          >
            {nombre}
          </span>
        ) : null}
      </div>
    );
  }

  const { lineas, cuerpo: c } = componerMarca(palabrasDeMarca(nombre), cuerpo, ancho);
  const ultima = lineas.length - 1;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      {lineas.map((linea, f) => (
        <div
          key={f}
          style={{
            display: "flex",
            alignItems: "baseline",
            marginTop: f ? c * 0.28 : 0,
          }}
        >
          {linea.map((palabra, i) => (
            <span
              key={`${palabra}-${i}`}
              style={{
                fontFamily: SERIF,
                fontWeight: 600,
                fontSize: c,
                // Satori quiere px, no em.
                letterSpacing: c * MARCA.interletraje,
                // La última palabra en tinta y las anteriores en acento: con
                // tres palabras, alternar dejaría la del medio suelta.
                color:
                  f === ultima && i === linea.length - 1
                    ? PALETA.tinta
                    : PALETA.acento,
                marginLeft: i ? c * MARCA.hueco : 0,
              }}
            >
              {palabra}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

/**
 * El descuento: una sola cifra.
 *
 * Antes eran dos, oro y plata, partidas por una regla. Aquí solo se vende
 * oro, así que enseñar una segunda columna al 0% sería anunciar algo que no
 * existe. El rótulo «EN ORO» se queda: sin él, un porcentaje suelto invita a
 * esperarlo sobre toda la compra.
 */
function Descuento({
  oro,
  cifra,
  rotulo,
}: {
  oro: number;
  cifra: number;
  rotulo: number;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      <span
        style={{
          fontFamily: SERIF,
          fontWeight: 600,
          fontSize: cifra,
          lineHeight: 1,
          color: PALETA.tinta,
        }}
      >
        {oro}%
      </span>
      <span
        style={{
          fontFamily: SANS,
          fontSize: rotulo,
          letterSpacing: rotulo * 0.22,
          color: PALETA.gris,
          marginTop: rotulo * 0.7,
          marginLeft: rotulo * 0.22,
        }}
      >
        EN ORO
      </span>
    </div>
  );
}

/**
 * Medidas del sello en la tarjeta vertical.
 *
 * Van aquí arriba porque el hueco que baja la firma se calcula desde ellas:
 * con las cifras escritas en dos sitios, el primer ajuste del sello vuelve a
 * dejar el nombre debajo.
 */
const SELLO_LADO = 150;
const SELLO_MARGEN = 34;

/**
 * Sello «compártelo», arriba a la derecha.
 *
 * Un anillo doble con el rótulo dentro, todo en el acento del vale. La
 * esquina de arriba a la derecha es la única libre —los trazos de las
 * esquinas van en la contraria y en la de abajo—.
 *
 * Las medidas van en fracciones del diámetro para que valga igual en la
 * tarjeta vertical y en la apaisada, que la dibujan a tamaños distintos.
 */
function Sello({ lado, margen }: { lado: number; margen: number }) {
  return (
    <div
      style={{
        position: "absolute",
        top: margen,
        right: margen,
        width: lado,
        height: lado,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: lado / 2,
        border: `1px solid ${PALETA.acento}`,
        // El anillo interior es lo que lo hace leer como sello y no como
        // botón. Satori no aplica `outline`, así que va como sombra.
        boxShadow: `inset 0 0 0 ${Math.max(1, lado * 0.03)}px ${PALETA.fondo}, inset 0 0 0 ${Math.max(2, lado * 0.035)}px ${PALETA.acento}`,
      }}
    >
      <span
        style={{
          fontFamily: SANS,
          fontWeight: 600,
          fontSize: lado * 0.125,
          letterSpacing: lado * 0.0125,
          marginLeft: lado * 0.0125,
          color: PALETA.tinta,
        }}
      >
        {SELLO.titulo}
      </span>
      <div
        style={{
          display: "flex",
          width: lado * 0.3,
          height: 1,
          backgroundColor: PALETA.acento,
          opacity: 0.5,
          margin: `${lado * 0.05}px 0`,
        }}
      />
      {SELLO.pie.map((linea) => (
        <span
          key={linea}
          style={{
            fontFamily: SANS,
            // El pie se leía a 10 px en una imagen que WhatsApp enseña
            // reducida a la mitad: no era el color, era el cuerpo.
            fontSize: lado * 0.088,
            letterSpacing: lado * 0.005,
            fontWeight: 500,
            color: PALETA.acento,
            lineHeight: 1.35,
          }}
        >
          {linea}
        </span>
      ))}
    </div>
  );
}

function Icono({ trazos, lado }: { trazos: TrazoIcono[]; lado: number }) {
  return (
    <svg
      width={lado}
      height={lado}
      viewBox="0 0 24 24"
      fill="none"
      stroke={PALETA.acento}
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {trazos.map(([etiqueta, atributos], i) =>
        etiqueta === "rect" ? (
          <rect key={i} {...atributos} />
        ) : (
          <path key={i} {...atributos} />
        ),
      )}
    </svg>
  );
}

/* ── Formato vertical 800×1200: el que se manda por WhatsApp ─────────────── */

export function tarjetaVertical(vale: DatosImagenVale): ReactElement {
  const vigente = vale.estado === "activo";
  const nota = notaEstatus(vale.portador);

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        /*
          Desde arriba y no centrado.
          El contenido tiene que empezar por debajo del sello, que ocupa la
          esquina de arriba a la derecha: con la firma centrada verticalmente,
          dónde caía dependía de la altura del resto —un nombre de dos líneas
          o un logotipo apaisado la subían— y a veces se cruzaban. Anclarla
          arriba la deja siempre en el mismo sitio, tenga la tienda logotipo
          o no.
        */
        justifyContent: "flex-start",
        backgroundColor: PALETA.fondo,
        fontFamily: SANS,
        paddingTop: SELLO_MARGEN + SELLO_LADO + 26,
        paddingLeft: 54,
        paddingRight: 54,
        paddingBottom: 44,
        position: "relative",
      }}
    >
      <Textura opacidad={0.85} />
      <Esquinas margen={22} lado={54} />
      {/* Un vale muerto no invita a compartirse. */}
      {vigente ? <Sello lado={SELLO_LADO} margen={SELLO_MARGEN} /> : null}

      <Marca cuerpo={62} ancho={620} nombre={vale.tienda} logo={vale.logo} />

      <div
        style={{
          display: "flex",
          width: 64,
          height: 1,
          backgroundColor: PALETA.acento,
          opacity: 0.6,
          margin: "26px 0 26px",
        }}
      />

      <Descuento oro={vale.descuentoOro} cifra={110} rotulo={19} />

      <div
        style={{
          display: "flex",
          backgroundColor: PALETA.blanco,
          borderRadius: 10,
          padding: 16,
          marginTop: 26,
        }}
      >
        {/*
          206 y no 232. Con el nombre de la tienda bajo el logotipo la
          columna dejó de caber en los 1200 px, y cuando eso pasa Satori no
          recorta por abajo: aprieta, y el código acaba impreso encima del
          portador. El alto sale de aquí porque el QR es la pieza más grande
          y la que menos sufre: a 206 px sigue muy por encima de lo que un
          teléfono necesita para leerlo, mientras que el código y la fecha no
          admiten perder ni un punto.
        */}
        <img src={vale.qr} width={206} height={206} alt="" />
      </div>

      <span
        style={{
          fontFamily: MONO,
          fontWeight: 500,
          fontSize: 27,
          letterSpacing: 2.4,
          color: PALETA.acento,
          // El pie llevaba la mitad de aire que el resto del vale —18 y 10
          // px— y se leía apelmazado contra el QR, que es justo donde hay
          // que mirar dos veces: el código se dicta en caja.
          marginTop: 26,
        }}
      >
        {vale.codigo}
      </span>
      <span style={{ fontSize: 16, color: PALETA.gris, marginTop: 14 }}>
        {vale.portador} · {vale.tipoEtiqueta}
      </span>

      <div
        style={{
          display: "flex",
          width: "100%",
          height: 1,
          backgroundColor: PALETA.divisor,
          margin: "20px 0 16px",
        }}
      />

      <span style={{ fontSize: 16, color: PALETA.gris }}>
        {leyendaVigencia(vale.estado, vale.vigencia)}
      </span>
      {/*
        Va en acento y no en gris como el aviso legal de abajo: es una oferta
        y no letra pequeña. Y va aquí, junto a la vigencia, porque es lo que
        el cliente necesita saber antes de decidir cómo paga, no después.
      */}
      {vale.formasPago ? (
        <span
          style={{
            fontSize: 15,
            fontWeight: 500,
            color: PALETA.acento,
            marginTop: 9,
            textAlign: "center",
          }}
        >
          {vale.formasPago}
        </span>
      ) : null}
      <span
        style={{
          fontSize: 13,
          color: PALETA.gris,
          opacity: 0.75,
          marginTop: 8,
          textAlign: "center",
        }}
      >
        {AVISO_LEGAL}
      </span>

      {/* Un vale vencido o anulado no invita a pasar por la tienda. */}
      {vigente ? (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            width: "100%",
            backgroundColor: PALETA.trama,
            border: `1px solid ${PALETA.acento}40`,
            borderRadius: 12,
            padding: "18px 22px",
            marginTop: 22,
          }}
        >
          {/* Satori no centra un `span` suelto con `textAlign`: necesita que
              el centrado lo resuelva el contenedor. */}
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              width: "100%",
              marginBottom: 14,
            }}
          >
            <span
              style={{
                fontSize: 12,
                fontWeight: 600,
                letterSpacing: 2.8,
                color: PALETA.acento,
                marginLeft: 2.8,
              }}
            >
              {TITULO_PASOS}
            </span>
          </div>
          {pasos(vale.telefono).map((paso) => (
            <div
              key={paso.numero}
              style={{
                display: "flex",
                alignItems: "center",
                marginTop: paso.numero === 1 ? 0 : 11,
              }}
            >
              <Icono trazos={paso.trazos} lado={19} />
              <span
                style={{
                  fontSize: 14,
                  color: PALETA.acento,
                  marginLeft: 11,
                  width: 17,
                }}
              >
                {paso.numero}.
              </span>
              <span style={{ fontSize: 14, color: PALETA.gris }}>
                {paso.texto}
              </span>
            </div>
          ))}
        </div>
      ) : null}

      <span
        style={{
          display: "flex",
          fontSize: 11.5,
          color: PALETA.gris,
          opacity: 0.7,
          marginTop: 18,
          textAlign: "center",
        }}
      >
        {nota.antes}
        <span style={{ color: PALETA.acento }}>{nota.estatus}</span>
        {nota.despues}
      </span>
    </div>
  );
}

/* ── Formato apaisado 1200×630: la vista previa del enlace ────────────────
 * No lleva los pasos ni la nota: WhatsApp la enseña a menos de la mitad de
 * ancho, y todo lo que se añada aquí llega ilegible. Solo comparte la paleta.
 */

export function tarjetaApaisada(vale: DatosImagenVale): ReactElement {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        backgroundColor: PALETA.fondo,
        fontFamily: SANS,
        position: "relative",
      }}
    >
      <Textura opacidad={0.85} />
      <Esquinas margen={20} lado={48} />
      {/* Más pequeño que en la vertical: aquí compite con el QR, y WhatsApp
          enseña esta imagen a menos de la mitad de ancho. */}
      {vale.estado === "activo" ? <Sello lado={112} margen={28} /> : null}

      <div
        style={{
          display: "flex",
          flex: 1,
          padding: "52px 70px",
          alignItems: "center",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            flex: 1,
            alignItems: "flex-start",
          }}
        >
          <Marca cuerpo={46} ancho={420} nombre={vale.tienda} logo={vale.logo} />

          <div
            style={{
              display: "flex",
              width: 56,
              height: 1,
              backgroundColor: PALETA.acento,
              opacity: 0.6,
              margin: "22px 0 22px",
            }}
          />

          <Descuento oro={vale.descuentoOro} cifra={96} rotulo={17} />

          <span
            style={{
              fontFamily: MONO,
              fontWeight: 500,
              fontSize: 26,
              letterSpacing: 2.2,
              color: PALETA.acento,
              marginTop: 26,
            }}
          >
            {vale.codigo}
          </span>
          <span style={{ fontSize: 15, color: PALETA.gris, marginTop: 9 }}>
            {vale.tipoEtiqueta} · {leyendaVigencia(vale.estado, vale.vigencia)}
          </span>
          {vale.formasPago ? (
            <span
              style={{
                fontSize: 14,
                fontWeight: 500,
                color: PALETA.acento,
                marginTop: 10,
              }}
            >
              {vale.formasPago}
            </span>
          ) : null}
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          <div
            style={{
              display: "flex",
              backgroundColor: PALETA.blanco,
              borderRadius: 8,
              padding: 14,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={vale.qr} width={238} height={238} alt="" />
          </div>
          <span style={{ fontSize: 14, color: PALETA.gris, marginTop: 14 }}>
            Escanea para presentarlo
          </span>
        </div>
      </div>
    </div>
  );
}
