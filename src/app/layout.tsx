import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geist = Geist({
  variable: "--font-geist",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

const cormorant = Cormorant_Garamond({
  variable: "--font-cormorant",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: {
    default: "GOLD HUB · Vales digitales",
    template: "%s · GOLD HUB",
  },
  description:
    "Plataforma de generación y redención de vales digitales de GOLD HUB.",
};

export const viewport: Viewport = {
  themeColor: "#0B0B0C",
  // `cover` es lo que da valor a env(safe-area-inset-*): sin él, la barra
  // inferior del móvil queda debajo del indicador de inicio en iPhone.
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es-GT"
      className={`${geist.variable} ${geistMono.variable} ${cormorant.variable} h-full`}
    >
      <body className="min-h-full">{children}</body>
    </html>
  );
}
