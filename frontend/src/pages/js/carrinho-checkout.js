import { exigirLogin } from "../services/auth.js";
import { db } from "../services/firebase-config.js";
import {
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";
import {
  obterCarrinho,
  atualizarQuantidade,
  removerDoCarrinho,
  esvaziarCarrinho,
  calcularTotal
} from "../services/carrinho.js";
import { calcularFrete, TAXA_RETIRADA_LOJA } from "../services/frete.js";
import { criarPedido } from "../services/pedidos.js";

const conteudo = document.getElementById("carrinho-conteudo");

let usuarioAtual = null;
let itensAtuais = [];
let modoEntrega = "entrega"; // "entrega" | "retirada"
let freteAtual = { valor: 0, zona: null, encontrado: true };

function formatarPreco(valor) {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function pesoTotalCarrinho(itens) {
  return itens.reduce((soma, item) => soma + (item.pesoUnitario || 0) * item.quantidade, 0);
}

// ── Renderização ──────────────────────────────────────────────────────────
function renderizarCarrinho() {
  if (itensAtuais.length === 0) {
    conteudo.innerHTML = `
      <p class="carrinho-vazio">
        Seu carrinho está vazio.<br><br>
        <a href="produtos.html" class="btn-primary" style="text-decoration:none;">Ver produtos</a>
      </p>
    `;
    return;
  }

  const subtotal = calcularTotal(itensAtuais);

  conteudo.innerHTML = `
    <div class="carrinho-layout">
      <div class="carrinho-itens" id="lista-itens"></div>

      <aside class="carrinho-resumo">
        <h2>Entrega</h2>

        <div class="modo-entrega-opcoes">
          <button class="modo-entrega-btn ${modoEntrega === "entrega" ? "active" : ""}" data-modo="entrega">
            🚚 Entrega
          </button>
          <button class="modo-entrega-btn ${modoEntrega === "retirada" ? "active" : ""}" data-modo="retirada">
            🏬 Retirar na loja
          </button>
        </div>

        <div id="campos-entrega"></div>

        <h2 style="margin-top:1.2rem;">Resumo do pedido</h2>
        <div class="resumo-linha">
          <span>Subtotal</span>
          <span>${formatarPreco(subtotal)}</span>
        </div>
        <div class="resumo-linha" id="linha-frete">
          <span>Frete</span>
          <span id="valor-frete">${modoEntrega === "retirada" ? "Grátis" : "—"}</span>
        </div>
        <div class="resumo-linha total">
          <span>Total</span>
          <span id="valor-total">${formatarPreco(subtotal)}</span>
        </div>

        <button class="btn-finalizar" id="btn-finalizar">Finalizar compra</button>
        <p class="checkout-msg" id="checkout-msg" style="display:none;"></p>
      </aside>
    </div>
  `;

  renderizarItens();
  renderizarCamposEntrega();
  configurarBotaoFinalizar();

  document.querySelectorAll(".modo-entrega-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      modoEntrega = btn.dataset.modo;
      document.querySelectorAll(".modo-entrega-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      renderizarCamposEntrega();
      atualizarResumoFrete();
    });
  });
}

function renderizarItens() {
  const lista = document.getElementById("lista-itens");
  lista.innerHTML = itensAtuais.map((item) => `
    <div class="carrinho-item" data-produto-id="${item.produtoId}" data-modo="${item.modo}">
      <div class="carrinho-item-img">
        <img src="${item.imagemURL || 'images/logo.ico'}" alt="${item.nome}">
      </div>
      <div class="carrinho-item-info">
        <h3>${item.nome} ${item.modo === "atacado" ? '<span style="font-size:0.65rem; color:var(--gold); border:1px solid var(--gold); padding:0.1rem 0.4rem; border-radius:3px; margin-left:0.4rem;">ATACADO</span>' : ""}</h3>
        <span class="preco-unit">${formatarPreco(item.precoUnitario)} / un.</span>
        <div class="carrinho-item-qtd">
          <button type="button" class="btn-qtd-menos">−</button>
          <span class="qtd-valor">${item.quantidade}</span>
          <button type="button" class="btn-qtd-mais">+</button>
        </div>
      </div>
      <div class="carrinho-item-totais">
        <div class="preco-total">${formatarPreco(item.precoUnitario * item.quantidade)}</div>
        <button class="carrinho-item-remover">Remover</button>
      </div>
    </div>
  `).join("");

  lista.querySelectorAll(".carrinho-item").forEach((el) => {
    const produtoId = el.dataset.produtoId;
    const modo = el.dataset.modo;
    const item = itensAtuais.find((i) => i.produtoId === produtoId && i.modo === modo);

    el.querySelector(".btn-qtd-mais").addEventListener("click", async () => {
      await mudarQuantidade(produtoId, modo, item.quantidade + 1);
    });
    el.querySelector(".btn-qtd-menos").addEventListener("click", async () => {
      await mudarQuantidade(produtoId, modo, item.quantidade - 1);
    });
    el.querySelector(".carrinho-item-remover").addEventListener("click", async () => {
      itensAtuais = await removerDoCarrinho(usuarioAtual.uid, produtoId, modo);
      renderizarCarrinho();
    });
  });
}

async function mudarQuantidade(produtoId, modo, novaQtd) {
  if (novaQtd < 1) return;
  itensAtuais = await atualizarQuantidade(usuarioAtual.uid, produtoId, modo, novaQtd);
  renderizarCarrinho();
}

function renderizarCamposEntrega() {
  const container = document.getElementById("campos-entrega");

  if (modoEntrega === "retirada") {
    container.innerHTML = `
      <p class="frete-zona-info">
        Retire seu pedido no Monumental Shopping, 2º piso — sem custo de frete.
      </p>
    `;
    return;
  }

  container.innerHTML = `
    <div class="checkout-campo">
      <label for="checkout-cep">CEP</label>
      <input type="text" id="checkout-cep" placeholder="65000-000" maxlength="9">
    </div>
    <div class="checkout-campo">
      <label for="checkout-endereco">Endereço</label>
      <input type="text" id="checkout-endereco" placeholder="Rua, número, bairro">
    </div>
    <div class="checkout-campo">
      <label for="checkout-bairro">Bairro</label>
      <input type="text" id="checkout-bairro" placeholder="Bairro (usado para calcular o frete)">
    </div>
    <p class="frete-zona-info" id="frete-zona-info"></p>
  `;

  const cepInput = document.getElementById("checkout-cep");
  const bairroInput = document.getElementById("checkout-bairro");
  const enderecoInput = document.getElementById("checkout-endereco");

  cepInput.addEventListener("input", () => {
    let v = cepInput.value.replace(/\D/g, "").slice(0, 8);
    if (v.length > 5) v = v.replace(/(\d{5})(\d{0,3})/, "$1-$2");
    cepInput.value = v;
  });

  cepInput.addEventListener("blur", async () => {
    const cepLimpo = cepInput.value.replace(/\D/g, "");
    if (cepLimpo.length !== 8) return;

    try {
      const resposta = await fetch(`https://viacep.com.br/ws/${cepLimpo}/json/`);
      const dados = await resposta.json();
      if (dados.erro) return;

      enderecoInput.value = `${dados.logradouro || ""}`.trim();
      bairroInput.value = dados.bairro || "";
      atualizarResumoFrete();
    } catch {
      // Silencioso: o usuário ainda pode digitar o bairro manualmente.
    }
  });

  bairroInput.addEventListener("blur", atualizarResumoFrete);

  // Pré-carrega endereço salvo no perfil, se existir
  carregarEnderecoSalvo();
}

async function carregarEnderecoSalvo() {
  try {
    const ref = doc(db, "usuarios", usuarioAtual.uid, "dados", "endereco");
    const snap = await getDoc(ref);
    if (!snap.exists()) return;

    const e = snap.data();
    const cepInput = document.getElementById("checkout-cep");
    const enderecoInput = document.getElementById("checkout-endereco");
    if (!cepInput || cepInput.value) return; // não sobrescreve o que o usuário já digitou

    cepInput.value = e.cep || "";
    enderecoInput.value = `${e.endereco || ""}${e.complemento ? ", " + e.complemento : ""}`;

    // Tenta extrair o bairro do endereço salvo (formato "Rua, Bairro")
    const partesEndereco = (e.endereco || "").split(",");
    const bairroInput = document.getElementById("checkout-bairro");
    if (partesEndereco.length > 1 && bairroInput) {
      bairroInput.value = partesEndereco[1].trim();
      atualizarResumoFrete();
    }
  } catch (erro) {
    console.error("Erro ao carregar endereço salvo:", erro);
  }
}

function atualizarResumoFrete() {
  const subtotal = calcularTotal(itensAtuais);
  const valorFreteEl = document.getElementById("valor-frete");
  const valorTotalEl = document.getElementById("valor-total");
  const zonaInfoEl = document.getElementById("frete-zona-info");

  if (modoEntrega === "retirada") {
    freteAtual = { valor: TAXA_RETIRADA_LOJA, zona: null, encontrado: true };
    valorFreteEl.textContent = "Grátis";
    valorTotalEl.textContent = formatarPreco(subtotal + TAXA_RETIRADA_LOJA);
    return;
  }

  const bairroInput = document.getElementById("checkout-bairro");
  const bairro = bairroInput?.value.trim();

  if (!bairro) {
    valorFreteEl.textContent = "Informe o bairro";
    valorTotalEl.textContent = formatarPreco(subtotal);
    return;
  }

  const peso = pesoTotalCarrinho(itensAtuais);
  freteAtual = calcularFrete(bairro, peso);

  valorFreteEl.textContent = formatarPreco(freteAtual.valor);
  valorTotalEl.textContent = formatarPreco(subtotal + freteAtual.valor);

  if (zonaInfoEl) {
    if (freteAtual.encontrado) {
      zonaInfoEl.textContent = `Região: ${freteAtual.zona.nome}`;
      zonaInfoEl.classList.remove("alerta");
    } else {
      zonaInfoEl.textContent = "Não localizamos esse bairro automaticamente — confirmaremos o frete por WhatsApp antes do envio.";
      zonaInfoEl.classList.add("alerta");
    }
  }
}

// ── Finalizar compra ────────────────────────────────────────────────────
function configurarBotaoFinalizar() {
  const btn = document.getElementById("btn-finalizar");
  const msg = document.getElementById("checkout-msg");

  btn.addEventListener("click", async () => {
    msg.style.display = "none";

    let endereco = null;
    if (modoEntrega === "entrega") {
      const cep = document.getElementById("checkout-cep")?.value.trim();
      const enderecoTexto = document.getElementById("checkout-endereco")?.value.trim();
      const bairro = document.getElementById("checkout-bairro")?.value.trim();

      if (!cep || !enderecoTexto || !bairro) {
        msg.textContent = "Preencha CEP, endereço e bairro para continuar.";
        msg.classList.remove("sucesso");
        msg.style.display = "block";
        return;
      }
      endereco = { cep, endereco: enderecoTexto, bairro };
      atualizarResumoFrete();
    }

    const subtotal = calcularTotal(itensAtuais);
    const totalFinal = subtotal + (modoEntrega === "retirada" ? 0 : freteAtual.valor);

    btn.disabled = true;
    btn.textContent = "Criando pedido...";

    try {
      const pedidoRef = await criarPedido({
        uidComprador: usuarioAtual.uid,
        itens: itensAtuais,
        modoEntrega,
        endereco,
        frete: modoEntrega === "retirada" ? null : freteAtual,
        subtotal,
        total: totalFinal
      });

      await esvaziarCarrinho(usuarioAtual.uid);

      msg.textContent = "Pedido criado com sucesso! Redirecionando para o pagamento...";
      msg.classList.add("sucesso");
      msg.style.display = "block";

      // O pagamento via Mercado Pago será conectado na próxima etapa.
      // Por ora, redireciona para uma página de confirmação simples.
      setTimeout(() => {
        window.location.href = `pedido-confirmado.html?id=${pedidoRef.id}`;
      }, 1200);
    } catch (erro) {
      console.error(erro);
      msg.textContent = "Não foi possível finalizar o pedido agora. Tente novamente.";
      msg.classList.remove("sucesso");
      msg.style.display = "block";
      btn.disabled = false;
      btn.textContent = "Finalizar compra";
    }
  });
}

// ── Inicialização ──────────────────────────────────────────────────────────
exigirLogin(async ({ usuario }) => {
  usuarioAtual = usuario;
  itensAtuais = await obterCarrinho(usuario.uid);
  renderizarCarrinho();
});
