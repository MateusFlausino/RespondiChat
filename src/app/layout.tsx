import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "RespondiChat · Seus posts, boas conversas",
  description: "Painel pessoal de automações do Instagram para @michellefmkt.",
  robots: { index: false, follow: false },
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
