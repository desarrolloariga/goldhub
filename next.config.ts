import path from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * La raíz del proyecto es esta carpeta. Sin esto Turbopack sube por el
   * árbol buscando lockfiles y encuentra los del directorio del usuario.
   */
  turbopack: {
    root: path.join(__dirname),
  },

  /**
   * Se cargan como módulos nativos de Node en el servidor en lugar de pasar
   * por el bundler: dependen de APIs de Node y de binarios por plataforma
   * que no deben empaquetarse.
   *
   * `sharp` está aquí porque la subida de logotipos lo importa de verdad
   * —`lib/acciones/tiendas.ts` lo usa para normalizar a PNG cuadrado—, no
   * solo por la optimización de imágenes de Next, que lo resuelve sola.
   */
  serverExternalPackages: ["@react-pdf/renderer", "sharp"],

  experimental: {
    /**
     * Una Server Action rechaza por omisión cualquier cuerpo de más de 1 MB,
     * y lo hace ANTES de entrar en la función: el código nunca corre, así
     * que no puede devolver un mensaje decente y el usuario ve el error
     * genérico de «recarga y vuelve a intentarlo».
     *
     * Justo lo que pasaba al subir un logotipo: la foto de una cámara pasa
     * del megabyte sin esfuerzo, y la comprobación de los 5 MB que hay en
     * `subirLogo` no llegaba a ejecutarse nunca.
     *
     * Se pone en 6 y no en 5 para que el tope real lo marque esa
     * comprobación, que sí sabe explicar qué pasó; el margen cubre lo que el
     * formulario añade alrededor del archivo.
     */
    serverActions: { bodySizeLimit: "6mb" },
  },

  images: {
    /**
     * Los logotipos de las tiendas viven en Supabase Storage.
     *
     * El comodín cubre cualquier proyecto de Supabase a propósito: la
     * referencia del proyecto va dentro del host, y fijarla aquí obligaría a
     * tocar código para apuntar a otro. Leerla de `SUPABASE_URL` tampoco
     * sirve: esto se evalúa al construir, y una variable que falte en ese
     * momento dejaría la lista vacía y los logotipos rotos en producción sin
     * que nada avise.
     *
     * La ruta sí está acotada: solo el prefijo público del almacén. Nada de
     * lo que hay detrás de credenciales pasa por aquí.
     */
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
};

export default nextConfig;
