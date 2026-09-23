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

/** Fija la clase `dark` antes de pintar, para no parpadear del tema equivocado. */
const THEME_SCRIPT = `
try {
  var theme = localStorage.getItem('framehouse-theme');
  var dark = theme === 'dark' || (!theme && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
} catch (e) {}
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={inter.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
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
