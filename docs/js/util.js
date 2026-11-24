// Funções pequenas usadas por todo o site.

const PREFIXO = "aiq:";
const memoria = new Map();

// O armazenamento local falha em algumas janelas anônimas; aí o site
// guarda o estado só enquanto a página estiver aberta.
export function ler(chave) {
  try {
    const valor = localStorage.getItem(PREFIXO + chave);
    return valor === null ? memoria.get(chave) ?? null : JSON.parse(valor);
  } catch {
    return memoria.get(chave) ?? null;
  }
}

export function gravar(chave, valor) {
  memoria.set(chave, valor);
  try {
    localStorage.setItem(PREFIXO + chave, JSON.stringify(valor));
  } catch {
    /* segue só com a memória */
  }
}

export function apagarTudo() {
  memoria.clear();
  try {
    Object.keys(localStorage).filter((k) => k.startsWith(PREFIXO)).forEach((k) => localStorage.removeItem(k));
  } catch {
    /* nada a apagar */
  }
}

export function escapar(texto) {
  return String(texto ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export function normalizar(texto) {
  return String(texto ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export async function sha256(texto) {
  const resumo = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto));
  return [...new Uint8Array(resumo)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function deBase64(texto) {
  return Uint8Array.from(atob(texto), (c) => c.charCodeAt(0));
}

export const semMovimento = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// Aviso curto no pé da tela, lido também pelos leitores de tela.
let brinde;
export function avisar(texto) {
  if (!brinde) {
    brinde = document.createElement("div");
    brinde.className = "brinde";
    brinde.setAttribute("role", "status");
    document.body.append(brinde);
  }
  brinde.textContent = texto;
  brinde.classList.add("visivel");
  clearTimeout(avisar.t);
  avisar.t = setTimeout(() => brinde.classList.remove("visivel"), 2200);
}

export async function copiar(texto, mensagem = "Copiado.") {
  try {
    await navigator.clipboard.writeText(texto);
    avisar(mensagem);
  } catch {
    avisar("O navegador não deixou copiar. Selecione o texto e use Ctrl C.");
  }
}

export function baixar(nome, texto, tipo = "text/markdown") {
  const url = URL.createObjectURL(new Blob([texto], { type: `${tipo};charset=utf-8` }));
  const a = Object.assign(document.createElement("a"), { href: url, download: nome });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  avisar(`${nome} baixado.`);
}

// Conta de 0 até o valor do elemento quando ele aparece na tela.
export function contarAoVer(elementos) {
  const formato = (v, casas) => v.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
  const observador = new IntersectionObserver((entradas) => {
    for (const { target: el, isIntersecting } of entradas) {
      if (!isIntersecting) continue;
      observador.unobserve(el);
      const alvo = Number(el.dataset.alvo);
      const casas = Number(el.dataset.casas || 0);
      const sufixo = el.dataset.sufixo || "";
      if (semMovimento()) continue;
      const inicio = performance.now();
      const passo = (agora) => {
        const t = Math.min(1, (agora - inicio) / 1100);
        const v = alvo * (1 - (1 - t) ** 3);
        el.textContent = formato(v, casas) + sufixo;
        if (t < 1) requestAnimationFrame(passo);
      };
      requestAnimationFrame(passo);
    }
  }, { threshold: 0.6 });
  elementos.forEach((el) => observador.observe(el));
  return () => observador.disconnect();
}
