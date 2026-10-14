"use client";
import { useState } from "react";
import { brl, CampoDinheiro, CampoNumero, lerDinheiro } from "../campos";

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

export default function Calculadora() {
  const [renda, setRenda] = useState("");
  const [atuais, setAtuais] = useState("");
  const [nova, setNova] = useState("");
  const [vezes, setVezes] = useState("10");
  const r = lerDinheiro(renda), a = lerDinheiro(atuais), n = lerDinheiro(nova);
  const qtd = Math.min(Math.max(parseInt(vezes, 10) || 1, 1), 120);
  const total = a + n;
  const pct = r > 0 ? (total / r) * 100 : 0;
  const classe = pct <= 20 ? "bom" : pct <= 30 ? "atencao" : "ruim";
  // última parcela: a primeira cai no mês que vem
  const hoje = new Date();
  const fim = new Date(hoje.getFullYear(), hoje.getMonth() + qtd, 1);
  return (
    <div className="calc-caixa">
      <div className="calc-form">
        <CampoDinheiro rotulo="Sua renda líquida por mês" valor={renda} mudar={setRenda} />
        <CampoDinheiro rotulo="Parcelas que você já paga por mês" valor={atuais} mudar={setAtuais} ajuda="Some cartão, empréstimos e financiamentos." />
        <CampoDinheiro rotulo="Nova parcela que está pensando em assumir (opcional)" valor={nova} mudar={setNova} />
        {n > 0 && <CampoNumero rotulo="Em quantas vezes" valor={vezes} mudar={setVezes} max={120} />}
      </div>
      <div className="calc-resultado" aria-live="polite">
        <h2>Da sua renda, as parcelas comprometem</h2>
        <p className={`calc-grande ${r > 0 && total > 0 ? classe : ""}`}>{r > 0 ? `${pct.toFixed(1).replace(".", ",")}%` : "—"}</p>
        <div className="calc-trilho" aria-hidden="true">
          <span style={{ width: `${Math.min(pct, 100)}%`, background: classe === "bom" ? "#3fe7c0" : classe === "atencao" ? "#ffc35a" : "#ff6b7d" }} />
        </div>
        <div className="calc-blocos">
          <div className="calc-bloco"><i style={{ background: "#526dff" }} /><span><strong>Parcelas por mês</strong>{n > 0 ? "as que você já paga mais a nova" : "o que já sai todo mês"}</span><b>{brl(total)}</b></div>
          <div className="calc-bloco"><i style={{ background: "#3fe7c0" }} /><span><strong>Sobra para o resto</strong>contas da casa, mercado, lazer, futuro</span><b>{brl(Math.max(r - total, 0))}</b></div>
          {n > 0 && <div className="calc-bloco"><i style={{ background: "#ffc35a" }} /><span><strong>Total da nova compra</strong>{qtd}x de {brl(n)}, até {MESES[fim.getMonth()]} de {fim.getFullYear()}</span><b>{brl(n * qtd)}</b></div>}
        </div>
        {r > 0 && total > 0 && (
          <p className="calc-nota">
            {pct <= 20 ? "As parcelas cabem com folga na sua renda."
              : pct <= 30 ? "Está perto do limite de 30% que costuma ser usado como referência. Antes de assumir outra parcela, vale olhar o resto do mês."
              : "Passa dos 30% da renda, a referência mais usada para parcelas. Isso deixa pouco espaço para imprevistos."}
          </p>
        )}
      </div>
    </div>
  );
}
