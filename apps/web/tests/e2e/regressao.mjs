// Regressão: roda o mesmo roteiro na versão de referência (padrão: origin/main) e na versão atual
// e compara, depois de cada passo, os dados gravados, o mês, a lista e a visão geral.
// Uso: npm run test:regressao  (REGRESSAO_BASE=<ref git> para comparar com outra versão)
// Diferença não é necessariamente erro: numa mudança de comportamento intencional, confira a saída.
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { servir, navegador, abrir, HTML_PADRAO } from "./ambiente.mjs";

const raiz = resolve(import.meta.dirname, "../..");
const base = process.env.REGRESSAO_BASE || "origin/main";
const tmp = mkdtempSync(join(tmpdir(), "arqevon-regressao-"));
// o motor mudou de lugar em 2026-10-14 (apps/finance-desktop/meu-financeiro.html → apps/web/src/motor.html)
const motorDe = caminho => execFileSync("git", ["show", `${base}:${caminho}`], { cwd: raiz, maxBuffer: 1 << 26, stdio: ["ignore", "pipe", "ignore"] });
let motorBase;
try { motorBase = motorDe("apps/web/src/motor.html"); } catch { motorBase = motorDe("apps/finance-desktop/meu-financeiro.html"); }
writeFileSync(join(tmp, "motor.html"), motorBase);
execFileSync("node", ["scripts/build.mjs"], { cwd: raiz, env: { ...process.env, ARQEVON_BILLING: "1", ARQEVON_MOTOR: join(tmp, "motor.html"), ARQEVON_SAIDA: tmp }, stdio: "ignore" });

const ROTEIRO = [
  { nome: "despesa sem dia no mês atual", tipo: "despesa", rep: "unico", mes: "2026-10", desc: "Mercado", valor: "250,00", cat: "alimentacao" },
  { nome: "despesa em novembro, dia 5", tipo: "despesa", rep: "unico", mes: "2026-11", dia: 5, desc: "Farmácia", valor: "80,50" },
  { nome: "conta fixa em novembro, dia 10", tipo: "despesa", rep: "fixo", mes: "2026-11", dia: 10, desc: "Aluguel", valor: "1.500,00" },
  { nome: "parcelado 10x em novembro", tipo: "despesa", rep: "parcelado", mes: "2026-11", num: 10, desc: "Celular", valor: "2.500,00" },
  { nome: "entrada em novembro, dia 5", tipo: "entrada", rep: "unico", mes: "2026-11", dia: 5, desc: "Freela", valor: "800,00" },
  { nome: "salário fixo, dia 5", tipo: "entrada", rep: "fixo", mes: "2026-10", dia: 5, desc: "Salário", valor: "5.000,00" },
  { nome: "despesa em setembro, dia 28", tipo: "despesa", rep: "unico", mes: "2026-09", dia: 28, desc: "Cinema", valor: "60,00" },
  { nome: "despesa no dia 31 de fevereiro", tipo: "despesa", rep: "unico", mes: "2027-02", dia: 31, desc: "Conta", valor: "99,00" },
  { nome: "ver dezembro", tipo: "ir", mes: "2026-12" },
  { nome: "ver março de 2027", tipo: "ir", mes: "2027-03" },
  { nome: "editar parcelado vendo janeiro", tipo: "editar", mes: "2027-01", fonte: "parc", col: "parcelamentos", desc: "Celular", form: "lanc", novoValor: "3.000,00" },
  { nome: "editar despesa avulsa", tipo: "editar", mes: "2026-10", fonte: "lanc", col: "lancamentos", desc: "Mercado", form: "lanc", novoValor: "275,00" },
  { nome: "editar conta fixa vendo dezembro", tipo: "editar", mes: "2026-12", fonte: "fixo", col: "fixos", desc: "Aluguel", form: "lanc", novoValor: "1.600,00" },
  { nome: "entrada avulsa vira todo mês", tipo: "editar", mes: "2026-11", fonte: "lanc", col: "lancamentos", desc: "Freela", form: "entrada", novaRep: "fixo" },
  { nome: "despesa avulsa vira parcelada", tipo: "editar", mes: "2026-11", fonte: "lanc", col: "lancamentos", desc: "Farmácia", form: "lanc", novaRep: "parcelado" },
  { nome: "editar salário vendo fevereiro", tipo: "editar", mes: "2027-02", fonte: "fixo", col: "fixos", desc: "Salário", form: "entrada", novaDesc: "Salário CLT" },
  { nome: "editar e cancelar", tipo: "editar", mes: "2026-09", fonte: "lanc", col: "lancamentos", desc: "Cinema", form: "lanc", novoValor: "999,00", cancelar: true },
  { nome: "valor vazio não grava", tipo: "despesa", rep: "unico", mes: "2026-10", dia: 2, desc: "Nada", valor: "" },
  { nome: "excluir avulsa", tipo: "excluir", mes: "2026-09", col: "lancamentos", desc: "Cinema" },
  { nome: "excluir parcelado", tipo: "excluir", mes: "2027-01", col: "parcelamentos", desc: "Celular" },
  { nome: "excluir fixo", tipo: "excluir", mes: "2026-10", col: "fixos", desc: "Aluguel" },
  { nome: "voltar para hoje", tipo: "ir", mes: "2026-10" },
];

function passo(p, a) {
  return p.evaluate(a => {
    const $ = s => document.querySelector(s);
    const ev = (el, t) => el.dispatchEvent(new Event(t, { bubbles: true }));
    const irPara = mk => {
      for (let i = 0; i < 40 && chaveMes(mesAtual.ano, mesAtual.mes) < mk; i++) $("#mesProx").click();
      for (let i = 0; i < 40 && chaveMes(mesAtual.ano, mesAtual.mes) > mk; i++) $("#mesAnt").click();
    };
    const achar = (col, desc) => JSON.parse(localStorage.getItem("meu-financeiro-v1"))[col].find(x => x.descricao === desc).id;
    if (a.tipo === "ir") irPara(a.mes);
    if (a.tipo === "despesa") {
      irPara(a.mes);
      $("#lRep").value = a.rep; ev($("#lRep"), "change");
      $("#lDesc").value = a.desc; $("#lValor").value = a.valor;
      if (a.cat) $("#lCat").value = a.cat;
      if (a.num) $("#lNum").value = a.num;
      $("#lDia").value = a.dia ? String(a.dia) : "";
      $("#formLanc").requestSubmit();
    }
    if (a.tipo === "entrada") {
      irPara(a.mes);
      $("#eRep").value = a.rep;
      $("#eDesc").value = a.desc; $("#eValor").value = a.valor; $("#eDia").value = a.dia ? String(a.dia) : "";
      $("#formEntrada").requestSubmit();
    }
    if (a.tipo === "editar") {
      irPara(a.mes);
      editarItem(a.fonte, achar(a.col, a.desc));
      const ent = a.form === "entrada";
      if (a.novoValor) $(ent ? "#eValor" : "#lValor").value = a.novoValor;
      if (a.novaDesc) $(ent ? "#eDesc" : "#lDesc").value = a.novaDesc;
      if (a.novaRep) { const r = $(ent ? "#eRep" : "#lRep"); r.value = a.novaRep; ev(r, "change"); }
      if (a.cancelar) $(ent ? "#eCancelar" : "#lCancelar").click();
      else $(ent ? "#formEntrada" : "#formLanc").requestSubmit();
    }
    if (a.tipo === "excluir") {
      irPara(a.mes);
      ({ lancamentos: excluirLanc, fixos: excluirFixo, parcelamentos: excluirParc })[a.col](achar(a.col, a.desc));
    }
  }, a);
}

// REGRESSAO_IGNORAR (regex) apaga textos novos conhecidos antes de comparar, para conferir que uma
// mudança intencional de tela não esconde outra diferença.
const IGNORAR = process.env.REGRESSAO_IGNORAR || "";
const foto = p => p.evaluate(ignorar => {
  const d = JSON.parse(localStorage.getItem("meu-financeiro-v1") || "{}");
  const limpa = arr => (arr || []).map(({ id, ...r }) => JSON.stringify(r)).sort();
  const t = s => {
    const v = document.querySelector(s).innerText.toLowerCase();
    // linhas só com espaços vêm da marcação, não do conteúdo
    return (ignorar ? v.replace(new RegExp(ignorar, "g"), "") : v).replace(/\n[ \t]*(?=\n)/g, "").replace(/\n{2,}/g, "\n");
  };
  return {
    dados: { l: limpa(d.lancamentos), f: limpa(d.fixos), p: limpa(d.parcelamentos), o: limpa(d.objetivos) },
    mes: t("#mesLabel"), lista: t("#cardLista"), painel: t("#aba-painel"),
    form: ["#lDesc", "#lValor", "#eDesc", "#eValor", "#lRep", "#eRep", "#lNum"].map(s => document.querySelector(s).value).join("|"),
  };
}, IGNORAR);

const [srvBase, srvNovo] = [await servir(join(tmp, "index.html")), await servir(HTML_PADRAO)];
const browser = await navegador();
let diferencas = 0;
for (const hoje of ["2026-10-13T12:00:00", "2026-10-31T12:00:00"]) {
  console.log(`\n${base} × atual, hoje = ${hoje.slice(0, 10)}`);
  const pb = await abrir(browser, { url: srvBase.url, hoje });
  const pn = await abrir(browser, { url: srvNovo.url, hoje });
  for (const a of [{ nome: "tela inicial", tipo: "nada" }, ...ROTEIRO]) {
    await passo(pb, a); await passo(pn, a);
    // perguntas (ex.: conta fixa "a partir deste mês" ou "em todos os meses"): a mesma resposta nas
    // duas versões, como a pessoa faria, para nenhuma ficar com um envio pendente
    for (const pg of [pb, pn]) {
      await new Promise(r => setTimeout(r, 50));
      await pg.evaluate(() => {
        if (!document.querySelector("#modalConfirmacao")?.open) return;
        const alt = document.querySelector("#confirmacaoAlternativa");
        (alt && !alt.hidden ? alt : document.querySelector("#confirmacaoAceitar")).click();
      });
      await new Promise(r => setTimeout(r, 50));
    }
    const [fb, fn] = [await foto(pb), await foto(pn)];
    const campos = Object.keys(fb).filter(k => JSON.stringify(fb[k]) !== JSON.stringify(fn[k]));
    if (!campos.length) { console.log(`  ✓ ${a.nome}`); continue; }
    diferencas++;
    console.log(`  ✗ ${a.nome}: difere em ${campos.join(", ")}`);
    for (const k of campos) console.log(`     base:  ${JSON.stringify(fb[k]).slice(0, 500)}\n     atual: ${JSON.stringify(fn[k]).slice(0, 500)}`);
  }
  for (const p of [pb, pn]) if (p.erros.length) { diferencas++; console.log("  erros de JavaScript:", p.erros); }
  await pb.fechar(); await pn.fechar();
}
await browser.close(); await srvBase.fechar(); await srvNovo.fechar();
console.log(diferencas ? `\n${diferencas} diferença(s) em relação a ${base}.` : `\nSem diferenças em relação a ${base}.`);
process.exit(diferencas ? 1 : 0);
