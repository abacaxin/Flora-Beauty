// ── Frete (versão servidor) — Flora Beauty ────────────────────────────────
// CÓPIA CONSCIENTE de frontend/src/pages/services/frete.js, adaptada para
// CommonJS. O frete cobrado no pedido é SEMPRE o calculado aqui (servidor);
// a versão do front existe só para mostrar a estimativa na tela antes de
// finalizar. Se você alterar valores de zona/peso, altere NOS DOIS arquivos.

const TAXA_RETIRADA_LOJA = 0;

// Zonas por proximidade ao Monumental Shopping (Renascença).
// "valorBase" é o frete para até 1kg; pedidos mais pesados somam FAIXAS_PESO.
const ZONAS = [
  {
    id: "zona1",
    nome: "Renascença e proximidades",
    valorBase: 8,
    bairros: [
      "renascença", "renascenca", "renascença ii", "renascenca ii",
      "ponta d'areia", "ponta d areia", "ponta da areia",
      "calhau", "jardim renascença", "jardim renascenca",
      "jardim são cristóvão", "jardim sao cristovao",
      "ponta do farol", "ponta farol"
    ]
  },
  {
    id: "zona2",
    nome: "Cohama, Vinhais e entorno",
    valorBase: 12,
    bairros: [
      "cohama", "cohafuma", "jaracaty", "jaracati",
      "jardim são francisco", "jardim sao francisco", "são francisco", "sao francisco",
      "monte castelo", "madre deus", "vinhais", "recanto dos vinhais",
      "fátima", "fatima"
    ]
  },
  {
    id: "zona3",
    nome: "Centro e região",
    valorBase: 15,
    bairros: [
      "centro", "joão paulo", "joao paulo", "cohab", "cohab anil",
      "cohab anil iv", "liberdade", "olho d'água", "olho dagua", "olho d agua",
      "desterro", "praia grande", "são francisco centro"
    ]
  },
  {
    id: "zona4",
    nome: "Cohatrac, Turu e adjacências",
    valorBase: 18,
    bairros: [
      "cohatrac", "cohatrac i", "cohatrac ii", "cohatrac iii", "cohatrac iv",
      "turu", "conjunto habitacional turu", "coroado", "coroadinho",
      "jardim america", "jardim américa", "cohajap", "cohaserma"
    ]
  },
  {
    id: "zona5",
    nome: "Itaqui, Anil e demais bairros",
    valorBase: 24,
    bairros: [
      "itaqui", "anil", "cruzeiro do anil", "cutim", "cutim anil",
      "maiobinha", "maiobão", "maiobao", "pedrinhas", "forquilha",
      "ipase", "jabaquara", "coroado", "diamante", "filipinho"
    ]
  }
];

// Adicional por faixa de peso do pedido inteiro (em gramas).
const FAIXAS_PESO = [
  { limiteAteGramas: 1000, adicional: 0 },
  { limiteAteGramas: 3000, adicional: 5 },
  { limiteAteGramas: 6000, adicional: 10 },
  { limiteAteGramas: Infinity, adicional: 18 }
];

function normalizar(texto) {
  return String(texto || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}

function identificarZona(bairro) {
  const normalizado = normalizar(bairro);
  if (!normalizado) return null;

  for (const zona of ZONAS) {
    const encontrou = zona.bairros.some((b) => {
      const bNormalizado = normalizar(b);
      return normalizado.includes(bNormalizado) || bNormalizado.includes(normalizado);
    });
    if (encontrou) return zona;
  }
  return null;
}

function adicionalPorPeso(pesoTotalGramas) {
  const faixa = FAIXAS_PESO.find((f) => pesoTotalGramas <= f.limiteAteGramas);
  return faixa ? faixa.adicional : FAIXAS_PESO[FAIXAS_PESO.length - 1].adicional;
}

/**
 * Calcula o frete final.
 * @param {string} bairro
 * @param {number} pesoTotalGramas
 * @returns {{ valor: number, zona: {id: string, nome: string}|null, encontrado: boolean }}
 */
function calcularFrete(bairro, pesoTotalGramas = 0) {
  const zona = identificarZona(bairro);

  if (!zona) {
    // Bairro não mapeado: usa a zona mais cara como estimativa segura e
    // marca encontrado:false para a loja confirmar manualmente.
    const zonaPadrao = ZONAS[ZONAS.length - 1];
    return {
      valor: zonaPadrao.valorBase + adicionalPorPeso(pesoTotalGramas),
      zona: null,
      encontrado: false
    };
  }

  return {
    valor: zona.valorBase + adicionalPorPeso(pesoTotalGramas),
    zona: { id: zona.id, nome: zona.nome },
    encontrado: true
  };
}

module.exports = { calcularFrete, TAXA_RETIRADA_LOJA };
