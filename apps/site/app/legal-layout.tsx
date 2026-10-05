import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import "./legal.css";

// Contato para dúvidas e para o exercício dos direitos do titular (LGPD, art. 18).
export const CONTATO = "arqevoncode@gmail.com";
export const ATUALIZADO_EM = "5 de outubro de 2026";

export default function LegalLayout({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <main className="legal">
      <div className="legal-topo">
        <Link className="legal-marca" href="/">
          <Image src="/simbolo-arqevon.svg" alt="" width={28} height={28} />
          <span><strong>Arqevon</strong> Finance</span>
        </Link>
        <Link href="/">Voltar ao início</Link>
      </div>
      <h1>{titulo}</h1>
      <p className="legal-data">Última atualização: {ATUALIZADO_EM}</p>
      {children}
      <div className="legal-rodape">
        <Link href="/termos">Termos de Uso</Link>
        <Link href="/privacidade">Política de Privacidade</Link>
        <a href={`mailto:${CONTATO}`}>{CONTATO}</a>
      </div>
    </main>
  );
}
