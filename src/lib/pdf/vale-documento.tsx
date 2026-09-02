import {
  Document,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";

import { MARCA } from "@/lib/vale-plantilla";

/**
 * Vale de descuento en PDF, para imprimir o adjuntar por correo.
 *
 * Tipografía: fuentes estándar del PDF (Helvetica / Times-Roman) para no
 * depender de la red al renderizar. Para usar Geist y Cormorant Garamond,
 * dejar los .ttf en `public/fonts/` y registrarlos con `Font.register`.
 *
 * Paleta propia, la del panel: este documento es material interno —exige
 * sesión— y no la pieza que ve el cliente, que va con la del vale. Lo único
 * que comparte con ella son las medidas de la firma, en `MARCA`.
 */

// Los mismos tonos que los tokens del panel en globals.css. Van copiados y
// no importados porque react-pdf no lee CSS; si allí cambian, aquí también.
const C = {
  ink: "#1A1714",
  bone: "#F5F2EC",
  paper: "#FFFFFF",
  taupe: "#8A7A61",
  taupeLight: "#CBBBA0",
  taupeDark: "#6E6151",
  linea: "#E3DDD1",
  tenue: "#6F6B63",
};

const s = StyleSheet.create({
  page: {
    backgroundColor: C.bone,
    color: C.ink,
    fontFamily: "Helvetica",
    fontSize: 10,
    padding: 34,
  },
  encabezado: {
    backgroundColor: C.ink,
    padding: 24,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  // La firma va en la serif estándar del PDF: es la única de las cuatro
  // integradas que se acerca a la Cormorant de la interfaz. Las medidas
  // vienen de `MARCA`, como en los otros tres renderizadores.
  firma: { flexDirection: "row", alignItems: "baseline" },
  firmaPalabra: {
    fontFamily: "Times-Roman",
    fontSize: 21,
    letterSpacing: 21 * MARCA.interletraje,
  },
  firmaHueco: { width: 21 * MARCA.hueco },
  // El logotipo va contenido en una caja fija: los de las tiendas no vienen
  // todos con la misma proporción y sin tope uno apaisado empujaría el código.
  logotipo: { maxWidth: 150, maxHeight: 46, objectFit: "contain" as const },
  etiquetaCabecera: {
    fontSize: 7,
    letterSpacing: 3,
    color: C.taupe,
    textAlign: "right",
  },
  codigo: {
    fontFamily: "Courier-Bold",
    fontSize: 17,
    color: C.bone,
    textAlign: "right",
    marginTop: 6,
  },
  reglaAcento: { height: 2, backgroundColor: C.taupe },
  cuerpo: {
    backgroundColor: C.paper,
    borderWidth: 1,
    borderColor: C.linea,
    borderTopWidth: 0,
    padding: 24,
    flexDirection: "row",
    gap: 24,
  },
  columna: { flex: 1, flexDirection: "column", gap: 15 },
  etiqueta: { fontSize: 7, letterSpacing: 2.2, color: C.tenue },
  valor: { fontSize: 11, color: C.ink, marginTop: 4 },
  tarifas: { flexDirection: "row", gap: 22, marginTop: 2 },
  descuento: {
    fontFamily: "Times-Bold",
    fontSize: 34,
    color: C.ink,
  },
  material: { fontSize: 7, letterSpacing: 1.6, color: C.tenue, marginTop: 2 },
  qrCaja: {
    width: 146,
    alignItems: "center",
    borderLeftWidth: 1,
    borderLeftColor: C.linea,
    paddingLeft: 22,
  },
  qr: { width: 124, height: 124 },
  qrPie: {
    fontSize: 7,
    color: C.tenue,
    textAlign: "center",
    marginTop: 9,
    lineHeight: 1.5,
  },
  condiciones: {
    marginTop: 18,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: C.linea,
  },
  condicionesTitulo: {
    fontSize: 7,
    letterSpacing: 2.2,
    color: C.taupeDark,
    marginBottom: 6,
  },
  condicion: { fontSize: 8, color: C.tenue, lineHeight: 1.6 },
  pie: {
    position: "absolute",
    left: 34,
    right: 34,
    bottom: 22,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 7,
    color: C.tenue,
  },
});

export type DatosVale = {
  codigo: string;
  tipo: string;
  /** Etiqueta legible del tipo, p. ej. "Empleados y referidos". */
  tipoEtiqueta: string;
  descuentoOro: number;
  portador: string;
  /** Ya formateadas. */
  emision: string;
  vigencia: string;
  estado: string;
  /** La tienda que lo emitió: firma el documento. */
  tiendaNombre?: string;
  /** Su logotipo como data URL. Nulo = firma con el nombre. */
  logo?: string | null;
  emisora?: string;
  tienda?: string | null;
  /** PNG del QR como data URL. Ver `qrDataUrl()` en `src/lib/qr.ts`. */
  qrDataUrl?: string;
  urlPublica?: string;
  condiciones?: string[];
};

const CONDICIONES_BASE = [
  "Válido presentando este código en la tienda que lo emitió, dentro de su vigencia.",
  "El descuento aplica sobre piezas de oro y no es canjeable por efectivo.",
  "Puede usarse en varias compras y por distintas personas mientras siga vigente.",
];

export function ValeDocumento(vale: DatosVale) {
  const condiciones = vale.condiciones ?? CONDICIONES_BASE;

  return (
    <Document
      title={`Vale ${vale.codigo} · GOLD HUB`}
      author="GOLD HUB"
      subject={`${vale.descuentoOro}% en oro · ${vale.tipoEtiqueta}`}
    >
      <Page size="A5" orientation="landscape" style={s.page}>
        <View style={s.encabezado}>
          {/* El logotipo de la tienda si lo tiene; si no, su nombre. */}
          {vale.logo ? (
            // eslint-disable-next-line jsx-a11y/alt-text
            <Image style={s.logotipo} src={vale.logo} />
          ) : (
            <View style={s.firma}>
              {(vale.tiendaNombre?.trim()
                ? vale.tiendaNombre.trim().toUpperCase().split(/\s+/)
                : MARCA.palabras
              ).map((palabra, i, todas) => (
                <View key={`${palabra}-${i}`} style={s.firma}>
                  {i ? <View style={s.firmaHueco} /> : null}
                  <Text
                    style={[
                      s.firmaPalabra,
                      { color: i === todas.length - 1 ? C.bone : C.taupeLight },
                    ]}
                  >
                    {palabra}
                  </Text>
                </View>
              ))}
            </View>
          )}
          <View>
            <Text style={s.etiquetaCabecera}>VALE DE DESCUENTO</Text>
            <Text style={s.codigo}>{vale.codigo}</Text>
          </View>
        </View>
        <View style={s.reglaAcento} />

        <View style={s.cuerpo}>
          <View style={s.columna}>
            <View>
              <Text style={s.etiqueta}>DESCUENTO</Text>
              {/* Una sola cifra: aquí solo se vende oro. El rótulo se queda
                  porque un porcentaje suelto invita a esperarlo sobre toda
                  la compra. */}
              <View style={s.tarifas}>
                <View>
                  <Text style={s.descuento}>{vale.descuentoOro}%</Text>
                  <Text style={s.material}>EN ORO</Text>
                </View>
              </View>
            </View>
            <View>
              <Text style={s.etiqueta}>PORTADOR</Text>
              <Text style={s.valor}>{vale.portador}</Text>
            </View>
            <View>
              <Text style={s.etiqueta}>TIPO</Text>
              <Text style={s.valor}>
                {vale.tipo} · {vale.tipoEtiqueta}
              </Text>
            </View>
            <View>
              <Text style={s.etiqueta}>VIGENTE HASTA</Text>
              <Text style={s.valor}>{vale.vigencia}</Text>
            </View>
          </View>

          <View style={s.qrCaja}>
            {vale.qrDataUrl ? (
              // eslint-disable-next-line jsx-a11y/alt-text
              <Image style={s.qr} src={vale.qrDataUrl} />
            ) : (
              <View style={[s.qr, { backgroundColor: C.linea }]} />
            )}
            <Text style={s.qrPie}>
              Escanea para presentarlo en tienda
              {vale.urlPublica ? `\n${vale.urlPublica}` : ""}
            </Text>
          </View>
        </View>

        <View style={s.condiciones}>
          <Text style={s.condicionesTitulo}>CONDICIONES</Text>
          {condiciones.map((linea, i) => (
            <Text key={i} style={s.condicion}>
              · {linea}
            </Text>
          ))}
        </View>

        <View style={s.pie}>
          <Text>
            {[vale.emisora, vale.tienda].filter(Boolean).join(" · ") ||
              "GOLD HUB"}
          </Text>
          <Text>Emitido el {vale.emision}</Text>
        </View>
      </Page>
    </Document>
  );
}
