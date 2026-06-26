import { listarCategorias } from "./categorias.js";

const lista = document.getElementById("dropdown-categorias-home");
const listaFooter = document.getElementById("footer-categorias-lista");

if (lista || listaFooter) {
  listarCategorias()
    .then((categorias) => {
      const itensDropdown = categorias.map(
        (cat) => `<li><a href="produtos.html?categoria=${cat.slug}"><i class="cat-icon">${cat.icone || "🏷️"}</i> ${cat.nome}</a></li>`
      ).join("");

      if (lista) lista.insertAdjacentHTML("afterbegin", itensDropdown);

      if (listaFooter) {
        const itensFooter = categorias.map(
          (cat) => `<li><a href="produtos.html?categoria=${cat.slug}">${cat.nome}</a></li>`
        ).join("");
        listaFooter.insertAdjacentHTML("afterbegin", itensFooter);
      }
    })
    .catch((erro) => {
      console.error("Erro ao carregar categorias no menu:", erro);
    });
}
