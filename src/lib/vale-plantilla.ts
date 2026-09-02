/**
 * Plantilla del vale: paleta, textos e iconos.
 *
 * Vive aparte porque el vale se dibuja varias veces y tiene que salir
 * idéntico: la tarjeta en pantalla (`components/vales/tarjeta-vale.tsx`) con
 * Tailwind, el PNG 800×1200 que arma el servidor (`lib/vale-imagen.tsx`) con
 * estilos en línea de Satori, y el PDF (`lib/pdf/vale-documento.tsx`) con su
 * propio motor. Ninguno comparte nada con los otros; tener los valores aquí
 * es lo único que impide que se separen con el tiempo.
 *
 * La paleta es propia del vale y no sale de los tokens de `globals.css`: la
 * tarjeta es material que ve el cliente final —impreso, en WhatsApp, fuera de
 * la aplicación— y se aparta a propósito del cromado del panel interno.
 */

import type { EstadoVale } from "@/lib/supabase/types";

export const PALETA = {
  /**
   * Hueso. El vale es claro y no oscuro, y esa es la decisión que manda
   * sobre el resto: cada tienda imprime aquí SU logotipo, y un logotipo se
   * diseña casi siempre para fondo blanco. Sobre oscuro, el que no traiga
   * versión en claro aparece con un recuadro alrededor —o hay que pedirle a
   * cada tienda una segunda versión, que es una gestión que nadie va a
   * sostener—. Sobre un fondo claro entra cualquiera tal como llegue.
   *
   * Claro, pero no blanco puro: en blanco el vale se leía como una hoja a
   * medio imprimir, y todo lo que va en taupe claro encima —el sello, las
   * reglas, las esquinas— se perdía por falta de fondo contra el que
   * recortarse. Este hueso es apenas un grado más cálido, suficiente para
   * que el vale tenga superficie sin tocar el contraste del texto oscuro,
   * que es lo que de verdad hay que leer.
   */
  fondo: "#F7F3EC",
  /**
   * Líneas de la trama diagonal y fondo de la caja de pasos. Un grado por
   * debajo del fondo, no por encima: sobre fondo claro, una trama que se
   * note compite con el logotipo de la tienda, que es lo único que debe
   * destacar arriba.
   */
  trama: "#EDE7DC",
  /**
   * Taupe: reglas, esquinas, iconos, código y títulos de sección.
   *
   * Se llama `acento` y no `oro` a propósito. Aquí «oro» es el material que
   * se vende, y un color con ese nombre que no fuera dorado engañaría a
   * quien lo leyera después. Es neutro porque el vale es de la red, no de
   * una tienda: el color de cada una lo pone su logotipo.
   */
  acento: "#7A6A52",
  /** El tono más oscuro: la cifra del descuento y el nombre de la tienda. */
  tinta: "#2B2723",
  /** Texto secundario. */
  gris: "#6E6862",
  /** Líneas divisorias. */
  divisor: "#E4DED2",
  /**
   * Fondo de la tarjeta del QR. Es el mismo blanco del vale, así que no se
   * ve como caja; lo que hace es tapar la trama por debajo. Un lector
   * necesita el contraste completo, y sobre fondo tramado algunos teléfonos
   * fallan a la primera.
   */
  blanco: "#FFFFFF",
} as const;

/**
 * Compone el nombre de una tienda para que quepa donde tiene que caber.
 *
 * Hace falta porque el vale ya no firma con un logotipo de medida fija sino
 * con el nombre de cada tienda, y esos nombres no miden lo mismo: «MAZATE»
 * entra a cualquier cuerpo y «CENTRO COMERCIAL PRADERA» se sale de la
 * tarjeta —o peor, se mete debajo del sello, que es lo que pasaba—.
 *
 * Encoger sin más no sirve: un nombre de cuatro palabras acabaría en un
 * cuerpo ilegible. Así que primero se prueba en una línea y, si eso obliga a
 * encoger por debajo de lo que se lee de un vistazo, se parte en dos. El
 * umbral es el 62% del cuerpo máximo, que es donde una línea deja de tener
 * presencia de firma y pasa a parecer un pie de página.
 *
 * El ancho se estima, no se mide: ni Satori ni react-pdf exponen métricas de
 * texto antes de dibujar. `0.86` es el avance medio de la Cormorant en
 * mayúsculas más el interletraje, ajustado contra los renders. Va holgado por
 * diseño: pasarse encoge de más, que es feo pero legible, mientras que
 * quedarse corto solapa.
 */
const AVANCE_MEDIO = 0.86;

function anchoEnEmes(linea: readonly string[]) {
  return (
    linea.reduce((n, p) => n + p.length, 0) * AVANCE_MEDIO +
    (linea.length - 1) * MARCA.hueco
  );
}

/** Reparte las palabras en dos líneas lo más parejas posible. */
function partirEnDos(palabras: readonly string[]) {
  if (palabras.length < 2) return [palabras];

  let mejor = 1;
  let diferencia = Infinity;
  for (let corte = 1; corte < palabras.length; corte++) {
    const d = Math.abs(
      anchoEnEmes(palabras.slice(0, corte)) - anchoEnEmes(palabras.slice(corte)),
    );
    if (d < diferencia) {
      diferencia = d;
      mejor = corte;
    }
  }
  return [palabras.slice(0, mejor), palabras.slice(mejor)];
}

export function componerMarca(
  palabras: readonly string[],
  cuerpoMaximo: number,
  anchoDisponible: number,
): { lineas: readonly (readonly string[])[]; cuerpo: number } {
  const cabe = (lineas: readonly (readonly string[])[]) =>
    Math.min(
      cuerpoMaximo,
      ...lineas.map((l) => anchoDisponible / Math.max(anchoEnEmes(l), 0.001)),
    );

  const enUna = [palabras];
  const cuerpoUna = cabe(enUna);
  if (cuerpoUna >= cuerpoMaximo * 0.62) return { lineas: enUna, cuerpo: cuerpoUna };

  const enDos = partirEnDos(palabras);
  const cuerpoDos = cabe(enDos);
  // Con dos líneas y aun así ilegible —un nombre kilométrico— se acepta el
  // suelo: antes que eso, que se acerque a los bordes.
  return {
    lineas: enDos,
    cuerpo: Math.max(cuerpoDos, cuerpoMaximo * 0.42),
  };
}

/** Parte un nombre de tienda en palabras, en mayúsculas. */
export function palabrasDeMarca(nombre?: string): readonly string[] {
  const limpio = (nombre ?? "").trim();
  return limpio ? limpio.toUpperCase().split(/\s+/) : MARCA.palabras;
}

/**
 * Firma de la marca, donde antes iba el logotipo.
 *
 * GOLD HUB no tiene isotipo: firma con su nombre compuesto en la serif del
 * sistema. Va aquí, en datos, porque lo dibujan cuatro motores distintos —el
 * DOM, Satori, react-pdf y la tarjeta del enlace A3— y cada uno lo arma a su
 * manera; lo que no puede diferir es qué dice ni con qué proporciones.
 *
 * Las tintas no viajan aquí: el PDF tiene su propia paleta, más cercana a la
 * del panel que a la del vale. La regla, que sí es común, es que la primera
 * palabra va en el oro de quien la dibuje y la segunda en su tono claro.
 *
 * Las medidas son relativas al cuerpo para que cada sitio la escale a lo suyo
 * sin recalcular proporciones. El hueco entre palabras va aparte porque con
 * un interletraje tan abierto, un espacio normal se estira y las separa de
 * más.
 */
export const MARCA = {
  palabras: ["GOLD", "HUB"] as const,
  /** Interletraje, en em. */
  interletraje: 0.18,
  /** Hueco entre las dos palabras, en em. */
  hueco: 0.26,
} as const;

/**
 * Estatus que promete la nota al pie. Es de campaña, no del vale: no viaja en
 * la base ni se congela al emitir, así que cambiarlo aquí lo cambia en todos
 * los vales a la vez, incluidos los ya entregados.
 */
export const ESTATUS_NOTA = "Premium";

/** Un trazo de icono: `[etiqueta, atributos]`, tal como los publica lucide. */
export type TrazoIcono = [string, Record<string, string | number>];

/**
 * Iconos de los pasos, copiados de lucide (ISC) en lugar de importados.
 *
 * Satori no monta componentes de React: necesita el árbol de elementos ya
 * resuelto. Guardar los trazos aquí es lo que permite que el PNG y la pantalla
 * dibujen exactamente el mismo icono en vez de dos parecidos.
 */
const ICONOS: Record<string, TrazoIcono[]> = {
  // lucide `user-round`
  //
  // Era el local de `store`. El primer paso dejó de mandar a un sitio y
  // pasó a mandar a una persona, así que un escaparate al lado del texto
  // contradecía lo que el texto pide.
  asesora: [
    // El círculo va como arco dentro de un `path` y no como `circle`: quien
    // pinta esto —la imagen y la tarjeta— solo distingue `rect` de `path`,
    // y cualquier otra etiqueta acabaría siendo un <path> sin `d`, es decir
    // un icono invisible.
    ["path", { d: "M17 8a5 5 0 1 1-10 0 5 5 0 0 1 10 0Z" }],
    ["path", { d: "M20 21a8 8 0 0 0-16 0" }],
  ],
  // lucide `scan-qr-code`
  escaner: [
    ["path", { d: "M17 12v4a1 1 0 0 1-1 1h-4" }],
    ["path", { d: "M17 3h2a2 2 0 0 1 2 2v2" }],
    ["path", { d: "M17 8V7" }],
    ["path", { d: "M21 17v2a2 2 0 0 1-2 2h-2" }],
    ["path", { d: "M3 7V5a2 2 0 0 1 2-2h2" }],
    ["path", { d: "M7 17h.01" }],
    ["path", { d: "M7 21H5a2 2 0 0 1-2-2v-2" }],
    ["rect", { x: "7", y: "7", width: "5", height: "5", rx: "1" }],
  ],
  // lucide `ticket-percent`
  etiqueta: [
    [
      "path",
      {
        d: "M2 9a3 3 0 1 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 1 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z",
      },
    ],
    ["path", { d: "M9 9h.01" }],
    ["path", { d: "m15 9-6 6" }],
    ["path", { d: "M15 15h.01" }],
  ],
};

/**
 * El sello «compártelo», en texto.
 *
 * Era una insignia PNG en negro y dorado, heredada. Sobre el crema del vale
 * era lo más ruidoso de la tarjeta y no se podía teñir: venía con su fondo
 * dentro. Ahora se dibuja con reglas y tipografía, así que sigue la paleta
 * sin que nadie tenga que regenerar un archivo.
 *
 * Se mantiene porque tiene trabajo que hacer: los A2 se reparten en frío
 * para que se compartan, y esa difusión es la que mide `vw_viralidad_a2`.
 */
export const SELLO = {
  titulo: "COMPÁRTELO",
  pie: ["Y HAZ FELIZ", "A ALGUIEN MÁS"],
} as const;

export type Paso = {
  /** Ordinal impreso a la izquierda, junto al icono. */
  numero: number;
  trazos: TrazoIcono[];
  texto: string;
};

/**
 * Los tres pasos, con el teléfono de la tienda incrustado en el segundo.
 *
 * Es una función y no una constante porque el segundo paso depende de la
 * tienda que emite: el número sale del maestro de tiendas, así que cada vale
 * lleva el de la suya.
 *
 * Sin teléfono cargado el paso se queda con su texto de siempre. No se deja
 * un hueco ni un guion: hoy la mayoría de las tiendas todavía no lo tienen
 * puesto, y un vale que anuncia un contacto vacío es peor que uno que no lo
 * anuncia. Cada tienda lo carga desde «Mi tienda» y sus vales lo estrenan
 * sin que haya que tocar nada aquí.
 */
export function pasos(telefono?: string | null): Paso[] {
  const tel = telefono?.trim();

  return [
    { numero: 1, trazos: ICONOS.asesora, texto: "Contacta a tu asesora." },
    {
      numero: 2,
      trazos: ICONOS.escaner,
      texto: tel
        ? `Escríbele al ${tel} o muestra este código en caja.`
        : "Muestra este código en caja antes de pagar.",
    },
    {
      numero: 3,
      trazos: ICONOS.etiqueta,
      texto: "Disfruta tu descuento inmediato.",
    },
  ];
}

export const TITULO_PASOS = "CÓMO USARLO";

export const AVISO_LEGAL =
  "Válido solo en la tienda que lo emitió. No es canjeable por efectivo.";

/**
 * Vigencia tal como se imprime. Un vale vencido o anulado no dice «vigente
 * hasta»: la fecha es la misma, pero la frase tiene que decir la verdad.
 */
export function leyendaVigencia(estado: EstadoVale, vigencia: string) {
  if (estado === "activo") return `Vigente hasta el ${vigencia}`;
  if (estado === "vencido") return `Venció el ${vigencia}`;
  return "Vale anulado";
}

/**
 * Nota al pie, partida en tres para poder dorar el estatus en medio.
 *
 * El vale circula: los A2 están pensados para compartirse y los A4 llegan de
 * un referido, así que quien lo abre muchas veces no es el portador impreso.
 * La nota le habla justo a esa persona.
 */
export function notaEstatus(portador: string) {
  // Los espacios que tocan al estatus son duros a propósito: al dibujar la
  // imagen, Satori recorta el espacio del borde de cada fragmento de texto y
  // la frase salía pegada («clientesPremiumal comprar»).
  return {
    antes: `Nota: Si no eres ${portador}, serás de nuestros clientes `,
    estatus: ESTATUS_NOTA,
    despues: " al comprar.",
  };
}
