// ── Serviço de Pedidos — Flora Boutique ────────────────────────────────────
// Um pedido nasce no checkout (status "aguardando_pagamento") e muda de
// status conforme o pagamento é confirmado (próxima etapa, com Mercado
// Pago) ou conforme o admin atualiza manualmente.
//
// Estrutura de pedidos/{id}:
// {
//   uidComprador, itens: [...], modoEntrega: "entrega" | "retirada",
//   endereco: {...} | null, frete: { valor, zona } | null,
//   subtotal, total, status, criadoEm
// }

import { db } from "./firebase-config.js";
import {
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";

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
 * Cria um novo pedido a partir dos itens do carrinho + dados de entrega.
 */
export async function criarPedido({
  uidComprador,
  itens,
  modoEntrega,
  endereco,
  frete,
  subtotal,
  total
}) {
  const colecaoRef = collection(db, COLECAO);
  return addDoc(colecaoRef, {
    uidComprador,
    itens,
    temItemAtacado: itens.some((item) => item.modo === "atacado"),
    modoEntrega,
    endereco: endereco || null,
    frete: frete || null,
    subtotal,
    total,
    status: STATUS_PEDIDO.AGUARDANDO_PAGAMENTO,
    criadoEm: serverTimestamp()
  });
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
