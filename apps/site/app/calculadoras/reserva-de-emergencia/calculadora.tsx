"use client";
import { useState } from "react";
import { AvisoExemplo, CampoDinheiro, CampoNumero, CampoOpcoes } from "../campos";
import { brl, EXEMPLOS, lerDinheiro, limitar, porcento, reservaEmergencia, textoPrazo } from "../contas";

const PERFIS = [
  { id: "estavel", nome: "Renda estável", detalhe: "CLT, servidor, aposentadoria · 6 meses", meses: 6 },
  { id: "variavel", nome: "Renda variável", detalhe: "autônomo, MEI, comissão · 12 meses", meses: 12 },
  { id: "outro", nome: "Outro prazo", detalhe: "você escolhe quantos meses guardar", meses: 0 },
];

export default function Calculadora() {
  const [gastos, setGastos] = useState("");
  const [perfil, setPerfil] = useState("estavel");
  const [mesesLivre, setMesesLivre] = useState("6");
  const [guardado, setGuardado] = useState("");
  const [porMes, setPorMes] = useState("");
  // sem nada digitado, o resultado mostra um exemplo em vez de R$ 0,00 em tudo
  const exemplo = !gastos && !guardado && !porMes;
  const x = EXEMPLOS.reserva;
  const g = exemplo ? x.gastos : lerDinheiro(gastos), j = exemplo ? x.guardado : lerDinheiro(guardado), m = exemplo ? x.porMes : lerDinheiro(porMes);
  const meses = PERFIS.find(p => p.id === perfil)!.meses || limitar(mesesLivre, 1, 36);
  const conta = reservaEmergencia({ gastos: g, meses, guardado: j, porMes: m });
  return (
    <div className="calc-caixa">
      <div className="calc-form">
        <CampoDinheiro rotulo="Seus gastos essenciais por mês" valor={gastos} mudar={setGastos} ajuda="Moradia, contas, mercado, transporte, saúde. Sem os desejos." />
        <CampoOpcoes rotulo="Sua renda é" valor={perfil} mudar={setPerfil} opcoes={PERFIS} />
        {perfil === "outro" && <CampoNumero rotulo="Quantos meses de gastos guardar" valor={mesesLivre} mudar={setMesesLivre} max={36} />}
        <CampoDinheiro rotulo="Quanto você já tem guardado" valor={guardado} mudar={setGuardado} />
        <CampoDinheiro rotulo="Quanto consegue guardar por mês" valor={porMes} mudar={setPorMes} />
      </div>
      <div className={`calc-resultado${exemplo ? " exemplo" : ""}`} aria-live="polite">
        {exemplo && <AvisoExemplo texto={`com gastos essenciais de ${brl(g)}, ${brl(j)} já guardados e ${brl(m)} por mês.`} />}
        <h2>Sua reserva de emergência</h2>
        <p className="calc-grande bom">{brl(conta.meta)}</p>
        <p className="calc-nota">{meses} {meses === 1 ? "mês" : "meses"} dos seus gastos essenciais.</p>
        <div className="calc-trilho" aria-hidden="true"><span style={{ width: `${conta.pct}%`, background: "#3fe7c0" }} /></div>
        <div className="calc-blocos">
          <div className="calc-bloco"><i style={{ background: "#3fe7c0" }} /><span><strong>Já guardado</strong>{conta.meta > 0 ? `${porcento(conta.pct, 0)} da reserva` : "—"}</span><b>{brl(j)}</b></div>
          <div className="calc-bloco"><i style={{ background: "#526dff" }} /><span><strong>Falta</strong>{conta.falta === 0 && conta.meta > 0 ? "reserva completa" : "para completar"}</span><b>{brl(conta.falta)}</b></div>
          {conta.prazo !== null && conta.falta > 0 && <div className="calc-bloco"><i style={{ background: "#ffc35a" }} /><span><strong>Prazo</strong>guardando {brl(m)} por mês</span><b>{textoPrazo(conta.prazo)}</b></div>}
        </div>
        {!exemplo && g === 0 && <p className="calc-nota">Preencha os gastos essenciais para calcular a reserva.</p>}
        <p className="calc-nota">O prazo não conta rendimento: considera só o que você guarda. Mantenha a reserva num lugar seguro e com resgate rápido.</p>
      </div>
    </div>
  );
}
