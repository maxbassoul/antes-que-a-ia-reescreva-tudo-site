// Mapa das referências: grafo de obras, capítulos e conceitos, com
// ficha de cada ponto, filtros, endereço compartilhável e o caminho
// mais curto entre dois pontos. O layout é calculado uma vez, sem
// animação contínua; depois o leitor move e aproxima à vontade.
import { escapar, normalizar, semMovimento, copiar } from "../util.js";

const ROTULO_TIPO = { capitulo: "Capítulo", conceito: "Conceito do glossário", obra: "Obra citada" };
const PASSO = {
  cita: "é citada em",
  juntas: "aparece na mesma frase que",
  explica: "ajuda a explicar",
  trata: "é tratado em",
};

function carregarD3() {
  if (window.d3) return Promise.resolve(window.d3);
  return new Promise((ok, falha) => {
    const s = Object.assign(document.createElement("script"), { src: "vendor/d3.min.js" });
    s.onload = () => ok(window.d3);
    s.onerror = falha;
    document.head.append(s);
  });
}

const semDisponivel = (ref) => ref.replace(/ Disponível em:.*$/, "");

export function montar(el, { pacote, rota, navegar }) {
  el.innerHTML = pacote.paginas.mapa;
  const q = (s) => el.querySelector(s);
  const tela = q("#tela");
  const ficha = q("#ficha");
  const busca = q("#busca");
  const filtroCap = q("#filtro-cap");
  const contagem = q("#contagem");
  const tabela = q("#tabela");
  const trilhas = el.querySelectorAll("#trilhas button");
  const tipos = el.querySelectorAll(".tipos input");

  const estado = { busca: "", caps: new Set(), tipos: new Set(["capitulo", "conceito", "obra"]), ativo: null, caminho: null };
  let d3, svg, zoom, enquadrar, centro, selecao, linhas;
  let vivo = true;

  // ---------------------------------------------------------- dados
  const { grafo, capitulos } = pacote.dados;
  const nos = grafo.nos.map((n) => ({ ...n }));
  const porId = new Map(nos.map((n) => [n.id, n]));
  const arestas = grafo.arestas.map((a) => ({ ...a, source: a.origem, target: a.destino }));
  const conceitoPorNome = new Map(nos.filter((n) => n.tipo === "conceito").map((n) => [normalizar(n.rotulo), n]));
  for (const cap of capitulos) {
    for (const nome of cap.conceitos) {
      const k = conceitoPorNome.get(normalizar(nome));
      if (k) arestas.push({ source: k.id, target: `c:${cap.id}`, origem: k.id, destino: `c:${cap.id}`, tipo: "trata" });
    }
  }
  const vizinhos = new Map(nos.map((n) => [n.id, []]));
  for (const a of arestas) {
    vizinhos.get(a.origem)?.push({ outro: a.destino, aresta: a });
    vizinhos.get(a.destino)?.push({ outro: a.origem, aresta: a });
  }
  for (const n of nos) n.grau = vizinhos.get(n.id).length;

  const nomeCap = (n) => (n.numero ? `Cap. ${n.numero}` : n.rotulo.split(":")[0]);
  const nomeLongo = (n) => (n.tipo === "capitulo" && n.numero ? `${nomeCap(n)}: ${n.rotulo}` : n.rotulo);

  for (const n of nos.filter((x) => x.tipo === "capitulo")) {
    filtroCap.append(new Option(n.numero ? `${n.numero}. ${n.rotulo}` : n.rotulo, n.id.slice(2)));
  }
  const porNome = new Map();
  q("#lista-pontos").innerHTML = nos.filter((n) => n.tipo !== "capitulo")
    .sort((a, b) => a.rotulo.localeCompare(b.rotulo, "pt-BR"))
    .map((n) => { porNome.set(normalizar(n.rotulo), n); return `<option value="${escapar(n.rotulo)}">`; }).join("");

  // -------------------------------------------------------- desenho
  const raio = (n) => (n.tipo === "capitulo" ? 9 + Math.sqrt(n.grau) * 1.3
    : n.tipo === "conceito" ? 5 + Math.sqrt(n.grau) * 1.1 : 3.5 + Math.sqrt(n.grau) * 1.2);

  function desenhar() {
    const caixa = tela.getBoundingClientRect();
    const largura = 1000;
    const altura = Math.round(largura * Math.min(1.6, Math.max(0.6, (caixa.height || 576) / (caixa.width || 760))));
    centro = [largura / 2, altura / 2];
    const sim = d3.forceSimulation(nos)
      .force("link", d3.forceLink(arestas).id((d) => d.id)
        .distance((a) => (a.tipo === "juntas" ? 50 : a.tipo === "cita" ? 95 : 70))
        .strength((a) => (a.tipo === "cita" ? 0.25 : 0.15)))
      .force("carga", d3.forceManyBody().strength((d) => (d.tipo === "capitulo" ? -700 : -110)).distanceMax(420))
      .force("colisao", d3.forceCollide().radius((d) => raio(d) + (d.tipo === "capitulo" ? 26 : 6)))
      .force("x", d3.forceX(largura / 2).strength(0.09))
      .force("y", d3.forceY(altura / 2).strength(0.13))
      .stop();
    for (let i = 0; i < 360; i += 1) sim.tick();

    svg = d3.select(tela).insert("svg", ".mapa-zoom")
      .attr("viewBox", [0, 0, largura, altura])
      .attr("role", "group").attr("aria-label", "Mapa das referências");
    const mundo = svg.append("g");
    linhas = mundo.append("g").attr("aria-hidden", "true")
      .selectAll("line").data(arestas).join("line")
      .attr("class", (a) => `aresta${a.tipo === "explica" || a.tipo === "trata" ? " aresta--explica" : ""}`)
      .attr("x1", (a) => a.source.x).attr("y1", (a) => a.source.y)
      .attr("x2", (a) => a.target.x).attr("y2", (a) => a.target.y);

    const ordem = { obra: 0, conceito: 1, capitulo: 2 };
    selecao = mundo.append("g").selectAll("g")
      .data([...nos].sort((a, b) => ordem[a.tipo] - ordem[b.tipo])).join("g")
      .attr("class", (n) => `no no--${n.tipo}`)
      .attr("transform", (n) => `translate(${n.x},${n.y})`)
      .attr("tabindex", 0).attr("role", "button")
      .attr("aria-label", (n) => `${ROTULO_TIPO[n.tipo]}: ${nomeLongo(n)}`)
      .on("click", (ev, n) => escolher(n.id))
      .on("keydown", (ev, n) => {
        if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); escolher(n.id); }
      })
      .on("pointerenter", (ev, n) => { if (!estado.ativo && !estado.caminho) espiar(n.id); })
      .on("pointerleave", () => { if (!estado.ativo && !estado.caminho) aplicar(); });
    selecao.append("circle").attr("r", raio);
    selecao.append("text")
      .attr("class", (n) => (n.tipo === "capitulo" ? "" : n.tipo === "conceito" || n.grau >= 7 ? "rotulo-perto" : "rotulo-oculto"))
      .attr("x", (n) => raio(n) + 4).attr("dy", "0.35em")
      .text((n) => (n.tipo === "capitulo" ? nomeCap(n) : n.tipo === "obra" ? n.autor_curto : n.rotulo));

    zoom = d3.zoom().scaleExtent([0.4, 8]).on("zoom", (ev) => {
      mundo.attr("transform", ev.transform);
      const escalaTela = svg.node().clientWidth / 1000 || 1;
      tela.style.setProperty("--k", ev.transform.k * escalaTela);
      tela.classList.toggle("perto", ev.transform.k > 1.7);
      tela.classList.toggle("longe", ev.transform.k * escalaTela < 0.5);
    });
    svg.call(zoom).on("dblclick.zoom", null);

    const xs = nos.map((n) => n.x);
    const ys = nos.map((n) => n.y);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const k = Math.min(largura / (x1 - x0 + 80), altura / (y1 - y0 + 60));
    enquadrar = d3.zoomIdentity.translate(largura / 2, altura / 2).scale(k).translate(-(x0 + x1) / 2, -(y0 + y1) / 2);
    svg.call(zoom.transform, enquadrar);
  }

  const animar = (alvo) => (semMovimento() ? svg : svg.transition().duration(550));

  function focarEm(ids, escalaMin = 1.6) {
    const pontos = ids.map((id) => porId.get(id));
    const xs = pontos.map((p) => p.x);
    const ys = pontos.map((p) => p.y);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const vb = svg.attr("viewBox").split(",").map(Number);
    const k = ids.length > 1
      ? Math.min(3, Math.max(0.5, Math.min(vb[2] / (x1 - x0 + 200), vb[3] / (y1 - y0 + 160))))
      : Math.min(2.2, Math.max(escalaMin, d3.zoomTransform(svg.node()).k));
    animar().call(zoom.transform, d3.zoomIdentity.translate(...centro).scale(k).translate(-(x0 + x1) / 2, -(y0 + y1) / 2));
  }

  // -------------------------------------------------------- filtros
  const visivel = (n) => estado.tipos.has(n.tipo);
  function casa(n) {
    if (estado.caps.size) {
      const ligado = (n.tipo === "capitulo" && estado.caps.has(n.id.slice(2)))
        || vizinhos.get(n.id).some(({ outro }) => outro.startsWith("c:") && estado.caps.has(outro.slice(2)));
      if (!ligado) return false;
    }
    if (estado.busca) {
      const alvo = normalizar(`${n.rotulo} ${n.autor || ""} ${n.referencia || ""} ${n.definicao || ""}`);
      if (!estado.busca.split(/\s+/).every((t) => alvo.includes(t))) return false;
    }
    return true;
  }

  function aplicar(espiado = null) {
    const ativo = espiado || estado.ativo;
    const noCaminho = estado.caminho ? new Set(estado.caminho.nos) : null;
    const arestasCaminho = estado.caminho ? new Set(estado.caminho.arestas) : null;
    const perto = ativo ? new Set([ativo, ...vizinhos.get(ativo).map((v) => v.outro)]) : null;
    let mostrados = 0;
    selecao
      .style("display", (n) => (visivel(n) || noCaminho?.has(n.id) ? null : "none"))
      .attr("tabindex", (n) => (visivel(n) ? 0 : -1))
      .classed("esmaecido", (n) => (noCaminho ? !noCaminho.has(n.id) : perto ? !perto.has(n.id) : !casa(n)))
      .classed("no--ativo", (n) => n.id === ativo)
      .classed("no--perto", (n) => Boolean(perto?.has(n.id) && n.id !== ativo))
      .classed("no--caminho", (n) => Boolean(noCaminho?.has(n.id)))
      .each((n) => { if (visivel(n) && casa(n)) mostrados += 1; });
    linhas
      .style("display", (a) => ((visivel(a.source) && visivel(a.target)) || arestasCaminho?.has(a) ? null : "none"))
      .classed("esmaecido", (a) => (arestasCaminho ? !arestasCaminho.has(a)
        : perto ? !(a.source.id === ativo || a.target.id === ativo) : !(casa(a.source) && casa(a.target))))
      .classed("destacado", (a) => Boolean(ativo && (a.source.id === ativo || a.target.id === ativo)))
      .classed("no-caminho", (a) => Boolean(arestasCaminho?.has(a)));
    if (espiado) return;
    contagem.textContent = `${mostrados} de ${nos.filter(visivel).length} pontos correspondem aos filtros.`;
    preencherTabela();
    trilhas.forEach((b) => {
      const caps = b.dataset.caps.split(" ");
      b.setAttribute("aria-pressed", String(caps.length === estado.caps.size && caps.every((c) => estado.caps.has(c))));
    });
  }
  const espiar = (id) => aplicar(id);

  function preencherTabela() {
    const obras = nos.filter((n) => n.tipo === "obra" && casa(n)).sort((a, b) => a.rotulo.localeCompare(b.rotulo, "pt-BR"));
    tabela.innerHTML = obras.map((o) => {
      const ref = o.url
        ? `${escapar(semDisponivel(o.referencia))} <a href="${escapar(o.url)}" target="_blank" rel="noopener">Página oficial<span class="visualmente-oculto"> de ${escapar(o.rotulo)}</span></a>`
        : escapar(o.referencia);
      const caps = o.capitulos.map((c) => nomeCap(porId.get(`c:${c}`))).join(", ");
      return `<tr><td><button type="button" class="link" data-ir="${escapar(o.id)}">${escapar(o.rotulo)}</button><br>${ref}</td><td>${escapar(o.formato)}</td><td>${escapar(caps)}</td></tr>`;
    }).join("") || '<tr><td colspan="3">Nenhuma obra corresponde aos filtros. Limpe a busca ou escolha outro capítulo.</td></tr>';
  }

  // ---------------------------------------------------------- ficha
  const botao = (id) => `<button type="button" class="link" data-ir="${escapar(id)}">${escapar(nomeLongo(porId.get(id)))}</button>`;
  function grupo(titulo, ligs, comFrase) {
    if (!ligs.length) return "";
    const vistos = new Set();
    return `<h3>${titulo} <span class="nota">(${new Set(ligs.map((l) => l.outro)).size})</span></h3><ul>${ligs
      .filter(({ outro }) => (vistos.has(outro) ? false : vistos.add(outro)))
      .map(({ outro, aresta }) => `<li>${botao(outro)}${comFrase && aresta.frase ? `<span class="por-que">${escapar(aresta.frase)}</span>` : ""}</li>`)
      .join("")}</ul>`;
  }

  function fichaInicial() {
    ficha.innerHTML = `<h2 id="ficha-titulo">Escolha um ponto</h2>
      <p class="ref">Os círculos escuros são capítulos, os azuis são conceitos do glossário e os claros são obras. O tamanho cresce com o número de ligações.</p>
      <p class="ref">Passe o ponteiro para ver os vizinhos. Arraste o fundo para mover e use a roda do mouse ou a pinça para aproximar.</p>
      <p class="ref"><button type="button" class="link" data-sortear>Mostrar uma obra ao acaso</button></p>`;
  }

  function mostrarFicha(n) {
    const ligs = vizinhos.get(n.id);
    const de = (tipo, alvo) => ligs.filter((l) => l.aresta.tipo === tipo && porId.get(l.outro).tipo === alvo);
    let html = `<p class="tipo-ficha">${ROTULO_TIPO[n.tipo]}</p>`;
    if (n.tipo === "obra") {
      html += `<h2 id="ficha-titulo">${escapar(n.rotulo)}</h2>
        <p class="ref">${escapar(semDisponivel(n.referencia))}</p>
        ${n.url ? `<p class="ref"><a href="${escapar(n.url)}" target="_blank" rel="noopener">Abrir a página oficial</a></p>` : ""}
        ${grupo("Onde o livro cita", de("cita", "capitulo"), true)}
        ${grupo("Conceitos que ajuda a explicar", de("explica", "conceito"), true)}
        ${grupo("Citada junto com", de("juntas", "obra"), true)}`;
    } else if (n.tipo === "conceito") {
      html += `<h2 id="ficha-titulo">${escapar(n.rotulo)}</h2>
        <p class="ref">${escapar(n.definicao)}</p>
        ${grupo("Capítulos que tratam do conceito", de("trata", "capitulo"), false)}
        ${grupo("Obras que ajudam a explicar", de("explica", "obra"), true)}`;
    } else {
      html += `<h2 id="ficha-titulo">${escapar(nomeLongo(n))}</h2>
        <p class="ref"><a href="#/capitulos/${escapar(n.id.slice(2))}">Objetivos e materiais do capítulo</a></p>
        ${grupo("Conceitos", de("trata", "conceito"), false)}
        ${grupo("Obras citadas", de("cita", "obra"), true)}`;
    }
    html += `<div class="ficha__acoes">
      <button type="button" class="link" data-copiar-link>Copiar link deste ponto</button>
      ${n.tipo !== "capitulo" ? '<button type="button" class="link" data-caminho-de>Usar como início de um caminho</button>' : ""}
      <button type="button" class="link" data-limpar>Voltar ao mapa inteiro</button></div>`;
    ficha.innerHTML = html;
    ficha.scrollTop = 0;
  }

  function escolher(id, { mover = true, endereco = true } = {}) {
    estado.ativo = id;
    estado.caminho = null;
    q("#caminho-passos").innerHTML = "";
    mostrarFicha(porId.get(id));
    aplicar();
    if (endereco) gravarEndereco();
    if (mover) focarEm([id]);
  }

  function limpar() {
    estado.ativo = null;
    estado.caminho = null;
    q("#caminho-passos").innerHTML = "";
    fichaInicial();
    aplicar();
    gravarEndereco();
    animar().call(zoom.transform, enquadrar);
  }

  // -------------------------------------------------------- caminho
  // Busca em largura: a menor sequência de ligações entre dois pontos.
  function caminhoEntre(a, b) {
    const anterior = new Map([[a, null]]);
    const fila = [a];
    while (fila.length) {
      const atual = fila.shift();
      if (atual === b) break;
      for (const { outro, aresta } of vizinhos.get(atual)) {
        if (!anterior.has(outro)) { anterior.set(outro, { de: atual, aresta }); fila.push(outro); }
      }
    }
    if (!anterior.has(b)) return null;
    const passos = [];
    for (let at = b; anterior.get(at); at = anterior.get(at).de) passos.unshift({ de: anterior.get(at).de, para: at, aresta: anterior.get(at).aresta });
    return passos;
  }

  function mostrarCaminho(a, b) {
    const lista = q("#caminho-passos");
    if (a === b) { lista.innerHTML = "<li>Escolha dois pontos diferentes.</li>"; return; }
    const passos = caminhoEntre(a, b);
    if (!passos) { lista.innerHTML = "<li>Esses dois pontos não se ligam no mapa.</li>"; return; }
    estado.ativo = null;
    estado.caminho = { nos: [a, ...passos.map((p) => p.para)], arestas: passos.map((p) => p.aresta) };
    lista.innerHTML = passos.map((p) => {
      const sentido = p.aresta.origem === p.de;
      const [x, y] = sentido ? [p.de, p.para] : [p.para, p.de];
      return `<li><strong>${botao(x)}</strong> ${PASSO[p.aresta.tipo]} <strong>${botao(y)}</strong>
        ${p.aresta.frase ? `<span class="por-que">${escapar(p.aresta.frase)}</span>` : ""}</li>`;
    }).join("");
    lista.insertAdjacentHTML("afterbegin", `<p class="nota">${passos.length} ${passos.length === 1 ? "ligação" : "ligações"} de distância.</p>`);
    fichaInicial();
    aplicar();
    focarEm(estado.caminho.nos);
    tela.scrollIntoView({ behavior: semMovimento() ? "auto" : "smooth", block: "center" });
  }

  const acharPonto = (texto) => porNome.get(normalizar(texto.trim()))
    || nos.find((n) => n.tipo !== "capitulo" && normalizar(n.rotulo).includes(normalizar(texto.trim())));

  q("#form-caminho").addEventListener("submit", (ev) => {
    ev.preventDefault();
    const a = acharPonto(q("#caminho-de").value);
    const b = acharPonto(q("#caminho-para").value);
    if (!a || !b) {
      q("#caminho-passos").innerHTML = `<li>Não encontrei ${!a ? "o ponto de partida" : "o ponto de chegada"}. Escolha um nome da lista que aparece ao digitar.</li>`;
      return;
    }
    q("#caminho-de").value = a.rotulo;
    q("#caminho-para").value = b.rotulo;
    mostrarCaminho(a.id, b.id);
  });
  q("#caminho-sorte").addEventListener("click", () => {
    const obras = nos.filter((n) => n.tipo === "obra");
    const a = obras[Math.floor(Math.random() * obras.length)];
    let b = a;
    while (b === a) b = obras[Math.floor(Math.random() * obras.length)];
    q("#caminho-de").value = a.rotulo;
    q("#caminho-para").value = b.rotulo;
    mostrarCaminho(a.id, b.id);
  });

  // ------------------------------------------- endereço compartilhável
  function gravarEndereco() {
    const p = new URLSearchParams();
    if (estado.caps.size) p.set("cap", [...estado.caps].join(","));
    if (estado.ativo) p.set("no", estado.ativo);
    if (busca.value.trim()) p.set("busca", busca.value.trim());
    const alvo = `#/mapa${p.toString() ? `?${p}` : ""}`;
    if (location.hash !== alvo) history.replaceState(null, "", alvo);
  }

  function lerEndereco(r) {
    const p = r.params;
    estado.caps = new Set(p.get("cap") ? p.get("cap").split(",") : []);
    filtroCap.value = estado.caps.size === 1 ? [...estado.caps][0] : "";
    busca.value = p.get("busca") || "";
    estado.busca = normalizar(busca.value.trim());
    const no = p.get("no");
    if (no && porId.has(no)) escolher(no, { endereco: false });
    else {
      estado.ativo = null;
      fichaInicial();
      aplicar();
    }
  }

  // --------------------------------------------------------- eventos
  let espera;
  busca.addEventListener("input", () => {
    clearTimeout(espera);
    espera = setTimeout(() => {
      estado.busca = normalizar(busca.value.trim());
      estado.ativo = null;
      estado.caminho = null;
      aplicar();
      gravarEndereco();
    }, 120);
  });
  filtroCap.addEventListener("change", () => {
    estado.caps = new Set(filtroCap.value ? [filtroCap.value] : []);
    estado.ativo = null;
    aplicar();
    gravarEndereco();
  });
  trilhas.forEach((b) => b.addEventListener("click", () => {
    const ja = b.getAttribute("aria-pressed") === "true";
    estado.caps = new Set(ja ? [] : b.dataset.caps.split(" "));
    filtroCap.value = "";
    estado.ativo = null;
    aplicar();
    gravarEndereco();
  }));
  tipos.forEach((c) => c.addEventListener("change", () => {
    if (c.checked) estado.tipos.add(c.value); else estado.tipos.delete(c.value);
    aplicar();
  }));
  q("#controles").addEventListener("submit", (ev) => ev.preventDefault());
  el.querySelectorAll("[data-zoom]").forEach((b) => b.addEventListener("click", () => {
    const f = Number(b.dataset.zoom);
    if (!f) animar().call(zoom.transform, enquadrar);
    else animar().call(zoom.scaleBy, f);
  }));
  el.addEventListener("click", (ev) => {
    const ir = ev.target.closest("[data-ir]");
    if (ir) {
      escolher(ir.dataset.ir);
      if (ir.closest(".lista-obras, .caminho")) tela.scrollIntoView({ behavior: semMovimento() ? "auto" : "smooth", block: "center" });
      else ficha.focus({ preventScroll: true });
      return;
    }
    if (ev.target.closest("[data-limpar]")) limpar();
    if (ev.target.closest("[data-sortear]")) {
      const obras = nos.filter((n) => n.tipo === "obra");
      escolher(obras[Math.floor(Math.random() * obras.length)].id);
    }
    if (ev.target.closest("[data-copiar-link]")) copiar(location.href, "Link do ponto copiado.");
    if (ev.target.closest("[data-caminho-de]")) {
      q("#caminho-de").value = porId.get(estado.ativo).rotulo;
      q("#caminho-para").focus();
      q("#caminho-para").scrollIntoView({ behavior: semMovimento() ? "auto" : "smooth", block: "center" });
    }
  });
  const teclas = (ev) => {
    if (ev.key === "Escape" && !document.querySelector("dialog[open]") && (estado.ativo || estado.caminho)) limpar();
  };
  document.addEventListener("keydown", teclas);

  fichaInicial();
  carregarD3().then((lib) => {
    if (!vivo) return;
    d3 = lib;
    desenhar();
    lerEndereco(rota);
  }).catch(() => {
    ficha.innerHTML = '<h2 id="ficha-titulo">O mapa não carregou</h2><p class="ref">Recarregue a página. A lista de obras abaixo usa os mesmos dados.</p>';
    preencherTabela();
  });

  return {
    limpar: () => { vivo = false; document.removeEventListener("keydown", teclas); },
    atualizar: (r) => { if (svg) lerEndereco(r); },
  };
}
