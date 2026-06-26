import { protegerPaginaAdmin } from "./admin-auth.js";
import { db } from "../../services/firebase-config.js";
import {
  collection,
  doc,
  updateDoc,
  getDocs,
  query,
  orderBy
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";

const STATUS_OPCOES = [
  "aguardando_pagamento",
  "pago",
  "preparando",
  "enviado",
  "entregue",
  "cancelado"
];

let pedidosCache = [];

const tabela = document.getElementById("tabela-pedidos");
const contagem = document.getElementById("contagem-pedidos");
const filtroStatus = document.getElementById("filtro-status");
const modal = document.getElementById("modal-pedido");
const modalConteudo = document.getElementById("modal-pedido-conteudo");

function formatarPreco(valor) {
  return (valor || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatarData(timestamp) {
  if (!timestamp?.toDate) return "—";
  return timestamp.toDate().toLocaleDateString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit"
  });
}

async function buscarTodosPedidos() {
  const colecaoRef = collection(db, "pedidos");
  const q = query(colecaoRef, orderBy("criadoEm", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

function renderizarTabela() {
  const filtro = filtroStatus.value;
  const lista = filtro ? pedidosCache.filter((p) => p.status === filtro) : pedidosCache;

  contagem.textContent = `${lista.length} pedido${lista.length === 1 ? "" : "s"}`;

  if (lista.length === 0) {
    tabela.innerHTML = `<p class="admin-vazio">Nenhum pedido encontrado.</p>`;
    return;
  }

  tabela.innerHTML = `
    <table class="admin-tabela">
      <thead>
        <tr>
          <th>ID</th>
          <th>Data</th>
          <th>Itens</th>
          <th>Entrega</th>
          <th>Total</th>
          <th>Status</th>
          <th>Ações</th>
        </tr>
      </thead>
      <tbody>
        ${lista.map((p) => `
          <tr>
            <td>${p.id.slice(0, 8)}...</td>
            <td>${formatarData(p.criadoEm)}</td>
            <td>${(p.itens || []).length} item(ns)</td>
            <td>${p.modoEntrega === "retirada" ? "Retirada" : "Entrega"}</td>
            <td>${formatarPreco(p.total)}</td>
            <td>
              <select class="select-status" data-id="${p.id}" style="background:transparent; border:1px solid var(--border,rgba(201,168,76,0.2)); color:inherit; border-radius:4px; padding:0.3rem;">
                ${STATUS_OPCOES.map((s) => `<option value="${s}" ${s === p.status ? "selected" : ""}>${s.replace(/_/g, " ")}</option>`).join("")}
              </select>
            </td>
            <td>
              <button class="admin-btn admin-btn-outline admin-btn-sm btn-ver-detalhe" data-id="${p.id}">Ver detalhes</button>
            </td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;

  document.querySelectorAll(".select-status").forEach((select) => {
    select.addEventListener("change", () => atualizarStatus(select.dataset.id, select.value));
  });
  document.querySelectorAll(".btn-ver-detalhe").forEach((btn) => {
    btn.addEventListener("click", () => abrirDetalhe(btn.dataset.id));
  });
}

async function atualizarStatus(pedidoId, novoStatus) {
  try {
    const ref = doc(db, "pedidos", pedidoId);
    await updateDoc(ref, { status: novoStatus });
    const pedido = pedidosCache.find((p) => p.id === pedidoId);
    if (pedido) pedido.status = novoStatus;
  } catch (erro) {
    console.error(erro);
    alert("Não foi possível atualizar o status agora. Tente novamente.");
  }
}

function abrirDetalhe(pedidoId) {
  const p = pedidosCache.find((ped) => ped.id === pedidoId);
  if (!p) return;

  const itensHtml = (p.itens || []).map((item) => `
    <tr>
      <td>${item.nome} ${item.modo === "atacado" ? "<span class='badge badge-aprovado'>ATACADO</span>" : ""}</td>
      <td>${item.quantidade}</td>
      <td>${formatarPreco(item.precoUnitario)}</td>
      <td>${formatarPreco(item.precoUnitario * item.quantidade)}</td>
    </tr>
  `).join("");

  modalConteudo.innerHTML = `
    <p style="font-size:0.85rem; margin-bottom:1rem;"><strong>Pedido:</strong> ${p.id}</p>
    <p style="font-size:0.85rem; margin-bottom:1rem;"><strong>Data:</strong> ${formatarData(p.criadoEm)}</p>

    <table class="admin-tabela" style="margin-bottom:1.2rem;">
      <thead><tr><th>Item</th><th>Qtd</th><th>Unit.</th><th>Subtotal</th></tr></thead>
      <tbody>${itensHtml}</tbody>
    </table>

    <p style="font-size:0.85rem;"><strong>Modo de entrega:</strong> ${p.modoEntrega === "retirada" ? "Retirada na loja" : "Entrega"}</p>
    ${p.endereco ? `
      <p style="font-size:0.85rem;"><strong>Endereço:</strong> ${p.endereco.endereco}, ${p.endereco.bairro} — CEP ${p.endereco.cep}</p>
    ` : ""}
    ${p.frete ? `<p style="font-size:0.85rem;"><strong>Frete:</strong> ${formatarPreco(p.frete.valor)} (${p.frete.zona?.nome || "zona não identificada"})</p>` : ""}

    <p style="font-size:0.95rem; margin-top:1rem;"><strong>Subtotal:</strong> ${formatarPreco(p.subtotal)}</p>
    <p style="font-size:1.05rem; color:var(--gold,#C9A84C);"><strong>Total:</strong> ${formatarPreco(p.total)}</p>
  `;

  modal.style.display = "flex";
}

document.getElementById("btn-fechar-modal-pedido").addEventListener("click", () => {
  modal.style.display = "none";
});
modal.addEventListener("click", (evento) => {
  if (evento.target === modal) modal.style.display = "none";
});

filtroStatus.addEventListener("change", renderizarTabela);

protegerPaginaAdmin(async () => {
  try {
    pedidosCache = await buscarTodosPedidos();
    renderizarTabela();
  } catch (erro) {
    console.error("Erro ao carregar pedidos:", erro);
    tabela.innerHTML = `<p class="admin-vazio">Não foi possível carregar os pedidos agora.</p>`;
  }
});
