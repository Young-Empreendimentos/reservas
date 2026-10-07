import type { NextConfig } from 'next';

// Site estático publicado no GitHub Pages (reservas.youngempreendimentos.com.br).
// Toda a lógica com dados roda no Supabase (regras de acesso + funções).
const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: 'export',
  images: { unoptimized: true },
  trailingSlash: true,
};

export default nextConfig;
