/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["pg"],
  experimental: {
    // El middleware de auth bufferea el body de cada request; por defecto lo corta a
    // 10MB, lo que rompía los uploads de PDF grandes a la KB (req.formData() fallaba al
    // parsear un cuerpo truncado -> 500). Subimos el límite para permitir PDFs grandes.
    // En Next 16 esta opción se renombra a proxyClientMaxBodySize.
    middlewareClientMaxBodySize: "50mb",
  },
};
export default nextConfig;
