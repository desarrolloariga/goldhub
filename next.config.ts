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
