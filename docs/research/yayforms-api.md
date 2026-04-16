# YayForms — Pesquisa de API/Webhook

**Data:** 2026-04-15
**Fonte:** Pesquisa em agente externo, consolidando docs oficiais em `yayforms.com/pricing` e `help.yayforms.com`.

## TL;DR operacional

- **REST pública de submissões:** NÃO documentada publicamente. Temos que receber via webhook.
- **Webhook outgoing:** sim, configurado em **Integrate > Webhooks**. É o caminho oficial.
- **Payload V2:** usa field ID como chave (mais fácil de mapear que V1). Vamos usar V2.
- **HMAC SHA256:** signature via secret configurável — vamos validar no nosso API Route.
- **`data-yf-transitive-search-params`:** FUNCIONA como o briefing pede. Herda query params da URL pai pro form embedado automaticamente.
- **Hidden fields:** criar em Share > Add hidden fields. Populados via URL. Recebidos no webhook.
- **Embed method:** iframe via script embed. Modos: STANDARD, FULL-PAGE, POPUP, SLIDER, POPOVER, SIDE TAB.
- **Trial 7 dias** — sem plano free permanente documentado. **RISCO a mitigar.**
- **Sem integração nativa com Datacrazy.**

## Webhook V2 payload (o que vamos receber)

```json
{
  "answers": {
    "<field_id_nome>": { "content": "João Silva" },
    "<field_id_email>": { "content": "joao@exemplo.com" },
    "<field_id_telefone>": { "content": "+5511999999999" },
    "<hidden_field_id_utm_source>": { "content": "google" },
    "<hidden_field_id_utm_medium>": { "content": "cpc" },
    "<hidden_field_id_utm_campaign>": { "content": "outlier2025" },
    "<hidden_field_id_utm_content>": { "content": "banner-a" },
    "<hidden_field_id_utm_term>": { "content": "evento" },
    "<hidden_field_id_sck>": { "content": "abc123" },
    "<hidden_field_id_src>": { "content": "linkedin" }
  }
}
```

## Embed code (o que vamos colocar na LP)

```html
<!-- STANDARD inline embed -->
<div
  data-yf-id="<FORM_ID>"
  data-yf-type="standard"
  data-yf-transitive-search-params="utm_source,utm_medium,utm_campaign,utm_content,utm_term,sck,src"
></div>
<script src="https://embed.yayforms.com/..."></script>
```

O atributo `data-yf-transitive-search-params` passa os query params da URL da página pai (nossa LP) pro iframe automaticamente — sem precisar de JS custom.

## Fluxo completo

```
User: https://lp.ticto-outlier.vercel.app/?utm_source=google&utm_medium=cpc&sck=abc&src=linkedin
                  │
                  ▼
Next.js LP (App Router) renderiza embed YayForms com data-yf-transitive-search-params
                  │
                  ▼
YayForms iframe herda query params → preenche hidden fields automaticamente
User preenche nome/email/telefone → submit
                  │
                  ▼
YayForms dispara webhook V2 (assinado com HMAC SHA256)
                  │
                  ▼
POST https://<nosso-dominio>.vercel.app/api/lead
- valida HMAC signature
- mapeia answers[field_id] → campos nomeados
- monta payload Datacrazy (estratégia 4 camadas)
                  │
                  ▼
POST https://api.g1.datacrazy.io/api/v1/leads (Bearer token)
                  │
                  ▼
Lead criado no Datacrazy com UTMs/sck/src mapeados
```

## Configuração que temos que fazer na conta YayForms

1. Criar form com campos: nome, email, telefone.
2. Adicionar **7 hidden fields**: `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term`, `sck`, `src`.
3. Pegar os field IDs de cada hidden field (precisamos para o mapeamento no webhook handler).
4. Gerar embed code com `data-yf-transitive-search-params` contendo os 7 parâmetros.
5. Em Integrate > Webhooks: configurar URL → `https://<dominio>.vercel.app/api/lead`, V2, secret para HMAC.

## 🚨 RISCO a mitigar: trial de 7 dias

- Plano Free permanente não está documentado oficialmente.
- Starter pago a partir de ~USD/mês (200 responses/mês).
- **Trial grátis:** 7 dias.
- **Problema:** se o avaliador da Ticto revisar mais de 7 dias depois do envio, o form embedado pode parar de funcionar.

### Mitigações possíveis (decidir)

1. **Criar conta YayForms o mais tarde possível** (próximo ao envio final do teste). Timing: só criar depois de o código e o design estarem prontos. Maximiza janela.
2. **Incluir screencast no README** mostrando o fluxo funcionando end-to-end — se o form cair depois, a evidência ainda está lá.
3. **Documentar o risco no README** de forma transparente ("conta em trial de 7 dias, válida até DD/MM; screencast incluído como evidência").
4. **Fallback:** se trial expirar e avaliador ainda estiver revisando, ter um plano B de migrar o form pra Tally/Typeform. (Provavelmente exagerado pra 72h.)

## Evidências externas úteis

- YayForms tem integrações nativas com Make e Zapier — confirma que deliberadamente estamos indo pra integração custom (coerência com pitch de entrevista).
- Ecossistema oficial de integrações listadas: Make, Zapier, Slack, Google Calendar, Google Contacts, Mailchimp, MailerLite, HubSpot, Pipedrive, Notion via Zapier, ActiveCampaign, Microsoft Clarity, GoHighLevel. **Datacrazy não está no catálogo.**

## Fontes consultadas

- https://yayforms.com/pricing
- https://help.yayforms.com/pt_BR/articles/como-gerar-um-token-de-api-do-yay-forms
- https://help.yayforms.com/en/articles/how-to-integrate-webhooks-into-your-form
- https://help.yayforms.com/en/articles/how-to-inherit-url-parameters-in-your-embedded-form
- https://help.yayforms.com/en/articles/how-to-add-hidden-fields-in-yay-forms
- https://help.yayforms.com/en/articles/how-to-embed-a-form-on-your-website
- https://help.yayforms.com/en/articles/how-to-track-yay-forms-events-with-google-tag-manager-on-embedded-forms
- https://help.yayforms.com/en/categories/integrations
