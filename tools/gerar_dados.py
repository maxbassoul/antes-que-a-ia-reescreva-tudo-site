"""Gera os dados do site a partir do LaTeX do livro.

Uso: python3 tools/gerar_dados.py CAMINHO_DO_LIVRO conteudo/dados

Produz tres arquivos JSON:
  grafo.json     obras, conceitos, capitulos e as conexoes entre eles
  indice.json    entradas para a busca unificada
  capitulos.json objetivos, resumo, conceitos e obras de cada capitulo

Cada conexao guarda a frase do livro que a justifica, encurtada.
"""

import json
import re
import sys
import unicodedata
from pathlib import Path

LIVRO = Path(sys.argv[1])
SAIDA = Path(sys.argv[2])
SAIDA.mkdir(parents=True, exist_ok=True)

# (identificador, arquivo, titulo quando o arquivo nao tem \chapter)
ORDEM = ([("prefacio", "pretextuais/prefacio.tex", None),
          ("intro", "capitulos/introducao.tex", None)]
         + [(f"{n:02d}", f"capitulos/cap{n:02d}.tex", None)
            for n in range(1, 17)]
         + [("apendices", "postextuais/apendices.tex", "Apêndices"),
            ("posfacio", "postextuais/posfacio.tex", None)])

# Conceitos genericos demais ligariam tudo a tudo no grafo.
GENERICOS = {"agente de programacao", "prompt", "benchmark",
             "pull request", "pipeline", "token"}


def sem_acento(texto):
    """Tira acentos para comparar palavras."""
    nfkd = unicodedata.normalize("NFKD", texto)
    return "".join(c for c in nfkd if not unicodedata.combining(c))


def slug(texto):
    """Transforma um nome num identificador curto."""
    base = sem_acento(texto).lower()
    return re.sub(r"[^a-z0-9]+", "-", base).strip("-")[:60]


def ler(caminho):
    """Le um arquivo .tex sem comentarios, abrindo os \\input."""
    texto = caminho.read_text(encoding="utf-8")
    texto = re.sub(r"(?m)(?<!\\)%.*$", "", texto)

    def abrir(m):
        alvo = LIVRO / (m.group(1) + ".tex")
        return ler(alvo) if alvo.exists() else ""
    return re.sub(r"\\input\{([^}]*)\}", abrir, texto)


def grupo(texto, inicio):
    """Devolve o conteudo entre chaves que abre em `inicio`."""
    nivel = 0
    for i in range(inicio, len(texto)):
        if texto[i] == "{":
            nivel += 1
        elif texto[i] == "}":
            nivel -= 1
            if nivel == 0:
                return texto[inicio + 1:i], i + 1
    return texto[inicio + 1:], len(texto)


# ---------------------------------------------------------------- obras
refs_tex = ler(LIVRO / "referencias" / "referencias.tex")
obras = {}
for m in re.finditer(r"\\defref", refs_tex):
    pos = m.end()
    campos = []
    for _ in range(5):
        while refs_tex[pos] != "{":
            pos += 1
        conteudo, pos = grupo(refs_tex, pos)
        campos.append(conteudo)
    chave, narrativo, parenteses, ano, entrada = campos
    narrativo, parenteses = (
        re.sub(r"\\etal\b\s*", "et al.", c).replace("~", " ")
        for c in (narrativo, parenteses))
    url = re.search(r"\\url\{([^}]*)\}", entrada)
    obras[chave] = {
        "id": chave,
        "autor": narrativo,
        "autor_curto": parenteses,
        "ano": ano,
        "url": url.group(1) if url else None,
        "entrada": entrada,
        "capitulos": [],
    }


def limpar(texto):
    """Converte um trecho de LaTeX em texto simples."""
    def citacao(m):
        comando, nota, chaves = m.group(1), m.group(2), m.group(3)
        partes = []
        for chave in chaves.split(","):
            obra = obras.get(chave.strip())
            if not obra:
                continue
            if comando == "citen":
                partes.append(f"{obra['autor']} ({obra['ano']})")
            else:
                partes.append(f"{obra['autor_curto']}, {obra['ano']}")
        texto_nota = f", {nota}" if nota else ""
        if comando == "citen":
            return "; ".join(partes)
        return "(" + "; ".join(partes) + texto_nota + ")"

    t = re.sub(r"\\(citen|citepv|citep|citeano)(?:\[([^\]]*)\])?\{([^}]*)\}",
               citacao, texto)
    t = re.sub(r"\\index\[[^\]]*\]\{[^}]*\}", "", t)
    t = re.sub(r"\\(label|pdfbookmark)(\[[^\]]*\])?\{[^}]*\}(\{[^}]*\})?",
               "", t)
    t = re.sub(r"Cap[ií]tulos?~\\ref\{cap:(\d+)\}",
               lambda m: f"Capítulo {int(m.group(1))}", t)
    t = re.sub(r"\\ref\{[^}]*\}", "", t)
    t = re.sub(r"\\url\{([^}]*)\}", r"\1", t)
    t = re.sub(r"\\(textbf|emph|termo|texttt|textit|textsc|mbox)\{([^}]*)\}",
               r"\2", t)
    t = re.sub(r"\\(opiniao|acesso|semlocal|etal|medskip|par|noindent)\b",
               lambda m: {"acesso": "", "semlocal": "[S. l.]",
                          "etal": "et al."}.get(m.group(1), ""), t)
    t = t.replace("\\\\", " ").replace("\\ ", " ")
    t = t.replace("~", " ").replace("\\%", "%").replace("\\$", "$")
    t = t.replace("\\&", "&").replace("\\_", "_").replace("\\,", " ")
    t = t.replace("``", "“").replace("''", "”").replace("\\ldots", "…")
    t = re.sub(r"`([^`']*)'", r"‘\1’", t)
    t = t.replace("\\times", "×").replace("\\#", "#")
    t = re.sub(r"\$([^$]*)\$", r"\1", t)
    t = re.sub(r"\\[a-zA-Z]+\*?", "", t)
    t = t.replace("{", "").replace("}", "")
    return re.sub(r"\s+", " ", t).strip()


for obra in obras.values():
    obra["referencia"] = limpar(obra.pop("entrada"))
    texto = obra["referencia"].lower()
    if obra["url"] and ("arxiv" in obra["url"] or "doi.org" in obra["url"]):
        obra["formato"] = "artigo"
    elif "lei n" in texto or "decreto" in texto or "regulamento" in texto \
            or "resolução" in texto:
        obra["formato"] = "norma"
    elif obra["url"]:
        obra["formato"] = "página"
    else:
        obra["formato"] = "livro ou artigo impresso"

# ------------------------------------------------------------ conceitos
glossario = ler(LIVRO / "postextuais" / "glossario.tex")
conceitos = {}
for m in re.finditer(r"\\item\[([^\]]*)\]\s*(.*?)(?=\\item\[|\\end\{description\})",
                     glossario, re.S):
    nome = limpar(m.group(1))
    cid = slug(nome)
    conceitos[cid] = {
        "id": cid,
        "nome": nome,
        "definicao": limpar(m.group(2)),
        "obras": re.findall(r"\\cite[a-z]*(?:\[[^\]]*\])?\{([^}]*)\}",
                            m.group(2)),
        "capitulos": [],
    }

# ------------------------------------------------------------ capitulos
capitulos = []
arestas = {}


def ligar(a, b, tipo, frase):
    """Guarda uma conexao com a primeira frase que a justifica."""
    chave = tuple(sorted((a, b))) + (tipo,)
    if chave in arestas:
        arestas[chave]["peso"] += 1
        return
    arestas[chave] = {"origem": a, "destino": b, "tipo": tipo,
                      "peso": 1, "frase": frase}


def encurtar(frase, limite=240):
    """Corta a frase sem partir palavras."""
    if len(frase) <= limite:
        return frase
    return frase[:limite].rsplit(" ", 1)[0] + "…"


def termos(nome):
    """Formas do nome de um conceito procuradas nas frases."""
    principal = re.split(r"\s*\(", nome)[0]
    formas = {sem_acento(principal).lower()}
    dentro = re.search(r"\(([^)]*)\)", nome)
    # O parentese so vale como sinonimo quando o nome e uma sigla
    # (ADR) ou quando traz o termo original numa palavra (tidying).
    if dentro and (principal.isupper() or " " not in dentro.group(1)):
        formas.add(sem_acento(dentro.group(1)).lower())
    return {f for f in formas if len(f) > 3}


formas_conceito = {cid: termos(c["nome"]) for cid, c in conceitos.items()}

for cid, arquivo, titulo_fixo in ORDEM:
    caminho = LIVRO / arquivo
    if not caminho.exists():
        continue
    texto = ler(caminho)
    titulo_m = re.search(r"\\chapter\*?(?:\[[^\]]*\])?(?:\[[^\]]*\])?\{([^}]*)\}",
                         texto)
    titulo = titulo_fixo or (limpar(titulo_m.group(1)) if titulo_m else cid)

    def itens(ambiente):
        bloco = re.search(r"\\begin\{" + ambiente + r"\}(.*?)\\end\{"
                          + ambiente + r"\}", texto, re.S)
        if not bloco:
            return []
        return [limpar(i) for i in re.split(r"\\item\s", bloco.group(1))[1:]]

    caixas = [limpar(n) for n in
              re.findall(r"\\begin\{conceito\}\{([^}]*)\}", texto)]
    corpo = re.sub(r"\\begin\{(objetivos|resumo|checklist)\}.*?\\end\{\1\}",
                   "", texto, flags=re.S)
    # Titulos de secao viram quebra de paragrafo, nao inicio de frase.
    corpo = re.sub(r"\\(?:sub)*section\*?(?:\[[^\]]*\])?\{[^}]*\}",
                   ".\n\n", corpo)
    frases = re.split(r"(?<=[.?!])\s+(?=[A-ZÁÉÍÓÚÂÊÔÀ\\])", corpo)
    citadas = []
    for frase_tex in frases:
        chaves = []
        for cm in re.finditer(r"\\cite[a-z]*(?:\[[^\]]*\])?\{([^}]*)\}",
                              frase_tex):
            chaves += [k.strip() for k in cm.group(1).split(",")]
        chaves = [k for k in chaves if k in obras]
        if not chaves:
            continue
        frase = encurtar(limpar(frase_tex))
        frase_cmp = sem_acento(frase).lower()
        for k in chaves:
            if k not in citadas:
                citadas.append(k)
            if cid not in obras[k]["capitulos"]:
                obras[k]["capitulos"].append(cid)
            ligar("o:" + k, "c:" + cid, "cita", frase)
        for i, a in enumerate(chaves):
            for b in chaves[i + 1:]:
                if a != b:
                    ligar("o:" + a, "o:" + b, "juntas", frase)
        for kid, formas in formas_conceito.items():
            if kid.replace("-", " ") in GENERICOS:
                continue
            if any(re.search(r"\b" + re.escape(f) + r"\b", frase_cmp)
                   for f in formas):
                for k in chaves:
                    ligar("o:" + k, "k:" + kid, "explica", frase)
                if cid not in conceitos[kid]["capitulos"]:
                    conceitos[kid]["capitulos"].append(cid)

    capitulos.append({
        "id": cid,
        "numero": int(cid) if cid.isdigit() else None,
        "titulo": titulo,
        "objetivos": itens("objetivos"),
        "resumo": itens("resumo"),
        "conceitos": caixas,
        "obras": citadas,
    })

# Obras citadas nas definicoes do glossario tambem explicam o conceito.
for kid, c in conceitos.items():
    for grupo_chaves in c.pop("obras"):
        for k in grupo_chaves.split(","):
            k = k.strip()
            if k in obras:
                ligar("o:" + k, "k:" + kid, "explica",
                      encurtar(c["definicao"]))

citadas_total = {k for cap in capitulos for k in cap["obras"]}
for k in list(obras):
    if k not in citadas_total:
        del obras[k]
arestas = [a for a in arestas.values()
           if all(not n.startswith("o:") or n[2:] in obras
                  for n in (a["origem"], a["destino"]))]
usados = {a[n] for a in arestas for n in ("origem", "destino")}
conceitos = {k: c for k, c in conceitos.items() if "k:" + k in usados}

nos = ([{"id": "c:" + c["id"], "tipo": "capitulo", "rotulo": c["titulo"],
         "numero": c["numero"]} for c in capitulos]
       + [{"id": "k:" + c["id"], "tipo": "conceito", "rotulo": c["nome"],
           "definicao": c["definicao"], "capitulos": c["capitulos"]}
          for c in conceitos.values()]
       + [{**o, "id": "o:" + o["id"], "chave": o["id"], "tipo": "obra",
           "rotulo": f"{o['autor']} ({o['ano']})"}
          for o in obras.values()])

grafo = {"gerado_de": "LaTeX do livro", "nos": nos, "arestas": arestas}
(SAIDA / "grafo.json").write_text(
    json.dumps(grafo, ensure_ascii=False, separators=(",", ":")),
    encoding="utf-8")

indice = ([{"tipo": "obra", "id": o["id"], "titulo": f"{o['autor']} ({o['ano']})",
            "texto": o["referencia"]} for o in obras.values()]
          + [{"tipo": "conceito", "id": c["id"], "titulo": c["nome"],
              "texto": c["definicao"]} for c in conceitos.values()]
          + [{"tipo": "capitulo", "id": c["id"], "titulo": c["titulo"],
              "texto": " ".join(c["objetivos"])} for c in capitulos])
(SAIDA / "indice.json").write_text(
    json.dumps(indice, ensure_ascii=False, separators=(",", ":")),
    encoding="utf-8")
(SAIDA / "capitulos.json").write_text(
    json.dumps(capitulos, ensure_ascii=False, indent=1), encoding="utf-8")

print(f"{len(obras)} obras, {len(conceitos)} conceitos, "
      f"{len(capitulos)} capitulos, {len(arestas)} conexoes")

# ------------------------------------------------------------ checklist
# Itens do Apêndice A, com os capítulos de cada um, e a explicação da
# escala de três níveis que abre o apêndice.
apendice = ler(LIVRO / "postextuais" / "apendices.tex")
trecho = apendice.split(r"\label{ap:checklist}", 1)[1].split(r"\chapter", 1)[0]
introducao = limpar(trecho.split(r"\begin{itemize}", 1)[0]).strip()
itens = []
for bruto in re.findall(r"\\item\s+(.+)", trecho):
    m = re.match(r"(.*?)\s*\((Cap[ií]tulos?[^)]*)\)\s*$", bruto)
    pergunta, refs = (m.group(1), m.group(2)) if m else (bruto, "")
    nums = re.findall(r"cap:(\d+)", refs) + re.findall(r"~(\d+)", refs)
    itens.append({
        "pergunta": limpar(pergunta).strip(),
        "capitulos": sorted({f"{int(n):02d}" for n in nums}),
    })
(SAIDA / "checklist.json").write_text(
    json.dumps({"introducao": introducao, "itens": itens},
               ensure_ascii=False, indent=1), encoding="utf-8")
print(f"checklist: {len(itens)} itens")
