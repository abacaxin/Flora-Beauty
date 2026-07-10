// Liga as barras de busca ao catálogo de produtos: a da navbar (desktop)
// e a do menu mobile (A1 — no celular a busca da navbar fica oculta, então
// o painel do menu ganhou um campo próprio). Ambas levam para
// produtos.html?busca=..., onde a filtragem acontece.
// A página produtos.html NÃO inclui este arquivo — lá a busca filtra a
// própria grade (ver js/produtos-catalogo.js).

function ligarBuscaRedirecionando(idForm, idInput) {
  const form = document.getElementById(idForm);
  const input = document.getElementById(idInput);
  if (!form || !input) return;

  form.addEventListener("submit", (evento) => {
    evento.preventDefault();
    const termo = input.value.trim();
    window.location.href = `produtos.html${termo ? `?busca=${encodeURIComponent(termo)}` : ""}`;
  });
}

ligarBuscaRedirecionando("nav-busca-form", "nav-busca-input");
ligarBuscaRedirecionando("mobile-busca-form", "mobile-busca-input");
