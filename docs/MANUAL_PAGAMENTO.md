# Manual do Sistema de Pagamento — Flora Beauty

**Para:** Miguel (DMG) · **Atualizado em:** 10/07/2026
**Objetivo:** explicar como o pagamento provisório funciona hoje e como configurar o pagamento definitivo na SUA conta, sem precisar compartilhar dados bancários com ninguém.

---

## 1. Como funciona HOJE (pagamento provisório)

O checkout já funciona ponta a ponta:

1. O cliente fecha o pedido no carrinho → a Cloud Function `criarPedido` valida tudo no servidor (preço, estoque, atacado, frete) e grava o pedido com `status: "aguardando_pagamento"` e `pagamento: { metodo: "provisorio", status: "pendente" }`.
2. A página **pedido-confirmado.html** mostra ao cliente as instruções de pagamento:
   - Chave **PIX** da loja (com botão "copiar") — se estiver configurada;
   - Botão **"Combinar pagamento no WhatsApp"** com o número do pedido e o valor já preenchidos na mensagem.
3. Você confere o comprovante e, no **painel admin → Pedidos**, muda o status do pedido para `pago` manualmente.

### 1.1. Configurar a chave PIX (sem mexer em código)

No [Firebase Console](https://console.firebase.google.com) → Firestore Database → coleção `configuracoes` → crie (ou edite) o documento com ID **`pagamento`**:

| Campo        | Tipo   | Exemplo                                     |
|--------------|--------|---------------------------------------------|
| `pixChave`   | string | `98984853656` ou chave aleatória             |
| `pixNome`    | string | `Flora Boutique LTDA`                        |
| `instrucoes` | string | `Enviar comprovante pelo WhatsApp` (opcional)|

> Se o documento não existir, a página de confirmação mostra apenas o botão de WhatsApp — nada quebra.

**Segurança:** esse documento é público para LEITURA (o cliente precisa ver a chave PIX), mas só o admin consegue escrever (regra em `firestore.rules`). Chave PIX é um dado de recebimento, não dá acesso à sua conta.

---

## 2. Configurar o pagamento DEFINITIVO (Mercado Pago Checkout Pro)

Recomendação: **Mercado Pago Checkout Pro** — o cliente paga numa página hospedada pelo Mercado Pago (PIX, cartão, boleto) e o site nunca vê número de cartão (isso mantém a loja fora do escopo PCI-DSS). Alternativas equivalentes: PagSeguro, Stripe, InfinitePay.

### 2.1. Criar as credenciais (só você faz, na sua conta)

1. Crie/acesse sua conta em <https://www.mercadopago.com.br>.
2. Vá em **Seu negócio → Configurações → Credenciais** (ou <https://www.mercadopago.com.br/developers/panel/app> → criar aplicação).
3. Anote o **Access Token de produção** (`APP_USR-...`). Existe também o de **teste** (`TEST-...`) — use o de teste primeiro.
4. **NUNCA** coloque esse token no código do site (ele fica visível para qualquer visitante). Ele vai para um secret das Cloud Functions (passo 2.3).

### 2.2. O que será criado no código (roteiro para a implementação)

Duas Cloud Functions novas em `functions/index.js`:

1. **`criarPreferenciaPagamento`** (callable) — chamada depois do `criarPedido`:
   - lê o pedido do Firestore (nunca confia em valores do cliente);
   - chama a API do Mercado Pago criando uma *preference* com o total do pedido;
   - grava `pagamento.preferenciaId` no pedido e devolve a URL de checkout (`init_point`);
   - o front redireciona o cliente para essa URL.
2. **`webhookMercadoPago`** (HTTP) — o Mercado Pago chama essa URL quando o pagamento muda de status:
   - valida a notificação (consultando a API com o `payment_id` recebido — nunca confie só no corpo do webhook);
   - se aprovado → `status: "pago"` e `pagamento.status: "aprovado"` no pedido;
   - se recusado/cancelado → `status: "cancelado"` e **devolve o estoque** (a função `criarPedido` já reservou).

### 2.3. Guardar o token com segurança

```bash
# na pasta do projeto (exige Firebase CLI logado no projeto)
firebase functions:secrets:set MP_ACCESS_TOKEN
# cole o token quando pedir; depois referencie no código com defineSecret("MP_ACCESS_TOKEN")
```

### 2.4. Registrar o webhook

No painel do Mercado Pago → sua aplicação → **Webhooks** → adicionar URL:

```
https://southamerica-east1-<SEU-PROJETO>.cloudfunctions.net/webhookMercadoPago
```

Marque o evento **Pagamentos**. Guarde a **assinatura secreta** do webhook (o Mercado Pago mostra) num secret `MP_WEBHOOK_SECRET`, para validar que a chamada é legítima.

### 2.5. Testar antes de ir para produção

1. Use o Access Token **de teste** + contas de teste do painel do Mercado Pago.
2. Faça um pedido no site, pague com o cartão de teste `5031 4332 1540 6351` (aprovação garantida em sandbox).
3. Confirme que o pedido muda sozinho para `pago` no painel admin.
4. Só então troque o secret para o token de produção e repita um pagamento real de valor baixo (ex.: R$ 1,00 via PIX) e estorne.

---

## 3. Checklist final

- [ ] Documento `configuracoes/pagamento` criado com a chave PIX (provisório — já dá para vender)
- [ ] Conta Mercado Pago criada e verificada
- [ ] Access Token de teste guardado como secret (`MP_ACCESS_TOKEN`)
- [ ] Functions `criarPreferenciaPagamento` + `webhookMercadoPago` implementadas e deployadas
- [ ] Webhook registrado no painel do Mercado Pago
- [ ] Pagamento de teste aprovado muda o pedido para `pago` sozinho
- [ ] Token de produção configurado e teste real feito
- [ ] Estorno testado (pedido volta para `cancelado` e estoque é devolvido)

> **Importante:** o pagamento provisório continua funcionando como fallback mesmo depois do gateway — se o gateway cair, você ainda recebe pedidos e combina o pagamento manualmente.
