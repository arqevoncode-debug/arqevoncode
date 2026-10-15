"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

// Topo da página inicial: as abas trocam a tela do app (prints reais do modo exemplo, tema escuro).
// Trocam sozinhas a cada 5,5 s até a pessoa clicar; com "reduzir movimento" ficam paradas.
const ABAS = [
  { id: "painel", nome: "Visão geral", sub: "o mês num relance", img: "/produto/app-painel.png", alt: "Visão geral do Arqevon Finance com receitas, despesas e gastos por categoria" },
  { id: "lancamentos", nome: "Lançamentos", sub: "parcelas no mês certo", img: "/produto/app-lancamentos.png", alt: "Lista de lançamentos do mês com parcelas, contas fixas e renda" },
  { id: "relatorios", nome: "Relatórios", sub: "mês a mês", img: "/produto/app-relatorios.png", alt: "Relatório mês a mês com receitas, despesas e saldo" },
  { id: "objetivos", nome: "Objetivos", sub: "metas e aportes", img: "/produto/app-objetivos.png", alt: "Objetivos com meta, aportes e previsão" },
];
const INTERVALO = 5500;

export default function HeroProduto({ app }: { app: string }) {
  const [atual, setAtual] = useState(0);
  const [auto, setAuto] = useState(true);

  useEffect(() => {
    if (!auto || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => setAtual(i => (i + 1) % ABAS.length), INTERVALO);
    return () => clearInterval(t);
  }, [auto]);

  function escolher(i: number) { setAtual(i); setAuto(false); }
  function teclado(e: React.KeyboardEvent) {
    const passo = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!passo) return;
    e.preventDefault();
    const i = (atual + passo + ABAS.length) % ABAS.length;
    escolher(i);
    document.getElementById(`aba-${ABAS[i].id}`)?.focus();
  }

  return (
    <section className="ini-hero">
      <div>
        <p className="ini-selo"><i /> Arqevon Finance</p>
        <h1>Suas finanças<br /><span className="ini-grad">sem planilha.</span></h1>
        <p className="ini-lead">Receitas, contas e parcelas num só lugar, e quanto sobra neste mês e nos próximos.</p>
        <div className="ini-acoes">
          <a className="ini-btn ini-g" href={app}>Começar grátis</a>
          <a className="ini-btn-sec ini-g" href={`${app}#exemplo`}>Ver um exemplo</a>
        </div>
        <div className={`ini-abas${auto ? "" : " parado"}`} role="tablist" aria-label="Telas do Arqevon Finance" onKeyDown={teclado}>
          {ABAS.map((a, i) => (
            <button key={a.id} id={`aba-${a.id}`} type="button" role="tab" aria-selected={i === atual} aria-controls={`tela-${a.id}`}
              tabIndex={i === atual ? 0 : -1} onClick={() => escolher(i)}>
              <b>{a.nome}</b><span>{a.sub}</span><i key={`${atual}-${auto}`} />
            </button>
          ))}
        </div>
      </div>
      <div className="ini-vis">
        <div className="ini-janela">
          <div className="ini-barra" aria-hidden="true"><i /><i /><i /><span>app.arqevoncode.com.br</span></div>
          {ABAS.map((a, i) => (
            <div key={a.id} id={`tela-${a.id}`} role="tabpanel" aria-labelledby={`aba-${a.id}`}
              className={`ini-tela${i === atual ? " on" : ""}`} aria-hidden={i !== atual}>
              <Image src={a.img} alt={a.alt} width={2560} height={1600} sizes="(max-width: 1000px) 100vw, 680px" priority={i === 0} />
            </div>
          ))}
        </div>
        <div className="ini-cel">
          <Image src="/produto/cel-painel.png" alt="Arqevon Finance no celular" width={1170} height={2532} sizes="168px" />
        </div>
      </div>
    </section>
  );
}
