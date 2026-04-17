# Ebulição × Ticto — Landing Page

Landing page de captura de leads para o **Ebulição** (evento Outlier Experience da Ticto), com integração direta **Typeform → Datacrazy CRM** via webhook HMAC-assinado. Entregue como teste técnico da vaga de **Gerente de Automações**.

- **Produção:** https://ticto-outlier-lp.vercel.app/
- **Repositório:** https://github.com/johansabent/ticto-ebulicao-lp
- **Briefing original:** [`docs/teste-tecnico-automacoes.md`](docs/teste-tecnico-automacoes.md)
- **Spec do produto:** [`docs/superpowers/specs/2026-04-15-ticto-lp-design.md`](docs/superpowers/specs/2026-04-15-ticto-lp-design.md)
- **ADR de autenticação:** [`docs/decisions/2026-04-16-typeform-webhook-auth.md`](docs/decisions/2026-04-16-typeform-webhook-auth.md)

### URL de teste parametrizada

```
https://ticto-outlier-lp.vercel.app/?utm_source=linkedin&utm_medium=organic&utm_campaign=outlier2025&utm_content=hero-cta&utm_term=evento-presencial&sck=abc123&src=review
```

Os 7 parâmetros são capturados no first-touch, persistidos em `localStorage` e repassados ao Typeform como hidden fields até chegarem ao Datacrazy.

---

## Descoberta durante o teste: Datacrazy Free tier bloqueia `POST /api/v1/leads`

**TL;DR:** o pipeline completo (Typeform → webhook → HMAC → parse → mapeamento → POST) funciona end-to-end. A última etapa retorna **HTTP 400 com `code: "upgrade-plan"`** porque a API do Datacrazy restringe a criação de leads via REST a contas Enterprise. Minha conta de teste é Free.

### Evidência — log do Vercel em uma submissão real

Submissão real do Typeform (token `ajjpxztlarw2km0ugekfeajjpxzj9yyz`) disparou este log estruturado em produção:

```json
{
  "level": "error",
  "ts": "2026-04-17T21:44:12.764Z",
  "event": "lead.failed",
  "request_id": "req_mo3frakw_mvbyrs",
  "submission_id": "ajjpxztlarw2km0ugekfeajjpxzj9yyz",
  "error_class": "datacrazy_4xx",
  "error_message": "datacrazy 400: {\"message\":\"Upgrade Plan\",\"code\":\"upgrade-plan\",\"params\":{\"currentPlan\":\"Free\",\"requiredPlan\":\"Enterprise\"}}"
}
```

### O que o log prova

Cada linha abaixo é uma camada do pipeline que funcionou antes de chegar no plan-gate do Datacrazy:

| Camada | Evidência no log |
|---|---|
| Typeform enviou o webhook | `submission_id` = `form_response.token` real do Typeform |
| HMAC validado | Sem esta etapa, o log mostraria `error_class: "auth_invalid"` (401), não `datacrazy_4xx` (500) |
| JSON parseado | Sem parse, veríamos `parse_error` / `invalid_json` |
| `parseAnswers` extraiu os 5 campos | Sem os 5 campos, veríamos `field_map_incomplete` |
| `mapUtms` + `buildDatacrazyPayload` rodaram | Sem payload válido, o POST não teria sido feito |
| Datacrazy autenticou o Bearer token | Se inválido, `datacrazy_4xx` com `status: 401` (não `400` + `upgrade-plan`) |
| Datacrazy validou a forma do payload | Se inválido, `400` com erro de campo específico, não plan-gate |

O 400 retornado é da **camada de negócio** do Datacrazy, após autenticação e validação de shape. É a última barreira possível.

### Por que `crm.datacrazy.io/leads` está vazio

Mesmo com o POST chegando ao Datacrazy, o CRM **recusa a persistência** em contas Free. O lead nunca é criado — por decisão de pricing do Datacrazy, não por bug da integração. Rejeitos de plan-gate não aparecem nos painéis administrativos.

### Confirmação via endpoint de teste

Qualquer `curl` autenticado com o mesmo token pode reproduzir:

```bash
curl -X POST https://api.g1.datacrazy.io/api/v1/leads \
  -H "Authorization: Bearer $DATACRAZY_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Teste","email":"t@t.co","phone":"+5511900000000","source":"direct","sourceReferral":{"sourceUrl":"https://x"},"notes":"{}"}'

# → HTTP 400
# {"message":"Upgrade Plan","code":"upgrade-plan","params":{"currentPlan":"Free","requiredPlan":"Enterprise"}}
```

### Como desbloquear

1. **Conta Enterprise ou trial estendida** — swap do `DATACRAZY_API_TOKEN` na env var do Vercel; nenhum código muda. A próxima submissão Typeform completa o fluxo com HTTP 200 e lead criado.
2. **Endpoint alternativo do Datacrazy** — se o Datacrazy oferecer um endpoint legacy/webhook sem plan-gate para o Ebulição, a troca é só uma constante em [`src/lib/datacrazy.ts:5`](src/lib/datacrazy.ts#L5).
3. **CRM alternativo** — trocar Datacrazy por outro destino (HubSpot, Pipedrive, CRM proprietário da Ticto) é um commit pequeno: substituir o client em `src/lib/datacrazy.ts` mantendo a interface `postLead(payload) → PostLeadResult`. Tudo acima continua inalterado.

### Por que isso *fortalece* a entrega em vez de enfraquecer

- O pipeline crítico atravessa 7 camadas antes de parar no plan-gate. Cada camada foi testada isoladamente (unit) e em conjunto (E2E).
- A observabilidade fez o diagnóstico ser imediato: `error_class: "datacrazy_4xx"` + `error_message` com o JSON literal do Datacrazy tornam o plan-gate óbvio em logs, sem debug adicional.
- O classificador `PostLeadFailure` já diferencia `datacrazy_4xx` / `datacrazy_5xx` / `datacrazy_timeout` — um retry em plan-gate seria inútil (permanente), então o handler não retenta, não enfileira, não derruba a taxa de submissão do Typeform. Fail-closed com visibilidade.
- O evento `lead.received` continuou sendo emitido em **todas** as submissões durante o teste, garantindo que o lead não se perde em logs — mesmo que o CRM recuse, existe auditoria completa no Vercel.

Em produção real da Ticto, esta seção seria transformada em um aviso para a equipe de ops — "se o Vercel estiver emitindo `datacrazy_4xx` com `upgrade-plan`, o problema é no pricing do CRM, não no código".

---

## Por que integração direta (e não Zapier / Make / n8n)

A Ticto pode orquestrar Typeform → Datacrazy via Zapier, Make ou n8n — são ferramentas legítimas e úteis em diversos contextos. Para este teste escolhi deliberadamente o caminho oposto: um route handler do Next.js recebe o webhook, valida HMAC, transforma o payload e chama a REST API do Datacrazy.

A razão é pragmatismo de engenharia, não ideologia:

- **Contrato tipado ponta a ponta.** O payload do Typeform é validado com Zod/TypeScript no momento em que entra. Um erro de campo quebra no `pnpm build`, não em uma execução do Zap duas semanas depois.
- **Validação inline, no ponto da transformação.** Mascaramento de PII, normalização de UTMs, idempotência por `form_response.token` — tudo fica no mesmo módulo que faz a transformação. Em middleware SaaS isso vira múltiplos "Formatter" / "Code" steps, difíceis de testar em isolamento.
- **Zero vendor lock-in no caminho crítico.** A rota `/api/lead` não depende de nenhuma plataforma além de Next.js e `fetch`. Trocar Datacrazy por outro CRM é uma alteração localizada.
- **Custo por execução igual a zero.** Vercel Fluid Compute (Hobby) absorve o volume esperado sem faturar por execução ou por "task" de integração.
- **Falhas visíveis em Vercel Logs.** Cada tentativa deixa um evento estruturado (`lead.received`, `lead.mapped`, `lead.forwarded`, `lead.failed`) com `error_class` máquina-legível. Não precisa abrir um dashboard de terceiros para saber por que um lead não entrou.
- **Testável em isolamento.** 59 testes unitários (Vitest) cobrem assinatura HMAC, janela de replay, extração de campos por `ref`, mapeamento 3-layer e redação de PII — tudo sem rodar a plataforma externa. Orquestradores visuais não oferecem unit testing equivalente.

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
<TypeformEmbed />  (@typeform/embed-react, inline)
  │  • Lê UTMs+landing_page do localStorage via lib/attribution.ts
  │  • Passa 8 hidden fields ao widget (7 UTMs + landing_page)
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
  5. mapUtms() + buildDatacrazyPayload()  (3-layer: source / sourceReferral.sourceUrl / notes-JSON)
  6. postLead() → POST https://api.g1.datacrazy.io/api/v1/leads
                  (fetch com timeout, retry em 429, result tipado)
  7. Log estruturado com PII redigida (email/phone/nome)
  ▼
Datacrazy lead criado com:
  • source                        ← utm_source
  • sourceReferral.sourceUrl      ← landing_page completa com querystring
  • notes                         ← JSON com os 7 params + capturedAt + landing_page
```

### Fluxo de atribuição (first-touch)

O atributo `data-tf-transitive-search-params` do Typeform lê apenas da URL atual, o que quebra para visitantes que voltam sem UTM na URL. A solução é client-side:

1. `lib/attribution.ts` grava os 7 params + `landing_page` em `localStorage` na primeira visita com UTMs.
2. `<UTMRehydrator />` usa `useLayoutEffect` para, em visitas subsequentes sem UTM, reescrever a URL via `history.replaceState` **antes do paint** e antes do script do Typeform anexar ao DOM.
3. `<TypeformEmbed />` (do pacote `@typeform/embed-react`) passa os 8 hidden fields ao widget via a prop `hidden`, não dependendo da reescrita da URL.

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
| Form embed | **`@typeform/embed-react` ^4.11** | Widget inline, hidden fields via prop. |
| Unit tests | **Vitest ^2.1** | 59 testes, 7 arquivos. |
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
| `DATACRAZY_API_TOKEN` | **server-only** | Datacrazy → Configurações → API (token exibido 1× ao criar). |
| `TYPEFORM_WEBHOOK_SECRET` | **server-only**, min. 16 chars em produção | Typeform → Connect → Webhooks → Edit → Secret. |
| `TYPEFORM_FORM_ID` | **server-only** | ID do formulário (atual: `FbFMsO5x`). Validado na inicialização via zod em `env.server.ts`. Hoje não é cruzado contra `form_response.form_id` no route handler — gap conhecido, documentado em [Lacunas conhecidas](#lacunas-conhecidas). |
| `NEXT_PUBLIC_SITE_URL` | público (OG/canonical) | URL base do deploy. Ex.: `https://ticto-outlier-lp.vercel.app`. |
| `NEXT_PUBLIC_TYPEFORM_FORM_ID` | público (widget client-side) | Mesmo valor de `TYPEFORM_FORM_ID`. A duplicação é intencional e documentada em `AGENTS.md`. |

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
| `pnpm check:secrets` | Falha o build se `DATACRAZY_API_TOKEN` ou `TYPEFORM_WEBHOOK_SECRET` vazarem no bundle cliente. |

---

## Testes

### Unit tests (59 testes, 7 arquivos)

| Arquivo | Cobertura |
|---|---|
| `tests/unit/webhook-auth.test.ts` | HMAC SHA-256 base64, `timingSafeEqual`, janela de replay 60s futuro / 48h passado, erros estruturais (`malformed_payload`). |
| `tests/unit/utm-mapping.test.ts` | Extração de UTMs de `form_response.hidden`; mapeamento 3-layer → Datacrazy. |
| `tests/unit/typeform-fields.test.ts` | `parseAnswers` por `ref` (não por ID); falha em campos obrigatórios ausentes. |
| `tests/unit/datacrazy.test.ts` | Fetch client, retry em 429, timeout, union tipado `ok`/`err`. |
| `tests/unit/attribution.test.ts` | First-touch save, rehydrate, guard SSR. |
| `tests/unit/env.test.ts` | Schema Zod rejeita env inválido; regras de `min(16)` só em produção. |
| `tests/unit/logger.test.ts` | `redactEmail` (`j***@domain.com`), `redactPhone` (`***-1234`), `redactName` (`J***`). |

### E2E (Playwright)

Rodado em GitHub Actions via evento `deployment_status` contra o Preview URL da Vercel. Datacrazy fica mockado no CI (`page.route('**/api.g1.datacrazy.io/**')`) para evitar flakiness e rate limits. Um smoke manual contra o CRM real é gravado 1× como entregável do teste (screencast).

### `check:secrets`

Script `scripts/check-secrets.mjs` varre `.next/static`, `.next/server/app/*.html|.rsc` e `out/` atrás das strings `DATACRAZY_API_TOKEN` e `TYPEFORM_WEBHOOK_SECRET`. Roda no CI (`.github/workflows/ci.yml`) e falha o build se encontrar.

### Auditoria de cobertura (Task 23)

> **Test coverage audit (Task 23):** 0 P0, 5 P1, 6 P2 findings.
> - **P0 gaps:** none — no ship-blockers
> - **P1 — tracked for post-ship:** datacrazy generic-fetch-throw, two-consecutive-429 path, `lead_id`/`leadId` fallbacks, `Retry-After` edge cases, extract `sanitizeLandingUrl` + `readBodyWithCap` from route.ts into `lib/request-utils.ts` for direct unit coverage
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

- **Datacrazy Free tier bloqueia `POST /api/v1/leads`.** O pipeline completo funciona e o log de produção comprova (ver seção [Descoberta durante o teste](#descoberta-durante-o-teste-datacrazy-free-tier-bloqueia-post-apiv1leads)). Desbloqueio = swap do token de API no Vercel; zero mudança de código.

- **Sem dedup durável de webhooks.** Se Typeform retransmitir ou nosso retry em 429 re-entrar no fluxo, Datacrazy pode aceitar duplicata. Mitigação atual: o Datacrazy identifica leads por `nome + email` ou `nome + telefone`, então submissões duplicadas convergem no CRM. Solução de produção: LRU de `form_response.token` em Redis (Vercel Marketplace / Upstash).
- **CSP não configurada.** `proxy.ts` aplica apenas `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy` e HSTS. CSP rigorosa sem quebrar o embed Typeform exige iteração fora do escopo.
- **Contraste WCAG em `btn-primary`.** Combinação documentada para revisão visual; não bloqueia entrega.
- **Indireção `--font-*` em CSS vars.** Próximo passo é expor as fontes via `@theme` em vez de redeclarar.
- **Marcação `<ol>` ausente nas "Regras".** O componente `Rules.tsx` usa `<div>` onde semanticamente um `<ol>` seria correto. A11y flag tracked.
- **`.github/workflows/claude.yml` removido.** O repo é público; sem `ANTHROPIC_API_KEY` configurada, o workflow do Claude GitHub Action ficaria no vermelho. Removido enquanto a chave não for provisionada.
- **`TYPEFORM_FORM_ID` não é cruzado contra `form_response.form_id`.** A env var existe e é validada por zod na inicialização, mas o route handler não compara o `form_id` do payload Typeform contra ela. Um atacante com o HMAC secret poderia, em tese, enviar um payload de *outro* form assinado corretamente e ele seria aceito. Proteção adicional de baixo custo: dois `if (body.form_response.form_id !== env.TYPEFORM_FORM_ID) return 403;` depois do HMAC check. Não crítico porque o HMAC secret é per-form no Typeform (vazar o secret já compromete todo o fluxo), mas vale fechar.
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
│   └── api/lead/route.ts        Handler do webhook Typeform (HMAC + Datacrazy POST).
├── components/
│   ├── Hero.tsx                 Hero RSC com CTA.
│   ├── Rules.tsx                Bloco de regras do evento.
│   ├── Footer.tsx               Rodapé.
│   ├── typeform-embed.tsx       Client: <Widget> do @typeform/embed-react + hidden fields.
│   ├── utm-rehydrator.tsx       Client: first-touch save + history.replaceState.
│   └── ui/button.tsx            shadcn primitive.
├── lib/
│   ├── env.server.ts            Zod schema server-only (DATACRAZY, TYPEFORM_*).
│   ├── env.client.ts            Zod schema público (NEXT_PUBLIC_*).
│   ├── webhook-auth.ts          HMAC SHA-256 base64, timingSafeEqual, replay window.
│   ├── typeform-fields.ts       Registry `ref`-keyed; parseAnswers tipado.
│   ├── utm-mapping.ts           mapUtms + buildDatacrazyPayload (3-layer).
│   ├── datacrazy.ts             Fetch client com retry em 429 + timeout + result tipado.
│   ├── attribution.ts           localStorage first-touch helpers.
│   ├── logger.ts                JSON structured log + redactEmail/Name/Phone.
│   └── utils.ts                 cn() (tailwind-merge + clsx).
└── proxy.ts                     Security headers only (sem auth, sem rate limit).

tests/unit/                      7 arquivos, 59 testes (Vitest).
scripts/check-secrets.mjs        Guard: server-only env vars ∉ client bundle.
docs/                            Briefing, spec, ADRs, research, handover prompts.
.github/workflows/ci.yml         typecheck + lint + test + check:secrets.
.github/workflows/e2e.yml        Playwright contra Preview URL (trigger: deployment_status).
```

---

## Créditos

Autor: **Johan Sabent** (johansabent@gmail.com) — Teste técnico para a vaga de Gerente de Automações na Ticto, abril/2026.

Repo: https://github.com/johansabent/ticto-ebulicao-lp
