import { observarAuth } from "../services/auth.js";
import { listarProdutosAtacado } from "../services/produtos.js";
import { adicionarAoCarrinho } from "../services/carrinho.js";

const conteudo = document.getElementById("atacado-conteudo");
const buscaForm = document.getElementById("nav-busca-form");
const buscaInput = document.getElementById("nav-busca-input");

let usuarioAtual = null;

buscaForm?.addEventListener("submit", (evento) => {
  evento.preventDefault();
  const termo = buscaInput.value.trim();
  window.location.href = `produtos.html${termo ? `?busca=${encodeURIComponent(termo)}` : ""}`;
});

function formatarPreco(valor) {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// ── Estado 1: visitante não logado ───────────────────────────────────────
function renderizarNaoLogado() {
  conteudo.innerHTML = `
    <div style="text-align:center; padding: 6rem 1rem 2rem; max-width: 520px; margin: 0 auto;">
      <div style="font-size: 2.5rem; margin-bottom: 1rem;">📦</div>
      <h1 style="font-family:'Playfair Display', serif; font-size: 1.7rem; margin-bottom: 0.8rem;">
        Área de Atacado
      </h1>
      <p style="font-family:'Jost', sans-serif; color: var(--text-muted); margin-bottom: 2rem;">
        Preços especiais por quantidade para lojistas e revendedores.
        Crie sua conta de revendedor informando o CNPJ da sua loja — após
        a aprovação, você terá acesso a esta área.
      </p>
      <a href="cadastro.html" class="btn-primary" style="text-decoration:none; margin-right: 0.8rem;">Criar conta de revendedor</a>
      <a href="login.html" class="btn-outline" style="text-decoration:none;">Já tenho conta</a>
    </div>
  `;
}

// ── Estado 2: logado, mas não é revendedor aprovado ──────────────────────
function renderizarSemAcesso(perfil) {
  const pendente = perfil?.tipoConta === "revendedor" && perfil?.statusRevendedor === "pendente";
  const rejeitado = perfil?.tipoConta === "revendedor" && perfil?.statusRevendedor === "rejeitado";

  let mensagem;
  if (pendente) {
    mensagem = "Sua conta de revendedor está em análise. Avisaremos por e-mail quando for aprovada.";
  } else if (rejeitado) {
    mensagem = "Sua solicitação de conta revendedora não foi aprovada. Entre em contato com a loja para mais informações.";
  } else {
    mensagem = "Esta área é exclusiva para revendedores aprovados. Se você tem uma loja, crie uma conta de revendedor informando seu CNPJ.";
  }

  conteudo.innerHTML = `
    <div style="text-align:center; padding: 6rem 1rem 2rem; max-width: 520px; margin: 0 auto;">
      <div style="font-size: 2.5rem; margin-bottom: 1rem;">📦</div>
      <h1 style="font-family:'Playfair Display', serif; font-size: 1.7rem; margin-bottom: 0.8rem;">
        Área de Atacado
      </h1>
      <p style="font-family:'Jost', sans-serif; color: var(--text-muted); margin-bottom: 2rem;">
        ${mensagem}
      </p>
      <a href="produtos.html" class="btn-primary" style="text-decoration:none;">Ver catálogo no varejo</a>
    </div>
  `;
}

// ── Estado 3: revendedor aprovado — catálogo de atacado ──────────────────
async function renderizarCatalogoAtacado() {
  conteudo.innerHTML = `
    <div class="catalogo-topo">
      <div class="catalogo-titulo">
        <h1>📦 Catálogo Atacado</h1>
        <p id="atacado-contagem"></p>
      </div>
    </div>
    <p style="font-family:'Jost', sans-serif; font-size: 0.82rem; color: var(--text-muted); margin-bottom: 1.5rem;">
      Os preços abaixo são por unidade, válidos a partir da quantidade mínima de cada produto.
    </p>
    <section class="catalogo-grid" id="atacado-grid">
      <p class="catalogo-loading">Carregando produtos de atacado...</p>
    </section>
  `;

  const grid = document.getElementById("atacado-grid");
  const contagem = document.getElementById("atacado-contagem");

  try {
    const produtos = await listarProdutosAtacado();

    if (produtos.length === 0) {
      grid.innerHTML = `<p class="catalogo-vazio">Nenhum produto disponível em atacado no momento.</p>`;
      contagem.textContent = "";
      return;
    }

    contagem.textContent = `${produtos.length} produto${produtos.length === 1 ? "" : "s"} disponível${produtos.length === 1 ? "" : "is"} em atacado`;

    grid.innerHTML = produtos.map((p) => `
      <div class="catalogo-card" style="cursor:default;" data-produto-id="${p.id}">
        <a href="produto.html?id=${p.id}" style="text-decoration:none; display:block;">
          <div class="catalogo-card-img">
            <img src="${p.imagemURL || 'images/logo.ico'}" alt="${p.nome}" loading="lazy">
          </div>
        </a>
        <div class="catalogo-card-info">
          <h3 class="catalogo-card-nome">${p.nome}</h3>
          <span class="catalogo-card-preco">${formatarPreco(p.precoAtacado)}/un.</span>
          <span class="catalogo-card-preco-atacado">Mínimo: ${p.qtdMinimaAtacado || 1} unidades</span>
          <div class="produto-qtd-wrap" style="margin-top:0.8rem;">
            <div class="produto-qtd-controle">
              <button type="button" class="btn-qtd-menos" data-id="${p.id}">−</button>
              <input type="number" class="input-qtd-atacado" data-id="${p.id}" value="${p.qtdMinimaAtacado || 1}" min="${p.qtdMinimaAtacado || 1}" max="${p.estoque}">
              <button type="button" class="btn-qtd-mais" data-id="${p.id}">+</button>
            </div>
          </div>
          <button class="btn-primary btn-add-atacado" data-id="${p.id}" style="width:100%; margin-top:0.6rem; font-size:0.78rem; padding:0.55rem;">
            Adicionar ao carrinho
          </button>
        </div>
      </div>
    `).join("");

    configurarBotoesAtacado(produtos);
  } catch (erro) {
    console.error(erro);
    grid.innerHTML = `<p class="catalogo-vazio">Não foi possível carregar o catálogo de atacado agora.</p>`;
  }
}

function configurarBotoesAtacado(produtos) {
  document.querySelectorAll(".btn-qtd-mais").forEach((btn) => {
    btn.addEventListener("click", () => {
      const input = document.querySelector(`.input-qtd-atacado[data-id="${btn.dataset.id}"]`);
      input.value = Math.min(Number(input.max), Number(input.value) + 1);
    });
  });

  document.querySelectorAll(".btn-qtd-menos").forEach((btn) => {
    btn.addEventListener("click", () => {
      const input = document.querySelector(`.input-qtd-atacado[data-id="${btn.dataset.id}"]`);
      input.value = Math.max(Number(input.min), Number(input.value) - 1);
    });
  });

  document.querySelectorAll(".btn-add-atacado").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const produtoId = btn.dataset.id;
      const produto = produtos.find((p) => p.id === produtoId);
      const input = document.querySelector(`.input-qtd-atacado[data-id="${produtoId}"]`);
      const quantidade = Number(input.value);

      if (quantidade < (produto.qtdMinimaAtacado || 1)) {
        alert(`A quantidade mínima para este produto em atacado é ${produto.qtdMinimaAtacado || 1} unidades.`);
        return;
      }

      btn.disabled = true;
      btn.textContent = "Adicionando...";

      try {
        await adicionarAoCarrinho(usuarioAtual.uid, {
          produtoId: produto.id,
          nome: produto.nome,
          imagemURL: produto.imagemURL || "",
          precoUnitario: produto.precoAtacado,
          pesoUnitario: produto.peso || 0,
          quantidade,
          modo: "atacado"
        });
        btn.textContent = "Adicionado!";
        setTimeout(() => {
          btn.textContent = "Adicionar ao carrinho";
          btn.disabled = false;
        }, 1500);
      } catch (erro) {
        console.error(erro);
        btn.textContent = "Erro — tente novamente";
        btn.disabled = false;
      }
    });
  });
}

// ── Inicialização ──────────────────────────────────────────────────────────
observarAuth(({ usuario, perfil }) => {
  usuarioAtual = usuario;

  if (!usuario) {
    renderizarNaoLogado();
    return;
  }

  // Admin tem acesso completo ao atacado (comprar e visualizar), para
  // poder acompanhar como a experiência está funcionando para os
  // revendedores de verdade.
  const ehAdmin = perfil?.role === "admin";
  const ehRevendedorAprovado = perfil?.tipoConta === "revendedor" && perfil?.statusRevendedor === "aprovado";

  if (ehAdmin || ehRevendedorAprovado) {
    renderizarCatalogoAtacado();
  } else {
    renderizarSemAcesso(perfil);
  }
});
