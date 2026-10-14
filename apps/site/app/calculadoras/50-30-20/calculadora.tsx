"use client";
import { useState } from "react";
import { brl, CampoDinheiro, lerDinheiro } from "../campos";

const PARTES = [
  { nome: "Necessidades", pct: 50, cor: "#526dff", texto: "moradia, contas da casa, mercado, transporte, saúde" },
  { nome: "Desejos", pct: 30, cor: "#ffc35a", texto: "lazer, restaurantes, compras, assinaturas" },
  { nome: "Futuro", pct: 20, cor: "#3fe7c0", texto: "reserva de emergência, objetivos, quitar dívidas" },
];

export default function Calculadora() {
  const [renda, setRenda] = useState("");
  const [essenciais, setEssenciais] = useState("");
  const r = lerDinheiro(renda), e = lerDinheiro(essenciais);
  const pctEssenciais = r > 0 ? (e / r) * 100 : 0;
  return (
    <div className="calc-caixa">
      <div className="calc-form">
        <CampoDinheiro rotulo="Sua renda líquida por mês" valor={renda} mudar={setRenda} ajuda="O que cai na conta, já sem impostos e descontos." />
        <CampoDinheiro rotulo="Quanto você gasta hoje com o essencial (opcional)" valor={essenciais} mudar={setEssenciais} ajuda="Aluguel, contas, mercado, transporte, saúde." />
      </div>
      <div className="calc-resultado" aria-live="polite">
        <h2>Pela regra 50/30/20</h2>
        <div className="calc-trilho" aria-hidden="true">{PARTES.map(p => <span key={p.nome} style={{ width: `${p.pct}%`, background: p.cor }} />)}</div>
        <div className="calc-blocos">
          {PARTES.map(p => (
            <div className="calc-bloco" key={p.nome}>
              <i style={{ background: p.cor }} />
              <span><strong>{p.nome} · {p.pct}%</strong>{p.texto}</span>
              <b>{brl(r * p.pct / 100)}</b>
            </div>
          ))}
        </div>
        {r > 0 && e > 0 && (
          <p className="calc-nota">
            Hoje o essencial leva <strong>{pctEssenciais.toFixed(0)}%</strong> da sua renda.{" "}
            {pctEssenciais <= 50
              ? `Está dentro dos 50%: sobram ${brl(r * 0.5 - e)} da parte das necessidades.`
              : `Passa dos 50% em ${brl(e - r * 0.5)}. Vale olhar quais contas fixas dá para renegociar ou reduzir.`}
          </p>
        )}
      </div>
    </div>
  );
}
