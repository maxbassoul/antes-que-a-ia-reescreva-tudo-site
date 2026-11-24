// Página inicial: planta animada, números e atalhos para o resto.
import { ler, copiar, contarAoVer, semMovimento } from "../util.js";

const LEGENDAS = {
  contido: "Com regras no repositório, o pipeline mantém cada módulo no lugar e só as dependências desenhadas existem.",
  deriva: "Sem contenção, cada mudança feita às pressas afasta um módulo do lugar e cria dependências que ninguém desenhou, marcadas em azul tracejado.",
};

export function montar(el, { pacote }) {
  el.innerHTML = pacote.paginas.inicio;

  const leitor = ler("leitor");
  const saudacao = el.querySelector("[data-saudacao]");
  if (leitor?.nome) {
    const hora = new Date().getHours();
    const turno = hora < 12 ? "Bom dia" : hora < 18 ? "Boa tarde" : "Boa noite";
    saudacao.textContent = `${turno}, ${leitor.nome}.`;
  }

  // A planta alterna entre deriva e contenção; sozinha, mostra a deriva
  // uma vez e volta, para o leitor ver o que o botão faz.
  const planta = el.querySelector("[data-planta]");
  const legenda = el.querySelector("#planta-legenda");
  const botoes = planta.querySelectorAll("[data-estado-planta]");
  const mostrar = (estado) => {
    planta.dataset.estado = estado;
    legenda.textContent = LEGENDAS[estado];
    botoes.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.estadoPlanta === estado)));
  };
  botoes.forEach((b) => b.addEventListener("click", () => {
    clearTimeout(demo);
    mostrar(b.dataset.estadoPlanta);
  }));
  mostrar("contido");
  let demo;
  if (!semMovimento()) {
    demo = setTimeout(() => {
      mostrar("deriva");
      demo = setTimeout(() => mostrar("contido"), 2600);
    }, 900);
  }

  // Os números vêm dos próprios dados do mapa.
  const { grafo } = pacote.dados;
  const valores = {
    obras: grafo.nos.filter((n) => n.tipo === "obra").length,
    conceitos: grafo.nos.filter((n) => n.tipo === "conceito").length,
    arestas: grafo.arestas.length,
  };
  el.querySelectorAll("[data-contar-dado]").forEach((d) => {
    d.dataset.alvo = valores[d.dataset.contarDado];
    d.textContent = valores[d.dataset.contarDado];
  });
  el.querySelectorAll("[data-contar]").forEach((d) => { d.dataset.alvo = d.dataset.contar; });
  const parar = contarAoVer(el.querySelectorAll("[data-alvo]"));

  el.querySelectorAll("[data-copiar]").forEach((b) => b.addEventListener("click", () => {
    copiar(b.parentElement.querySelector("pre").textContent, "Comandos copiados.");
  }));

  return () => {
    clearTimeout(demo);
    parar();
  };
}
