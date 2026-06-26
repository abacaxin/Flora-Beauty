import { listarDestaques, listarBannerHero } from "./produtos.js";
import { listarCategorias } from "./categorias.js";
import { observarAuth } from "./auth.js";
import { adicionarAoCarrinho } from "./carrinho.js";
import { ativarReveals } from "./script.js";

let usuarioLogado = null;
observarAuth(({ usuario }) => {
  usuarioLogado = usuario;
});

function formatarPreco(valor) {
  return (valor || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// ── "Nossas categorias" (cards com link real para o catálogo filtrado) ───
async function carregarCategoriasVisuais() {
  const grid = document.getElementById("grid-categorias-home");
  if (!grid) return;

  try {
    const categorias = await listarCategorias();

    if (categorias.length === 0) {
      grid.innerHTML = `<p class="catalogo-vazio">Nenhuma categoria cadastrada ainda.</p>`;
      return;
    }

    grid.innerHTML = categorias.map((c) => `
      <a class="cat-card reveal" href="produtos.html?categoria=${c.slug}" style="text-decoration:none; display:block;">
        <div class="cat-imagem-generica">
          <img src="${c.imagemURL || 'images/logo.ico'}" alt="${c.nome}">
        </div>
        <div class="cat-overlay"></div>
        <div class="cat-label">
          <span class="cat-name">${c.icone || ""} ${c.nome}</span>
        </div>
        <div class="cat-arrow">→</div>
      </a>
    `).join("");

    ativarReveals(grid);

  } catch (erro) {
    console.error("Erro ao carregar categorias na home:", erro);
    grid.innerHTML = `<p class="catalogo-vazio">Não foi possível carregar as categorias agora.</p>`;
  }
}

// ── Destaques ("Os mais amados") ────────────────────────────────────────
async function carregarDestaques() {
  const grid = document.getElementById("grid-destaques");
  if (!grid) return;

  try {
    const produtos = await listarDestaques(8);

    if (produtos.length === 0) {
      grid.innerHTML = `<p class="catalogo-vazio" style="padding:2rem;">Nenhum produto em destaque no momento.</p>`;
      return;
    }

    grid.innerHTML = produtos.map((p) => `
      <div class="product-card reveal">
        <a href="produto.html?id=${p.id}" style="text-decoration:none; color:inherit; display:block;">
          <div class="product-featured">
            <img src="${p.imagemURL || 'images/logo.ico'}" alt="${p.nome}">
          </div>
          <div class="product-info">
            <div class="product-name">${p.nome}</div>
            <div class="product-brand">${p.categoria || ""}</div>
            <div class="product-footer">
              <span class="product-price">${formatarPreco(p.precoVarejo)}</span>
            </div>
          </div>
        </a>
        <button class="product-add" data-id="${p.id}" title="Adicionar ao carrinho">+</button>
      </div>
    `).join("");

    ativarReveals(grid);

    grid.querySelectorAll(".product-add").forEach((btn) => {
      btn.addEventListener("click", () => adicionarDestaqueAoCarrinho(btn, produtos));
    });
  } catch (erro) {
    console.error("Erro ao carregar destaques:", erro);
    grid.innerHTML = `<p class="catalogo-vazio" style="padding:2rem;">Não foi possível carregar os destaques agora.</p>`;
  }
}

async function adicionarDestaqueAoCarrinho(btn, produtos) {
  if (!usuarioLogado) {
    window.location.href = "login.html";
    return;
  }

  const produto = produtos.find((p) => p.id === btn.dataset.id);
  if (!produto) return;

  const textoOriginal = btn.textContent;
  btn.disabled = true;
  btn.textContent = "…";

  try {
    await adicionarAoCarrinho(usuarioLogado.uid, {
      produtoId: produto.id,
      nome: produto.nome,
      imagemURL: produto.imagemURL || "",
      precoUnitario: produto.precoVarejo,
      pesoUnitario: produto.peso || 0,
      quantidade: 1,
      modo: "varejo"
    });
    btn.textContent = "✓";
    setTimeout(() => {
      btn.textContent = textoOriginal;
      btn.disabled = false;
    }, 1200);
  } catch (erro) {
    console.error(erro);
    btn.textContent = "!";
    setTimeout(() => {
      btn.textContent = textoOriginal;
      btn.disabled = false;
    }, 1200);
  }
}

// ── Banner "Produto da Estação" (carrossel com setas) ────────────────────
let produtosBanner = [];
let indiceBanner = 0;

function renderizarBanner() {
  const container = document.getElementById("highlight-conteudo");
  const nav = document.getElementById("highlight-nav");
  const contador = document.getElementById("highlight-contador");

  if (produtosBanner.length === 0) {
    container.innerHTML = `<p class="catalogo-vazio">Nenhum produto configurado para este banner ainda.</p>`;
    nav.style.display = "none";
    return;
  }

  const p = produtosBanner[indiceBanner];

  container.innerHTML = `
    <div class="highlight-visual reveal">
      <div class="highlight-circle">
        <img src="${p.bannerImagemURL || p.imagemURL || 'images/logo.ico'}" alt="${p.nome}">
      </div>
      ${p.bannerEtiqueta ? `<div class="highlight-tag">${p.bannerEtiqueta}</div>` : ""}
    </div>
    <div class="highlight-content reveal reveal-delay-1">
      <span class="section-eyebrow2">${p.bannerNomeSecao || "Produto da estação"}</span>
      <h2 class="highlight-title">${p.bannerTitulo || p.nome}</h2>
      <p class="highlight-text">${p.bannerTexto || p.descricao || ""}</p>
      ${(p.bannerTags && p.bannerTags.length > 0) ? `
        <div class="highlight-notes">
          ${p.bannerTags.map((tag) => `<span class="note-pill">${tag}</span>`).join("")}
        </div>
      ` : ""}
      <div class="highlight-price">
        <small>A partir de</small>
        ${formatarPreco(p.precoVarejo)}
      </div>
      <a href="produto.html?id=${p.id}" class="btn-primary">
        Quero este produto
      </a>
    </div>
  `;

  ativarReveals(container);

  if (produtosBanner.length > 1) {
    nav.style.display = "flex";
    contador.textContent = `${indiceBanner + 1} / ${produtosBanner.length}`;
  } else {
    nav.style.display = "none";
  }
}

async function carregarBannerHero() {
  try {
    produtosBanner = await listarBannerHero();
    indiceBanner = 0;
    renderizarBanner();
  } catch (erro) {
    console.error("Erro ao carregar banner:", erro);
    document.getElementById("highlight-conteudo").innerHTML =
      `<p class="catalogo-vazio">Não foi possível carregar esta seção agora.</p>`;
  }
}

document.getElementById("highlight-prev")?.addEventListener("click", () => {
  indiceBanner = (indiceBanner - 1 + produtosBanner.length) % produtosBanner.length;
  renderizarBanner();
});

document.getElementById("highlight-next")?.addEventListener("click", () => {
  indiceBanner = (indiceBanner + 1) % produtosBanner.length;
  renderizarBanner();
});

// ── Inicialização ──────────────────────────────────────────────────────────
carregarCategoriasVisuais();
carregarDestaques();
carregarBannerHero();
