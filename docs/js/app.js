// Entrada do site: tela de entrada, abertura do pacote e rotas.
import { abrir, chaveDeTeste } from "./cofre.js";
import { ler, gravar, apagarTudo, escapar, normalizar, sha256, semMovimento, avisar } from "./util.js";

const CONFIG = JSON.parse(document.body.dataset.config || "{}");
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const $ = (id) => document.getElementById(id);

let pacote = null;

// ================================================== tela de entrada

const portao = {
  codigo: "",
  formCodigo: $("form-codigo"),
  formCadastro: $("form-cadastro"),
  resultado: $("resultado"),
  campoCodigo: document.querySelector(".campo--codigo"),
  caixas: [...document.querySelectorAll("#codigo-caixas span")],
};

function passo(n) {
  document.querySelectorAll(".passos li").forEach((li) => {
    const p = Number(li.dataset.passo);
    li.classList.toggle("feito", p < n);
    if (p === n) li.setAttribute("aria-current", "step");
    else li.removeAttribute("aria-current");
  });
}

function erro(id, mensagem) {
  const saida = $(`${id}-erro`);
  if (saida) saida.textContent = mensagem;
  $(id)?.setAttribute("aria-invalid", mensagem ? "true" : "false");
  return !mensagem;
}

function aviso(html, tipo) {
  portao.resultado.className = `aviso${tipo ? ` aviso--${tipo}` : ""}`;
  portao.resultado.innerHTML = html;
}

function desenharCaixas() {
  const input = $("codigo");
  const valor = input.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
  if (input.value !== valor) input.value = valor;
  const foco = document.activeElement === input;
  portao.caixas.forEach((c, i) => {
    c.textContent = valor[i] || "";
    c.classList.toggle("cheia", Boolean(valor[i]));
    c.classList.toggle("atual", foco && i === Math.min(valor.length, 5));
  });
  portao.campoCodigo.classList.remove("erro", "certo");
  return valor;
}

async function conferirCodigo(evento) {
  evento?.preventDefault();
  const valor = desenharCaixas();
  if (valor.length < 6) {
    erro("codigo", "O código tem seis caracteres. Confira no livro.");
    return;
  }
  if ((await sha256(valor)) !== CONFIG.codigoHash) {
    erro("codigo", "Esse código não confere. Confira as letras e os números no livro.");
    portao.campoCodigo.classList.add("erro");
    $("codigo").select();
    return;
  }
  erro("codigo", "");
  portao.codigo = valor;
  portao.campoCodigo.classList.add("certo");
  setTimeout(() => {
    portao.formCodigo.hidden = true;
    portao.formCadastro.hidden = false;
    passo(2);
    $("nome").focus();
  }, semMovimento() ? 0 : 450);
}

async function pedirChave(cadastro) {
  if (CONFIG.teste) return chaveDeTeste(portao.codigo);
  const resposta = await fetch(CONFIG.appsScriptUrl, {
    method: "POST",
    // text/plain evita a checagem prévia que o Apps Script não atende.
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(cadastro),
  });
  const dados = await resposta.json();
  if (!dados.ok) throw Object.assign(new Error(dados.mensagem), { doServidor: true });
  return dados.chave;
}

async function cadastrar(evento) {
  evento.preventDefault();
  const nome = $("nome").value.trim();
  const email = $("email").value.trim().toLowerCase();
  const ok = [
    erro("nome", nome.length >= 2 ? "" : "Digite seu nome."),
    erro("email", EMAIL.test(email) ? "" : "Digite um e-mail válido, como nome@exemplo.com."),
    erro("consentimento", $("consentimento").checked ? "" : "Para abrir o site, marque a concordância."),
  ];
  if (ok.includes(false)) {
    portao.formCadastro.querySelector('[aria-invalid="true"]')?.focus();
    return;
  }
  const botao = portao.formCadastro.querySelector('button[type="submit"]');
  botao.disabled = true;
  botao.textContent = "Enviando…";
  aviso("", "");
  try {
    const chave = await pedirChave({
      codigo: portao.codigo, nome, email,
      consentimento: true, novidades: $("novidades").checked,
    });
    passo(3);
    botao.textContent = "Abrindo…";
    pacote = await abrir(chave);
    gravar("chave", chave);
    gravar("leitor", { nome: nome.split(/\s+/)[0], desde: new Date().toISOString() });
    iniciarApp(true);
  } catch (e) {
    botao.disabled = false;
    botao.textContent = "Abrir o site";
    if (e.doServidor) aviso(escapar(e.message), "erro");
    else if (e.name === "OperationError") aviso("A chave recebida não abriu o site. Escreva para o contato abaixo.", "erro");
    else aviso("O cadastro não chegou ao servidor. Confira sua conexão e tente de novo.", "erro");
  }
}

function prepararPortao() {
  const input = $("codigo");
  input.addEventListener("input", () => {
    erro("codigo", "");
    if (desenharCaixas().length === 6) conferirCodigo();
  });
  input.addEventListener("focus", desenharCaixas);
  input.addEventListener("blur", desenharCaixas);
  portao.formCodigo.addEventListener("submit", conferirCodigo);
  portao.formCadastro.addEventListener("submit", cadastrar);
  $("voltar-codigo").addEventListener("click", () => {
    portao.formCadastro.hidden = true;
    portao.formCodigo.hidden = false;
    passo(1);
    input.focus();
  });

  // A capa acompanha o ponteiro, de leve.
  const capa = document.querySelector(".portao__capa img");
  if (capa && !semMovimento() && matchMedia("(pointer: fine)").matches) {
    document.querySelector(".portao").addEventListener("pointermove", (ev) => {
      const x = ev.clientX / innerWidth - 0.5;
      const y = ev.clientY / innerHeight - 0.5;
      capa.style.setProperty("--giro", `${-8 + x * 10}deg`);
      capa.style.setProperty("--incl", `${2 - y * 6}deg`);
    });
  }
  document.body.dataset.estado = "portao";
  input.focus({ preventScroll: true });
}

// =========================================================== rotas

const VISTAS = {
  inicio: () => import("./vistas/inicio.js"),
  mapa: () => import("./vistas/mapa.js"),
  capitulos: () => import("./vistas/capitulos.js"),
  ferramentas: () => import("./vistas/ferramentas.js"),
  blog: () => import("./vistas/blog.js"),
  privacidade: () => import("./vistas/privacidade.js"),
};
const TITULOS = {
  inicio: "", mapa: "Mapa das referências", capitulos: "Capítulos",
  ferramentas: "Ferramentas", blog: "Blog", privacidade: "Privacidade",
};

const vista = $("vista");
let desmontar = null;
let rotaAtual = "";

export function lerRota() {
  const [caminho, busca = ""] = location.hash.replace(/^#\/?/, "").split("?");
  const [nome, ...resto] = caminho.split("/").filter(Boolean);
  return { nome: VISTAS[nome] ? nome : "inicio", resto, params: new URLSearchParams(busca), caminho };
}

export function navegar(destino, { substituir = false } = {}) {
  const alvo = destino.startsWith("#") ? destino : `#/${destino}`;
  if (substituir) history.replaceState(null, "", alvo);
  else location.hash = alvo;
  if (substituir) trocarVista();
}

async function trocarVista() {
  const rota = lerRota();
  const chave = rota.nome;
  // Mudar só os parâmetros não remonta a vista; ela mesma reage.
  if (chave === rotaAtual && desmontar?.atualizar) {
    desmontar.atualizar(rota);
    return;
  }
  rotaAtual = chave;
  const modulo = await VISTAS[rota.nome]();
  const trocar = () => {
    if (typeof desmontar === "function") desmontar();
    else desmontar?.limpar?.();
    vista.innerHTML = "";
    window.scrollTo({ top: 0 });
    vista.focus({ preventScroll: true });
    desmontar = modulo.montar(vista, { pacote, rota, navegar }) || null;
  };
  if (document.startViewTransition && !semMovimento() && vista.childElementCount) {
    await document.startViewTransition(trocar).updateCallbackDone;
  } else trocar();

  document.querySelectorAll("[data-rota]").forEach((a) => {
    if (a.dataset.rota === rota.nome) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  });
  const titulo = vista.dataset.titulo || TITULOS[rota.nome];
  document.title = titulo ? `${titulo} | Antes que a IA Reescreva Tudo` : "Antes que a IA Reescreva Tudo";
  progresso();
}

// =========================================================== paleta

let itensPaleta = [];

function montarItens() {
  const { grafo, capitulos } = pacote.dados;
  const itens = [
    { tipo: "Página", titulo: "Início", destino: "#/" },
    { tipo: "Página", titulo: "Mapa das referências", destino: "#/mapa" },
    { tipo: "Página", titulo: "Capítulos", destino: "#/capitulos" },
    { tipo: "Ferramenta", titulo: "Checklist de diagnóstico", sub: "Apêndice A", destino: "#/ferramentas/checklist" },
    { tipo: "Ferramenta", titulo: "Gerador de AGENTS.md", sub: "Apêndice B", destino: "#/ferramentas/agents" },
    { tipo: "Página", titulo: "Blog", destino: "#/blog" },
    { tipo: "Página", titulo: "Privacidade", destino: "#/privacidade" },
  ];
  for (const c of capitulos) {
    itens.push({
      tipo: "Capítulo", titulo: c.numero ? `${c.numero}. ${c.titulo}` : c.titulo,
      sub: c.resumo[0] || "", destino: `#/capitulos/${c.id}`,
    });
  }
  for (const n of grafo.nos) {
    if (n.tipo === "conceito") itens.push({ tipo: "Conceito", titulo: n.rotulo, sub: n.definicao, destino: `#/mapa?no=${encodeURIComponent(n.id)}` });
    if (n.tipo === "obra") itens.push({ tipo: "Obra", titulo: n.rotulo, sub: n.referencia, destino: `#/mapa?no=${encodeURIComponent(n.id)}` });
  }
  for (const p of pacote.posts) itens.push({ tipo: "Post", titulo: p.titulo, sub: p.resumo, destino: `#/blog/${p.slug}` });
  return itens.map((i) => ({ ...i, alvo: normalizar(`${i.titulo} ${i.sub || ""}`), alvoTitulo: normalizar(i.titulo) }));
}

function realcar(texto, termos) {
  let html = escapar(texto);
  for (const t of termos) {
    if (t.length < 2) continue;
    const norm = normalizar(texto);
    const i = norm.indexOf(t);
    if (i >= 0) {
      const original = texto.slice(i, i + t.length);
      html = html.replace(escapar(original), `<mark>${escapar(original)}</mark>`);
    }
  }
  return html;
}

function prepararPaleta() {
  const dialogo = $("paleta");
  const entrada = $("paleta-busca");
  const lista = $("paleta-lista");
  let resultados = [];
  let atual = 0;

  const desenhar = () => {
    const termos = normalizar(entrada.value).split(/\s+/).filter(Boolean);
    resultados = (termos.length
      ? itensPaleta
        .filter((i) => termos.every((t) => i.alvo.includes(t)))
        .map((i) => ({ i, nota: termos.reduce((s, t) => s + (i.alvoTitulo.startsWith(t) ? 3 : i.alvoTitulo.includes(t) ? 2 : 0), 0) }))
        .sort((a, b) => b.nota - a.nota)
        .map((r) => r.i)
      : itensPaleta.filter((i) => i.tipo === "Página" || i.tipo === "Ferramenta")
    ).slice(0, 40);
    atual = 0;
    lista.innerHTML = resultados.length
      ? resultados.map((r, n) => `<li role="option" id="op-${n}" data-n="${n}" aria-selected="${n === 0}">
          <span class="tipo">${escapar(r.tipo)}</span><span class="tit">${realcar(r.titulo, termos)}</span>
          ${r.sub ? `<span class="sub">${escapar(r.sub)}</span>` : ""}</li>`).join("")
      : '<li class="paleta__vazio" role="option" aria-disabled="true">Nada encontrado. Tente um sobrenome, um conceito ou o número do capítulo.</li>';
    entrada.setAttribute("aria-activedescendant", resultados.length ? "op-0" : "");
  };
  const mover = (d) => {
    if (!resultados.length) return;
    atual = (atual + d + resultados.length) % resultados.length;
    lista.querySelectorAll("[role=option]").forEach((li, n) => li.setAttribute("aria-selected", String(n === atual)));
    lista.querySelector(`#op-${atual}`)?.scrollIntoView({ block: "nearest" });
    entrada.setAttribute("aria-activedescendant", `op-${atual}`);
  };
  const ir = (n) => {
    const r = resultados[n];
    if (!r) return;
    dialogo.close();
    location.hash = r.destino;
  };

  entrada.addEventListener("input", desenhar);
  entrada.addEventListener("keydown", (ev) => {
    if (ev.key === "ArrowDown") { ev.preventDefault(); mover(1); }
    if (ev.key === "ArrowUp") { ev.preventDefault(); mover(-1); }
    if (ev.key === "Enter") { ev.preventDefault(); ir(atual); }
  });
  lista.addEventListener("click", (ev) => {
    const li = ev.target.closest("[data-n]");
    if (li) ir(Number(li.dataset.n));
  });
  dialogo.addEventListener("click", (ev) => { if (ev.target === dialogo) dialogo.close(); });

  return () => {
    if (dialogo.open) return;
    entrada.value = "";
    desenhar();
    dialogo.showModal();
    entrada.focus();
  };
}

// ========================================================== teclado

function prepararTeclado(abrirPaleta) {
  let esperandoG = 0;
  const destinos = { i: "#/", m: "#/mapa", c: "#/capitulos", f: "#/ferramentas", b: "#/blog" };
  document.addEventListener("keydown", (ev) => {
    const digitando = ev.target.closest("input, textarea, select, [contenteditable]");
    if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === "k") {
      ev.preventDefault();
      abrirPaleta();
      return;
    }
    if (digitando || ev.ctrlKey || ev.metaKey || ev.altKey || document.querySelector("dialog[open]")) return;
    if (ev.key === "/") { ev.preventDefault(); abrirPaleta(); return; }
    if (ev.key === "?") { $("atalhos").showModal(); return; }
    if (ev.key === "g") { esperandoG = Date.now(); return; }
    if (esperandoG && Date.now() - esperandoG < 1200 && destinos[ev.key]) {
      location.hash = destinos[ev.key];
    }
    esperandoG = 0;
  });
}

// Barra fina no topo que mostra quanto da página já foi lido.
function progresso() {
  const barra = $("progresso");
  const alto = document.documentElement.scrollHeight - innerHeight;
  barra.style.setProperty("--lido", alto > 200 ? String(Math.min(1, scrollY / alto)) : "0");
}

// ======================================================= abertura

function iniciarApp(acabouDeEntrar) {
  itensPaleta = montarItens();
  const abrirPaleta = prepararPaleta();
  prepararTeclado(abrirPaleta);
  $("abrir-paleta").addEventListener("click", abrirPaleta);
  $("abrir-atalhos").addEventListener("click", () => $("atalhos").showModal());
  $("link-errata").href = `${pacote.repositorio}/issues/new?labels=errata&title=${encodeURIComponent("Errata: ")}`;
  $("sair").addEventListener("click", () => {
    apagarTudo();
    location.hash = "";
    location.reload();
  });
  addEventListener("hashchange", trocarVista);
  addEventListener("scroll", progresso, { passive: true });

  const abrirSite = () => {
    document.body.dataset.estado = "aberto";
    $("app").hidden = false;
    trocarVista();
  };
  if (acabouDeEntrar && document.startViewTransition && !semMovimento()) {
    document.startViewTransition(abrirSite);
  } else abrirSite();
  if (acabouDeEntrar) avisar(`Bem-vindo, ${ler("leitor")?.nome || "leitor"}.`);
}

document.querySelectorAll("[data-abrir]").forEach((b) => b.addEventListener("click", () => $(b.dataset.abrir).showModal()));

(async () => {
  const chave = ler("chave");
  if (chave) {
    try {
      pacote = await abrir(chave);
      iniciarApp(false);
      return;
    } catch {
      // Chave trocada ou pacote novo: o leitor passa de novo pela entrada.
      gravar("chave", null);
    }
  }
  prepararPortao();
})();
