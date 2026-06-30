import { listarProdutos, filtrarProdutos, ordenarProdutos } from "../services/produtos.js";
import { listarCategorias } from "../services/categorias.js";

const grid = document.getElementById("catalogo-grid");
const tituloTexto = document.getElementById("catalogo-titulo-texto");
const contagem = document.getElementById("catalogo-contagem");
const selectOrdenar = document.getElementById("select-ordenar");
const buscaInput = document.getElementById("nav-busca-input");
const buscaForm = document.getElementById("nav-busca-form");
const filtroCategoriasLista = document.getElementById("filtro-categorias-lista");
const dropdownCategoriasLista = document.getElementById("dropdown-categorias-lista");
const inputPrecoMin = document.getElementById("filtro-preco-min");
const inputPrecoMax = document.getElementById("filtro-preco-max");
const btnAplicarPreco = document.getElementById("btn-aplicar-preco");
const btnLimparFiltros = document.getElementById("btn-limpar-filtros");

let produtosBrutos = []; // tudo que veio do Firestore para a categoria atual
let categoriasCache = [];
let categoriaAtual = "";
let termoBusca = "";
let precoMin = null;
let precoMax = null;

// ── Lê parâmetros da URL (categoria=, busca=) ────────────────────────────
const params = new URLSearchParams(window.location.search);
categoriaAtual = params.get("categoria") || "";
termoBusca = params.get("busca") || "";
buscaInput.value = termoBusca;

// ── Monta a lista de categorias nos filtros e no dropdown da navbar ──────
async function montarCategorias() {
  try {
    categoriasCache = await listarCategorias();
  } catch (erro) {
    console.error("Erro ao carregar categorias:", erro);
    categoriasCache = [];
  }

  filtroCategoriasLista.innerHTML = categoriasCache.map(
    (cat) => `<button class="filtro-categoria-item" data-categoria="${cat.slug}"> ${cat.nome}</button>`
  ).join("");

  dropdownCategoriasLista.innerHTML = categoriasCache.map(
    (cat) => `<li><a href="produtos.html?categoria=${cat.slug}"><i class="cat-icon"></i> ${cat.nome}</a></li>`
  ).join("");

  document.querySelectorAll(".filtro-categoria-item").forEach((btn) => {
    btn.addEventListener("click", () => {
      categoriaAtual = btn.dataset.categoria;
      document.querySelectorAll(".filtro-categoria-item").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      carregarProdutos();
    });
  });

  // Marca o botão "Todas" ou a categoria certa como ativo, conforme a URL
  const botaoAtivo = document.querySelector(
    `.filtro-categoria-item[data-categoria="${categoriaAtual}"]`
  );
  if (botaoAtivo) {
    document.querySelectorAll(".filtro-categoria-item").forEach((b) => b.classList.remove("active"));
    botaoAtivo.classList.add("active");
  }
}

// ── Renderiza os cards de produto ────────────────────────────────────────
function formatarPreco(valor) {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function renderizarProdutos(produtos) {
  if (produtos.length === 0) {
    grid.innerHTML = `<p class="catalogo-vazio">Nenhum produto encontrado com esses filtros.</p>`;
    return;
  }

  grid.innerHTML = produtos.map((p) => `
    <a class="catalogo-card" href="produto.html?id=${p.id}">
      <div class="catalogo-card-img">
        <img src="${p.imagemURL || 'images/logo.ico'}" alt="${p.nome}" loading="lazy">
      </div>
      <div class="catalogo-card-info">
        <h3 class="catalogo-card-nome">${p.nome}</h3>
        <span class="catalogo-card-preco">${formatarPreco(p.precoVarejo)}</span>
        ${p.precoAtacado ? `<span class="catalogo-card-preco-atacado">A partir de ${p.qtdMinimaAtacado || 1}un: ${formatarPreco(p.precoAtacado)}/un</span>` : ""}
        ${p.estoque <= 0 ? `<span class="catalogo-card-estoque">Fora de estoque</span>` : ""}
      </div>
    </a>
  `).join("");
}

function aplicarFiltrosERenderizar() {
  let lista = filtrarProdutos(produtosBrutos, { termo: termoBusca, precoMin, precoMax });
  lista = ordenarProdutos(lista, selectOrdenar.value);
  renderizarProdutos(lista);
  contagem.textContent = `${lista.length} produto${lista.length === 1 ? "" : "s"} encontrado${lista.length === 1 ? "" : "s"}`;
}

// ── Carrega produtos do Firestore (refeito quando a categoria muda) ──────
async function carregarProdutos() {
  grid.innerHTML = `<p class="catalogo-loading">Carregando produtos...</p>`;

  const catInfo = categoriasCache.find((c) => c.slug === categoriaAtual);
  tituloTexto.textContent = catInfo ? catInfo.nome : "Todos os produtos";

  try {
    produtosBrutos = await listarProdutos({ categoria: categoriaAtual || null });
    aplicarFiltrosERenderizar();
  } catch (erro) {
    console.error("Erro ao carregar produtos:", erro);
    grid.innerHTML = `<p class="catalogo-vazio">Não foi possível carregar os produtos agora. Tente novamente em instantes.</p>`;
  }
}

// ── Eventos ───────────────────────────────────────────────────────────────
buscaForm.addEventListener("submit", (evento) => {
  evento.preventDefault();
  termoBusca = buscaInput.value.trim();
  aplicarFiltrosERenderizar();
});

selectOrdenar.addEventListener("change", aplicarFiltrosERenderizar);

btnAplicarPreco.addEventListener("click", () => {
  precoMin = inputPrecoMin.value ? Number(inputPrecoMin.value) : null;
  precoMax = inputPrecoMax.value ? Number(inputPrecoMax.value) : null;
  aplicarFiltrosERenderizar();
});

btnLimparFiltros.addEventListener("click", () => {
  termoBusca = "";
  precoMin = null;
  precoMax = null;
  categoriaAtual = "";
  buscaInput.value = "";
  inputPrecoMin.value = "";
  inputPrecoMax.value = "";
  selectOrdenar.value = "relevancia";
  document.querySelectorAll(".filtro-categoria-item").forEach((b) => b.classList.remove("active"));
  const botaoTodas = document.querySelector('.filtro-categoria-item[data-categoria=""]');
  if (botaoTodas) botaoTodas.classList.add("active");
  carregarProdutos();
});

// ── Inicialização ──────────────────────────────────────────────────────────
async function iniciar() {
  await montarCategorias();
  await carregarProdutos();
}
iniciar();
