// Lista de posts e página de cada post.
import { escapar } from "../util.js";

function minutos(html) {
  const palavras = html.replace(/<[^>]+>/g, " ").split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(palavras / 220));
}

export function montar(el, { pacote, rota }) {
  const slug = rota.resto[0];
  const post = slug && pacote.posts.find((p) => p.slug === slug);
  if (post) {
    el.dataset.titulo = post.titulo;
    el.innerHTML = `<article class="faixa post">
      <p><a href="#/blog">Blog</a></p>
      <time datetime="${escapar(post.data)}">${escapar(post.data_extenso)}</time>
      <span class="etiqueta">${escapar(post.etiqueta)}</span>
      <h1>${escapar(post.titulo)}</h1>
      <p class="tempo">Leitura de ${minutos(post.html)} min</p>
      <div class="corpo">${post.html}</div>
    </article>`;
    // Links do post para fora do site abrem em outra aba.
    el.querySelectorAll('.corpo a[href^="http"]').forEach((a) => { a.target = "_blank"; a.rel = "noopener"; });
    return () => { delete el.dataset.titulo; };
  }
  el.innerHTML = `<section class="faixa">
    <h1>Blog</h1>
    <p class="lead">O que muda depois que o livro vai para a gráfica: novas pesquisas sobre agentes e arquitetura, erratas e versões novas das ferramentas.</p>
    <ol class="post-lista" aria-label="Posts, do mais recente ao mais antigo">
      ${pacote.posts.map((p) => `<li>
        <time datetime="${escapar(p.data)}">${escapar(p.data_extenso)}</time>
        <span class="etiqueta">${escapar(p.etiqueta)}</span>
        <h2><a href="#/blog/${escapar(p.slug)}">${escapar(p.titulo)}</a></h2>
        <p>${escapar(p.resumo)}</p>
      </li>`).join("") || "<li>Ainda não há posts.</li>"}
    </ol>
  </section>`;
  return null;
}
