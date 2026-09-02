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
   * Se carga como módulo nativo de Node en el servidor en lugar de pasar por
   * el bundler: depende de APIs de Node que no deben empaquetarse.
   * (`sharp` no hace falta aquí: Next lo resuelve solo para optimizar
   * imágenes, y esta aplicación no lo importa de forma directa.)
   */
  serverExternalPackages: ["@react-pdf/renderer"],

  images: {
    /**
     * Los logotipos de las tiendas viven en Supabase Storage, así que su
     * host tiene que estar permitido para `<Image>`.
     *
     * Sale de la variable de entorno y no está escrito a mano: el host lleva
     * la referencia del proyecto dentro, y fijarla aquí obligaría a tocar
     * código para apuntar a otro Supabase.
     */
    remotePatterns: process.env.SUPABASE_URL
      ? [
          {
            protocol: "https" as const,
            hostname: new URL(process.env.SUPABASE_URL).hostname,
            pathname: "/storage/v1/object/public/**",
          },
        ]
      : [],
  },
};

export default nextConfig;
