// Abre o pacote cifrado do site (cofre.json, campo "dados" em base64):
// 12 bytes de vetor inicial, depois o JSON comprimido com gzip e
// cifrado com AES-256-GCM.
import { deBase64 } from "./util.js";

let bruto;

async function pacoteCifrado() {
  if (!bruto) {
    const resposta = await fetch("cofre.json", { cache: "no-cache" });
    if (!resposta.ok) throw new Error("cofre indisponível");
    bruto = deBase64((await resposta.json()).dados);
  }
  return bruto;
}

async function descomprimir(bytes) {
  const fluxo = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Response(fluxo).text();
}

// Devolve o pacote aberto ou lança erro se a chave não servir.
export async function abrir(chaveBase64) {
  const chave = await crypto.subtle.importKey("raw", deBase64(chaveBase64), "AES-GCM", false, ["decrypt"]);
  const dados = await pacoteCifrado();
  const claro = await crypto.subtle.decrypt({ name: "AES-GCM", iv: dados.slice(0, 12) }, chave, dados.slice(12));
  return JSON.parse(await descomprimir(claro));
}

// Só na prévia: a chave vem embrulhada com o código do livro.
export async function chaveDeTeste(codigo) {
  const teste = await (await fetch("teste.json")).json();
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(codigo), "PBKDF2", false, ["deriveKey"]);
  const embrulho = await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: deBase64(teste.sal), iterations: teste.iteracoes, hash: "SHA-256" },
    base, { name: "AES-GCM", length: 256 }, false, ["decrypt"],
  );
  const dados = deBase64(teste.chave);
  const k = await crypto.subtle.decrypt({ name: "AES-GCM", iv: dados.slice(0, 12) }, embrulho, dados.slice(12));
  return btoa(String.fromCharCode(...new Uint8Array(k)));
}
