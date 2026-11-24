// Capítulos: um bloco por capítulo, filtro por parte, índice que
// acompanha a leitura e marca de "lido" guardada no navegador.
import { escapar, ler, gravar, avisar } from "../util.js";

const PARTES = { 1: ["01", "02", "03", "04"], 2: ["05", "06", "07", "08"], 3: ["09", "10", "11", "12", "13"], 4: ["14", "15", "16"] };

const itens = (arr) => arr.map((t) => `<li>${escapar(t)}</li>`).join("");

function bloco(cap, materiais, lidos, repositorio) {
  const id = `cap-${cap.id}`;
  const rotulo = cap.numero ? `Capítulo ${cap.numero}` : cap.titulo;
  const partes = [];
  if (cap.objetivos.length) partes.push(`<h3>Ao terminar, você consegue</h3><ul>${itens(cap.objetivos)}</ul>`);
  if (cap.resumo.length) {
    partes.push(`<h3>Pontos principais</h3><ul>${itens(cap.resumo.slice(0, 3))}</ul>`);
    if (cap.resumo.length > 3) partes.push(`<details><summary>Mais ${cap.resumo.length - 3} pontos</summary><ul>${itens(cap.resumo.slice(3))}</ul></details>`);
  }
  if (cap.conceitos.length) {
    partes.push(`<h3>Conceitos</h3><ul class="chips">${cap.conceitos
      .map((c) => `<li><a href="#/mapa?busca=${encodeURIComponent(c)}">${escapar(c)}</a></li>`).join("")}</ul>`);
  }
  const meus = materiais.filter((m) => m.capitulos.includes(cap.id));
  if (meus.length) {
    partes.push(`<h3>Materiais no repositório</h3><ul>${meus
      .map((m) => `<li><a href="${escapar(m.url)}" target="_blank" rel="noopener">${escapar(m.titulo)}</a></li>`).join("")}</ul>`);
  }
  const n = cap.obras.length;
  const errata = `${repositorio}/issues/new?labels=errata&title=${encodeURIComponent(`Errata (${rotulo}): `)}`;
  const lido = lidos.includes(cap.id);
  partes.push(`<p class="acoes">
    <a href="#/mapa?cap=${escapar(cap.id)}">Ver ${n} ${n === 1 ? "fonte" : "fontes"} no mapa</a>
    <a href="${errata}" target="_blank" rel="noopener">Reportar errata</a>
    <button type="button" class="link" data-lido="${escapar(cap.id)}" aria-pressed="${lido}">${lido ? "Desmarcar como lido" : "Marcar como lido"}</button>
  </p>`);
  return `<article class="capitulo" id="${id}" data-cap="${escapar(cap.id)}" aria-labelledby="${id}-t">
    <p class="capitulo__num" aria-hidden="true">${cap.numero ? String(cap.numero).padStart(2, "0") : "·"}</p>
    <div>
      <h2 id="${id}-t">${cap.numero ? `<span class="visualmente-oculto">Capítulo ${cap.numero}: </span>` : ""}${escapar(cap.titulo)}${lido ? '<span class="lido-marca">lido</span>' : ""}</h2>
      ${partes.join("\n")}
    </div>
  </article>`;
}

export function montar(el, { pacote, rota, navegar }) {
  el.innerHTML = pacote.paginas.capitulos;
  const { capitulos, materiais } = pacote.dados;
  const lista = el.querySelector("#lista-capitulos");
  const indice = el.querySelector("#indice-lista");
  const botoesParte = el.querySelectorAll("#partes button");
  let lidos = ler("lidos") || [];

  const desenhar = () => {
    lista.innerHTML = capitulos.map((c) => bloco(c, materiais, lidos, pacote.repositorio)).join("");
    indice.innerHTML = capitulos.map((c) => `<li data-cap="${escapar(c.id)}"><a href="#/capitulos/${escapar(c.id)}">${c.numero ? `${c.numero}. ` : ""}${escapar(c.titulo)}${lidos.includes(c.id) ? " ✓" : ""}</a></li>`).join("");
  };

  const filtrar = (parte) => {
    const caps = PARTES[parte];
    el.querySelectorAll("[data-cap]").forEach((n) => { n.hidden = Boolean(caps && !caps.includes(n.dataset.cap)); });
    botoesParte.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.parte === (parte || ""))));
  };

  // O índice marca o capítulo que está na tela.
  let espiao;
  const vigiar = () => {
    espiao?.disconnect();
    espiao = new IntersectionObserver((entradas) => {
      for (const e of entradas) {
        if (!e.isIntersecting) continue;
        indice.querySelectorAll("a").forEach((a) => a.removeAttribute("aria-current"));
        indice.querySelector(`[data-cap="${e.target.dataset.cap}"] a`)?.setAttribute("aria-current", "true");
      }
    }, { rootMargin: "-30% 0px -60% 0px" });
    lista.querySelectorAll(".capitulo").forEach((c) => espiao.observe(c));
  };

  const irPara = (r) => {
    filtrar(r.params.get("parte") || "");
    const alvo = r.resto[0] && el.querySelector(`#cap-${CSS.escape(r.resto[0])}`);
    if (alvo) {
      alvo.hidden = false;
      alvo.scrollIntoView({ block: "start" });
      alvo.querySelector("h2").setAttribute("tabindex", "-1");
      alvo.querySelector("h2").focus({ preventScroll: true });
    }
  };

  desenhar();
  vigiar();
  irPara(rota);

  botoesParte.forEach((b) => b.addEventListener("click", () => {
    navegar(b.dataset.parte ? `#/capitulos?parte=${b.dataset.parte}` : "#/capitulos", { substituir: true });
  }));
  lista.addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-lido]");
    if (!b) return;
    const id = b.dataset.lido;
    lidos = lidos.includes(id) ? lidos.filter((x) => x !== id) : [...lidos, id];
    gravar("lidos", lidos);
    const rolagem = scrollY;
    desenhar();
    vigiar();
    filtrar(new URLSearchParams(location.hash.split("?")[1] || "").get("parte") || "");
    scrollTo({ top: rolagem });
    el.querySelector(`[data-lido="${CSS.escape(id)}"]`)?.focus({ preventScroll: true });
    const total = capitulos.filter((c) => c.numero).length;
    const feitos = lidos.filter((x) => /^\d+$/.test(x)).length;
    avisar(lidos.includes(id) ? `Marcado como lido. ${feitos} de ${total} capítulos.` : "Marca de lido removida.");
  });

  return { limpar: () => espiao?.disconnect(), atualizar: irPara };
}
