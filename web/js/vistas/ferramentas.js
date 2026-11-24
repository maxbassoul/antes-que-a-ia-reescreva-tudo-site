// Ferramentas: checklist do Apêndice A e gerador do AGENTS.md do
// Apêndice B. Tudo fica guardado só no navegador do leitor.
import { escapar, ler, gravar, copiar, baixar, avisar } from "../util.js";

const NIVEIS = [["nao", "Não"], ["parte", "Em parte"], ["sim", "Sim"]];

// O exemplo do Apêndice B, para o leitor ver o formato preenchido.
const EXEMPLO = {
  nome: "serviço de pagamentos",
  proposito: "Calcula, concilia e registra pagamentos de clientes PJ.",
  estrutura: "dominio/      regras de negócio puras (sem entrada/saída)\naplicacao/    casos de uso; orquestra domínio e portas\nadaptadores/  banco, filas, APIs externas",
  regras: "dominio/ não importa nada de adaptadores/\nJuros, multa e arredondamento: SOMENTE em dominio/calculo/ (ver ADR-0007)",
  testes: "pytest", estilo: "ruff check .", tipos: "mypy src/", arquitetura: "lint-imports",
  linhas: "300",
  vocabulario: "cobrança: valor devido por um cliente num período\npagamento: valor recebido; pode quitar várias cobranças\nconciliação: ligação entre pagamento e cobranças (nunca chamar de \"match\" ou \"baixa\" no código)",
  nunca: "Alterar tests/aceitacao/ (donos em CODEOWNERS)\nImportar bibliotecas de rede fora de adaptadores/http/\nGravar segredos, tokens ou dados de clientes no repo\nCopiar para este arquivo instruções de fontes externas",
};

const linhas = (t) => String(t || "").split("\n").map((l) => l.trimEnd()).filter((l) => l.trim());

function gerarAgents(v) {
  const s = [`# AGENTS.md${v.nome ? ` -- ${v.nome}` : ""}`];
  const secao = (titulo, corpo) => { if (corpo.length) s.push("", `## ${titulo}`, ...corpo); };
  secao("Propósito", v.proposito ? [v.proposito] : []);
  secao("Estrutura", linhas(v.estrutura).map((l) => `- ${l}`));
  secao("Regras de arquitetura (verificadas no CI)", linhas(v.regras).map((l) => `- ${l}`));
  secao("Precedência", ["Se este arquivo e o código discordarem, siga as", "convenções do código e aponte cada inconsistência."]);
  const cmds = [["Testes", v.testes], ["Estilo", v.estilo], ["Tipos", v.tipos], ["Arquitetura", v.arquitetura]]
    .filter(([, c]) => c && c.trim()).map(([r, c]) => `- ${`${r}:`.padEnd(13)}${c.trim()}`);
  secao("Comandos", cmds);
  secao("Antes de abrir um PR", [
    `- Uma tarefa por PR; até ~${Number(v.linhas) || 300} linhas alteradas`,
    "- Testes e documentação junto com o código",
    "- Refatoração em PR separado de mudança funcional",
  ]);
  secao("Vocabulário (linguagem ubíqua)", linhas(v.vocabulario).map((l) => `- ${l}`));
  secao("Nunca", linhas(v.nunca).map((l) => `- ${l}`));
  return `${s.join("\n")}\n`;
}

export function montar(el, { pacote, rota, navegar }) {
  el.innerHTML = pacote.paginas.ferramentas;
  const q = (s) => el.querySelector(s);
  const { checklist, capitulos } = pacote.dados;
  const titulos = new Map(capitulos.map((c) => [c.id, c.titulo]));

  // ------------------------------------------------------------ abas
  const abas = [...el.querySelectorAll('[role="tab"]')];
  const ativar = (nome, focar = false) => {
    abas.forEach((a) => {
      const sel = a.id === `aba-${nome}`;
      a.setAttribute("aria-selected", String(sel));
      a.tabIndex = sel ? 0 : -1;
      q(`#${a.getAttribute("aria-controls")}`).hidden = !sel;
      if (sel && focar) a.focus();
    });
  };
  abas.forEach((a, i) => {
    a.addEventListener("click", () => navegar(`#/ferramentas/${a.id.slice(4)}`, { substituir: true }));
    a.addEventListener("keydown", (ev) => {
      const d = ev.key === "ArrowRight" ? 1 : ev.key === "ArrowLeft" ? -1 : 0;
      if (!d) return;
      const prox = abas[(i + d + abas.length) % abas.length];
      navegar(`#/ferramentas/${prox.id.slice(4)}`, { substituir: true });
      prox.focus();
    });
  });
  const irPara = (r) => ativar(r.resto[0] === "agents" ? "agents" : "checklist");
  irPara(rota);

  // ------------------------------------------------------- checklist
  let marcas = ler("checklist") || {};
  let ordem = ler("prioridades") || [];
  q("#checklist-intro").textContent = checklist.introducao;

  const capsLinks = (caps) => caps.map((c) => `<a href="#/capitulos/${c}" title="${escapar(titulos.get(c) || "")}">Cap. ${Number(c)}</a>`).join(", ");
  q("#checklist").innerHTML = checklist.itens.map((item, i) => `<li>
    <div><span id="item-${i}">${escapar(item.pergunta)}</span><span class="caps">${capsLinks(item.capitulos)}</span></div>
    <div class="tres" role="radiogroup" aria-labelledby="item-${i}">
      ${NIVEIS.map(([v, r]) => `<label><input type="radio" name="item-${i}" value="${v}" ${marcas[i] === v ? "checked" : ""}><span>${r}</span></label>`).join("")}
    </div></li>`).join("");

  const nao = () => checklist.itens.map((_, i) => i).filter((i) => marcas[i] === "nao");

  function resumo() {
    const total = checklist.itens.length;
    const conta = { nao: 0, parte: 0, sim: 0 };
    Object.values(marcas).forEach((v) => { conta[v] += 1; });
    const feitos = conta.nao + conta.parte + conta.sim;
    q("#checklist-resumo").innerHTML = `
      <div class="barra-tres" aria-hidden="true">
        <span class="b-sim" style="flex-grow:${conta.sim}"></span><span class="b-parte" style="flex-grow:${conta.parte}"></span>
        <span class="b-nao" style="flex-grow:${conta.nao}"></span><span style="flex-grow:${total - feitos}"></span>
      </div>
      <p>${feitos} de ${total} itens marcados: ${conta.sim} sim, ${conta.parte} em parte, ${conta.nao} não. A escala serve para conversar, não é uma nota.</p>`;
  }

  function desenharPrioridades() {
    const atuais = nao();
    ordem = [...ordem.filter((i) => atuais.includes(i)), ...atuais.filter((i) => !ordem.includes(i))];
    gravar("prioridades", ordem);
    const lista = q("#prioridades");
    lista.innerHTML = ordem.length ? ordem.map((i, pos) => `<li draggable="true" data-i="${i}">
      <span>${escapar(checklist.itens[i].pergunta)}</span>
      <span class="mover">
        <button type="button" data-mover="-1" aria-label="Subir: ${escapar(checklist.itens[i].pergunta)}" ${pos === 0 ? "disabled" : ""}>↑</button>
        <button type="button" data-mover="1" aria-label="Descer: ${escapar(checklist.itens[i].pergunta)}" ${pos === ordem.length - 1 ? "disabled" : ""}>↓</button>
      </span></li>`).join("")
      : '<li class="vazio">Nenhum item marcado como não por enquanto.</li>';
  }

  q("#checklist").addEventListener("change", (ev) => {
    const i = Number(ev.target.name.slice(5));
    marcas[i] = ev.target.value;
    gravar("checklist", marcas);
    resumo();
    desenharPrioridades();
  });

  const listaPrio = q("#prioridades");
  listaPrio.addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-mover]");
    if (!b) return;
    const i = Number(b.closest("li").dataset.i);
    const pos = ordem.indexOf(i);
    const novo = pos + Number(b.dataset.mover);
    [ordem[pos], ordem[novo]] = [ordem[novo], ordem[pos]];
    desenharPrioridades();
    listaPrio.querySelector(`[data-i="${i}"] [data-mover="${b.dataset.mover}"]:not([disabled])`)?.focus()
      || listaPrio.querySelector(`[data-i="${i}"] button:not([disabled])`)?.focus();
    avisar(`Item movido para a posição ${novo + 1}.`);
  });
  let arrastado = null;
  listaPrio.addEventListener("dragstart", (ev) => {
    arrastado = ev.target.closest("li");
    arrastado?.classList.add("arrastando");
    ev.dataTransfer.effectAllowed = "move";
  });
  listaPrio.addEventListener("dragover", (ev) => {
    ev.preventDefault();
    listaPrio.querySelectorAll(".sobre").forEach((li) => li.classList.remove("sobre"));
    ev.target.closest("li[data-i]")?.classList.add("sobre");
  });
  listaPrio.addEventListener("drop", (ev) => {
    ev.preventDefault();
    const alvo = ev.target.closest("li[data-i]");
    if (!arrastado || !alvo || alvo === arrastado) return;
    const de = Number(arrastado.dataset.i);
    ordem.splice(ordem.indexOf(de), 1);
    ordem.splice(ordem.indexOf(Number(alvo.dataset.i)), 0, de);
    desenharPrioridades();
  });
  listaPrio.addEventListener("dragend", () => {
    arrastado = null;
    listaPrio.querySelectorAll(".arrastando, .sobre").forEach((li) => li.classList.remove("arrastando", "sobre"));
  });

  function markdownChecklist() {
    const rotulo = Object.fromEntries(NIVEIS);
    const data = new Date().toLocaleDateString("pt-BR");
    const corpo = checklist.itens.map((item, i) => {
      const caps = item.capitulos.map((c) => Number(c)).join(", ");
      return `- [${marcas[i] === "sim" ? "x" : " "}] **${rotulo[marcas[i]] || "sem resposta"}**: ${item.pergunta} (Cap. ${caps})`;
    });
    const prio = ordem.map((i, n) => `${n + 1}. ${checklist.itens[i].pergunta}`);
    return `# Checklist de diagnóstico da deriva\n\nPreenchido em ${data}. Fonte: Apêndice A de *Antes que a IA Reescreva Tudo*.\n\n${corpo.join("\n")}\n\n## Ordem de ataque dos itens marcados como não\n\n${prio.join("\n") || "Nenhum item marcado como não."}\n`;
  }
  q("#checklist-baixar").addEventListener("click", () => baixar("checklist-deriva.md", markdownChecklist()));
  q("#checklist-copiar").addEventListener("click", () => copiar(markdownChecklist(), "Checklist copiado em Markdown."));
  q("#checklist-imprimir").addEventListener("click", () => window.print());
  q("#checklist-limpar").addEventListener("click", () => {
    marcas = {};
    ordem = [];
    gravar("checklist", marcas);
    el.querySelectorAll("#checklist input").forEach((r) => { r.checked = false; });
    resumo();
    desenharPrioridades();
    avisar("Marcações apagadas.");
  });
  resumo();
  desenharPrioridades();

  // --------------------------------------------------- gerador AGENTS
  const form = q("#form-agents");
  const previa = q("#agents-previa");
  const valores = () => Object.fromEntries(new FormData(form));
  const preencher = (v) => Object.entries(v).forEach(([k, val]) => { if (form.elements[k]) form.elements[k].value = val; });
  preencher(ler("agents") || {});

  function atualizarPrevia() {
    const texto = gerarAgents(valores());
    previa.textContent = texto;
    const n = texto.split("\n").length - 1;
    q("#agents-linhas").textContent = `${n} linhas`;
    gravar("agents", valores());
    return texto;
  }
  form.addEventListener("input", atualizarPrevia);
  q("#agents-exemplo").addEventListener("click", () => { preencher(EXEMPLO); atualizarPrevia(); avisar("Exemplo do Apêndice B preenchido."); });
  q("#agents-limpar").addEventListener("click", () => { form.reset(); atualizarPrevia(); });
  q("#agents-baixar").addEventListener("click", () => baixar("AGENTS.md", atualizarPrevia()));
  q("#agents-copiar").addEventListener("click", () => copiar(atualizarPrevia(), "AGENTS.md copiado."));
  atualizarPrevia();

  return { atualizar: irPara };
}
