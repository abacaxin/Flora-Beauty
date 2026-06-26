import { protegerPaginaAdmin } from "./admin-auth.js";
import {
  criarProduto,
  atualizarProduto,
  excluirProduto
} from "../../services/produtos.js";
import { listarCategorias } from "../../services/categorias.js";
import { db } from "../../services/firebase-config.js";
import {
  collection,
  getDocs,
  query,
  orderBy
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";

let produtosCache = [];
let categoriasCache = [];
let produtoEditandoId = null;

const tabela = document.getElementById("tabela-produtos");
const contagem = document.getElementById("contagem-produtos");
const modal = document.getElementById("modal-produto");
const form = document.getElementById("form-produto");
const modalTitulo = document.getElementById("modal-titulo");
const modalMsg = document.getElementById("modal-msg");
const btnSalvar = document.getElementById("btn-salvar-produto");
const selectOrdenar = document.getElementById("select-ordenar-admin");
const inputBusca = document.getElementById("busca-produtos-admin");
const selectCategoria = document.getElementById("p-categoria");
const selectBannerHero = document.getElementById("p-banner-hero");
const camposBannerHero = document.getElementById("campos-banner-hero");
const listaImagens = document.getElementById("lista-imagens-produto");
const btnAddImagem = document.getElementById("btn-add-imagem");

function formatarPreco(valor) {
  return (valor || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// Busca TODOS os produtos (ativos e inativos) — diferente do catálogo
// público, o admin precisa ver e gerenciar tudo.
async function buscarTodosProdutosAdmin() {
  const colecaoRef = collection(db, "produtos");
  const q = query(colecaoRef, orderBy("criadoEm", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

async function carregarCategoriasNoSelect() {
  categoriasCache = await listarCategorias();
  if (categoriasCache.length === 0) {
    selectCategoria.innerHTML = `<option value="" disabled selected>Nenhuma categoria cadastrada — crie uma em "Categorias"</option>`;
    return;
  }
  selectCategoria.innerHTML = categoriasCache
    .map((c) => `<option value="${c.slug}">${c.icone || "🏷️"} ${c.nome}</option>`)
    .join("");
}

// ── Busca + ordenação combinadas ─────────────────────────────────────────
function ordenarLista(lista, criterio) {
  const copia = [...lista];
  switch (criterio) {
    case "categoria-az":
      return copia.sort((a, b) => (a.categoria || "").localeCompare(b.categoria || "", "pt-BR"));
    case "preco-maior":
      return copia.sort((a, b) => (b.precoVarejo || 0) - (a.precoVarejo || 0));
    case "preco-menor":
      return copia.sort((a, b) => (a.precoVarejo || 0) - (b.precoVarejo || 0));
    case "estoque-maior":
      return copia.sort((a, b) => (b.estoque || 0) - (a.estoque || 0));
    case "estoque-menor":
      return copia.sort((a, b) => (a.estoque || 0) - (b.estoque || 0));
    default:
      return copia; // "recentes" = ordem original (mais recentes primeiro)
  }
}

function filtrarPorBusca(lista, termo) {
  const termoNormalizado = termo.trim().toLowerCase();
  if (!termoNormalizado) return lista;
  return lista.filter((p) => {
    const alvo = `${p.nome || ""} ${p.sku || ""}`.toLowerCase();
    return alvo.includes(termoNormalizado);
  });
}

function nomeCategoria(slug) {
  return categoriasCache.find((c) => c.slug === slug)?.nome || slug || "—";
}

function renderizarTabela() {
  let lista = filtrarPorBusca(produtosCache, inputBusca.value);
  lista = ordenarLista(lista, selectOrdenar.value);

  contagem.textContent = `${lista.length} de ${produtosCache.length} produto${produtosCache.length === 1 ? "" : "s"}`;

  if (lista.length === 0) {
    tabela.innerHTML = produtosCache.length === 0
      ? `<p class="admin-vazio">Nenhum produto cadastrado ainda. Clique em "+ Novo produto" para começar.</p>`
      : `<p class="admin-vazio">Nenhum produto encontrado para essa busca.</p>`;
    return;
  }

  tabela.innerHTML = `
    <table class="admin-tabela">
      <thead>
        <tr>
          <th></th>
          <th>Nome</th>
          <th>SKU</th>
          <th>Categoria</th>
          <th>Preço</th>
          <th>Estoque</th>
          <th>Status</th>
          <th>Ações</th>
        </tr>
      </thead>
      <tbody>
        ${lista.map((p) => `
          <tr>
            <td><img class="thumb" src="${primeiraImagem(p) || '../images/logo.ico'}" alt=""></td>
            <td>${p.nome} ${p.bannerHero ? '<span class="badge badge-aprovado" title="No banner Produto da Estação">BANNER</span>' : ""}</td>
            <td>${p.sku || "—"}</td>
            <td>${nomeCategoria(p.categoria)}</td>
            <td>${formatarPreco(p.precoVarejo)}</td>
            <td>${p.estoque ?? 0}</td>
            <td><span class="badge ${p.ativo ? 'badge-aprovado' : 'badge-rejeitado'}">${p.ativo ? 'Ativo' : 'Inativo'}</span></td>
            <td>
              <div class="admin-acoes-linha">
                <button class="admin-btn admin-btn-outline admin-btn-sm btn-editar" data-id="${p.id}">Editar</button>
                <button class="admin-btn admin-btn-danger admin-btn-sm btn-excluir" data-id="${p.id}">Excluir</button>
              </div>
            </td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;

  document.querySelectorAll(".btn-editar").forEach((btn) => {
    btn.addEventListener("click", () => abrirModalEdicao(btn.dataset.id));
  });
  document.querySelectorAll(".btn-excluir").forEach((btn) => {
    btn.addEventListener("click", () => confirmarExclusao(btn.dataset.id));
  });
}

// imagemURL continua sendo o campo principal (compatibilidade com o
// restante do site); imagensExtras guarda as imagens adicionais.
function primeiraImagem(produto) {
  return produto.imagemURL || (produto.imagensExtras && produto.imagensExtras[0]) || "";
}

async function carregarTabela() {
  produtosCache = await buscarTodosProdutosAdmin();
  renderizarTabela();
}

// ── Lista dinâmica de campos de imagem ───────────────────────────────────
function criarLinhaImagem(valor = "", ehPrincipal = false) {
  const linha = document.createElement("div");
  linha.className = "linha-imagem-produto";
  linha.style.display = "flex";
  linha.style.gap = "0.5rem";
  linha.style.marginBottom = "0.5rem";

  linha.innerHTML = `
    <input type="url" class="input-imagem-produto" placeholder="${ehPrincipal ? 'https://... (imagem principal)' : 'https://... (imagem adicional)'}" value="${valor}" style="flex:1;">
    ${!ehPrincipal ? `<button type="button" class="admin-btn admin-btn-danger admin-btn-sm btn-remover-imagem">Remover</button>` : ""}
  `;

  const btnRemover = linha.querySelector(".btn-remover-imagem");
  if (btnRemover) {
    btnRemover.addEventListener("click", () => linha.remove());
  }

  return linha;
}

function resetarListaImagens() {
  listaImagens.innerHTML = "";
  listaImagens.appendChild(criarLinhaImagem("", true));
}

function preencherListaImagens(produto) {
  listaImagens.innerHTML = "";
  listaImagens.appendChild(criarLinhaImagem(produto.imagemURL || "", true));
  (produto.imagensExtras || []).forEach((url) => {
    listaImagens.appendChild(criarLinhaImagem(url, false));
  });
}

function coletarImagens() {
  const inputs = Array.from(listaImagens.querySelectorAll(".input-imagem-produto"));
  const valores = inputs.map((i) => i.value.trim()).filter(Boolean);
  return {
    imagemURL: valores[0] || "",
    imagensExtras: valores.slice(1)
  };
}

btnAddImagem.addEventListener("click", () => {
  listaImagens.appendChild(criarLinhaImagem("", false));
});

// ── Modal de criar/editar produto ────────────────────────────────────────
function limparForm() {
  form.reset();
  document.getElementById("p-ativo").value = "true";
  document.getElementById("p-destaque").value = "false";
  selectBannerHero.value = "false";
  camposBannerHero.style.display = "none";
  document.getElementById("p-banner-nome-secao").value = "Produto da estação";
  modalMsg.style.display = "none";
  resetarListaImagens();
}

function abrirModalNovo() {
  produtoEditandoId = null;
  limparForm();
  modalTitulo.textContent = "Novo produto";
  modal.style.display = "flex";
}

function abrirModalEdicao(id) {
  const p = produtosCache.find((prod) => prod.id === id);
  if (!p) return;

  produtoEditandoId = id;
  limparForm();
  modalTitulo.textContent = "Editar produto";

  document.getElementById("p-nome").value = p.nome || "";
  document.getElementById("p-sku").value = p.sku || "";
  document.getElementById("p-codigo-barras").value = p.codigoBarras || "";
  if (p.categoria) selectCategoria.value = p.categoria;
  document.getElementById("p-peso").value = p.peso || "";
  document.getElementById("p-descricao").value = p.descricao || "";
  preencherListaImagens(p);
  document.getElementById("p-preco-varejo").value = p.precoVarejo || "";
  document.getElementById("p-estoque").value = p.estoque ?? 0;
  document.getElementById("p-preco-atacado").value = p.precoAtacado || "";
  document.getElementById("p-qtd-min-atacado").value = p.qtdMinimaAtacado || "";
  document.getElementById("p-ativo").value = String(p.ativo !== false);
  document.getElementById("p-destaque").value = String(p.destaque === true);

  selectBannerHero.value = String(p.bannerHero === true);
  camposBannerHero.style.display = p.bannerHero ? "block" : "none";
  document.getElementById("p-banner-imagem").value = p.bannerImagemURL || "";
  document.getElementById("p-banner-nome-secao").value = p.bannerNomeSecao || "Produto da estação";
  document.getElementById("p-banner-etiqueta").value = p.bannerEtiqueta || "";
  document.getElementById("p-banner-titulo").value = p.bannerTitulo || "";
  document.getElementById("p-banner-texto").value = p.bannerTexto || "";
  document.getElementById("p-banner-tags").value = (p.bannerTags || []).join(", ");
  document.getElementById("p-banner-ordem").value = p.bannerOrdem ?? 0;

  modal.style.display = "flex";
}

function fecharModal() {
  modal.style.display = "none";
}

async function confirmarExclusao(id) {
  const produto = produtosCache.find((p) => p.id === id);
  const confirmar = confirm(`Excluir o produto "${produto?.nome}"? Essa ação não pode ser desfeita.`);
  if (!confirmar) return;

  try {
    await excluirProduto(id);
    await carregarTabela();
  } catch (erro) {
    console.error(erro);
    alert("Não foi possível excluir o produto agora. Tente novamente.");
  }
}

document.getElementById("btn-novo-produto").addEventListener("click", abrirModalNovo);
document.getElementById("btn-cancelar-modal").addEventListener("click", fecharModal);
modal.addEventListener("click", (evento) => {
  if (evento.target === modal) fecharModal();
});

selectOrdenar.addEventListener("change", renderizarTabela);
inputBusca.addEventListener("input", renderizarTabela);

selectBannerHero.addEventListener("change", () => {
  camposBannerHero.style.display = selectBannerHero.value === "true" ? "block" : "none";
});

form.addEventListener("submit", async (evento) => {
  evento.preventDefault();
  modalMsg.style.display = "none";

  const bannerHero = selectBannerHero.value === "true";
  const { imagemURL, imagensExtras } = coletarImagens();

  const dados = {
    nome: document.getElementById("p-nome").value.trim(),
    sku: document.getElementById("p-sku").value.trim(),
    codigoBarras: document.getElementById("p-codigo-barras").value.trim(),
    categoria: selectCategoria.value,
    peso: Number(document.getElementById("p-peso").value) || 0,
    descricao: document.getElementById("p-descricao").value.trim(),
    imagemURL,
    imagensExtras,
    precoVarejo: Number(document.getElementById("p-preco-varejo").value) || 0,
    estoque: Number(document.getElementById("p-estoque").value) || 0,
    precoAtacado: Number(document.getElementById("p-preco-atacado").value) || null,
    qtdMinimaAtacado: Number(document.getElementById("p-qtd-min-atacado").value) || null,
    ativo: document.getElementById("p-ativo").value === "true",
    destaque: document.getElementById("p-destaque").value === "true",
    bannerHero,
    bannerImagemURL: bannerHero ? document.getElementById("p-banner-imagem").value.trim() : "",
    bannerNomeSecao: bannerHero ? (document.getElementById("p-banner-nome-secao").value.trim() || "Produto da estação") : "",
    bannerEtiqueta: bannerHero ? document.getElementById("p-banner-etiqueta").value.trim() : "",
    bannerTitulo: bannerHero ? document.getElementById("p-banner-titulo").value.trim() : "",
    bannerTexto: bannerHero ? document.getElementById("p-banner-texto").value.trim() : "",
    bannerTags: bannerHero
      ? document.getElementById("p-banner-tags").value.split(",").map((t) => t.trim()).filter(Boolean)
      : [],
    bannerOrdem: bannerHero ? Number(document.getElementById("p-banner-ordem").value) || 0 : 0
  };

  if (!dados.nome || !dados.sku) {
    modalMsg.textContent = "Nome e SKU são obrigatórios.";
    modalMsg.classList.remove("sucesso");
    modalMsg.style.display = "block";
    return;
  }

  if (!dados.categoria) {
    modalMsg.textContent = "Selecione uma categoria (crie uma em \"Categorias\" se a lista estiver vazia).";
    modalMsg.classList.remove("sucesso");
    modalMsg.style.display = "block";
    return;
  }

  btnSalvar.disabled = true;
  btnSalvar.textContent = "Salvando...";

  try {
    if (produtoEditandoId) {
      await atualizarProduto(produtoEditandoId, dados);
    } else {
      await criarProduto(dados);
    }
    fecharModal();
    await carregarTabela();
  } catch (erro) {
    console.error(erro);
    modalMsg.textContent = "Não foi possível salvar o produto agora. Tente novamente.";
    modalMsg.classList.remove("sucesso");
    modalMsg.style.display = "block";
  } finally {
    btnSalvar.disabled = false;
    btnSalvar.textContent = "Salvar produto";
  }
});

protegerPaginaAdmin(async () => {
  try {
    await carregarCategoriasNoSelect();
    await carregarTabela();
  } catch (erro) {
    console.error("Erro ao carregar produtos:", erro);
    tabela.innerHTML = `<p class="admin-vazio">Não foi possível carregar os produtos agora.</p>`;
  }
});
