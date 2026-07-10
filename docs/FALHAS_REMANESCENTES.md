# Estado Atual e Falhas Remanescentes — pós-revisão 07/2026

Registro honesto do que **ainda não está resolvido** depois das mudanças. Nenhum sistema é "100% seguro" — esta lista é o que sabemos que falta, em ordem de prioridade.

---

## 1. Pendências que DEPENDEM DE AÇÃO MANUAL (bloqueiam a proteção nova)

Estas proteções estão **implementadas no código, mas desligadas** até os passos do [MANUAL_CONFIGURACAO.md](MANUAL_CONFIGURACAO.md):

| # | Pendência | Risco enquanto não for feita |
|---|-----------|------------------------------|
| P1 | **Deploy das novas `firestore.rules`** | As regras antigas continuam valendo no servidor: `metricas` aberta, pedido forjável, perfil sem exigir e-mail verificado. **O código novo do site já supõe as regras novas.** |
| P2 | **Deploy da Cloud Function `criarPedido`** (exige plano Blaze) | Sem a função no ar + rules novas aplicadas, o checkout fica **quebrado** (o front chama a função). Fazer P1+P2 juntos. |
| P3 | **App Check (chave reCAPTCHA + enforce no console + `EXIGIR_APP_CHECK = true`)** | Bots ainda conseguem chamar Auth/Firestore direto. O C2 (perfil só com e-mail verificado) reduz o estrago no banco, mas a criação de contas Auth e o spam de e-mails de verificação continuam possíveis até o App Check ser aplicado. |
| P4 | **Estoque de atacado dos produtos antigos** | Produtos cadastrados antes aparecem como "sem estoque de atacado" até o admin preencher o campo novo. |

## 2. Falhas de segurança conhecidas que PERMANECEM (por decisão de escopo)

| # | Falha | Por que ficou | Mitigação atual / caminho |
|---|-------|---------------|---------------------------|
| R1 | **Rate limiting fino inexistente.** App Check dificulta bots, mas não impede um humano (ou farm de humanos) de criar contas/pedidos em volume. | Firebase não tem rate limit nativo por usuário; exigiria contadores em Firestore ou Cloud Armor. | Alertas de billing + monitorar console. Roadmap: contador de pedidos/hora por uid na própria function. |
| R2 | **E-mail "existente" não é verificável em tempo real.** Validamos formato + exigimos clique no link; um e-mail real de terceiro ainda recebe 1 mensagem indesejada. | Verificação SMTP em tempo real é não-confiável e cara; é o mesmo trade-off de qualquer loja. | App Check + limite natural do Firebase de reenvio. |
| R3 | **Admin é um único ponto de falha.** Uma conta admin comprometida edita produtos/preços/pedidos. | Escopo — exigiria 2FA obrigatório e trilha de auditoria. | C4 (escape) já impede que o admin comprometido plante XSS. Roadmap: exigir MFA na conta admin (console Firebase suporta). |
| R4 | **Sem verificação server-side de que `imagemURL` aponta para imagem de fato.** Validamos só `https://`. | Proxy/validação de conteúdo é infra extra. | Baixo risco: só admin escreve. |
| R5 | **Webhook/estorno de pagamento não existem ainda** — o fluxo é manual (status trocado pelo admin). | Miguel vai configurar o gateway na conta dele (ver MANUAL_PAGAMENTO.md). | Estoque é reservado na criação do pedido; cancelamento manual exige devolver estoque manualmente por enquanto. |
| R6 | **Pedido cancelado não devolve estoque automaticamente.** | Regra de negócio a definir (quando cancelar devolve? sempre?). | Admin ajusta o estoque no painel ao cancelar. Roadmap: function `onUpdate` de pedidos. |

## 3. Dívidas técnicas (não são falhas de segurança)

| # | Dívida | Impacto |
|---|--------|---------|
| D1 | `buscarMetricas` ainda agrega no cliente (1 doc por visita, janela de 30 dias). | Dashboard fica lento/caro com tráfego alto. Roadmap: agregação diária via function agendada. |
| D2 | Busca textual é client-side (com filtro ativo, a categoria inteira é baixada). | OK para catálogo pequeno/médio; com milhares de produtos, migrar para Algolia/Typesense ou a busca da Nuvemshop. |
| D3 | Carrinho guarda `precoUnitario` de exibição que pode ficar defasado até o checkout. | Sem risco (servidor recalcula e mostra o total confirmado), mas o cliente pode ver diferença entre carrinho e confirmação se o admin mudar um preço no meio — comportamento documentado na tela ("valores são estimativa"). |
| D4 | Duplicação consciente do cálculo de frete (front `services/frete.js` + servidor `functions/frete.js`). | Alterar zonas/preços exige editar os dois arquivos (avisado em comentário em ambos). |
| D5 | `firestore.indexes.json` pode precisar de índices novos se o catálogo crescer com muitas categorias (a query paginada usa `ativo == true` + `categoria ==` + `orderBy criadoEm`). O Firestore avisa com um link de criação quando faltar. | Erro visível no console do navegador com link de um clique. |
| D6 | Testes automatizados não existem (nunca existiram no projeto). | Regressões dependem de teste manual. Roadmap: testes das rules com o emulador. |

## 4. Como validar o estado atual (roteiro de teste manual)

1. `firebase emulators:start` (ou ambiente de testes) com rules + functions deployadas.
2. **Fraude de preço:** via console do navegador, tentar `addDoc` em `pedidos` → deve falhar (`permission-denied`). Tentar checkout normal → deve criar pedido com total do servidor.
3. **Metricas:** tentar `addDoc` em `metricas` com campo extra ou string de 500 chars → deve falhar.
4. **Cadastro:** criar conta com e-mail inventado → não recebe link, não loga, e `usuarios/{uid}` não existe no Firestore.
5. **Atacado:** visitante vê catálogo e não compra; cliente sem CNPJ recebe aviso; revendedor aprovado compra com ≥6 unidades (menos que isso a function recusa).
6. **Tema:** alternar em admin/atacado/produtos e recarregar (persiste via localStorage).
7. **XSS:** criar produto com nome `<img src=x onerror=alert(1)>` → deve aparecer como texto literal em todas as telas (home, catálogo, detalhe, admin).
