// Contas das calculadoras, sem React: as telas usam estas funções e tests/calculadoras.test.mjs as
// testa direto no Node. Em JS (e não TS) para o Node importar sem build.

export const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

/** Valores que aparecem antes de a pessoa digitar qualquer coisa, marcados como "Exemplo". */
export const EXEMPLOS = {
  regra: { renda: 3000 },
  parcelas: { renda: 4000, atuais: 600, nova: 300, vezes: 10 },
  reserva: { gastos: 2500, guardado: 3000, porMes: 500 },
};

const centavos = v => Math.round((Number.isFinite(v) ? v : 0) * 100);

export const brl = v => (Number.isFinite(v) ? v : 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Porcentagem no padrão brasileiro: 22.5 → "22,5%". */
export const porcento = (v, casas = 1) => `${(Number.isFinite(v) ? v : 0).toFixed(casas).replace(".", ",")}%`;

/** Converte o texto digitado ("1.234,56") em número; vazio vira 0. */
export function lerDinheiro(t) {
  const n = Number(String(t).replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

/** Máscara do campo de dinheiro: os dígitos entram pelos centavos, como no app ("150000" → "1.500,00"). */
export function mascaraDinheiro(digitado) {
  const d = String(digitado).replace(/\D/g, "").replace(/^0+(?=\d)/, "").slice(0, 11);
  return d ? (parseInt(d, 10) / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "";
}

/** Texto colado ("3500", "3.500", "R$ 3.500,00", "3500.5") em reais, formatado no padrão brasileiro. */
export function valorColado(t) {
  let s = String(t).replace(/R\$|\s/g, "");
  if (/,\d{1,2}$/.test(s)) s = s.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  else s = s.replace(/,/g, "");
  const n = Math.abs(Number(s));
  return Number.isFinite(n) && n > 0 ? Math.min(n, 999999999.99).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "";
}

/** Inteiro dentro de [min, max]; texto vazio ou inválido vira min. */
export function limitar(v, min, max) {
  return Math.min(Math.max(parseInt(String(v), 10) || min, min), max);
}

/** Regra 50/30/20 e, se informado, quanto o essencial de hoje ocupa da renda. */
export function regra503020(renda, essenciais = 0) {
  const pctEssenciais = renda > 0 ? (essenciais / renda) * 100 : 0;
  return {
    necessidades: renda * 0.5,
    desejos: renda * 0.3,
    futuro: renda * 0.2,
    pctEssenciais,
    // positivo: quanto ainda cabe nos 50%; negativo: quanto passou
    folga: (centavos(renda * 0.5) - centavos(essenciais)) / 100,
  };
}

/** Classificação usada na cor e no texto: até 20% folga, até 30% atenção, acima disso pesado. */
export const classeParcelas = pct => (pct <= 20 ? "bom" : pct <= 30 ? "atencao" : "ruim");

/** Quanto as parcelas comprometem a renda. A 1ª parcela da compra nova cai no mês seguinte a `hoje`. */
export function parcelasERenda({ renda, atuais, nova = 0, vezes = 1, hoje = new Date() }) {
  const qtd = limitar(vezes, 1, 120);
  const total = (centavos(atuais) + centavos(nova)) / 100;
  const pct = renda > 0 ? (total / renda) * 100 : 0;
  const fim = new Date(hoje.getFullYear(), hoje.getMonth() + qtd, 1);
  return {
    qtd, total, pct,
    classe: classeParcelas(pct),
    sobra: Math.max(centavos(renda) - centavos(total), 0) / 100,
    totalNova: (centavos(nova) * qtd) / 100,
    ultima: `${MESES[fim.getMonth()]} de ${fim.getFullYear()}`,
  };
}

/** Reserva de emergência: meta, quanto falta e em quantos meses, sem contar rendimento. */
export function reservaEmergencia({ gastos, meses, guardado = 0, porMes = 0 }) {
  const meta = (centavos(gastos) * meses) / 100;
  const falta = Math.max(centavos(meta) - centavos(guardado), 0);
  return {
    meta,
    falta: falta / 100,
    prazo: porMes > 0 ? Math.ceil(falta / centavos(porMes)) : null,
    pct: meta > 0 ? Math.min((guardado / meta) * 100, 100) : 0,
  };
}

/** "24 meses", "1 mês", "2 anos e 3 meses". Prazos absurdos viram "mais de 100 anos". */
export function textoPrazo(meses) {
  if (meses > 1200) return "mais de 100 anos";
  const anos = Math.floor(meses / 12), resto = meses % 12;
  const m = n => `${n.toLocaleString("pt-BR")} ${n === 1 ? "mês" : "meses"}`;
  if (meses < 24) return m(meses);
  const a = `${anos} ${anos === 1 ? "ano" : "anos"}`;
  return resto ? `${a} e ${m(resto)}` : a;
}
