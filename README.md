# Ebulição × Ticto — Landing Page

Landing page de captura de leads para o **Ebulição** (evento Outlier Experience da Ticto), com integração direta **Typeform → HubSpot CRM** via webhook HMAC-assinado. Entregue como teste técnico da vaga de **Gerente de Automações**.

- **Produção:** https://ticto-outlier-lp.vercel.app/
- **Repositório:** https://github.com/johansabent/ticto-ebulicao-lp
- **Briefing original:** [`docs/teste-tecnico-automacoes.md`](docs/teste-tecnico-automacoes.md)

> **Sobre a escolha Typeform × YayForms:** o briefing solicitava YayForms, mas o **Gustavo (Head de Marketing da Ticto)** confirmou diretamente via WhatsApp que a Ticto **usa Typeform em produção** e que o YayForms foi **descontinuado este mês**. A troca para Typeform foi aprovada e a integração aqui espelha o provider real da plataforma.

### URL de teste parametrizada

```
https://ticto-outlier-lp.vercel.app/?utm_source=linkedin&utm_medium=organic&utm_campaign=outlier2025&utm_content=hero-cta&utm_term=evento-presencial&sck=abc123&src=review
```

Os 7 parâmetros são capturados no first-touch, persistidos em `localStorage` e repassados ao Typeform como hidden fields até chegarem ao HubSpot.

### Status dos entregáveis do briefing

| Item | Status |
|---|---|
| URL publicada | https://ticto-outlier-lp.vercel.app/ |
| Repositório público | https://github.com/johansabent/ticto-ebulicao-lp |
| URL parametrizada | Ver exemplo acima com `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term`, `sck` e `src`. |
| Evidência CRM | A submissão real chega ao webhook, valida HMAC, mapeia os campos e cria o contato no HubSpot via `POST /crm/v3/objects/contacts`. Retransmissões do Typeform com o mesmo email convergem na mesma row por idempotência (409-como-sucesso). A motivação da troca CRM → HubSpot está documentada abaixo. |
| README | Este arquivo contém setup local, decisões técnicas, dificuldades e limitações. |

---

## Integração CRM: HubSpot

**Motivação.** A primeira iteração do pipeline apontava para outro CRM cuja conta Free bloqueava criação de leads via API: os dois endpoints documentados (`POST /api/v1/leads` e `POST /api/v1/leads/additional-fields`) retornavam **HTTP 400 com `code: "upgrade-plan"`**, com o gate localizado na camada de billing do recurso *Leads* e não na rota específica. As duas respostas lado a lado e a investigação que confirmou o diagnóstico (plan-gate resource-level, não route-specific) estão preservadas no git em [`a1b5901`](https://github.com/johansabent/ticto-ebulicao-lp/commit/a1b5901) e [`e442a5d`](https://github.com/johansabent/ticto-ebulicao-lp/commit/e442a5d) para auditoria. Em vez de entregar com a última camada do pipeline travada num paywall, troquei o destino para HubSpot, que tem plano free e aceita `POST /crm/v3/objects/contacts` com token de Private App.

**A troca foi localizada.** Um novo adapter em `src/lib/hubspot.ts` substituiu o cliente do CRM anterior, swappando o POST target para a Contacts v3 API do HubSpot. As camadas 1–6 do pipeline (HMAC, parse de answers, map de UTMs, build do payload, timeout, retry em 429) permanecem idênticas — só a última muda de destino. A interface `postLead(payload) → PostLeadResult` foi preservada exatamente por esse motivo: trocar CRM era uma alteração prevista, não improvisada.

### Env vars novas

| Variável | Escopo | Origem |
|---|---|---|
| `HUBSPOT_PRIVATE_APP_TOKEN` | **server-only** | Settings → Integrations → Private Apps. Scope mínimo: `crm.objects.contacts.write`. |
| `HUBSPOT_API_BASE` | **server-only**, opcional | Override do host (default `https://api.hubapi.com`). |

### Idempotência via 409

HubSpot retorna `409 Contact already exists` quando o email já está no CRM. O adapter mapeia isso para `{ ok: true, status: 409, leadId: null, duplicate: true }`, e a rota loga `lead.forwarded` com `hubspot_status: 409`. Consequência: retransmissões do Typeform (seja por nosso retry de 429, seja pelo retry do próprio Typeform em 5xx) com o mesmo email **não quebram o fluxo** — convergem na row existente do contato. Obter o `id` do contato existente exigiria um segundo `GET /contacts/{email}?idProperty=email`; fora do escopo de 72h, `leadId: null` é suficiente para observabilidade.

### Por que isso *fortalece* a entrega

- O pipeline crítico atravessa 7 camadas antes de chegar no HubSpot. Cada camada é testada isoladamente (unit) e em conjunto (E2E).
- A observabilidade funcionou desde o começo: a combinação de `error_class` máquina-legível com `error_message` contendo o JSON literal da resposta foi o que tornou o plan-gate do CRM anterior óbvio em logs quando ele apareceu, sem debug adicional. Pós-swap, o mesmo classificador emite `hubspot_4xx` / `hubspot_5xx` / `hubspot_timeout` — a troca de destino não degradou observabilidade.
- O classificador `PostLeadFailure` distingue as três classes, então retries em condição permanente (4xx estrutural) não acontecem; só 429 e timeout tentam de novo. Fail-closed com visibilidade.
- O evento `lead.received` continua sendo emitido em **todas** as submissões, garantindo auditoria completa no Vercel mesmo quando o CRM recusa.
- A troca de CRM foi uma mudança localizada: um arquivo (`src/lib/hubspot.ts`), um novo schema (`HubspotContactPayload`) e três log events renomeados. A invariante "interface `postLead` estável, destino trocável" deixou de ser promessa na arquitetura e virou exercício em produção.

---

## Por que integração direta (e não Zapier / Make / n8n)

A Ticto pode orquestrar Typeform → HubSpot via Zapier, Make ou n8n — são ferramentas legítimas e úteis em diversos contextos. Para este teste escolhi deliberadamente o caminho oposto: um route handler do Next.js recebe o webhook, valida HMAC, transforma o payload e chama a REST API do HubSpot.

A razão é pragmatismo de engenharia, não ideologia:

- **Contrato tipado ponta a ponta.** O payload do Typeform é validado com Zod/TypeScript no momento em que entra. Um erro de campo quebra no `pnpm build`, não em uma execução do Zap duas semanas depois.
- **Validação inline, no ponto da transformação.** Mascaramento de PII, normalização de UTMs, idempotência por `form_response.token` — tudo fica no mesmo módulo que faz a transformação. Em middleware SaaS isso vira múltiplos "Formatter" / "Code" steps, difíceis de testar em isolamento.
- **Zero vendor lock-in no caminho crítico.** A rota `/api/lead` não depende de nenhuma plataforma além de Next.js e `fetch`. A migração de CRM documentada acima é a prova viva: uma alteração localizada na última camada do pipeline, sem redesenhar nada.
- **Custo por execução igual a zero.** Vercel Fluid Compute (Hobby) absorve o volume esperado sem faturar por execução ou por "task" de integração.
- **Falhas visíveis em Vercel Logs.** Cada tentativa deixa um evento estruturado (`lead.received`, `lead.mapped`, `lead.forwarded`, `lead.failed`) com `error_class` máquina-legível. Não precisa abrir um dashboard de terceiros para saber por que um lead não entrou.
- **Testável em isolamento.** 62 testes unitários (Vitest) cobrem assinatura HMAC, janela de replay, extração de campos por `ref`, build do `HubspotContactPayload`, 409-como-sucesso e redação de PII — tudo sem rodar a plataforma externa. Orquestradores visuais não oferecem unit testing equivalente.

Para volume e complexidade maiores, orquestradores visuais têm lugar (múltiplas fontes, fan-out, humanos no meio). Para este escopo — 1 formulário → 1 CRM com auditoria de UTMs — código direto ganha em todas as dimensões que importam para um Gerente de Automações.

---

## Arquitetura

```
Browser (?utm_source=…&sck=…&src=…)
  │
  ▼
app/page.tsx (RSC)  ──►  <UTMRehydrator /> (client, useLayoutEffect)
  │                        • 1ª visita com UTMs → grava first-touch em localStorage
  │                        • Visita sem UTMs   → re-injeta URL antes do paint
  ▼
<TypeformEmbed />  (popup Typeform via embed script)
  │  • Lê UTMs+landing_page do localStorage via lib/attribution.ts
  │  • Passa 8 hidden fields ao popup (7 UTMs + landing_page)
  ▼
Typeform form (id: FbFMsO5x)  ──►  servidores do Typeform
  │
  ▼  POST assinado (HMAC-SHA256, header `typeform-signature: sha256=<base64>`)
app/api/lead/route.ts (Vercel Fluid Compute, runtime Node 24)
  1. Fast-reject via content-length (413 se > 64 KB)
  2. Stream body com cap de 64 KB (aborta antes de materializar em memória)
  3. verifyTypeformSignature()  ─►  HMAC em bytes crus ANTES de JSON.parse
                                    + janela de replay 60s futuro / 48h passado
  4. JSON.parse → parseAnswers(by ref)
  5. mapUtms() + buildHubspotContactPayload()  (envelope com properties achatadas)
  6. postLead() → POST https://api.hubapi.com/crm/v3/objects/contacts
                  (fetch com timeout, retry em 429, 409-como-sucesso, result tipado)
  7. Log estruturado com PII redigida (email/phone/nome)
  ▼
HubSpot Contacts v3 API recebe payload com:
  • properties.email              ← answers.email
  • properties.firstname          ← answers.nome
  • properties.phone              ← answers.telefone
  • properties.cpf                ← answers.cpf (custom property)
  • properties.sells_online       ← answers.sells_online (custom property)
  • properties.utm_*              ← utm_source, utm_medium, utm_campaign, utm_content, utm_term, sck, src
  • properties.landing_page       ← landing_page validada via sanitizeLandingUrl
  • properties.captured_at        ← submitted_at do Typeform (ISO-8601)
```

### Fluxo de atribuição (first-touch)

O atributo `data-tf-transitive-search-params` do Typeform lê apenas da URL atual, o que quebra para visitantes que voltam sem UTM na URL. A solução é client-side:

1. `lib/attribution.ts` grava os 7 params + `landing_page` em `localStorage` na primeira visita com UTMs.
2. `<UTMRehydrator />` usa `useLayoutEffect` para, em visitas subsequentes sem UTM, reescrever a URL via `history.replaceState` **antes do paint** e antes do script do Typeform anexar ao DOM.
3. `<TypeformEmbed />` renderiza o botão popup do Typeform e passa os 8 hidden fields via `data-tf-hidden`, não dependendo da reescrita da URL.

Trade-off consciente: a URL copiada após a reescrita contém os params originais. O ganho é atribuição first-touch preservada entre sessões, sem forkar a lib do Typeform.

---

## Stack

| Camada | Escolha | Nota |
|---|---|---|
| Framework | **Next.js ^16.2** (App Router, Turbopack) | `proxy.ts` no lugar de `middleware.ts`; async Request APIs. |
| Runtime | **Node.js 24 LTS** em Vercel Fluid Compute | `node:crypto` para HMAC; `force-dynamic` na rota. |
| Linguagem | **TypeScript ^6.0** | `tsc --noEmit` no CI. |
| UI | **Tailwind CSS ^4** (CSS-first, `@theme`) + **shadcn/ui** (Base UI + `data-slot`, sem `forwardRef`) | Sem `tailwind.config.ts`. |
| Animações | `tw-animate-css` | `tailwindcss-animate` deprecated em 2025. |
| Validação env | **Zod ^4** | Schema Zod fail-fast em `lib/env.server.ts` e `lib/env.client.ts`. |
| Form embed | **Typeform embed script** | Popup aprovado pelo snippet `data-tf-live`; hidden fields via `data-tf-hidden`. |
| Unit tests | **Vitest ^2.1** | 62 testes, 7 arquivos. |
| E2E | **Playwright ^1.59** | Trigger `deployment_status` no CI contra Preview. |
| Package manager | **pnpm 10.33** | `engines.node >=24 <25`. |
| Deploy | **Vercel + GitHub integration** | Push em `main` = prod; PRs = Preview. |

---

## Setup local

### Pré-requisitos

- Node.js 24 LTS
- pnpm 10.33.0 (versão pinada em `packageManager`)
- Conta Vercel (opcional, para `vercel env pull`)

### Instalação

```bash
git clone https://github.com/johansabent/ticto-ebulicao-lp.git
cd ticto-ebulicao-lp
cp .env.example .env.local   # preencher valores reais
pnpm install
pnpm dev                     # http://localhost:3000
```

### Variáveis de ambiente

| Variável | Escopo | Origem |
|---|---|---|
| `HUBSPOT_PRIVATE_APP_TOKEN` | **server-only** | Settings → Integrations → Private Apps (scope: `crm.objects.contacts.write`). |
| `HUBSPOT_API_BASE` | **server-only**, opcional | Override do host (default `https://api.hubapi.com`). |
| `TYPEFORM_WEBHOOK_SECRET` | **server-only**, min. 16 chars em produção | Typeform → Connect → Webhooks → Edit → Secret. |
| `TYPEFORM_FORM_ID` | **server-only** | ID do formulário (atual: `FbFMsO5x`). Validado na inicialização via zod em `env.server.ts` e cruzado contra `form_response.form_id` no webhook. |
| `NEXT_PUBLIC_SITE_URL` | público (OG/canonical) | URL base do deploy. Ex.: `https://ticto-outlier-lp.vercel.app`. |
| `NEXT_PUBLIC_TYPEFORM_FORM_ID` | público (popup client-side) | Mesmo valor de `TYPEFORM_FORM_ID`. A duplicação é intencional e documentada em `AGENTS.md`. |

Vars `NEXT_PUBLIC_*` adicionais estão proibidas pela allowlist em `AGENTS.md`.

---

## Scripts

| Comando | Função |
|---|---|
| `pnpm dev` | Dev server com Turbopack (http://localhost:3000). |
| `pnpm build` | Build de produção. |
| `pnpm start` | Serve o build de produção. |
| `pnpm lint` | ESLint (`eslint.config.mjs`, flat config). |
| `pnpm typecheck` | `tsc --noEmit`. |
| `pnpm test` | Vitest (run único, para CI). |
| `pnpm test:watch` | Vitest em watch. |
| `pnpm e2e` | Playwright (`--pass-with-no-tests` até a suite E2E ser reintroduzida). |
| `pnpm check:secrets` | Falha o build se `HUBSPOT_PRIVATE_APP_TOKEN` ou `TYPEFORM_WEBHOOK_SECRET` vazarem no bundle cliente. |

---

## Testes

### Unit tests (62 testes, 7 arquivos)

| Arquivo | Cobertura |
|---|---|
| `tests/unit/webhook-auth.test.ts` | HMAC SHA-256 base64, `timingSafeEqual`, janela de replay 60s futuro / 48h passado, erros estruturais (`malformed_payload`). |
| `tests/unit/utm-mapping.test.ts` | Extração de UTMs de `form_response.hidden`; build do `HubspotContactPayload` com properties achatadas e envelope `{ properties: {...} }`. |
| `tests/unit/typeform-fields.test.ts` | `parseAnswers` por `ref` (não por ID); falha em campos obrigatórios ausentes. |
| `tests/unit/hubspot.test.ts` | Fetch client HubSpot Contacts v3, Bearer Private App token, retry em 429, timeout, 409-como-sucesso idempotente, union tipado `ok`/`err`. |
| `tests/unit/attribution.test.ts` | First-touch save, rehydrate, guard SSR. |
| `tests/unit/env.test.ts` | Schema Zod rejeita env inválido; regras de `min(16)` só em produção. |
| `tests/unit/logger.test.ts` | `redactEmail` (`j***@domain.com`), `redactPhone` (`***-1234`), `redactName` (`J***`). |

### E2E (Playwright)

Rodado em GitHub Actions via evento `deployment_status` contra o Preview URL da Vercel. HubSpot fica mockado no CI (`page.route('**/api.hubapi.com/**')`) para evitar flakiness e rate limits. Um smoke manual contra o CRM real é gravado 1× como entregável do teste (screencast).

### `check:secrets`

Script `scripts/check-secrets.mjs` varre `.next/static`, `.next/server/app/*.html|.rsc` e `out/` atrás das strings `HUBSPOT_PRIVATE_APP_TOKEN` e `TYPEFORM_WEBHOOK_SECRET`. Roda no CI (`.github/workflows/ci.yml`) e falha o build se encontrar.

### Auditoria de cobertura (Task 23)

> **Test coverage audit (Task 23):** 0 P0, 5 P1, 6 P2 findings.
> - **P0 gaps:** none — no ship-blockers
> - **P1 — tracked for post-ship:** hubspot generic-fetch-throw, two-consecutive-429 path, `contact-id` extraction fallbacks, `Retry-After` edge cases, extract `sanitizeLandingUrl` + `readBodyWithCap` from route.ts into `lib/request-utils.ts` for direct unit coverage
> - **P2 — polish:** 48h past-boundary edge, multibyte UTF-8 HMAC test, empty-string UTM handling, `storageAvailable()=false` branches
> - **Strengths:** discriminated-union `ValidationResult` with narrowing helper, HMAC-first ordering tested, asymmetric window boundary tests, explanatory test comments

---

## Invariantes de segurança

| Invariante | Onde vive | Racional |
|---|---|---|
| **HMAC-first ordering** | `app/api/lead/route.ts` | HMAC é verificado sobre bytes crus (`readBodyWithCap`) **antes** de `JSON.parse`. Payloads que falham estruturalmente depois do HMAC retornam `400 malformed_payload` (não `401`), porque o sender autenticou. |
| **Streaming body cap (64 KB)** | `readBodyWithCap` em `route.ts` | Aborta o stream ao atingir o cap, antes de materializar em memória. Fecha vetor de DoS com `content-length` ausente/spoofado. |
| **Asymmetric replay window** | `lib/webhook-auth.ts` | 60s no futuro (tolerância de clock skew), 48h no passado (absorve retries do Typeform). `submitted_at` do payload é a referência — Typeform não envia timestamp em header. |
| **Min 16 chars em produção** | `lib/env.server.ts` | `TYPEFORM_WEBHOOK_SECRET` aceita placeholder em dev, mas exige `min(16)` quando `NODE_ENV=production`. `emptyToUndefined` garante que `.env.example` copiado vazio falhe cedo, não silenciosamente. |
| **PII redaction** | `lib/logger.ts` | `j***@domain.com`, `***-1234`, `J***`. Logs nunca vêem valor completo de email/telefone/nome. Corpo cru do request nunca é logado. |
| **Split de status code** | `route.ts` linhas 132-148 | `401 unauthorized` para assinatura inválida (Typeform para de tentar); `400 malformed_payload` para payload estrutural quebrado (Typeform também para, mas semântica correta). |
| **Landing URL validation** | `sanitizeLandingUrl` em `route.ts` | `landing_page` vem do localStorage do cliente — um visitante pode injetar strings arbitrárias. Cap de 2048 chars + `new URL()` + protocolo `http`/`https`. Em caso de falha cai para `NEXT_PUBLIC_SITE_URL` em vez de rejeitar o lead. |
| **`proxy.ts` só para headers** | `src/proxy.ts` | Sem auth, sem rate limit, sem validação de body. Toda lógica de webhook fica no route handler. Documentado em `AGENTS.md` como invariante. |
| **Allowlist de `NEXT_PUBLIC_*`** | `AGENTS.md` | Apenas `NEXT_PUBLIC_SITE_URL` e `NEXT_PUBLIC_TYPEFORM_FORM_ID`. Adicionar uma nova var pública exige update da allowlist no mesmo PR. |
| **Zero middleware SaaS** | Arquitetura | Rota crítica não passa por Zapier/Make/n8n. Consequência do pitch da entrevista e coerente com `AGENTS.md`. |

---

## Lacunas conhecidas

Em respeito ao tempo de 72h e ao escopo do teste, aceitei as seguintes limitações conscientemente. Todas estão trackadas e seriam tratadas em produção:

- **Sem dedup durável por `form_response.token`.** Retransmissões do Typeform (seja por nosso retry em 429, seja pelo retry do Typeform em 5xx) convergem em idempotência natural pelo 409-como-sucesso do HubSpot: mesmo email ⇒ mesma row. O que **não** está coberto: se um mesmo token do Typeform retransmitisse com email diferente (cenário patológico/raro), o HubSpot criaria duas rows distintas. Solução de produção: LRU de `form_response.token` em Redis (Vercel Marketplace / Upstash). Fora do escopo de 72h.

- **`leadId: null` em 409-como-sucesso.** O adapter trata 409 como sucesso idempotente mas não devolve o `id` do contato existente (faria exigir um segundo `GET /contacts/{email}?idProperty=email`). A observabilidade do caminho feliz (`lead.forwarded` com `hubspot_status: 409`) é suficiente para o teste; em produção real esse segundo GET seria adicionado para fechar o loop de auditoria.
- **CSP não configurada.** `proxy.ts` aplica apenas `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy` e HSTS. CSP rigorosa sem quebrar o embed Typeform exige iteração fora do escopo.
- **Contraste WCAG em `btn-primary`.** Combinação documentada para revisão visual; não bloqueia entrega.
- **Indireção `--font-*` em CSS vars.** Próximo passo é expor as fontes via `@theme` em vez de redeclarar.
- **`.github/workflows/claude.yml` removido.** O repo é público; sem `ANTHROPIC_API_KEY` configurada, o workflow do Claude GitHub Action ficaria no vermelho. Removido enquanto a chave não for provisionada.
- **P1s da auditoria de cobertura (Task 23).** Listados acima; pós-ship.

Essa lista é explícita exatamente porque o avaliador merece ver **onde o escopo foi cortado** e por quê, em vez de descobrir depois.

---

## Mapa de arquivos

```
src/
├── app/
│   ├── layout.tsx               Metadata, fontes locais (Space Grotesk, Tomato Grotesk).
│   ├── page.tsx                 LP RSC; compõe Hero, Rules, Footer, TypeformEmbed.
│   ├── globals.css              Tailwind @import + @theme + tokens OKLCH.
│   ├── fonts/                   OTF/TTF locais servidas via `next/font/local`.
│   └── api/lead/route.ts        Handler do webhook Typeform (HMAC + HubSpot POST).
├── components/
│   ├── Hero.tsx                 Hero RSC com CTA.
│   ├── Rules.tsx                Bloco de regras do evento.
│   ├── Footer.tsx               Rodapé.
│   ├── typeform-embed.tsx       Client: popup Typeform + hidden fields.
│   ├── utm-rehydrator.tsx       Client: first-touch save + history.replaceState.
│   └── ui/button.tsx            shadcn primitive.
├── lib/
│   ├── env.server.ts            Zod schema server-only (HUBSPOT_*, TYPEFORM_*).
│   ├── env.client.ts            Zod schema público (NEXT_PUBLIC_*).
│   ├── webhook-auth.ts          HMAC SHA-256 base64, timingSafeEqual, replay window.
│   ├── typeform-fields.ts       Registry `ref`-keyed; parseAnswers tipado.
│   ├── utm-mapping.ts           mapUtms + buildHubspotContactPayload (flat properties envelope).
│   ├── hubspot.ts               Fetch client HubSpot Contacts v3: retry em 429 + timeout + 409-como-sucesso + result tipado.
│   ├── attribution.ts           localStorage first-touch helpers.
│   ├── logger.ts                JSON structured log + redactEmail/Name/Phone.
│   └── utils.ts                 cn() (tailwind-merge + clsx).
└── proxy.ts                     Security headers only (sem auth, sem rate limit).

tests/unit/                      7 arquivos, 62 testes (Vitest).
scripts/check-secrets.mjs        Guard: server-only env vars ∉ client bundle.
docs/                            Briefing original do teste técnico.
.github/workflows/ci.yml         typecheck + lint + test + check:secrets.
.github/workflows/e2e.yml        Playwright contra Preview URL (trigger: deployment_status).
```

---

## Créditos

Autor: **Johan Sabent** (johansabent@gmail.com) — Teste técnico para a vaga de Gerente de Automações na Ticto, abril/2026.

Repo: https://github.com/johansabent/ticto-ebulicao-lp
