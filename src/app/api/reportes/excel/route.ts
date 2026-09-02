import ExcelJS from "exceljs";
import { NextResponse } from "next/server";

import { requerirAdmin } from "@/lib/auth/guardas";
import { desempenoTiendas } from "@/lib/datos/metricas";
import { listarRedenciones } from "@/lib/datos/redenciones";
import { listarVales } from "@/lib/datos/vales";
import { ETIQUETA_SEGMENTO, ETIQUETA_TIPO } from "@/lib/supabase/types";

export const runtime = "nodejs";

/**
 * Reporte completo en Excel: tres hojas —tiendas, vales y redenciones—.
 *
 * Se genera un .xlsx de verdad y no un CSV porque Excel interpreta el
 * separador y la codificación según la configuración regional de cada
 * equipo: un CSV con acentos y comas acaba en una sola columna con la
 * mitad de las tildes rotas. Aquí los tipos van declarados.
 *
 * Solo administradores: contiene teléfonos y correos de clientes.
 */

const CABECERA = { argb: "FF0B0B0C" };
const ORO = { argb: "FFE7CE92" };

type Columna = { header: string; key: string; width: number; formato?: string };

const MONEDA = '"Q" #,##0.00';
const PORCENTAJE = "0.0";

function hoja(
  libro: ExcelJS.Workbook,
  nombre: string,
  columnas: Columna[],
  filas: Record<string, unknown>[],
) {
  const h = libro.addWorksheet(nombre, {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  h.columns = columnas.map((c) => ({
    header: c.header,
    key: c.key,
    width: c.width,
    style: c.formato ? { numFmt: c.formato } : undefined,
  }));

  h.getRow(1).eachCell((celda) => {
    celda.font = { bold: true, color: ORO, size: 10 };
    celda.fill = { type: "pattern", pattern: "solid", fgColor: CABECERA };
    celda.alignment = { vertical: "middle" };
  });
  h.getRow(1).height = 22;

  filas.forEach((f) => h.addRow(f));

  // Autofiltro sobre toda la tabla: lo primero que hace cualquiera al abrirlo.
  if (filas.length > 0) {
    h.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: columnas.length },
    };
  }

  return h;
}

export async function GET() {
  await requerirAdmin();

  const [desempeno, vales, redenciones] = await Promise.all([
    desempenoTiendas("ingreso"),
    listarVales({ porPagina: 5000 }),
    listarRedenciones({ porPagina: 5000 }),
  ]);

  const libro = new ExcelJS.Workbook();
  libro.creator = "GOLD HUB SMART VALE";
  libro.created = new Date();

  /* ── Tiendas ────────────────────────────────────────────────────────── */
  hoja(
    libro,
    "Tiendas",
    [
      { header: "Tienda", key: "tienda", width: 26 },
      { header: "Prefijo", key: "prefijo", width: 9 },
      { header: "Acceso", key: "correo", width: 20 },
      { header: "Con logotipo", key: "logo", width: 13 },
      { header: "Activa", key: "activo", width: 9 },
      { header: "Vales emitidos", key: "emitidos", width: 15 },
      { header: "A1", key: "a1", width: 7 },
      { header: "A2", key: "a2", width: 7 },
      { header: "A3", key: "a3", width: 7 },
      { header: "A4", key: "a4", width: 7 },
      { header: "Vigentes", key: "vigentes", width: 10 },
      { header: "Vencidos", key: "vencidos", width: 10 },
      { header: "Compras", key: "redenciones", width: 10 },
      { header: "Vales con compra", key: "conCompra", width: 17 },
      { header: "Conversión %", key: "conversion", width: 14, formato: PORCENTAJE },
      { header: "Venta generada", key: "ingreso", width: 17, formato: MONEDA },
      { header: "Ticket promedio", key: "ticket", width: 17, formato: MONEDA },
      { header: "Descuento otorgado", key: "descuento", width: 19, formato: MONEDA },
      { header: "Venta por vale", key: "ventaPorVale", width: 16, formato: MONEDA },
      { header: "Correlativo actual", key: "correlativo", width: 18 },
      { header: "Última emisión", key: "ultimaEmision", width: 20 },
    ],
    (desempeno ?? []).map((d) => ({
      tienda: d.tienda,
      prefijo: d.prefijo,
      correo: d.cuenta_correo ?? "",
      logo: d.tiene_logo ? "Sí" : "No",
      activo: d.activo ? "Sí" : "No",
      emitidos: d.vales_emitidos,
      a1: d.vales_a1,
      a2: d.vales_a2,
      a3: d.vales_a3,
      a4: d.vales_a4,
      vigentes: d.vales_vigentes,
      vencidos: d.vales_vencidos,
      redenciones: d.redenciones,
      conCompra: d.vales_con_compra,
      conversion: d.tasa_conversion === null ? null : Number(d.tasa_conversion),
      ingreso: Number(d.ingreso_generado),
      ticket: d.ticket_promedio === null ? null : Number(d.ticket_promedio),
      descuento: Number(d.descuento_otorgado),
      ventaPorVale: d.venta_por_vale === null ? null : Number(d.venta_por_vale),
      correlativo: d.correlativo_actual,
      ultimaEmision: d.ultima_emision ? new Date(d.ultima_emision) : null,
    })),
  );

  /* ── Vales ──────────────────────────────────────────────────────────── */
  hoja(
    libro,
    "Vales",
    [
      { header: "Código", key: "codigo", width: 16 },
      { header: "Tipo", key: "tipo", width: 24 },
      { header: "Clasificación", key: "segmento", width: 22 },
      { header: "Origen", key: "origen", width: 26 },
      { header: "Portador", key: "portador", width: 26 },
      { header: "Teléfono", key: "telefono", width: 16 },
      { header: "Correo", key: "correo", width: 24 },
      { header: "Emitido por", key: "emisora", width: 24 },
      { header: "Tienda", key: "tienda", width: 20 },
      { header: "Lo refirió", key: "referidor", width: 24 },
      { header: "Vale del referidor", key: "origenCodigo", width: 18 },
      { header: "Personas que trajo", key: "referidos", width: 18 },
      { header: "% oro", key: "descuentoOro", width: 10, formato: PORCENTAJE },
      { header: "Emisión", key: "emision", width: 20 },
      { header: "Vencimiento", key: "vencimiento", width: 20 },
      { header: "Estado", key: "estado", width: 12 },
      { header: "Compras", key: "compras", width: 10 },
      { header: "Venta generada", key: "ingreso", width: 17, formato: MONEDA },
      { header: "Descuento otorgado", key: "descuento", width: 19, formato: MONEDA },
    ],
    vales.vales.map((v) => ({
      codigo: v.codigo,
      tipo: `${v.tipo} · ${ETIQUETA_TIPO[v.tipo]}`,
      segmento: v.segmento ? ETIQUETA_SEGMENTO[v.segmento] : "",
      origen: v.origen ?? "",
      portador: v.portador,
      telefono: v.portador_telefono,
      correo: v.portador_correo ?? "",
      emisora: v.emisora,
      tienda: v.tienda ?? "",
      referidor: v.referidor ?? "",
      origenCodigo: v.origen_codigo ?? "",
      referidos: v.referidos,
      descuentoOro: Number(v.descuento_oro_pct),
      emision: new Date(v.fecha_emision),
      vencimiento: new Date(v.fecha_vencimiento),
      estado: v.estado,
      compras: v.total_redenciones,
      ingreso: Number(v.ingreso_generado),
      descuento: Number(v.descuento_otorgado),
    })),
  );

  /* ── Redenciones ────────────────────────────────────────────────────── */
  hoja(
    libro,
    "Redenciones",
    [
      { header: "Fecha", key: "fecha", width: 20 },
      { header: "Vale", key: "codigo", width: 16 },
      { header: "Comprador", key: "comprador", width: 26 },
      { header: "Teléfono", key: "telefono", width: 16 },
      { header: "Correo", key: "correo", width: 24 },
      { header: "Le compartió", key: "referido", width: 24 },
      { header: "Tienda", key: "tienda", width: 20 },
      { header: "Monto en oro", key: "montoOro", width: 15, formato: MONEDA },
      { header: "Descuento", key: "descuento", width: 15, formato: MONEDA },
      { header: "Registró", key: "registro", width: 24 },
    ],
    redenciones.redenciones.map((r) => ({
      fecha: new Date(r.fecha_creacion),
      codigo: r.codigo,
      comprador: r.comprador,
      telefono: r.comprador_telefono,
      correo: r.comprador_correo ?? "",
      referido: r.referido_por ?? "",
      tienda: r.tienda,
      montoOro: r.monto_oro,
      descuento: r.descuento_aplicado,
      registro: r.registrada_por,
    })),
  );

  const buffer = await libro.xlsx.writeBuffer();
  const fecha = new Date().toISOString().slice(0, 10);

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="goldhub-smart-vale-${fecha}.xlsx"`,
      "Cache-Control": "private, no-store",
    },
  });
}
