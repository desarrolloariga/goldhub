import type { CeldaCalor } from "@/lib/datos/ventas";
import { moneda, monedaCorta } from "@/lib/format";

/**
 * Movimiento por día de semana y hora.
 *
 * Es una rejilla de magnitud, así que va en un solo tono de claro a oscuro:
 * el color dice **cuánto**, nunca **cuál**. Los siete pasos viven en
 * `globals.css` y arrancan a 2.10:1 sobre el papel; por encima de esa
 * luminosidad la celda se confundía con el fondo, y una celda invisible no
 * dice «poco», dice «no sé». El blanco queda para la ausencia real.
 *
 * La semana empieza en lunes aunque Postgres numere desde el domingo: es
 * como se lee una semana de trabajo, y el domingo al final deja los dos
 * días de fin de semana juntos, que es la comparación que interesa.
 */

const DIAS = [
  { dow: 1, corto: "LUN", largo: "lunes" },
  { dow: 2, corto: "MAR", largo: "martes" },
  { dow: 3, corto: "MIÉ", largo: "miércoles" },
  { dow: 4, corto: "JUE", largo: "jueves" },
  { dow: 5, corto: "VIE", largo: "viernes" },
  { dow: 6, corto: "SÁB", largo: "sábado" },
  { dow: 0, corto: "DOM", largo: "domingo" },
];

const PASOS = 7;

/** La franja a dibujar: la que tiene movimiento, con una hora de margen. */
function franja(celdas: CeldaCalor[]) {
  const horas = celdas.filter((c) => c.tickets > 0).map((c) => c.hora);
  if (horas.length === 0) return { desde: 9, hasta: 20 };

  return {
    desde: Math.max(0, Math.min(...horas) - 1),
    hasta: Math.min(23, Math.max(...horas) + 1),
  };
}

export function MapaCalor({
  celdas,
  medida,
}: {
  celdas: CeldaCalor[];
  /** Qué pinta el color: el dinero o el número de compras. */
  medida: "venta" | "tickets";
}) {
  const valorDe = (c: CeldaCalor) =>
    medida === "venta" ? Number(c.venta) : c.tickets;

  const mapa = new Map<string, CeldaCalor>();
  for (const c of celdas) mapa.set(`${c.dia_semana}-${c.hora}`, c);

  const maximo = Math.max(0, ...celdas.map(valorDe));
  const { desde, hasta } = franja(celdas);
  const horas = Array.from({ length: hasta - desde + 1 }, (_, i) => desde + i);

  /** El paso de la rampa, 1..7. Cero no entra: la ausencia no es un valor. */
  const paso = (v: number) => {
    if (v <= 0 || maximo <= 0) return 0;
    return Math.max(1, Math.ceil((v / maximo) * PASOS));
  };

  if (maximo === 0) {
    return (
      <p className="text-ink/45 m-0 py-8 text-center text-[12.5px]">
        No hubo movimiento en el periodo elegido.
      </p>
    );
  }

  const formato = (v: number) =>
    medida === "venta" ? moneda(v) : `${v} ${v === 1 ? "compra" : "compras"}`;

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto">
        <table className="border-separate border-spacing-[2px]">
          <caption className="sr-only">
            Movimiento por día de la semana y hora del día
          </caption>
          <thead>
            <tr>
              <th className="w-9" />
              {horas.map((h) => (
                <th
                  key={h}
                  scope="col"
                  className="text-ink/35 min-w-[26px] pb-1 text-[9.5px] font-medium tabular-nums"
                >
                  {/* Solo las horas pares llevan rótulo: con las doce puestas
                      los números se tocan y dejan de leerse. */}
                  {h % 2 === 0 ? h : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {DIAS.map((d) => (
              <tr key={d.dow}>
                <th
                  scope="row"
                  className="text-ink/45 pr-2 text-right text-[9.5px] font-medium tracking-[0.1em]"
                >
                  {d.corto}
                </th>
                {horas.map((h) => {
                  const celda = mapa.get(`${d.dow}-${h}`);
                  const valor = celda ? valorDe(celda) : 0;
                  const nivel = paso(valor);

                  return (
                    <td key={h} className="p-0">
                      <div
                        // El título es el detalle al pasar por encima: sin
                        // él la rejilla enseña la forma pero esconde la cifra.
                        title={
                          valor > 0
                            ? `${d.largo} de ${h}:00 a ${h + 1}:00 · ${formato(valor)}`
                            : `${d.largo} de ${h}:00 a ${h + 1}:00 · sin movimiento`
                        }
                        className={`h-[26px] w-[26px] rounded-[3px] transition-transform hover:scale-110 ${
                          nivel === 0 ? "border-ink/8 border" : ""
                        }`}
                        style={
                          nivel === 0
                            ? undefined
                            : { background: `var(--calor-${nivel})` }
                        }
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* La escala, sin la cual el color no significa nada */}
      <div className="text-ink/45 flex flex-wrap items-center gap-2 text-[11px]">
        <span>Menos</span>
        <span className="flex gap-[2px]">
          <span className="border-ink/8 h-[13px] w-[13px] rounded-[2px] border" />
          {Array.from({ length: PASOS }, (_, i) => (
            <span
              key={i}
              className="h-[13px] w-[13px] rounded-[2px]"
              style={{ background: `var(--calor-${i + 1})` }}
            />
          ))}
        </span>
        <span>Más</span>
        <span className="text-ink/35 ml-1">
          · hasta {medida === "venta" ? monedaCorta(maximo) : maximo} por hora
        </span>
      </div>
    </div>
  );
}
