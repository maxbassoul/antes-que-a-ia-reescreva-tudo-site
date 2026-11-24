// A página de privacidade usa o mesmo texto do diálogo da entrada.
export function montar(el) {
  const fonte = document.getElementById("privacidade").cloneNode(true);
  fonte.querySelector("form")?.remove();
  el.innerHTML = `<section class="faixa"><div class="texto">${fonte.innerHTML.replace(/<h2 id="priv-titulo">/, "<h1>").replace("</h2>", "</h1>")}</div></section>`;
}
