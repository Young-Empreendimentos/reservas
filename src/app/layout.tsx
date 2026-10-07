import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Reservas | Young Empreendimentos',
  description: 'Sistema de reservas de lotes da Young Empreendimentos',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
