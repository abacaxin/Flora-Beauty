# Manual de Configuração — Flora Beauty

**Para:** Miguel (DMG) · **Atualizado em:** 10/07/2026
Passos manuais que **só podem ser feitos no console/CLI** (não dá para automatizar por código). Sem eles, partes da revisão de segurança ficam desligadas.

> Projeto atual: **flora-5754a** (ambiente de TESTES). A seção 5 explica o que precisa ser refeito ao migrar para o projeto de produção.

---

## 1. Deploy das regras do Firestore (fazer AGORA)

As `firestore.rules` novas fecham a coleção `metricas`, exigem e-mail verificado para criar perfil e bloqueiam a criação de pedidos pelo cliente. Elas **só valem depois do deploy**:

```bash
firebase deploy --only firestore:rules
```

⚠️ **Atenção:** depois desse deploy, finalizar compra SÓ funciona com a Cloud Function no ar (passo 2). Faça os dois no mesmo dia.

## 2. Deploy da Cloud Function `criarPedido` (fazer AGORA)

A função é quem recalcula preço/estoque/frete no servidor (correção da fraude de preço).

1. **Plano Blaze**: Cloud Functions exigem o plano *Blaze (pay as you go)* — [console](https://console.firebase.google.com) → ⚙️ → Uso e faturamento → Detalhes do plano → Modificar. O nível gratuito do Blaze cobre folgado o volume de uma loja pequena (2 milhões de invocações/mês grátis); configure um **alerta de orçamento** (ex.: R$ 20) na mesma tela.
2. Instalar dependências e deployar:

```bash
cd functions
npm install
cd ..
firebase deploy --only functions
```

3. Testar: faça login no site (conta com e-mail verificado), adicione um produto ao carrinho e finalize. O pedido deve aparecer no painel admin com o total calculado pelo servidor.

## 3. App Check + reCAPTCHA v3 (anti-bot — C0)

Sem isso, um script consegue chamar o Firebase direto (a config do site é pública por design).

1. Console Firebase → **App Check** → aba *Apps* → registre o app web com o provedor **reCAPTCHA v3**. O console cria a chave do site (ligada ao domínio do Hosting).
2. Copie a chave e cole em [firebase-config.js](frontend/src/pages/services/firebase-config.js) na constante `RECAPTCHA_V3_SITE_KEY` (substituindo o placeholder `COLE_AQUI_...`).
3. Volte ao console App Check → aba *APIs* → **Aplicar (Enforce)** para **Cloud Firestore** e **Authentication**.
   - Dica: deixe alguns dias em modo "monitorar" antes de aplicar, para confirmar que ~100% das requisições chegam verificadas.
4. Em [functions/index.js](functions/index.js), mude `EXIGIR_APP_CHECK` para `true` e rode `firebase deploy --only functions` de novo.
5. Para testar em `localhost` depois do enforce: descomente `self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;` no firebase-config.js, abra o site, copie o token do console do navegador e registre em App Check → Apps → ⋮ → *Gerenciar tokens de depuração*. **Não deixe essa linha descomentada em produção.**

## 4. Documentos de configuração no Firestore (opcionais, com padrão embutido)

Coleção `configuracoes` (leitura pública, escrita só admin):

| Documento       | Campos                                        | Para quê                                                    |
|-----------------|-----------------------------------------------|-------------------------------------------------------------|
| `atacado`       | `qtdMinimaCarrinho` (number)                  | Mínimo de unidades de atacado por carrinho (padrão: **6**)   |
| `pagamento`     | `pixChave`, `pixNome`, `instrucoes` (strings) | Instruções de pagamento provisório (ver MANUAL_PAGAMENTO.md) |
| `homeCarrossel` | `imagens` (array de URLs https), `intervaloMs`| Fotos do carrossel de anúncio da home (padrão: fotos locais) |

## 5. Migração de produtos antigos (estoque de atacado)

O estoque agora é **separado por modalidade** (`estoqueVarejo` / `estoqueAtacado`). Produtos cadastrados antes:

- continuam vendendo normalmente no **varejo** (o campo antigo `estoque` vale como estoque de varejo);
- aparecem no atacado como **"Sem estoque de atacado"** até você abrir cada um no painel admin → Produtos → Editar e preencher o campo **Estoque atacado**. Ao salvar, o produto migra sozinho para o modelo novo.

## 6. Ao migrar para o projeto de PRODUÇÃO (não migra sozinho)

Refazer no projeto real, nesta ordem:

1. `.firebaserc` → trocar `flora-5754a` pelo ID do projeto de produção.
2. `frontend/src/pages/services/firebase-config.js` → trocar TODO o bloco `firebaseConfig` pelas credenciais do projeto novo (console → configurações do projeto → seus apps).
3. **App Check**: registrar o app de novo (a chave reCAPTCHA é por domínio/projeto) e refazer o passo 3 inteiro.
4. **Functions**: `firebase deploy --only functions` no projeto novo (exige Blaze lá também) + refazer secrets de pagamento.
5. **Rules e indexes**: `firebase deploy --only firestore`.
6. Recriar os documentos da coleção `configuracoes` e a conta admin (`usuarios/{uid}` com `role: "admin"` — defina manualmente no console).
7. Hosting: `firebase deploy --only hosting` e apontar o domínio.

## 7. Comandos úteis

```bash
firebase deploy                      # tudo (hosting + rules + functions)
firebase deploy --only hosting       # só o site
firebase emulators:start             # testar local (Firestore + Functions + Auth)
firebase functions:log               # logs da criarPedido em produção
```
