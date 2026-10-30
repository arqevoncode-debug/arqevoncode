// Contas das calculadoras (app/calculadoras/contas.js), sem navegador.
import assert from "node:assert/strict";
import test from "node:test";
import {
  brl, classeParcelas, EXEMPLOS, lerDinheiro, limitar, mascaraDinheiro, parcelasERenda, porcento,
  regra503020, reservaEmergencia, textoPrazo, valorColado,
} from "../app/calculadoras/contas.js";

// toLocaleString usa espaço sem quebra entre "R$" e o número
const txt = s => s.replace(/ /g, " ");

test("formata reais e porcentagens no padrão brasileiro", () => {
  assert.equal(txt(brl(1500)), "R$ 1.500,00");
  assert.equal(txt(brl(0.1 + 0.2)), "R$ 0,30");
  assert.equal(txt(brl(NaN)), "R$ 0,00");
  assert.equal(porcento(22.5), "22,5%");
  assert.equal(porcento(60, 0), "60%");
  assert.equal(porcento(Infinity), "0,0%");
});

test("máscara do campo: dígitos entram pelos centavos", () => {
  assert.equal(mascaraDinheiro("150000"), "1.500,00");
  assert.equal(mascaraDinheiro("5"), "0,05");
  assert.equal(mascaraDinheiro("0005"), "0,05");
  assert.equal(mascaraDinheiro("1.500,009"), "15.000,09", "o caractere digitado no fim entra como centavo");
  assert.equal(mascaraDinheiro("abc"), "");
  assert.equal(mascaraDinheiro(""), "");
  assert.equal(mascaraDinheiro("123456789012345"), "123.456.789,01", "no máximo 11 dígitos");
  assert.equal(lerDinheiro(mascaraDinheiro("150000")), 1500);
});

test("valor colado em qualquer formato comum vira reais", () => {
  assert.equal(valorColado("3500"), "3.500,00");
  assert.equal(valorColado("3.500"), "3.500,00");
  assert.equal(valorColado("R$ 3.500,00"), "3.500,00");
  assert.equal(valorColado("3500.5"), "3.500,50");
  assert.equal(valorColado("1,5"), "1,50");
  assert.equal(valorColado("-200"), "200,00");
  assert.equal(valorColado("abc"), "");
  assert.equal(valorColado("0"), "");
});

test("lê o texto do campo e limita números inteiros", () => {
  assert.equal(lerDinheiro("1.234,56"), 1234.56);
  assert.equal(lerDinheiro(""), 0);
  assert.equal(lerDinheiro("x"), 0);
  assert.equal(limitar("10", 1, 120), 10);
  assert.equal(limitar("", 1, 120), 1);
  assert.equal(limitar("500", 1, 120), 120);
  assert.equal(limitar("-3", 1, 36), 1);
});

test("regra 50/30/20 e comparação com o essencial de hoje", () => {
  const r = regra503020(3000);
  assert.deepEqual([r.necessidades, r.desejos, r.futuro], [1500, 900, 600]);
  const acima = regra503020(3000, 1800);
  assert.equal(acima.pctEssenciais, 60);
  assert.equal(acima.folga, -300);
  assert.equal(regra503020(3000, 1200).folga, 300);
  assert.equal(regra503020(0, 500).pctEssenciais, 0, "sem renda não divide por zero");
  assert.equal(regra503020(1000.1, 500.05).folga, 0, "conta em centavos: 50% de 1.000,10 é 500,05");
});

test("parcelas: faixas de 20% e 30% da renda", () => {
  assert.equal(classeParcelas(20), "bom");
  assert.equal(classeParcelas(20.01), "atencao");
  assert.equal(classeParcelas(30), "atencao");
  assert.equal(classeParcelas(30.01), "ruim");
});

test("parcelas: total, sobra e última parcela da compra nova", () => {
  const hoje = new Date(2026, 9, 30); // 30/10/2026: a 1ª parcela cai em novembro
  const c = parcelasERenda({ ...EXEMPLOS.parcelas, hoje });
  assert.equal(c.total, 900);
  assert.equal(c.pct, 22.5);
  assert.equal(c.classe, "atencao");
  assert.equal(c.sobra, 3100);
  assert.equal(c.totalNova, 3000);
  assert.equal(c.ultima, "agosto de 2027");
  assert.equal(parcelasERenda({ renda: 3000, atuais: 0, nova: 100, vezes: 1, hoje: new Date(2026, 11, 15) }).ultima, "janeiro de 2027", "vira o ano");
  assert.equal(parcelasERenda({ renda: 1000, atuais: 1500, hoje }).sobra, 0, "a sobra nunca fica negativa");
  assert.equal(parcelasERenda({ renda: 1000, atuais: 0.1, nova: 0.2, hoje }).total, 0.3, "soma em centavos");
  assert.equal(parcelasERenda({ renda: 1000, atuais: 0, nova: 10, vezes: "999", hoje }).qtd, 120);
  assert.equal(parcelasERenda({ renda: 0, atuais: 300, hoje }).pct, 0, "sem renda não divide por zero");
});

test("reserva de emergência: meta, falta e prazo", () => {
  const r = reservaEmergencia({ ...EXEMPLOS.reserva, meses: 6 });
  assert.deepEqual([r.meta, r.falta, r.prazo, r.pct], [15000, 12000, 24, 20]);
  assert.equal(reservaEmergencia({ gastos: 2500, meses: 12 }).meta, 30000);
  const completa = reservaEmergencia({ gastos: 1000, meses: 6, guardado: 7000, porMes: 100 });
  assert.deepEqual([completa.falta, completa.prazo, completa.pct], [0, 0, 100]);
  assert.equal(reservaEmergencia({ gastos: 1000, meses: 6 }).prazo, null, "sem valor por mês não há prazo");
  assert.equal(reservaEmergencia({ gastos: 0, meses: 6, guardado: 100 }).pct, 0);
});

// Em ponto flutuante, 1.000,49 × 6 − 2,94 dá 6.000,000000001: o prazo virava 61 meses em vez de 60.
test("reserva: prazo exato quando a falta é múltiplo do valor por mês", () => {
  assert.equal(reservaEmergencia({ gastos: 1000.49, meses: 6, guardado: 2.94, porMes: 100 }).prazo, 60);
  assert.equal(reservaEmergencia({ gastos: 1000.7, meses: 6, guardado: 4.2, porMes: 100 }).prazo, 60);
});

test("prazo em meses e anos", () => {
  assert.equal(textoPrazo(1), "1 mês");
  assert.equal(textoPrazo(23), "23 meses");
  assert.equal(textoPrazo(24), "2 anos");
  assert.equal(textoPrazo(30), "2 anos e 6 meses");
  assert.equal(textoPrazo(37), "3 anos e 1 mês");
  assert.equal(textoPrazo(1201), "mais de 100 anos");
});
