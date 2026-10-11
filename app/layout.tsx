import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { supabaseKey, supabaseUrl } from "@/lib/supabase/env";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "LogiAI", template: "%s · LogiAI" },
  description: "Logística y manual de servicio · El Lugar de Su Presencia",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: LayoutProps<"/">) {
  const publicSupabaseConfig = JSON.stringify({ url: supabaseUrl, key: supabaseKey }).replace(/</g, "\\u003c");

  return (
    <html lang="es" suppressHydrationWarning className={geistSans.variable}>
      <body className="min-h-dvh antialiased">
        <script
          dangerouslySetInnerHTML={{
            __html: `window.__LOGIAI_SUPABASE__=${publicSupabaseConfig};`,
          }}
        />
        <ThemeProvider attribute="data-theme" defaultTheme="system" enableSystem disableTransitionOnChange>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
