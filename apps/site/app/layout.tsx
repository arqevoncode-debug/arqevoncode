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
    title: "Arqevon Code — Sistemas construídos para evoluir",
    description: "Produtos digitais próprios, simples e seguros. Conheça o Arqevon Finance e os próximos sistemas da Arqevon Code.",
    keywords: ["Arqevon Code", "Arqevon Finance", "software", "gestão financeira", "aplicativo financeiro"],
    alternates: { canonical: "/" },
    icons: { icon: "/simbolo-arqevon.svg", shortcut: "/simbolo-arqevon.svg" },
    openGraph: {
      type: "website",
      locale: "pt_BR",
      url: "/",
      siteName: "Arqevon Code",
      title: "Arqevon Code — Sistemas construídos para evoluir",
      description: "Uma família de produtos digitais para transformar tarefas complexas em experiências simples.",
      images: [{ url: "/og.png", width: 1536, height: 1024, alt: "Arqevon Code — Sistemas construídos para evoluir" }],
    },
    twitter: { card: "summary_large_image", title: "Arqevon Code", description: "Sistemas construídos para evoluir.", images: ["/og.png"] },
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
