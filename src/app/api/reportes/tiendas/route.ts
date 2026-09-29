import ExcelJS from "exceljs";
import { NextResponse, type NextRequest } from "next/server";

import { requerirAdmin } from "@/lib/auth/guardas";
import { consolidado, consolidadoPorTienda } from "@/lib/datos/ventas";
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

  const [filas, totales] = await Promise.all([
    consolidadoPorTienda({ desde, hasta }),
    consolidado({ desde, hasta, tiendaId: null }),
  ]);

  const libro = new ExcelJS.Workbook();
  libro.creator = "GOLD HUB SMART VALE";
  libro.created = new Date();

  const hoja = libro.addWorksheet("Venta por tienda");

  hoja.columns = [
    { header: "Tienda", key: "tienda", width: 26 },
    { header: "Asesora", key: "asesora", width: 30 },
    { header: "Bruta con vales", key: "bruta", width: 17, style: { numFmt: MONEDA } },
    { header: "Comisiones", key: "descuento", width: 15, style: { numFmt: MONEDA } },
    { header: "Neta con vales", key: "neta", width: 17, style: { numFmt: MONEDA } },
    { header: "Sin vale · oro", key: "oro", width: 15, style: { numFmt: MONEDA } },
    { header: "Sin vale · plata", key: "plata", width: 16, style: { numFmt: MONEDA } },
    { header: "Ventas normales", key: "directa", width: 17, style: { numFmt: MONEDA } },
    { header: "Gran total", key: "gran", width: 17, style: { numFmt: MONEDA } },
  ];

  hoja.getRow(1).font = { bold: true };
  hoja.getRow(1).alignment = { vertical: "middle" };
  hoja.views = [{ state: "frozen", ySplit: 1 }];

  for (const f of filas) {
    hoja.addRow({
      tienda: f.tienda,
      asesora: f.asesora ?? "",
      bruta: Number(f.vale_bruta),
      descuento: Number(f.vale_descuento),
      neta: Number(f.vale_neta),
      oro: Number(f.directa_oro),
      plata: Number(f.directa_plata),
      directa: Number(f.directa_total),
      gran: Number(f.gran_total),
    });
  }

  /*
   * Los totales salen de la misma consulta que usa la pantalla, no de sumar
   * las filas de esta hoja: las dos vistas leen la misma cifra y no pueden
   * discrepar.
   *
   * Y van como número, no como fórmula: una fórmula se rompe al copiar la
   * hoja a otro libro o al abrirla en un programa que no sea Excel, y
   * entonces el total desaparece sin avisar.
   */
  if (filas.length > 0) {
    const fila = hoja.addRow({
      tienda: "TOTAL",
      asesora: `${filas.length} tienda${filas.length === 1 ? "" : "s"}`,
      bruta: Number(totales.vale_bruta),
      descuento: Number(totales.vale_descuento),
      neta: Number(totales.vale_neta),
      oro: Number(totales.directa_oro),
      plata: Number(totales.directa_plata),
      directa: Number(totales.directa_total),
      gran: Number(totales.gran_total),
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
  hoja.addRow({
    tienda: "Ventas normales",
    asesora: "Venta sin vale, oro y plata. No lleva descuento de campaña.",
  });
  hoja.addRow({
    tienda: "Gran total",
    asesora: "Neta con vales + ventas normales: lo que entró en caja.",
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
