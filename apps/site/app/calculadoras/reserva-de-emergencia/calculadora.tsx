"use client";
import { useState } from "react";
import { brl, CampoDinheiro, lerDinheiro } from "../campos";

const PERFIS = [
  { id: "estavel", nome: "Renda estável (CLT, servidor, aposentadoria)", meses: 6 },
  { id: "variavel", nome: "Renda variável (autônomo, MEI, comissão)", meses: 12 },
  { id: "outro", nome: "Escolher o número de meses", meses: 0 },
];

export default function Calculadora() {
  const [gastos, setGastos] = useState("");
  const [perfil, setPerfil] = useState("estavel");
  const [mesesLivre, setMesesLivre] = useState("6");
  const [guardado, setGuardado] = useState("");
  const [porMes, setPorMes] = useState("");
  const g = lerDinheiro(gastos), j = lerDinheiro(guardado), m = lerDinheiro(porMes);
  const p = PERFIS.find(x => x.id === perfil)!;
  const meses = p.meses || Math.min(Math.max(parseInt(mesesLivre, 10) || 1, 1), 36);
  const meta = g * meses;
  const falta = Math.max(meta - j, 0);
  const prazo = m > 0 ? Math.ceil(falta / m) : null;
  const pct = meta > 0 ? Math.min((j / meta) * 100, 100) : 0;
  return (
    <div className="calc-caixa">
      <div className="calc-form">
        <CampoDinheiro rotulo="Seus gastos essenciais por mês" valor={gastos} mudar={setGastos} ajuda="Moradia, contas, mercado, transporte, saúde. Sem os desejos." />
        <label className="calc-campo"><span>Sua renda é</span>
          <select value={perfil} onChange={e => setPerfil(e.target.value)}>
            {PERFIS.map(x => <option key={x.id} value={x.id}>{x.nome}{x.meses ? ` · ${x.meses} meses` : ""}</option>)}
          </select>
        </label>
        {perfil === "outro" && (
          <label className="calc-campo"><span>Quantos meses de gastos guardar</span>
            <input type="number" inputMode="numeric" min={1} max={36} value={mesesLivre} onChange={e => setMesesLivre(e.target.value)} />
          </label>
        )}
        <CampoDinheiro rotulo="Quanto você já tem guardado" valor={guardado} mudar={setGuardado} />
        <CampoDinheiro rotulo="Quanto consegue guardar por mês" valor={porMes} mudar={setPorMes} />
      </div>
      <div className="calc-resultado" aria-live="polite">
        <h2>Sua reserva de emergência</h2>
        <p className="calc-grande bom">{brl(meta)}</p>
        <p className="calc-nota">{meses} {meses === 1 ? "mês" : "meses"} dos seus gastos essenciais.</p>
        <div className="calc-trilho" aria-hidden="true"><span style={{ width: `${pct}%`, background: "#3fe7c0" }} /></div>
        <div className="calc-blocos">
          <div className="calc-bloco"><i style={{ background: "#3fe7c0" }} /><span><strong>Já guardado</strong>{meta > 0 ? `${pct.toFixed(0)}% da reserva` : "—"}</span><b>{brl(j)}</b></div>
          <div className="calc-bloco"><i style={{ background: "#526dff" }} /><span><strong>Falta</strong>{falta === 0 && meta > 0 ? "reserva completa" : "para completar"}</span><b>{brl(falta)}</b></div>
          {prazo !== null && falta > 0 && <div className="calc-bloco"><i style={{ background: "#ffc35a" }} /><span><strong>Prazo</strong>guardando {brl(m)} por mês</span><b>{prazo} {prazo === 1 ? "mês" : "meses"}</b></div>}
        </div>
        <p className="calc-nota">O prazo não conta rendimento: considera só o que você guarda. Mantenha a reserva num lugar seguro e com resgate rápido.</p>
      </div>
    </div>
  );
}
