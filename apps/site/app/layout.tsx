import type { Metadata } from "next";
import { headers } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.includes("localhost") ? "http" : "https");
  const metadataBase = new URL(`${protocol}://${host}`);

  return {
    metadataBase,
    title: "Arqevon Finance — Suas contas do mês, claras em uma tela",
    description: "Organize receitas, contas fixas e parcelas do cartão. Veja quanto sobra e como ficam os próximos meses. Grátis, no navegador, com seus dados no seu aparelho.",
    keywords: ["Arqevon Finance", "controle financeiro", "finanças pessoais", "controle de gastos", "parcelas do cartão", "Arqevon Code"],
    alternates: { canonical: "/" },
    icons: { icon: "/simbolo-arqevon.svg", shortcut: "/simbolo-arqevon.svg" },
    openGraph: {
      type: "website",
      locale: "pt_BR",
      url: "/",
      siteName: "Arqevon Finance",
      title: "Arqevon Finance — Suas contas do mês, claras em uma tela",
      description: "Receitas, contas fixas e parcelas organizadas, com projeção dos próximos meses. Grátis e no navegador.",
      images: [{ url: "/og.png", width: 1536, height: 1024, alt: "Arqevon Code — Sistemas construídos para evoluir" }],
    },
    twitter: { card: "summary_large_image", title: "Arqevon Finance", description: "Suas contas do mês, claras em uma tela.", images: ["/og.png"] },
    robots: { index: true, follow: true },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>{children}</body>
    </html>
  );
}
