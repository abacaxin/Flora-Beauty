// ── Cloud Functions — Flora Beauty ─────────────────────────────────────────
// Backend de confiança da loja. Tudo que o cliente NÃO pode decidir
// (preço, desconto, estoque, frete, permissão de atacado) é recalculado
// aqui, no servidor, a partir da coleção "produtos" — qualquer valor
// enviado pelo navegador é ignorado.
//
// Deploy: firebase deploy --only functions   (exige plano Blaze — ver
// docs/MANUAL_CONFIGURACAO.md)

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { setGlobalOptions } = require("firebase-functions/v2");
const admin = require("firebase-admin");
const { calcularFrete } = require("./frete");

admin.initializeApp();
const db = admin.firestore();

// Mesma região do Firestore (southamerica-east1) — menos latência.
setGlobalOptions({ region: "southamerica-east1", maxInstances: 10 });

// ⚠️ App Check: deixe "false" só enquanto o App Check ainda não foi
// configurado no console (chave reCAPTCHA v3). Assim que configurar
// (ver docs/MANUAL_CONFIGURACAO.md), mude para true e faça novo deploy —
// a função passa a recusar chamadas que não venham do site real.
const EXIGIR_APP_CHECK = false;

// Fallbacks usados quando o documento configuracoes/atacado não existe.
const MINIMO_ATACADO_CARRINHO_PADRAO = 6;

const MAX_ITENS_POR_PEDIDO = 30;
const MAX_QTD_POR_ITEM = 500;

// ── Helpers de preço/estoque (fonte de verdade do servidor) ──────────────

function centavos(valor) {
  return Math.round(Number(valor) * 100);
}

function reais(cent) {
  return Math.round(cent) / 100;
}

/**
 * Desconto configurado pelo admin no produto (A2). Só se aplica ao preço
 * de varejo; o preço de atacado é o valor exato definido pelo admin.
 */
function precoUnitarioCentavos(produto, modo) {
  if (modo === "atacado") {
    const preco = Number(produto.precoAtacado);
    return preco > 0 ? centavos(preco) : null;
  }

  const base = Number(produto.precoVarejo);
  if (!(base > 0)) return null;

  const pct = Number(produto.descontoPercentual);
  if (produto.descontoAtivo === true && pct >= 1 && pct <= 90) {
    return Math.round(centavos(base) * (1 - pct / 100));
  }
  return centavos(base);
}

/**
 * Estoques independentes por modalidade (A4). Produtos antigos que só têm
 * o campo "estoque" continuam funcionando: ele vale como estoque de varejo.
 */
function estoqueDisponivel(produto, modo) {
  if (modo === "atacado") {
    return Number(produto.estoqueAtacado) || 0;
  }
  if (typeof produto.estoqueVarejo === "number") {
    return produto.estoqueVarejo;
  }
  return Number(produto.estoque) || 0;
}

function campoEstoque(produto, modo) {
  if (modo === "atacado") return "estoqueAtacado";
  return typeof produto.estoqueVarejo === "number" ? "estoqueVarejo" : "estoque";
}

// ── Validação do payload ─────────────────────────────────────────────────

function validarPayload(dados) {
  if (!dados || typeof dados !== "object") {
    throw new HttpsError("invalid-argument", "Dados do pedido ausentes.");
  }

  const { itens, modoEntrega, endereco } = dados;

  if (!Array.isArray(itens) || itens.length === 0) {
    throw new HttpsError("invalid-argument", "O carrinho está vazio.");
  }
  if (itens.length > MAX_ITENS_POR_PEDIDO) {
    throw new HttpsError("invalid-argument", "Pedido com itens demais.");
  }

  const itensLimpos = itens.map((item) => {
    const produtoId = String(item?.produtoId || "").trim();
    const quantidade = Number(item?.quantidade);
    const modo = item?.modo === "atacado" ? "atacado" : "varejo";

    if (!produtoId || produtoId.length > 128) {
      throw new HttpsError("invalid-argument", "Item com identificador inválido.");
    }
    if (!Number.isInteger(quantidade) || quantidade < 1 || quantidade > MAX_QTD_POR_ITEM) {
      throw new HttpsError("invalid-argument", "Quantidade inválida em um dos itens.");
    }
    return { produtoId, quantidade, modo };
  });

  // O mesmo produto pode aparecer em varejo E atacado, mas não duplicado
  // no mesmo modo (o front já agrega — aqui é só defesa extra).
  const chaves = new Set();
  for (const item of itensLimpos) {
    const chave = `${item.produtoId}:${item.modo}`;
    if (chaves.has(chave)) {
      throw new HttpsError("invalid-argument", "Item duplicado no pedido.");
    }
    chaves.add(chave);
  }

  if (modoEntrega !== "entrega" && modoEntrega !== "retirada") {
    throw new HttpsError("invalid-argument", "Modo de entrega inválido.");
  }

  let enderecoLimpo = null;
  if (modoEntrega === "entrega") {
    const cep = String(endereco?.cep || "").trim();
    const rua = String(endereco?.endereco || "").trim();
    const bairro = String(endereco?.bairro || "").trim();

    if (!cep || !rua || !bairro || cep.length > 12 || rua.length > 300 || bairro.length > 120) {
      throw new HttpsError("invalid-argument", "Endereço de entrega incompleto ou inválido.");
    }
    enderecoLimpo = { cep, endereco: rua, bairro };
  }

  return { itens: itensLimpos, modoEntrega, endereco: enderecoLimpo };
}

// ── criarPedido ──────────────────────────────────────────────────────────
// Recebe APENAS identificadores e quantidades. Preço, desconto, estoque,
// frete, mínimo de atacado e permissão de revenda são todos resolvidos
// aqui dentro. Também baixa o estoque na mesma transação (reserva) e
// esvazia o carrinho do usuário ao final.

exports.criarPedido = onCall({ enforceAppCheck: EXIGIR_APP_CHECK }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Faça login para finalizar a compra.");
  }
  if (request.auth.token.email_verified !== true) {
    throw new HttpsError("permission-denied", "Confirme seu e-mail antes de comprar.");
  }

  const uid = request.auth.uid;
  const { itens, modoEntrega, endereco } = validarPayload(request.data);

  // Perfil do comprador (permissão de atacado é decidida aqui, nunca no front)
  const perfilSnap = await db.doc(`usuarios/${uid}`).get();
  const perfil = perfilSnap.exists ? perfilSnap.data() : null;
  if (!perfil) {
    throw new HttpsError("failed-precondition", "Perfil não encontrado. Faça login novamente.");
  }

  const temItemAtacado = itens.some((i) => i.modo === "atacado");
  const ehAdmin = perfil.role === "admin";
  const revendedorAprovado = perfil.statusRevendedor === "aprovado";

  if (temItemAtacado && !ehAdmin && !revendedorAprovado) {
    throw new HttpsError(
      "permission-denied",
      "Compras no atacado são liberadas apenas para revendedores aprovados."
    );
  }

  // Mínimo de atacado por CARRINHO (A3): soma das unidades de todos os
  // itens em modo atacado, configurável em configuracoes/atacado.
  if (temItemAtacado) {
    const configSnap = await db.doc("configuracoes/atacado").get();
    const minimo = Number(configSnap.exists && configSnap.data().qtdMinimaCarrinho) ||
      MINIMO_ATACADO_CARRINHO_PADRAO;

    const totalUnidadesAtacado = itens
      .filter((i) => i.modo === "atacado")
      .reduce((soma, i) => soma + i.quantidade, 0);

    if (totalUnidadesAtacado < minimo) {
      throw new HttpsError(
        "failed-precondition",
        `O pedido de atacado exige no mínimo ${minimo} unidades no carrinho (você tem ${totalUnidadesAtacado}).`
      );
    }
  }

  const pedidoRef = db.collection("pedidos").doc();

  const resultado = await db.runTransaction(async (tx) => {
    // 1) Lê todos os produtos envolvidos (deduplicado por id)
    const idsUnicos = [...new Set(itens.map((i) => i.produtoId))];
    const snaps = await Promise.all(
      idsUnicos.map((id) => tx.get(db.doc(`produtos/${id}`)))
    );
    const produtos = new Map();
    snaps.forEach((snap, i) => {
      if (!snap.exists) {
        throw new HttpsError("not-found", "Um dos produtos do carrinho não existe mais.");
      }
      produtos.set(idsUnicos[i], snap.data());
    });

    // 2) Revalida cada item com os dados ATUAIS do servidor
    let subtotalCentavos = 0;
    let pesoTotal = 0;
    const itensPedido = [];
    const baixasPorProduto = new Map(); // produtoId -> { campo: qtd }

    for (const item of itens) {
      const produto = produtos.get(item.produtoId);

      if (produto.ativo === false) {
        throw new HttpsError(
          "failed-precondition",
          `O produto "${produto.nome}" não está mais disponível.`
        );
      }

      const precoCent = precoUnitarioCentavos(produto, item.modo);
      if (precoCent === null) {
        throw new HttpsError(
          "failed-precondition",
          `O produto "${produto.nome}" não está disponível no modo ${item.modo}.`
        );
      }

      const disponivel = estoqueDisponivel(produto, item.modo);
      const jaReservado = (baixasPorProduto.get(item.produtoId) || {})[campoEstoque(produto, item.modo)] || 0;
      if (item.quantidade + jaReservado > disponivel) {
        throw new HttpsError(
          "failed-precondition",
          `Estoque insuficiente de "${produto.nome}" no modo ${item.modo} (restam ${Math.max(disponivel - jaReservado, 0)}).`
        );
      }

      const campo = campoEstoque(produto, item.modo);
      const baixas = baixasPorProduto.get(item.produtoId) || {};
      baixas[campo] = (baixas[campo] || 0) + item.quantidade;
      baixasPorProduto.set(item.produtoId, baixas);

      subtotalCentavos += precoCent * item.quantidade;
      pesoTotal += (Number(produto.peso) || 0) * item.quantidade;

      itensPedido.push({
        produtoId: item.produtoId,
        nome: produto.nome || "",
        imagemURL: produto.imagemURL || "",
        precoUnitario: reais(precoCent),
        pesoUnitario: Number(produto.peso) || 0,
        quantidade: item.quantidade,
        modo: item.modo
      });
    }

    // 3) Frete calculado no servidor
    let frete = null;
    let freteCentavos = 0;
    if (modoEntrega === "entrega") {
      frete = calcularFrete(endereco.bairro, pesoTotal);
      freteCentavos = centavos(frete.valor);
    }

    const totalCentavos = subtotalCentavos + freteCentavos;

    // 4) Baixa o estoque (reserva) e grava o pedido na MESMA transação
    for (const [produtoId, baixas] of baixasPorProduto) {
      const atual = produtos.get(produtoId);
      const atualizacao = {};
      for (const [campo, qtd] of Object.entries(baixas)) {
        atualizacao[campo] = (Number(atual[campo]) || 0) - qtd;
      }
      tx.update(db.doc(`produtos/${produtoId}`), atualizacao);
    }

    tx.set(pedidoRef, {
      uidComprador: uid,
      itens: itensPedido,
      temItemAtacado,
      modoEntrega,
      endereco: endereco || null,
      frete: frete || null,
      subtotal: reais(subtotalCentavos),
      total: reais(totalCentavos),
      status: "aguardando_pagamento",
      pagamento: {
        // Pagamento provisório (A7): PIX manual/combinação por WhatsApp.
        // Quando o gateway real for ligado, este campo passa a ser
        // preenchido pelo webhook do gateway (ver docs/MANUAL_PAGAMENTO.md).
        metodo: "provisorio",
        status: "pendente"
      },
      criadoEm: admin.firestore.FieldValue.serverTimestamp()
    });

    return {
      pedidoId: pedidoRef.id,
      subtotal: reais(subtotalCentavos),
      frete: frete ? frete.valor : 0,
      total: reais(totalCentavos)
    };
  });

  // 5) Esvazia o carrinho (fora da transação: se falhar, não invalida o pedido)
  try {
    await db.doc(`carrinhos/${uid}`).set({ itens: [] });
  } catch (erro) {
    console.error("Pedido criado, mas não foi possível esvaziar o carrinho:", erro);
  }

  return resultado;
});
