import "./globals.css";

export const metadata = {
  title: "Arqevon Finance · Licenças",
  description: "Painel privado de licenças do Arqevon Finance",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
