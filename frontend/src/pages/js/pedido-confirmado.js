import { exigirLogin } from "../services/auth.js";
import { buscarPedidoPorId } from "../services/pedidos.js";

const params = new URLSearchParams(window.location.search);
const pedidoId = params.get("id");
const conteudo = document.getElementById("confirmacao-conteudo");

function formatarPreco(valor) {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

exigirLogin(async ({ usuario }) => {
  if (!pedidoId) {
    conteudo.innerHTML = `<p class="carrinho-vazio">Pedido não encontrado.</p>`;
    return;
  }

  const pedido = await buscarPedidoPorId(pedidoId);

  if (!pedido || pedido.uidComprador !== usuario.uid) {
    conteudo.innerHTML = `<p class="carrinho-vazio">Pedido não encontrado.</p>`;
    return;
  }

  conteudo.innerHTML = `
    <div style="max-width: 480px; margin: 0 auto; padding: 2rem 0;">
      <div style="font-size: 3rem; margin-bottom: 1rem;">🌸</div>
      <h1 style="font-family:'Playfair Display', serif; font-size: 1.6rem; margin-bottom: 0.8rem;">
        Pedido recebido!
      </h1>
      <p style="font-family:'Jost', sans-serif; color: var(--text-muted); margin-bottom: 1.5rem;">
        Número do pedido: <strong>${pedido.id}</strong><br>
        Total: <strong style="color: var(--gold);">${formatarPreco(pedido.total)}</strong>
      </p>
      <p style="font-family:'Jost', sans-serif; font-size: 0.85rem; color: var(--text-muted); margin-bottom: 2rem;">
        ${pedido.modoEntrega === "retirada"
          ? "Retire seu pedido no Monumental Shopping, 2º piso, assim que recebermos a confirmação do pagamento."
          : "Em breve entraremos em contato para confirmar sua entrega."}
        <br><br>
        O pagamento via Mercado Pago será habilitado em breve — por enquanto, entraremos em contato para combinar o pagamento.
      </p>
      <a href="produtos.html" class="btn-primary" style="text-decoration:none;">Continuar comprando</a>
    </div>
  `;
});
