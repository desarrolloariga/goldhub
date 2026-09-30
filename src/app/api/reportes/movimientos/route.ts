import ExcelJS from "exceljs";
import { NextResponse, type NextRequest } from "next/server";

import { requerirAdmin } from "@/lib/auth/guardas";
import { todasLasVentas } from "@/lib/datos/ventas";
import { ES_FECHA } from "@/lib/rango-fechas";

export const runtime = "nodejs";

const MONEDA = '"Q" #,##0.00';

/** Todas las ventas —con vale y sin él— en Excel, con la columna de tipo. */
export async function GET(request: NextRequest) {
  await requerirAdmin();

  const params = request.nextUrl.searchParams;
  const crudoDesde = params.get("desde") ?? "";
  const crudoHasta = params.get("hasta") ?? "";
  const crudoTipo = params.get("tipo") ?? "";

  const desde = ES_FECHA.test(crudoDesde) ? crudoDesde : null;
  const hasta = ES_FECHA.test(crudoHasta) ? crudoHasta : null;
  const tienda = Number(params.get("tienda")) || null;
  const tipo = crudoTipo === "vale" || crudoTipo === "normal" ? crudoTipo : null;

  const ventas = await todasLasVentas({ desde, hasta, tiendaId: tienda, tipo });

  const libro = new ExcelJS.Workbook();
  libro.creator = "GOLD HUB SMART VALE";
  libro.created = new Date();

  const hoja = libro.addWorksheet("Todas las ventas");

  hoja.columns = [
    { header: "Fecha", key: "dia", width: 12 },
    { header: "Tipo", key: "tipo", width: 10 },
    { header: "Tienda", key: "tienda", width: 24 },
    { header: "Vale", key: "codigo", width: 15 },
    { header: "Comprador", key: "comprador", width: 26 },
    { header: "Detalle", key: "detalle", width: 22 },
    { header: "Oro", key: "oro", width: 15, style: { numFmt: MONEDA } },
    { header: "Plata", key: "plata", width: 15, style: { numFmt: MONEDA } },
    { header: "Descuento", key: "descuento", width: 15, style: { numFmt: MONEDA } },
    { header: "Neto", key: "neto", width: 15, style: { numFmt: MONEDA } },
  ];

  hoja.getRow(1).font = { bold: true };
  hoja.views = [{ state: "frozen", ySplit: 1 }];

  for (const v of ventas) {
    hoja.addRow({
      // Como texto y no como fecha: en una columna de fechas, Excel las
      // reinterpreta según el idioma del equipo y el 09/10 pasa a ser otro
      // día en una máquina configurada en inglés.
      dia: v.dia,
      tipo: v.tipo === "vale" ? "Con vale" : "Normal",
      tienda: v.tienda,
      codigo: v.codigo ?? "",
      comprador: v.comprador ?? "",
      detalle: v.detalle ?? "",
      oro: Number(v.monto_oro),
      plata: Number(v.monto_plata),
      descuento: Number(v.descuento),
      neto: Number(v.neto),
    });
  }

  if (ventas.length > 0) {
    const total = ventas.reduce(
      (a, v) => ({
        oro: a.oro + Number(v.monto_oro),
        plata: a.plata + Number(v.monto_plata),
        descuento: a.descuento + Number(v.descuento),
        neto: a.neto + Number(v.neto),
        vale: a.vale + (v.tipo === "vale" ? 1 : 0),
      }),
      { oro: 0, plata: 0, descuento: 0, neto: 0, vale: 0 },
    );

    const fila = hoja.addRow({
      dia: "TOTAL",
      tipo: `${total.vale} con vale`,
      tienda: `${ventas.length - total.vale} normales`,
      oro: total.oro,
      plata: total.plata,
      descuento: total.descuento,
      neto: total.neto,
    });
    fila.font = { bold: true };
    fila.border = { top: { style: "medium" } };
  }

  hoja.addRow({});
  hoja.addRow({
    dia: "Con vale",
    tipo: "El cliente presentó su vale y se le aplicó el descuento de campaña.",
  });
  hoja.addRow({
    dia: "Normal",
    tipo: "Venta de la tienda sin vale, en oro o plata, sin descuento.",
  });

  const buffer = await libro.xlsx.writeBuffer();
  const sufijo = desde || hasta ? `-${desde ?? "inicio"}_${hasta ?? "hoy"}` : "";

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="todas-las-ventas${sufijo}.xlsx"`,
      "Cache-Control": "private, no-store",
    },
  });
}
