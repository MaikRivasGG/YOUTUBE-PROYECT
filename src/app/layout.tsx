import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { Toaster } from "sonner";

import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Framehouse - Producción de video faceless",
    template: "%s - Framehouse",
  },
  description:
    "Panel de producción para equipos de canales de YouTube faceless: pipeline, roles, calendario editorial y actividad en tiempo real.",
  applicationName: "Framehouse",
};

export const viewport: Viewport = {
  themeColor: "#14161c",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={inter.variable}>
      <body className="min-h-dvh antialiased">
        {children}
        <Toaster
          position="bottom-right"
          toastOptions={{ className: "text-sm" }}
          closeButton
          richColors
        />
      </body>
    </html>
  );
}
