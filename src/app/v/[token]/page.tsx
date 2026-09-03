import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { TarjetaVale } from "@/components/vales/tarjeta-vale";
import { valePorToken } from "@/lib/datos/vales";
import { urlImagenVale, urlPublicaVale, versionImagen } from "@/lib/compartir";
import { fecha } from "@/lib/format";
import { urlLogo } from "@/lib/logos";
import { tarifaDeTipo, tarifaVigente } from "@/lib/datos/configuracion";

/**
 * Cara pública del vale: lo que abre quien recibe el enlace por WhatsApp.
 *
 * Se llega por **token**, no por código. El correlativo es consecutivo, así
 * que con el código en la URL cualquiera podía recorrer `000000, 000001…` y
 * cosechar descuentos válidos sin que se los hubieran entregado.
 *
 * No exige sesión. Muestra solo lo que ya lleva impreso la tarjeta —código,
 * descuento, vigencia y nombre del portador—; nunca el teléfono ni el correo,
 * porque el enlace circula entre terceros, sobre todo en los vales A2.
 */

export async function generateMetadata({
  params,
}: PageProps<"/v/[token]">): Promise<Metadata> {
  const { token } = await params;
  const [vale, tarifa] = await Promise.all([
    valePorToken(decodeURIComponent(token)),
    tarifaVigente(),
  ]);

  if (!vale) return { title: "Vale no encontrado" };

  /*
   * Los dos porcentajes de la red, no el de oro que llevaba el vale.
   *
   * Esto es lo que WhatsApp enseña como título de la vista previa, así que
   * era el sitio donde peor sentaba quedarse con el 15%: la imagen ya decía
   * 20 y 25, y el renglón de debajo la contradecía.
   */
  const pct = tarifaDeTipo(tarifa, vale.tipo);
  const titulo = `${pct.visa}% visa · ${pct.transferencia}% transferencia · ${vale.tienda}`;
  const descripcion = `Vale ${vale.codigo}, vigente hasta el ${fecha(vale.fecha_vencimiento)}. Preséntalo en cualquier sucursal.`;

  return {
    title: titulo,
    description: descripcion,
    // La vista previa de WhatsApp toma estos metadatos: sin ellos el enlace
    // llega como texto pelado.
    openGraph: {
      title: titulo,
      description: descripcion,
      url: urlPublicaVale(vale.token),
      siteName: "GOLD HUB",
      images: [
        {
          url: urlImagenVale(vale.token, versionImagen(vale.tienda_actualizada_en, vale.tienda_logo_actualizado_en)),
          width: 1200,
          height: 630,
        },
      ],
      type: "website",
      locale: "es_GT",
    },
    twitter: {
      card: "summary_large_image",
      title: titulo,
      description: descripcion,
      images: [
        urlImagenVale(vale.token, versionImagen(vale.tienda_actualizada_en, vale.tienda_logo_actualizado_en)),
      ],
    },
    robots: { index: false, follow: false },
  };
}

export default async function PaginaPublicaVale({
  params,
}: PageProps<"/v/[token]">) {
  const { token } = await params;
  const [vale, tarifa] = await Promise.all([
    valePorToken(decodeURIComponent(token)),
    tarifaVigente(),
  ]);

  if (!vale) notFound();

  const vigente = vale.estado === "activo";

  return (
    <main className="bg-ink flex min-h-screen items-center justify-center px-4 py-10">
      <div className="flex w-full max-w-[380px] flex-col gap-5">
        <TarjetaVale
          compacta
          vale={{
            codigo: vale.codigo,
            token: vale.token,
            tipo: vale.tipo,
            estado: vale.estado,
            ...tarifaDeTipo(tarifa, vale.tipo),
            tienda: vale.tienda,
            telefonoTienda: vale.tienda_telefono,
            logo: urlLogo(vale),
            version: versionImagen(vale.tienda_actualizada_en, vale.tienda_logo_actualizado_en),
            portador: vale.portador,
            // Nunca al cliente: el enlace circula entre terceros.
            telefono: "",
            vigencia: fecha(vale.fecha_vencimiento),
          }}
        />

        {/*
          Los pasos y el aviso legal viajan dentro de la tarjeta desde que
          también salen impresos en la imagen que se comparte. Aquí solo queda
          lo que la tarjeta no puede decir: por qué un vale muerto no sirve, y
          que un A2 está hecho para pasarlo.
        */}
        {vigente ? null : (
          <div className="border-taupe/15 bg-ink-soft rounded-card border p-5">
            <p className="text-bone/55 m-0 text-[12.5px] leading-relaxed">
              {vale.estado === "vencido"
                ? `Este vale venció el ${fecha(vale.fecha_vencimiento)} y ya no puede usarse. Contacta a tu asesora de GOLD HUB para obtener uno nuevo.`
                : "Este vale fue anulado y ya no puede usarse. Contacta a tu asesora de GOLD HUB."}
            </p>
          </div>
        )}

        {vigente && vale.tipo === "A2" ? (
          <p className="text-bone/30 m-0 px-2 text-center text-[11px] leading-relaxed">
            Puedes compartirlo con familiares, amigos y compañeros de trabajo.
          </p>
        ) : null}
      </div>
    </main>
  );
}
