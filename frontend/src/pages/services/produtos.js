// ── Serviço de Produtos Flora Boutique ─────────────────────────────────────
// Centraliza leitura/escrita da coleção "produtos" no Firestore.
//
// Estrutura de um documento em produtos/{id}:
// {
//   nome: string,
//   sku: string,                  // código interno do produto
//   codigoBarras: string,         // EAN/GTIN
//   peso: number,                 // em gramas
//   descricao: string,
//   categoria: string,            // slug de uma categoria (ver services/categorias.js)
//   imagemURL: string,
//   precoVarejo: number,
//   precoAtacado: number,         // preço por unidade quando comprado em qtd >= qtdMinimaAtacado
//   qtdMinimaAtacado: number,
//   estoque: number,
//   ativo: boolean,               // false = produto oculto do catálogo
//   destaque: boolean,            // aparece na seção "Os mais amados" da home
//   bannerHero: boolean,          // aparece no carrossel "Produto da Estação"
//   bannerEtiqueta: string,       // ex: "Lançamento", "Edição Limitada"
//   bannerTitulo: string,         // título de exibição no banner (pode diferir do nome)
//   bannerTexto: string,          // texto promocional do banner
//   bannerTags: string[],         // ex: ["Rosa", "Jasmim", "Baunilha"]
//   bannerOrdem: number,          // ordem de exibição no carrossel
//   criadoEm: timestamp,
//   atualizadoEm: timestamp
// }

import { db } from "./firebase-config.js";
import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit as limitarQtd,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";

const COLECAO = "produtos";

// ⚠️ As categorias deixaram de ser uma lista fixa aqui — agora vivem na
// coleção "categorias" do Firestore, gerenciável pelo admin.
// Veja services/categorias.js.

/**
 * Lista produtos ativos, opcionalmente filtrando por categoria.
 * A busca textual é feita no cliente (Firestore não tem full-text search
 * nativo); para um catálogo de porte pequeno/médio isso é suficiente e evita
 * custo de um serviço de busca externo (Algolia etc.).
 */
export async function listarProdutos({ categoria = null } = {}) {
  const colecaoRef = collection(db, COLECAO);
  const condicoes = [where("ativo", "==", true)];

  if (categoria) {
    condicoes.push(where("categoria", "==", categoria));
  }

  const q = query(colecaoRef, ...condicoes, orderBy("criadoEm", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * Lista produtos marcados como destaque (para a home).
 */
export async function listarDestaques(max = 8) {
  const colecaoRef = collection(db, COLECAO);
  const q = query(
    colecaoRef,
    where("ativo", "==", true),
    where("destaque", "==", true),
    limitarQtd(max)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * Lista produtos marcados para aparecer no banner "Produto da Estação",
 * já ordenados pela ordem de exibição definida pelo admin.
 * Filtra "bannerHero" no cliente (mesmo motivo do atacado: evita exigir
 * mais um índice composto para um filtro de baixo volume de dados).
 */
export async function listarBannerHero() {
  const todos = await listarProdutos();
  return todos
    .filter((p) => p.bannerHero === true)
    .sort((a, b) => (a.bannerOrdem || 0) - (b.bannerOrdem || 0));
}

/**
 * Lista produtos disponíveis no modo atacado (têm precoAtacado configurado).
 * O filtro de "tem preço de atacado" é feito no cliente, já que o Firestore
 * não tem como filtrar por "campo numérico maior que zero" combinado com
 * outros where() sem um índice dedicado — para o tamanho de catálogo de
 * uma loja, filtrar no cliente é mais simples e igualmente rápido.
 */
export async function listarProdutosAtacado({ categoria = null } = {}) {
  const todos = await listarProdutos({ categoria });
  return todos.filter((p) => p.precoAtacado && p.precoAtacado > 0);
}

/**
 * Busca um produto específico por ID.
 */
export async function buscarProdutoPorId(id) {
  const ref = doc(db, COLECAO, id);
  const snap = await getDoc(ref);
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

/**
 * Filtra uma lista de produtos já carregada por termo de busca
 * (nome, SKU ou descrição) e faixa de preço. Tudo no cliente.
 */
export function filtrarProdutos(produtos, { termo = "", precoMin = null, precoMax = null } = {}) {
  const termoNormalizado = termo.trim().toLowerCase();

  return produtos.filter((p) => {
    if (termoNormalizado) {
      const alvo = `${p.nome} ${p.sku} ${p.descricao}`.toLowerCase();
      if (!alvo.includes(termoNormalizado)) return false;
    }
    if (precoMin !== null && p.precoVarejo < precoMin) return false;
    if (precoMax !== null && p.precoVarejo > precoMax) return false;
    return true;
  });
}

/**
 * Ordena uma lista de produtos.
 * criterios: "relevancia" | "menor-preco" | "maior-preco" | "nome"
 */
export function ordenarProdutos(produtos, criterio) {
  const lista = [...produtos];
  switch (criterio) {
    case "menor-preco":
      return lista.sort((a, b) => a.precoVarejo - b.precoVarejo);
    case "maior-preco":
      return lista.sort((a, b) => b.precoVarejo - a.precoVarejo);
    case "nome":
      return lista.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    default:
      return lista; // "relevancia" = ordem original (mais recentes primeiro)
  }
}

// ── Funções de escrita (uso exclusivo do painel admin) ──────────────────
// As regras do Firestore já bloqueiam quem não é admin de chamar estas
// funções com sucesso, mas a função em si não faz a checagem — a segurança
// real está nas regras do banco, nunca confie só na interface.

export async function criarProduto(dados) {
  const colecaoRef = collection(db, COLECAO);
  return addDoc(colecaoRef, {
    ...dados,
    ativo: dados.ativo ?? true,
    destaque: dados.destaque ?? false,
    criadoEm: serverTimestamp(),
    atualizadoEm: serverTimestamp()
  });
}

export async function atualizarProduto(id, dados) {
  const ref = doc(db, COLECAO, id);
  return updateDoc(ref, {
    ...dados,
    atualizadoEm: serverTimestamp()
  });
}

export async function excluirProduto(id) {
  const ref = doc(db, COLECAO, id);
  return deleteDoc(ref);
}
