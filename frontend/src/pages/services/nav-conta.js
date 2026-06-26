import { observarAuth } from "./auth.js";

const navAccountBtn = document.getElementById("nav-account-btn");
const navAccountLabel = document.getElementById("nav-account-label");

if (navAccountBtn && navAccountLabel) {
  observarAuth(({ usuario, perfil }) => {
    if (!usuario) {
      navAccountBtn.setAttribute("href", "login.html");
      navAccountLabel.textContent = "Entrar";
      return;
    }

    const primeiroNome = (perfil?.nome || usuario.displayName || "Conta").split(" ")[0];
    navAccountLabel.textContent = primeiroNome;

    if (perfil?.role === "admin") {
      navAccountBtn.setAttribute("href", "admin/index.html");
    } else {
      // Cliente logado: leva para a página de Minha Conta (configurações).
      navAccountBtn.setAttribute("href", "perfil.html");
    }
  });
}
