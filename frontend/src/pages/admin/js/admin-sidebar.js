// ── Sidebar do Painel Admin ──────────────────────────────────────────────
// Montada via JS para evitar duplicar o mesmo HTML em cada página do
// painel. Marca o item ativo conforme a página atual.

const paginaAtual = window.location.pathname.split("/").pop().replace(".html", "") || "index";

const itensMenu = [
  { id: "index", href: "index.html", label: "Dashboard" },
  { id: "produtos", href: "produtos.html", label: "Produtos" },
  { id: "categorias", href: "categorias.html", label: "Categorias" },
  { id: "pedidos", href: "pedidos.html", label: "Pedidos" },
  { id: "revendedores", href: "revendedores.html", label: "Revendedores" }
];

function montarSidebar() {
  const container = document.getElementById("admin-sidebar-slot");
  if (!container) return;

  container.innerHTML = `
    <aside class="admin-sidebar">
      <div class="admin-logo">
        <a href="../index.html" class="admin_logo_nome">Flora Boutique</a>
        <small>Painel Admin</small>
      </div>
      <nav class="admin-nav">
        ${itensMenu.map((item) => `
          <a href="${item.href}" class="${item.id === paginaAtual ? "active" : ""}">
            ${item.label}
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
