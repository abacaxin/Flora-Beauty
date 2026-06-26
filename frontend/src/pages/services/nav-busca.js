// Liga a barra de busca da navbar (usada fora da página de catálogo,
// como na Home) ao catálogo de produtos.
const form = document.getElementById("nav-busca-form");
const input = document.getElementById("nav-busca-input");

if (form && input) {
  form.addEventListener("submit", (evento) => {
    evento.preventDefault();
    const termo = input.value.trim();
    window.location.href = `produtos.html${termo ? `?busca=${encodeURIComponent(termo)}` : ""}`;
  });
}
