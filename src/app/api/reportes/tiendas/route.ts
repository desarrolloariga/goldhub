import ExcelJS from "exceljs";
import { NextResponse, type NextRequest } from "next/server";

import { requerirAdmin } from "@/lib/auth/guardas";
import { ventasPorTienda } from "@/lib/datos/ventas";
import { ES_FECHA } from "@/lib/rango-fechas";

export const runtime = "nodejs";

const MONEDA = '"Q" #,##0.00';

/**
 * El reporte por tienda en Excel, con el mismo rango que se está viendo.
 *
 * Las fechas llegan por la URL y no se recalculan aquí: si esta ruta
 * volviera a traducir el atajo por su cuenta, un reporte pedido a las 23:59
 * podría descargarse con el rango del día siguiente.
 */
export async function GET(request: NextRequest) {
  await requerirAdmin();

  const params = request.nextUrl.searchParams;
  const crudoDesde = params.get("desde") ?? "";
  const crudoHasta = params.get("hasta") ?? "";

  const desde = ES_FECHA.test(crudoDesde) ? crudoDesde : null;
  const hasta = ES_FECHA.test(crudoHasta) ? crudoHasta : null;

  const filas = await ventasPorTienda({ desde, hasta, tiendaId: null });

  const libro = new ExcelJS.Workbook();
  libro.creator = "GOLD HUB SMART VALE";
  libro.created = new Date();

  const hoja = libro.addWorksheet("Venta por tienda");

  hoja.columns = [
    { header: "Tienda", key: "tienda", width: 26 },
    { header: "Asesora", key: "asesora", width: 30 },
    { header: "Compras", key: "tickets", width: 10 },
    { header: "Venta bruta", key: "venta", width: 16, style: { numFmt: MONEDA } },
    { header: "Comisiones", key: "descuento", width: 16, style: { numFmt: MONEDA } },
    { header: "Venta neta", key: "neta", width: 16, style: { numFmt: MONEDA } },
  ];

  hoja.getRow(1).font = { bold: true };
  hoja.getRow(1).alignment = { vertical: "middle" };
  hoja.views = [{ state: "frozen", ySplit: 1 }];

  for (const f of filas) {
    hoja.addRow({
      tienda: f.tienda,
      asesora: f.asesora ?? "",
      tickets: f.tickets,
      venta: Number(f.venta),
      descuento: Number(f.descuento),
      neta: Number(f.venta_neta),
    });
  }

  /*
   * Los totales se suman sobre las mismas filas que se escriben, igual que
   * en la pantalla. Y van como número y no como fórmula: una fórmula se
   * rompe al copiar la hoja a otro libro o al abrirla en un programa que no
   * sea Excel, y entonces el total desaparece sin avisar.
   */
  if (filas.length > 0) {
    const total = filas.reduce(
      (a, f) => ({
        tickets: a.tickets + f.tickets,
        venta: a.venta + Number(f.venta),
        descuento: a.descuento + Number(f.descuento),
        neta: a.neta + Number(f.venta_neta),
      }),
      { tickets: 0, venta: 0, descuento: 0, neta: 0 },
    );

    const fila = hoja.addRow({
      tienda: "TOTAL",
      asesora: `${filas.length} tienda${filas.length === 1 ? "" : "s"}`,
      tickets: total.tickets,
      venta: total.venta,
      descuento: total.descuento,
      neta: total.neta,
    });
    fila.font = { bold: true };
    fila.border = { top: { style: "medium" } };
  }

  // El periodo, debajo de la tabla: sin él, dos descargas del mismo reporte
  // con rangos distintos son indistinguibles una vez guardadas.
  hoja.addRow({});
  hoja.addRow({
    tienda: "Periodo",
    asesora:
      desde && hasta
        ? `${desde} a ${hasta}`
        : desde
          ? `Desde ${desde}`
          : hasta
            ? `Hasta ${hasta}`
            : "Todo el histórico",
  });
  hoja.addRow({
    tienda: "Comisiones",
    asesora: "Descuento aplicado al cliente al redimir su vale.",
  });

  const buffer = await libro.xlsx.writeBuffer();
  const sufijo = desde || hasta ? `-${desde ?? "inicio"}_${hasta ?? "hoy"}` : "";

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="venta-por-tienda${sufijo}.xlsx"`,
      "Cache-Control": "private, no-store",
    },
  });
}
