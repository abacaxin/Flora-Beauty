// ── Visibilidade do botão "Atacado" na navbar ──────────────────────────────
// Aparece para revendedores com status "aprovado" e também para admin
// (que precisa acompanhar como a experiência de atacado está funcionando).
// Clientes comuns e revendedores ainda pendentes não veem esse botão.

import { observarAuth } from "./auth.js";

const botaoAtacado = document.getElementById("nav-btn-atacado");

if (botaoAtacado) {
  // Esconde por padrão até confirmar o status — evita "flash" do botão
  // para quem não tem permissão, antes do Firebase responder.
  botaoAtacado.style.display = "none";

  observarAuth(({ perfil }) => {
    const podeVerAtacado =
      perfil?.role === "admin" ||
      (perfil?.tipoConta === "revendedor" && perfil?.statusRevendedor === "aprovado");
    botaoAtacado.style.display = podeVerAtacado ? "" : "none";
  });
}
