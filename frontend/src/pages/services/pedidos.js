// ── Serviço de Pedidos — Flora Boutique ────────────────────────────────────
// Um pedido nasce no checkout via Cloud Function "criarPedido" (status
// "aguardando_pagamento") e muda de status conforme o admin atualiza.
//
// SEGURANÇA (C1): o front NÃO grava pedidos no Firestore — as rules
// bloqueiam o create direto. Enviamos apenas {produtoId, quantidade, modo}
// de cada item + modo de entrega/endereço; preço, desconto, estoque,
// frete e total são recalculados no servidor a partir da coleção
// "produtos". Qualquer valor de preço vindo do navegador é ignorado.
//
// Estrutura de pedidos/{id} (criada pelo servidor):
// {
//   uidComprador, itens: [...], modoEntrega: "entrega" | "retirada",
//   endereco: {...} | null, frete: { valor, zona } | null,
//   subtotal, total, status, pagamento: { metodo, status }, criadoEm
// }

import { db, functions } from "./firebase-config.js";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";
import {
  httpsCallable
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-functions.js";

const COLECAO = "pedidos";

export const STATUS_PEDIDO = {
  AGUARDANDO_PAGAMENTO: "aguardando_pagamento",
  PAGO: "pago",
  PREPARANDO: "preparando",
  ENVIADO: "enviado",
  ENTREGUE: "entregue",
  CANCELADO: "cancelado"
};

/**
 * Cria um pedido no SERVIDOR a partir dos itens do carrinho.
 * @param {{ itens: Array<{produtoId: string, quantidade: number, modo: string}>,
 *           modoEntrega: "entrega"|"retirada",
 *           endereco: {cep, endereco, bairro}|null }} dados
 * @returns {{ pedidoId: string, subtotal: number, frete: number, total: number }}
 */
export async function criarPedido({ itens, modoEntrega, endereco }) {
  const chamada = httpsCallable(functions, "criarPedido");
  const resposta = await chamada({
    // Só identificadores e quantidades — o servidor resolve o resto.
    itens: itens.map((i) => ({
      produtoId: i.produtoId,
      quantidade: i.quantidade,
      modo: i.modo
    })),
    modoEntrega,
    endereco: endereco || null
  });
  return resposta.data;
}

/**
 * Traduz erros da Cloud Function para mensagens amigáveis. A mensagem
 * detalhada (estoque, mínimo de atacado etc.) vem do próprio servidor.
 */
export function traduzErroPedido(erro) {
  const mensagemServidor = erro?.message || "";
  const codigo = erro?.code || "";

  // Mensagens de negócio geradas pela função (já em PT-BR) são exibidas
  // como vieram; erros de infraestrutura ganham texto genérico.
  if (codigo.includes("functions/") === false && mensagemServidor) {
    return mensagemServidor;
  }
  const mapa = {
    "functions/unauthenticated": "Faça login para finalizar a compra.",
    "functions/permission-denied": mensagemServidor || "Você não tem permissão para esta compra.",
    "functions/failed-precondition": mensagemServidor || "Algum item do carrinho mudou. Revise e tente de novo.",
    "functions/invalid-argument": mensagemServidor || "Dados do pedido inválidos. Revise e tente de novo.",
    "functions/not-found": mensagemServidor || "Um dos produtos não está mais disponível.",
    "functions/internal": "Não foi possível finalizar o pedido agora. Tente novamente.",
    "functions/unavailable": "Servidor indisponível no momento. Tente novamente em instantes."
  };
  return mapa[codigo] || "Não foi possível finalizar o pedido agora. Tente novamente.";
}

/**
 * Lista os pedidos de um usuário, mais recentes primeiro.
 */
export async function listarPedidosDoUsuario(uid) {
  const colecaoRef = collection(db, COLECAO);
  const q = query(colecaoRef, where("uidComprador", "==", uid), orderBy("criadoEm", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * Busca um pedido específico por ID.
 */
export async function buscarPedidoPorId(id) {
  const ref = doc(db, COLECAO, id);
  const snap = await getDoc(ref);
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}
