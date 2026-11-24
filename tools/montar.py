"""Monta o site em _site/, com o conteúdo criptografado.

Uso:
  SITE_KEY=... APPS_SCRIPT_URL=... python3 tools/montar.py   -> docs/
  python3 tools/montar.py --teste                           -> _previa/

O repositório é público, então o conteúdo aberto (conteudo/) nunca vai
para o git: só docs/, com o pacote já cifrado. O GitHub Pages publica
a pasta docs/ do ramo main.

Só a tela de entrada fica aberta. Páginas, posts e dados vão num único
pacote (cofre.bin): JSON comprimido com gzip e cifrado com AES-256-GCM.
A chave (SITE_KEY, 32 bytes em base64) fica com o Apps Script, que só a
entrega depois de gravar o cadastro do leitor.

No modo --teste, a chave também vai embrulhada com o código do livro
(teste.json), para a prévia funcionar sem o Apps Script. Nunca publique
uma montagem de teste.
"""

import base64
import gzip
import hashlib
import html
import json
import os
import re
import secrets
import shutil
import sys
from pathlib import Path

import markdown
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.hashes import SHA256
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

RAIZ = Path(__file__).resolve().parent.parent
TESTE = "--teste" in sys.argv
SAIDA = RAIZ / ("_previa" if TESTE else "docs")
CONTEUDO = RAIZ / "conteudo"
CODIGO = os.environ.get("CODIGO_LIVRO", "IA2026")
CONTATO = "maxbassoul@gmail.com"
REPOSITORIO = "https://github.com/maxbassoul/antes-que-a-ia-reescreva-tudo"
MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho",
         "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"]


def data_extenso(iso):
    ano, mes, dia = (int(p) for p in iso.split("-"))
    return f"{dia} de {MESES[mes - 1]} de {ano}"


def b64(dados):
    return base64.b64encode(dados).decode()


def chave():
    texto = os.environ.get("SITE_KEY", "")
    if texto:
        bruta = base64.b64decode(texto)
        if len(bruta) != 32:
            sys.exit("SITE_KEY precisa ter 32 bytes em base64.")
        return bruta
    if not TESTE:
        sys.exit("Falta SITE_KEY. Use --teste só para prévia local.")
    return secrets.token_bytes(32)


def paginas():
    saida = {}
    for caminho in sorted((CONTEUDO / "fonte" / "paginas").glob("*.html")):
        saida[caminho.stem] = caminho.read_text(encoding="utf-8")
    return saida


def posts():
    lista = []
    for caminho in sorted((CONTEUDO / "fonte" / "posts").glob("*.md")):
        _, cabeca, corpo = caminho.read_text(encoding="utf-8").split("---", 2)
        meta = dict(re.findall(r"(?m)^(\w+):\s*(.+)$", cabeca))
        lista.append({
            "slug": caminho.stem, **meta,
            "data_extenso": data_extenso(meta["data"]),
            "html": markdown.markdown(corpo, extensions=["extra"]),
        })
    return sorted(lista, key=lambda p: p["data"], reverse=True)


def dados():
    return {c.stem: json.loads(c.read_text(encoding="utf-8"))
            for c in sorted((CONTEUDO / "dados").glob("*.json"))}


def cifrar(chave_bytes, conteudo):
    iv = secrets.token_bytes(12)
    return iv + AESGCM(chave_bytes).encrypt(iv, conteudo, None)


def main():
    k = chave()
    if SAIDA.exists():
        shutil.rmtree(SAIDA)
    shutil.copytree(RAIZ / "web", SAIDA)

    pacote = {"paginas": paginas(), "posts": posts(), "dados": dados(),
              "repositorio": REPOSITORIO}
    bruto = json.dumps(pacote, ensure_ascii=False,
                       separators=(",", ":")).encode()
    (SAIDA / "cofre.bin").write_bytes(cifrar(k, gzip.compress(bruto, 9)))

    if TESTE:
        sal = secrets.token_bytes(16)
        kdf = PBKDF2HMAC(algorithm=SHA256(), length=32, salt=sal,
                         iterations=210_000)
        embrulho = kdf.derive(CODIGO.upper().encode())
        (SAIDA / "teste.json").write_text(json.dumps({
            "sal": b64(sal), "iteracoes": 210_000,
            "chave": b64(cifrar(embrulho, k))}), encoding="utf-8")

    config = {
        "appsScriptUrl": "" if TESTE else os.environ.get("APPS_SCRIPT_URL", ""),
        "codigoHash": hashlib.sha256(CODIGO.upper().encode()).hexdigest(),
        "teste": TESTE,
        "contato": CONTATO,
    }
    if not TESTE and not config["appsScriptUrl"]:
        sys.exit("Falta APPS_SCRIPT_URL.")
    modelo = (SAIDA / "index.html").read_text(encoding="utf-8")
    modelo = modelo.replace("__CONFIG__", html.escape(json.dumps(config)))
    modelo = modelo.replace("__CONTATO__", CONTATO)
    (SAIDA / "index.html").write_text(modelo, encoding="utf-8")
    (SAIDA / ".nojekyll").write_text("")

    tamanho = (SAIDA / "cofre.bin").stat().st_size
    print(f"{SAIDA.name}/ montado ({'teste' if TESTE else 'produção'}); "
          f"cofre.bin com {tamanho // 1024} KB")


if __name__ == "__main__":
    main()
