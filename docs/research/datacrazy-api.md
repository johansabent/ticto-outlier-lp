# Datacrazy CRM — Pesquisa de API

**Data:** 2026-04-15
**Fonte:** Pesquisa feita pelo Johan em agente externo, consolidando docs oficiais em `docs.datacrazy.io` e `help.datacrazy.io`.

## TL;DR operacional

- **Endpoint de criar lead:** `POST https://api.g1.datacrazy.io/api/v1/leads`
- **Auth:** `Authorization: Bearer <token>` — token gerado em `crm.datacrazy.io/config/api`, exibido **uma única vez**.
- **Rate limit:** 60 req/min por rota (headers `X-RateLimit-*`, `Retry-After` em 429).
- **Sem SDK oficial** — usar `fetch`/`axios` com HTTP raw.
- **Sem integração nativa com YayForms** — confirmado que a integração tem que ser via nosso middleware.
- **Sem sandbox documentado** — vamos testar direto na conta free/trial.

## Endpoint `POST /api/v1/leads` — schema

Campos documentados no body (nenhum marcado como obrigatório na docs — apenas `Authorization` é obrigatório):

- `name`, `image`, `phone`, `email`
- `source` (string de origem)
- `company`, `taxId`, `site`, `instagram`, `address`
- `sourceReferral` (objeto com `sourceId`, `sourceUrl`, `ctwaId`)
- `tags`, `lists`, `attendant`, `notes`

Regra prática (da docs de automações, não do endpoint REST): a identificação de lead no ecossistema Datacrazy usa **"Nome + Telefone"** ou **"Nome + Email"**.

## 🚨 ALERTA CRÍTICO — mapeamento de UTMs

**O endpoint REST não tem campo `customFields` / `additionalFields` documentado.**

Como o teste pede **7 parâmetros** (`utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term`, `sck`, `src`) e vale **25% da nota**, precisamos de estratégia de mapeamento criativa.

### Estratégia proposta (camadas defensáveis)

```json
{
  "name": "João Silva",
  "email": "joao@exemplo.com",
  "phone": "+5511999999999",
  "source": "<utm_source>",
  "sourceReferral": {
    "sourceId": "<utm_campaign>",
    "sourceUrl": "<URL completa da LP com todas as query strings preservadas>"
  },
  "tags": [
    "utm_medium:<valor>",
    "utm_content:<valor>",
    "utm_term:<valor>",
    "sck:<valor>",
    "src:<valor>"
  ],
  "notes": "UTMs capturadas: utm_source=... | utm_medium=... | utm_campaign=... | utm_content=... | utm_term=... | sck=... | src=..."
}
```

**Justificativa pra README:**
> Como a API REST pública do Datacrazy não documenta campos customizados arbitrários, implementei uma estratégia de mapeamento em múltiplas camadas:
> - Campo nativo `source` recebe `utm_source` (origem primária no CRM).
> - `sourceReferral.sourceId` recebe `utm_campaign`, `sourceUrl` preserva a URL completa com todas as query strings (auditoria).
> - `tags` recebe os demais parâmetros em formato `chave:valor` (pesquisável/filtrável dentro do CRM).
> - `notes` contém o dump completo dos parâmetros como string formatada (backup e visualização rápida).
>
> Essa decisão foi documentada após leitura direta da documentação em `docs.datacrazy.io` e é a abordagem mais defensável dado o schema público atual.

## Rate limit

- 60 req/min por rota.
- Headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`.
- Em 429: respeitar `Retry-After`.
- Para o caso de uso (1 lead por submissão de form), não vai estourar.

## Integrações nativas documentadas

- Google Forms: sim, integração nativa documentada.
- YayForms / Typeform / Tally: **não** existem integrações nativas. Precisa via HTTP.
- Conexão Universal (webhook receiver): existe mas é pra mensageria, não serve pra criar lead.

## Evidências externas do caminho de integração

- **YayForms tem integrações nativas com Make e Zapier** — caminho "oficial" dele é terceirizar pra middleware SaaS. Estamos *deliberadamente* evitando essa rota (coerência com pitch de entrevista: API/MCP/CLI ao invés de orquestradores no-code).
- **Terceiros como Respondi integram Datacrazy via webhook + HTTP** — confirma que middleware próprio (nosso Next.js API Route) é o padrão real de mercado pra integração custom com Datacrazy.

## Confirmação cruzada

Duas pesquisas independentes (mesma data) chegaram aos mesmos resultados em todos os pontos materiais. Sem conflitos.

## cURL de referência

```bash
curl --request POST \
  --url https://api.g1.datacrazy.io/api/v1/leads \
  --header 'Authorization: Bearer SEU_TOKEN' \
  --header 'Content-Type: application/json' \
  --data '{
    "name": "João Silva",
    "phone": "+5511999999999",
    "email": "joao@exemplo.com",
    "source": "google",
    "sourceReferral": {
      "sourceUrl": "https://lp.exemplo.com/?utm_source=google&utm_medium=cpc"
    }
  }'
```

## Fontes consultadas

- https://docs.datacrazy.io/
- https://docs.datacrazy.io/api-reference/leads/criar-lead
- https://docs.datacrazy.io/api-reference/leads/buscar-lead-por-id
- https://docs.datacrazy.io/essencials/get-token
- https://docs.datacrazy.io/essencials/rate-limit
- https://docs.datacrazy.io/universal-connection/overview
- https://docs.datacrazy.io/universal-connection/authentication
- https://docs.datacrazy.io/universal-connection/receiving-webhooks
- https://help.datacrazy.io/pt-br/collections/11846718-integracoes
- https://help.datacrazy.io/pt-br/articles/10670531-integrando-o-google-forms-no-datacrazy
- https://help.datacrazy.io/pt-br/articles/10670790-bloco-lessgreaterjavascript-kb-para-agente-de-ia
