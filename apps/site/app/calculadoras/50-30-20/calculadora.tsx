"use client";
import { useState } from "react";
import { AvisoExemplo, CampoDinheiro } from "../campos";
import { brl, EXEMPLOS, lerDinheiro, porcento, regra503020 } from "../contas";

const PARTES = [
  { chave: "necessidades", nome: "Necessidades", pct: 50, cor: "#526dff", texto: "moradia, contas da casa, mercado, transporte, saúde" },
  { chave: "desejos", nome: "Desejos", pct: 30, cor: "#ffc35a", texto: "lazer, restaurantes, compras, assinaturas" },
  { chave: "futuro", nome: "Futuro", pct: 20, cor: "#3fe7c0", texto: "reserva de emergência, objetivos, quitar dívidas" },
] as const;

export default function Calculadora() {
  const [renda, setRenda] = useState("");
  const [essenciais, setEssenciais] = useState("");
  // sem nada digitado, o resultado mostra um exemplo em vez de R$ 0,00 em tudo
  const exemplo = !renda && !essenciais;
  const r = exemplo ? EXEMPLOS.regra.renda : lerDinheiro(renda), e = lerDinheiro(essenciais);
  const conta = regra503020(r, e);
  return (
    <div className="calc-caixa">
      <div className="calc-form">
        <CampoDinheiro rotulo="Sua renda líquida por mês" valor={renda} mudar={setRenda} ajuda="O que cai na conta, já sem impostos e descontos." />
        <CampoDinheiro rotulo="Quanto você gasta hoje com o essencial (opcional)" valor={essenciais} mudar={setEssenciais} ajuda="Aluguel, contas, mercado, transporte, saúde." />
      </div>
      <div className={`calc-resultado${exemplo ? " exemplo" : ""}`} aria-live="polite">
        {exemplo && <AvisoExemplo texto={`com renda de ${brl(r)}. Digite a sua para calcular.`} />}
        <h2>Pela regra 50/30/20</h2>
        <div className="calc-trilho" aria-hidden="true">{PARTES.map(p => <span key={p.nome} style={{ width: `${p.pct}%`, background: p.cor }} />)}</div>
        <div className="calc-blocos">
          {PARTES.map(p => (
            <div className="calc-bloco" key={p.nome}>
              <i style={{ background: p.cor }} />
              <span><strong>{p.nome} · {p.pct}%</strong>{p.texto}</span>
              <b>{brl(conta[p.chave])}</b>
            </div>
          ))}
        </div>
        {e > 0 && (r > 0 ? (
          <p className={`calc-nota destaque ${conta.folga >= 0 ? "bom" : "ruim"}`}>
            Hoje o essencial leva <strong>{porcento(conta.pctEssenciais, 0)}</strong> da sua renda.{" "}
            {conta.folga >= 0
              ? `Está dentro dos 50%: sobram ${brl(conta.folga)} da parte das necessidades.`
              : `Passa dos 50% em ${brl(-conta.folga)}. Vale olhar quais contas fixas dá para renegociar ou reduzir.`}
          </p>
        ) : <p className="calc-nota">Preencha a renda para comparar com o que você gasta hoje.</p>)}
      </div>
    </div>
  );
}
