"""Lista os materiais do repositório e os capítulos a que cada um serve.

Uso: python3 tools/materiais.py CAMINHO_DO_REPOSITORIO_DO_LIVRO

Lê os arquivos de docs/ do repositório, pega o título (primeira linha
com "# ") e as menções "Cap. N" ou "Caps. N e M", e grava
dados/materiais.json. Os modelos de docs/modelos/ não citam capítulo
no texto, então o capítulo deles vem da tabela MODELOS.
"""

import json
import re
from pathlib import Path

import sys

SITE = Path(__file__).resolve().parent.parent
REPO = Path(sys.argv[1])
BASE = ("https://github.com/maxbassoul/antes-que-a-ia-reescreva-tudo"
        "/blob/main/")

# Modelos que o livro apresenta nos apêndices e discute no Cap. 9
# (arquivo de instruções e registro de decisões) e no Cap. 1
# (o script que conta mudanças qualificadas).
MODELOS = {
    "docs/modelos/AGENTS.md": ("Modelo de AGENTS.md", ["09"]),
    "docs/modelos/ADR.md": ("Modelo de registro de decisão (ADR)", ["09"]),
    "docs/modelos/mudancas_qualificadas.sh":
        ("Script de mudanças qualificadas", ["01", "04"]),
}


def capitulos_citados(texto):
    nums = set()
    for trecho in re.findall(r"Caps?\.\s*([\d ,e]+)", texto):
        nums.update(int(n) for n in re.findall(r"\d+", trecho))
    return sorted(f"{n:02d}" for n in nums if 1 <= n <= 16)


def main():
    materiais = []
    for caminho in sorted((REPO / "docs").glob("*.md")):
        texto = caminho.read_text(encoding="utf-8")
        titulo = re.search(r"(?m)^# (.+)$", texto).group(1).strip()
        rel = caminho.relative_to(REPO).as_posix()
        materiais.append({"titulo": titulo, "url": BASE + rel,
                          "capitulos": capitulos_citados(texto)})
    for rel, (titulo, caps) in MODELOS.items():
        if (REPO / rel).exists():
            materiais.append({"titulo": titulo, "url": BASE + rel,
                              "capitulos": caps})
    destino = SITE / "dados" / "materiais.json"
    destino.write_text(json.dumps(materiais, ensure_ascii=False, indent=1),
                       encoding="utf-8")
    for m in materiais:
        print(m["titulo"], m["capitulos"])


if __name__ == "__main__":
    main()
