// ── Sidebar do Painel Admin ──────────────────────────────────────────────
// Montada via JS para evitar duplicar o mesmo HTML em cada página do
// painel. Marca o item ativo conforme a página atual.

const paginaAtual = window.location.pathname.split("/").pop().replace(".html", "") || "index";

const itensMenu = [
  { id: "index", href: "index.html", icone: "📊", label: "Dashboard" },
  { id: "produtos", href: "produtos.html", icone: "🛍️", label: "Produtos" },
  { id: "categorias", href: "categorias.html", icone: "🏷️", label: "Categorias" },
  { id: "pedidos", href: "pedidos.html", icone: "📦", label: "Pedidos" },
  { id: "revendedores", href: "revendedores.html", icone: "🏪", label: "Revendedores" }
];

function montarSidebar() {
  const container = document.getElementById("admin-sidebar-slot");
  if (!container) return;

  container.innerHTML = `
    <aside class="admin-sidebar">
      <div class="admin-logo">
        Flora Boutique
        <small>Painel Admin</small>
      </div>
      <nav class="admin-nav">
        ${itensMenu.map((item) => `
          <a href="${item.href}" class="${item.id === paginaAtual ? "active" : ""}">
            <span>${item.icone}</span> ${item.label}
          </a>
        `).join("")}
      </nav>
      <div class="admin-sidebar-rodape">
        <a href="../index.html">← Voltar para a loja</a>
        <a href="#" id="admin-btn-logout">Sair da conta</a>
      </div>
    </aside>
  `;
}

montarSidebar();
