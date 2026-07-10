import { protegerPaginaAdmin } from "./admin-auth.js";
import { escapeHtml } from "../../services/seguranca.js";
import { buscarMetricas } from "../../services/metricas.js";
import { listarProdutos } from "../../services/produtos.js";
import { db } from "../../services/firebase-config.js";
import {
  collection,
  getDocs,
  query,
  orderBy,
  limit
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";

function formatarPreco(valor) {
  return (valor || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatarData(timestamp) {
  if (!timestamp?.toDate) return "—";
  return timestamp.toDate().toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

async function buscarTodosPedidos() {
  const colecaoRef = collection(db, "pedidos");
  const q = query(colecaoRef, orderBy("criadoEm", "desc"), limit(200));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

function renderizarBarra(rotulo, valor, total, cor = "var(--gold)") {
  const porcentagem = total > 0 ? Math.round((valor / total) * 100) : 0;
  return `
    <div style="margin-bottom: 0.8rem;">
      <div style="display:flex; justify-content:space-between; font-size:0.8rem; margin-bottom:0.3rem;">
        <span>${escapeHtml(rotulo)}</span>
        <span style="color:var(--text-muted);">${valor} (${porcentagem}%)</span>
      </div>
      <div style="background:rgba(255,255,255,0.06); border-radius:4px; height:8px; overflow:hidden;">
        <div style="background:${cor}; height:100%; width:${porcentagem}%;"></div>
      </div>
    </div>
  `;
}

async function carregarDashboard() {
  const [metricas, produtos, pedidos] = await Promise.all([
    buscarMetricas(30),
    listarProdutos(),
    buscarTodosPedidos()
  ]);

  // ── Cards de métricas gerais ────────────────────────────────────────────
  const pedidosPagos = pedidos.filter((p) => p.status !== "cancelado" && p.status !== "aguardando_pagamento");
  const faturamento = pedidosPagos.reduce((soma, p) => soma + (p.total || 0), 0);
  const totalVisitas = metricas.filter((m) => m.tipo === "pagina").length;
  const totalVisualizacoesProduto = metricas.filter((m) => m.tipo === "produto").length;

  document.getElementById("cards-metricas").innerHTML = `
    <div class="admin-card-metrica">
      <div class="valor">${totalVisitas}</div>
      <div class="rotulo">Visitas (30 dias)</div>
    </div>
    <div class="admin-card-metrica">
      <div class="valor">${totalVisualizacoesProduto}</div>
      <div class="rotulo">Views de produto</div>
    </div>
    <div class="admin-card-metrica">
      <div class="valor">${produtos.length}</div>
      <div class="rotulo">Produtos ativos</div>
    </div>
    <div class="admin-card-metrica">
      <div class="valor">${pedidos.length}</div>
      <div class="rotulo">Pedidos totais</div>
    </div>
    <div class="admin-card-metrica">
      <div class="valor">${formatarPreco(faturamento)}</div>
      <div class="rotulo">Faturamento (pagos+)</div>
    </div>
  `;

  // ── Gráfico de dispositivo ───────────────────────────────────────────────
  const totalDispositivo = metricas.length;
  const porDispositivo = { mobile: 0, tablet: 0, desktop: 0 };
  metricas.forEach((m) => {
    if (porDispositivo[m.dispositivo] !== undefined) porDispositivo[m.dispositivo]++;
  });

  document.getElementById("grafico-dispositivo").innerHTML = totalDispositivo === 0
    ? `<p class="admin-vazio">Ainda não há dados suficientes.</p>`
    : `
      ${renderizarBarra("Mobile", porDispositivo.mobile, totalDispositivo)}
      ${renderizarBarra("Desktop", porDispositivo.desktop, totalDispositivo)}
      ${renderizarBarra("Tablet", porDispositivo.tablet, totalDispositivo)}
    `;

  // ── Gráfico de origem ─────────────────────────────────────────────────────
  const porOrigem = {};
  metricas.forEach((m) => {
    const origem = m.origem || "direto";
    porOrigem[origem] = (porOrigem[origem] || 0) + 1;
  });
  const origensOrdenadas = Object.entries(porOrigem).sort((a, b) => b[1] - a[1]).slice(0, 6);

  document.getElementById("grafico-origem").innerHTML = origensOrdenadas.length === 0
    ? `<p class="admin-vazio">Ainda não há dados suficientes.</p>`
    : origensOrdenadas.map(([origem, qtd]) => renderizarBarra(origem, qtd, totalDispositivo)).join("");

  // ── Páginas mais visitadas ────────────────────────────────────────────────
  const porPagina = {};
  metricas.filter((m) => m.tipo === "pagina").forEach((m) => {
    porPagina[m.pagina] = (porPagina[m.pagina] || 0) + 1;
  });
  const paginasOrdenadas = Object.entries(porPagina).sort((a, b) => b[1] - a[1]).slice(0, 8);

  document.getElementById("lista-paginas").innerHTML = paginasOrdenadas.length === 0
    ? `<p class="admin-vazio">Ainda não há dados suficientes.</p>`
    : `
      <table class="admin-tabela">
        <thead><tr><th>Página</th><th>Visitas</th></tr></thead>
        <tbody>
          ${paginasOrdenadas.map(([pagina, qtd]) => `<tr><td>${escapeHtml(pagina)}</td><td>${qtd}</td></tr>`).join("")}
        </tbody>
      </table>
    `;

  // ── Pedidos recentes ──────────────────────────────────────────────────────
  const recentes = pedidos.slice(0, 8);
  document.getElementById("lista-pedidos-recentes").innerHTML = recentes.length === 0
    ? `<p class="admin-vazio">Nenhum pedido ainda.</p>`
    : `
      <table class="admin-tabela">
        <thead><tr><th>ID</th><th>Data</th><th>Total</th><th>Status</th></tr></thead>
        <tbody>
          ${recentes.map((p) => `
            <tr>
              <td>${escapeHtml(p.id.slice(0, 8))}...</td>
              <td>${formatarData(p.criadoEm)}</td>
              <td>${formatarPreco(p.total)}</td>
              <td><span class="badge badge-${escapeHtml(p.status || "")}">${escapeHtml((p.status || "").replace(/_/g, " "))}</span></td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;
}

protegerPaginaAdmin(() => {
  carregarDashboard().catch((erro) => {
    console.error("Erro ao carregar dashboard:", erro);
  });
});
