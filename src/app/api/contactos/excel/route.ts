import ExcelJS from "exceljs";
import { NextResponse, type NextRequest } from "next/server";

import { requerirAdmin } from "@/lib/auth/guardas";
import {
  listarContactosCompleto,
  ORDENES_CONTACTOS,
  type FiltroContactos,
  type OrdenContactos,
} from "@/lib/datos/contactos";
import { ETIQUETA_SEGMENTO, ETIQUETA_TIPO, type TipoVale } from "@/lib/supabase/types";

export const runtime = "nodejs";

/**
 * El directorio de contactos tal como se está viendo en pantalla.
 *
 * Toma los mismos parámetros que la página, así que exporta la selección
 * filtrada y no la base entera: quien acota «los A2 de Pradera que aún no
 * compran» se lleva justo esa lista para trabajarla.
 *
 * Sale COMPLETA, no la página que se esté viendo: `listarContactosCompleto`
 * recorre el resultado de mil en mil hasta agotarlo. Pedir un rango enorme de
 * una vez parecía más simple, pero PostgREST puede llevar un techo por
 * petición y habría devuelto un libro a medias sin avisar de nada.
 *
 * Solo administradores: son teléfonos y correos de clientes.
 */

const MONEDA = '"Q" #,##0.00';

export async function GET(request: NextRequest) {
  await requerirAdmin();

  const p = request.nextUrl.searchParams;
  const texto = (k: string) => p.get(k)?.trim() || undefined;

  const tipo = texto("tipo");
  const orden = texto("orden");
  const compro = texto("compro");

  const filtros: FiltroContactos = {
    busqueda: texto("q"),
    tipo:
      tipo && tipo !== "todos" ? (tipo as TipoVale | "sin-vale") : undefined,
    tiendaId: Number(p.get("tienda")) || undefined,
    origen: texto("origen"),
    compro: compro === "si" || compro === "no" ? compro : undefined,
    orden:
      orden && orden in ORDENES_CONTACTOS
        ? (orden as OrdenContactos)
        : "reciente",
  };

  const { contactos, total, truncado } = await listarContactosCompleto(filtros);

  const libro = new ExcelJS.Workbook();
  libro.creator = "GOLD HUB SMART VALE";
  libro.created = new Date();

  const hoja = libro.addWorksheet("Contactos", {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  const columnas = [
    { header: "Nombre", key: "nombre", width: 28 },
    { header: "Teléfono", key: "telefono", width: 16 },
    { header: "Correo", key: "correo", width: 26 },
    { header: "Entró por", key: "tipo", width: 24 },
    { header: "Primer vale", key: "vale", width: 18 },
    { header: "Clasificación", key: "segmento", width: 20 },
    { header: "Origen A2", key: "origen", width: 24 },
    { header: "Lo refirió", key: "referidor", width: 24 },
    { header: "Tienda", key: "tienda", width: 20 },
    { header: "La captó", key: "emisora", width: 24 },
    { header: "Vales", key: "vales", width: 8 },
    { header: "Vigentes", key: "vigentes", width: 10 },
    { header: "Compras", key: "compras", width: 10 },
    { header: "Comprado", key: "gastado", width: 15, formato: MONEDA },
    { header: "En oro", key: "oro", width: 14, formato: MONEDA },
    { header: "En plata", key: "plata", width: 14, formato: MONEDA },
    { header: "Descuento recibido", key: "ahorrado", width: 19, formato: MONEDA },
    { header: "Última compra", key: "ultima", width: 20 },
    { header: "Compró en", key: "tiendaCompra", width: 20 },
    { header: "Personas que trajo", key: "referidos", width: 18 },
    { header: "Alta", key: "alta", width: 20 },
  ];

  hoja.columns = columnas.map((c) => ({
    header: c.header,
    key: c.key,
    width: c.width,
    style: c.formato ? { numFmt: c.formato } : undefined,
  }));

  hoja.getRow(1).eachCell((celda) => {
    celda.font = { bold: true, color: { argb: "FFE7CE92" }, size: 10 };
    celda.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF0B0B0C" },
    };
    celda.alignment = { vertical: "middle" };
  });
  hoja.getRow(1).height = 22;

  for (const c of contactos) {
    hoja.addRow({
      nombre: c.nombre,
      telefono: c.telefono,
      correo: c.correo ?? "",
      tipo: c.tipo ? `${c.tipo} · ${ETIQUETA_TIPO[c.tipo]}` : "Sin vale propio",
      vale: c.vale_codigo ?? "",
      segmento: c.segmento ? ETIQUETA_SEGMENTO[c.segmento] : "",
      origen: c.origen ?? "",
      referidor: c.referidor ?? "",
      tienda: c.tienda ?? c.tienda_compra ?? "",
      emisora: c.emisora ?? (c.autorregistro ? "Autorregistro" : ""),
      vales: c.vales,
      vigentes: c.vales_vigentes,
      compras: c.compras,
      gastado: Number(c.gastado),
      ahorrado: Number(c.ahorrado),
      ultima: c.ultima_compra ? new Date(c.ultima_compra) : null,
      tiendaCompra: c.tienda_compra ?? "",
      referidos: c.referidos,
      alta: new Date(c.fecha_alta),
    });
  }

  /*
   * Si el tope de seguridad cortó el recorrido, tiene que constar DENTRO del
   * archivo. Un aviso en pantalla se pierde en cuanto se manda el .xlsx por
   * correo, y entonces nadie sabe que esa lista no está entera.
   */
  if (truncado) {
    const fila = hoja.addRow({
      nombre: `⚠ Lista incompleta: se exportaron ${contactos.length} de ${total}. Acota los filtros.`,
    });
    fila.font = { bold: true, color: { argb: "FF8E4534" } };
  }

  if (contactos.length > 0) {
    hoja.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: columnas.length },
    };
  }

  const buffer = await libro.xlsx.writeBuffer();
  const dia = new Date().toISOString().slice(0, 10);

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="goldhub-contactos-${dia}.xlsx"`,
      "Cache-Control": "private, no-store",
    },
  });
}
