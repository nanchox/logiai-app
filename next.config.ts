import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    // «Anuncios» pasó a llamarse «Novedades»: la dirección vieja sigue funcionando.
    return [{ source: "/anuncios", destination: "/novedades", permanent: true }];
  },
};

export default nextConfig;
