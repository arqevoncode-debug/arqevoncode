"use client";
import { useId } from "react";

export const brl = (v: number) => (Number.isFinite(v) ? v : 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Converte o texto digitado ("1.234,56") em número; vazio vira 0. */
export function lerDinheiro(t: string) {
  const n = Number(String(t).replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

/** Campo de dinheiro com máscara brasileira: os dígitos entram pelos centavos, como no app. */
export function CampoDinheiro({ rotulo, valor, mudar, ajuda }: { rotulo: string; valor: string; mudar: (v: string) => void; ajuda?: string }) {
  const id = useId();
  return (
    <label className="calc-campo" htmlFor={id}>
      <span>{rotulo}</span>
      <div className="calc-dinheiro"><b>R$</b>
        <input id={id} inputMode="numeric" autoComplete="off" placeholder="0,00" value={valor}
          onChange={e => {
            const d = e.target.value.replace(/\D/g, "").replace(/^0+(?=\d)/, "").slice(0, 11);
            mudar(d ? (parseInt(d, 10) / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "");
          }} />
      </div>
      {ajuda && <small>{ajuda}</small>}
    </label>
  );
}

export function CampoNumero({ rotulo, valor, mudar, min = 1, max = 120, ajuda }: { rotulo: string; valor: string; mudar: (v: string) => void; min?: number; max?: number; ajuda?: string }) {
  const id = useId();
  return (
    <label className="calc-campo" htmlFor={id}>
      <span>{rotulo}</span>
      <input id={id} type="number" inputMode="numeric" min={min} max={max} value={valor} onChange={e => mudar(e.target.value)} />
      {ajuda && <small>{ajuda}</small>}
    </label>
  );
}
