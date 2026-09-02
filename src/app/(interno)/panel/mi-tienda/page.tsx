import { redirect } from "next/navigation";
import type { Metadata } from "next";

import { Tarjeta } from "@/components/ui/tarjeta";
import { requerirSesion } from "@/lib/auth/guardas";
import { urlAutorregistro } from "@/lib/compartir";
import { tarifaVigente } from "@/lib/datos/configuracion";
import { tiendaPorId } from "@/lib/datos/tiendas";
import { urlLogo } from "@/lib/logos";

import { QrTienda } from "../tiendas/qr-tienda";
import { DatosTienda } from "./datos";
import { Logotipo } from "./logotipo";

export const metadata: Metadata = { title: "Mi tienda" };

/**
 * Lo que cada tienda administra de sí misma.
 *
 * El administrador no llega aquí: no tiene tienda propia, y desde su cuenta
 * la pregunta «¿de qué tienda?» no tendría respuesta. Él ve todas en
 * `/panel/tiendas`.
 */
export default async function PaginaMiTienda() {
  const sesion = await requerirSesion();
  if (!sesion.tiendaId) redirect("/panel/tiendas");

  const [tienda, tarifa] = await Promise.all([
    tiendaPorId(sesion.tiendaId),
    tarifaVigente(),
  ]);
  if (!tienda) redirect("/panel");

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
      <div className="flex flex-col gap-6">
        <Tarjeta className="flex flex-col gap-6 p-6 sm:p-8">
          <div className="flex flex-col gap-1">
            <span className="text-taupe-dark tracking-eyebrow text-[9px] font-medium">
              IDENTIDAD
            </span>
            <h2 className="font-display m-0 text-[24px] leading-tight font-normal">
              Logotipo de {tienda.nombre}
            </h2>
          </div>

          <Logotipo actual={urlLogo(tienda)} nombre={tienda.nombre} />
        </Tarjeta>

        <Tarjeta className="flex flex-col gap-6 p-6 sm:p-8">
          <div className="flex flex-col gap-1">
            <span className="text-taupe-dark tracking-eyebrow text-[9px] font-medium">
              DATOS
            </span>
            <h2 className="font-display m-0 text-[24px] leading-tight font-normal">
              Contacto y registro
            </h2>
          </div>

          <DatosTienda
            direccion={tienda.direccion}
            telefono={tienda.telefono}
            autorregistro={tienda.autorregistro}
          />
        </Tarjeta>
      </div>

      <aside className="flex flex-col gap-4">
        <Tarjeta className="flex flex-col gap-4 p-5">
          <span className="text-ink/42 text-[9px] font-medium tracking-[0.2em]">
            TU QR DE MOSTRADOR
          </span>
          <p className="text-ink/60 m-0 text-[12.5px] leading-relaxed">
            Se imprime una vez y se deja puesto: no caduca ni cambia con cada
            cliente. Quien lo escanea se registra solo y recibe su vale al
            instante.
          </p>
          <QrTienda
            nombre={tienda.nombre}
            url={urlAutorregistro(tienda.token)}
            descuento={tarifa.oro}
          />
        </Tarjeta>

        <Tarjeta className="flex flex-col gap-3 p-5">
          <span className="text-ink/42 text-[9px] font-medium tracking-[0.2em]">
            TUS CÓDIGOS
          </span>
          <span className="font-display text-taupe-dark text-[24px] leading-none">
            {tienda.prefijo}-
            {String(tienda.correlativo + 1).padStart(6, "0")}
          </span>
          <p className="text-ink/50 m-0 text-[11.5px] leading-relaxed">
            Será el código del próximo vale que emitas. El prefijo{" "}
            <strong className="font-medium">{tienda.prefijo}</strong> es tuyo y
            ninguna otra tienda lo usa, así que tus correlativos no chocan con
            los de nadie. Llevas {tienda.correlativo} emitido
            {tienda.correlativo === 1 ? "" : "s"}.
          </p>
        </Tarjeta>

        <p className="text-ink/45 m-0 px-1 text-[11.5px] leading-relaxed">
          El nombre y el prefijo los cambia el administrador: van impresos en
          vales que ya están en manos de clientes.
        </p>
      </aside>
    </div>
  );
}
