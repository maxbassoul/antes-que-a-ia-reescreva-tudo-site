// Cadastro dos leitores do site "Antes que a IA Reescreva Tudo".
//
// Recebe nome e e-mail, confere o código do livro, grava uma linha na
// planilha e devolve a chave que abre o conteúdo cifrado do site.
// Sem cadastro gravado, não há chave: é isso que bloqueia o site.
//
// Propriedades do script (Configurações do projeto > Propriedades):
//   CHAVE_DO_SITE  a chave em base64 gerada pelo tools/montar.py
//   CODIGO_LIVRO   opcional; o padrão é IA2026

const ABA = "Cadastros";
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function responder(dados) {
  return ContentService.createTextOutput(JSON.stringify(dados))
    .setMimeType(ContentService.MimeType.JSON);
}

function propriedade(nome, padrao) {
  return PropertiesService.getScriptProperties().getProperty(nome) || padrao;
}

function doPost(e) {
  let pedido;
  try {
    pedido = JSON.parse(e.postData.contents);
  } catch (erro) {
    return responder({ ok: false, mensagem: "Pedido em formato inválido." });
  }

  const codigo = String(pedido.codigo || "").trim().toUpperCase();
  const nome = String(pedido.nome || "").trim().slice(0, 120);
  const email = String(pedido.email || "").trim().toLowerCase().slice(0, 160);

  if (codigo !== propriedade("CODIGO_LIVRO", "IA2026").toUpperCase()) {
    return responder({ ok: false, mensagem: "O código não confere." });
  }
  if (nome.length < 2) {
    return responder({ ok: false, mensagem: "Digite seu nome." });
  }
  if (!EMAIL.test(email)) {
    return responder({ ok: false, mensagem: "Digite um e-mail válido." });
  }
  if (pedido.consentimento !== true) {
    return responder({ ok: false, mensagem: "Falta a concordância com o uso dos dados." });
  }

  const chave = propriedade("CHAVE_DO_SITE", "");
  if (!chave) {
    return responder({ ok: false, mensagem: "O site está em manutenção. Tente mais tarde." });
  }

  const trava = LockService.getScriptLock();
  trava.waitLock(10000);
  try {
    const planilha = SpreadsheetApp.getActiveSpreadsheet();
    const aba = planilha.getSheetByName(ABA) || planilha.insertSheet(ABA);
    if (aba.getLastRow() === 0) {
      aba.appendRow(["Data", "Nome", "E-mail", "Avisos de atualização", "Acessos"]);
      aba.setFrozenRows(1);
    }
    const ultima = aba.getLastRow();
    const emails = ultima > 1
      ? aba.getRange(2, 3, ultima - 1, 1).getValues().map((linha) => linha[0])
      : [];
    const posicao = emails.indexOf(email);
    if (posicao === -1) {
      // O apóstrofo impede que a planilha leia o nome como fórmula.
      aba.appendRow([new Date(), "'" + nome, email,
        pedido.novidades === true ? "sim" : "não", 1]);
    } else {
      // Leitor que volta em outro navegador: conta o acesso.
      const celula = aba.getRange(posicao + 2, 5);
      celula.setValue(Number(celula.getValue() || 0) + 1);
    }
  } finally {
    trava.releaseLock();
  }

  return responder({ ok: true, chave: chave });
}

// Rode esta função uma vez pelo editor para conferir a configuração.
function testarConfiguracao() {
  const chave = propriedade("CHAVE_DO_SITE", "");
  Logger.log(chave ? "CHAVE_DO_SITE configurada." : "Falta CHAVE_DO_SITE.");
  Logger.log("Código do livro: " + propriedade("CODIGO_LIVRO", "IA2026"));
  Logger.log("Planilha: " + SpreadsheetApp.getActiveSpreadsheet().getName());
}
