"use client";
import { useId } from "react";
import { mascaraDinheiro, valorColado } from "./contas";

/** Campo de dinheiro com máscara brasileira: os dígitos entram pelos centavos, como no app. */
export function CampoDinheiro({ rotulo, valor, mudar, ajuda }: { rotulo: string; valor: string; mudar: (v: string) => void; ajuda?: string }) {
  const id = useId();
  return (
    <label className="calc-campo" htmlFor={id}>
      <span>{rotulo}</span>
      <div className="calc-dinheiro"><b>R$</b>
        <input id={id} inputMode="numeric" autoComplete="off" placeholder="0,00" value={valor}
          onPaste={e => { e.preventDefault(); mudar(valorColado(e.clipboardData.getData("text"))); }}
          onChange={e => mudar(mascaraDinheiro(e.target.value))} />
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
      <input id={id} type="number" inputMode="numeric" min={min} max={max} value={valor} onChange={e => mudar(e.target.value)}
        onBlur={() => mudar(String(Math.min(Math.max(Math.round(Number(valor)) || min, min), max)))} />
      {ajuda && <small>{ajuda}</small>}
    </label>
  );
}

/** Escolha única em cartões (rádio): no celular o texto quebra em vez de ser cortado, como no select. */
export function CampoOpcoes({ rotulo, valor, mudar, opcoes }: {
  rotulo: string; valor: string; mudar: (v: string) => void; opcoes: { id: string; nome: string; detalhe: string }[];
}) {
  const nome = useId();
  return (
    <fieldset className="calc-campo calc-opcoes">
      <legend>{rotulo}</legend>
      {opcoes.map(o => (
        <label key={o.id} className={o.id === valor ? "ativa" : undefined}>
          <input type="radio" name={nome} value={o.id} checked={o.id === valor} onChange={() => mudar(o.id)} />
          <span><strong>{o.nome}</strong>{o.detalhe}</span>
        </label>
      ))}
    </fieldset>
  );
}

/** Aviso no topo do resultado enquanto ele mostra o exemplo, antes de a pessoa digitar. */
export function AvisoExemplo({ texto }: { texto: string }) {
  return <p className="calc-exemplo"><b>Exemplo</b>{texto}</p>;
}
