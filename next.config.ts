import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    // El service worker nunca se guarda en caché (así las actualizaciones llegan) y puede controlar todo el sitio.
    return [{ source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }, { key: "Service-Worker-Allowed", value: "/" }] }];
  },
  async redirects() {
    // «Anuncios» pasó a llamarse «Novedades»: la dirección vieja sigue funcionando.
    return [{ source: "/anuncios", destination: "/novedades", permanent: true }];
  },
};

export default nextConfig;
