# Site do livro *Antes que a IA Reescreva Tudo*

Área do leitor do livro de Diego Marques de Carvalho: mapa das
referências, capítulos, ferramentas dos apêndices e blog.

O site inteiro fica cifrado. Quem abre o endereço vê só a tela de
entrada; o conteúdo está em `docs/cofre.json`, cifrado com AES-256-GCM.
A chave fica no Apps Script do autor, que só a entrega depois de gravar
o nome e o e-mail do leitor numa planilha. Por isso o repositório pode
ser público: aqui não há texto aberto do livro.

## Pastas

| Pasta | O que guarda | Vai para o git? |
| --- | --- | --- |
| `web/` | Tela de entrada, estilos, JavaScript, fontes e imagens | sim |
| `tools/` | Scripts que geram os dados e montam o site | sim |
| `apps-script/` | Código do cadastro no Google Apps Script | sim |
| `docs/` | Site montado e cifrado, publicado pelo GitHub Pages | sim |
| `conteudo/` | Páginas, posts e dados em texto aberto | **não** |
| `_previa/` | Montagem de teste, abre só com o código | **não** |

## Montar

Requer Python 3.10+ com `pip install markdown cryptography`.

```sh
# 1. Dados a partir do LaTeX do livro e do repositório de material
python3 tools/gerar_dados.py CAMINHO_DO_LIVRO conteudo/dados
python3 tools/materiais.py CAMINHO_DO_REPOSITORIO_DO_LIVRO

# 2. Prévia local (a chave vai embrulhada com o código do livro)
python3 tools/montar.py --teste
python3 -m http.server -d _previa 8000

# 3. Versão publicada
SITE_KEY="..." APPS_SCRIPT_URL="https://script.google.com/macros/s/.../exec" \
  python3 tools/montar.py
git add docs && git commit -m "Atualiza o site" && git push
```

`SITE_KEY` é a mesma chave guardada na propriedade `CHAVE_DO_SITE` do
Apps Script. Nunca a coloque no repositório.

## Publicar

No GitHub: **Settings > Pages > Build and deployment**, origem
**Deploy from a branch**, ramo `main`, pasta `/docs`.

## Licenças

Código sob licença MIT. Fontes Orbit, Literata e Atkinson Hyperlegible
sob a SIL Open Font License (`web/fontes/`); D3 sob licença ISC
(`web/vendor/`).
