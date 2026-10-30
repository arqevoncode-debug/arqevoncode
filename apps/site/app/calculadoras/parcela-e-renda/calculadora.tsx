"use client";
import { useState } from "react";
import { AvisoExemplo, CampoDinheiro, CampoNumero } from "../campos";
import { brl, EXEMPLOS, lerDinheiro, limitar, parcelasERenda, porcento } from "../contas";

const COR = { bom: "#3fe7c0", atencao: "#ffc35a", ruim: "#ff6b7d" };

export default function Calculadora() {
  const [renda, setRenda] = useState("");
  const [atuais, setAtuais] = useState("");
  const [nova, setNova] = useState("");
  const [vezes, setVezes] = useState("10");
  // sem nada digitado, o resultado mostra um exemplo em vez de "—" e R$ 0,00
  const exemplo = !renda && !atuais && !nova;
  const x = EXEMPLOS.parcelas;
  const r = exemplo ? x.renda : lerDinheiro(renda), a = exemplo ? x.atuais : lerDinheiro(atuais), n = exemplo ? x.nova : lerDinheiro(nova);
  const conta = parcelasERenda({ renda: r, atuais: a, nova: n, vezes: exemplo ? x.vezes : limitar(vezes, 1, 120) });
  const mostraClasse = r > 0 && conta.total > 0;
  return (
    <div className="calc-caixa">
      <div className="calc-form">
        <CampoDinheiro rotulo="Sua renda líquida por mês" valor={renda} mudar={setRenda} />
        <CampoDinheiro rotulo="Parcelas que você já paga por mês" valor={atuais} mudar={setAtuais} ajuda="Some cartão, empréstimos e financiamentos." />
        <CampoDinheiro rotulo="Nova parcela que está pensando em assumir (opcional)" valor={nova} mudar={setNova} />
        {lerDinheiro(nova) > 0 && <CampoNumero rotulo="Em quantas vezes" valor={vezes} mudar={setVezes} max={120} />}
      </div>
      <div className={`calc-resultado${exemplo ? " exemplo" : ""}`} aria-live="polite">
        {exemplo && <AvisoExemplo texto={`com renda de ${brl(r)}, ${brl(a)} em parcelas e uma compra nova de ${conta.qtd}x de ${brl(n)}.`} />}
        <h2>Da sua renda, as parcelas comprometem</h2>
        <p className={`calc-grande ${mostraClasse ? conta.classe : ""}`}>{r > 0 ? porcento(conta.pct) : "—"}</p>
        <div className="calc-trilho" aria-hidden="true">
          <span style={{ width: `${Math.min(conta.pct, 100)}%`, background: COR[conta.classe as keyof typeof COR] }} />
        </div>
        <div className="calc-blocos">
          <div className="calc-bloco"><i style={{ background: "#526dff" }} /><span><strong>Parcelas por mês</strong>{n > 0 ? "as que você já paga mais a nova" : "o que já sai todo mês"}</span><b>{brl(conta.total)}</b></div>
          <div className="calc-bloco"><i style={{ background: "#3fe7c0" }} /><span><strong>Sobra para o resto</strong>contas da casa, mercado, lazer, futuro</span><b>{brl(conta.sobra)}</b></div>
          {n > 0 && <div className="calc-bloco"><i style={{ background: "#ffc35a" }} /><span><strong>Total da nova compra</strong>{conta.qtd}x de {brl(n)}, até {conta.ultima}</span><b>{brl(conta.totalNova)}</b></div>}
        </div>
        {mostraClasse && (
          <p className={`calc-nota destaque ${conta.classe}`}>
            {conta.classe === "bom" ? "As parcelas cabem com folga na sua renda."
              : conta.classe === "atencao" ? "Está perto do limite de 30% que costuma ser usado como referência. Antes de assumir outra parcela, vale olhar o resto do mês."
              : "Passa dos 30% da renda, a referência mais usada para parcelas. Isso deixa pouco espaço para imprevistos."}
          </p>
        )}
        {!exemplo && r === 0 && <p className="calc-nota">Preencha a renda para ver quanto ela fica comprometida.</p>}
      </div>
    </div>
  );
}
