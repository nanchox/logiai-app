import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { PwaRegister } from "@/components/pwa/PwaRegister";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "LogiAI", template: "%s · LogiAI" },
  description: "Logística y manual de servicio · El Lugar de Su Presencia",
  appleWebApp: { capable: true, title: "LogiAI", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Color de la barra del navegador y del sistema: negro en claro, morado oscuro en oscuro (igual que el encabezado).
  themeColor: [{ media: "(prefers-color-scheme: light)", color: "#0b0713" }, { media: "(prefers-color-scheme: dark)", color: "#2b0a55" }],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" suppressHydrationWarning className={geistSans.variable}>
      <body className="min-h-dvh antialiased">
        <ThemeProvider attribute="data-theme" defaultTheme="system" enableSystem disableTransitionOnChange>
          {children}
          <PwaRegister />
        </ThemeProvider>
      </body>
    </html>
  );
}
