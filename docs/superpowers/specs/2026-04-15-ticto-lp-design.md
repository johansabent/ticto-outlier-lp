> **SUPERSEDED IN PART — 2026-04-16:** Platform changed from YayForms to Typeform. Product name changed from "Outlier Experience" to "Ebulição". The implementation plan at `docs/superpowers/plans/2026-04-15-ticto-lp-implementation.md` is the canonical source for current state. This spec is retained as historical context only.

# Design Spec — LP Outlier Experience (Teste Técnico Ticto) — v2

**Data:** 2026-04-15
**Autor:** Johan (assistido por Claude; revisão adversarial por Codex CLI)
**Status:** Aguardando aprovação
**Changelog v2:** incorpora correções da review adversarial do Codex — removidas afirmações não verificadas, BotID removido do webhook (erro conceitual), Cache Components removido (overkill), 4-layer UTM → 3-layer, rate limit movido pra fora do `proxy.ts` no webhook, E2E com CRM real só manual (CI mocka), adicionados field-ID registry + env validation fail-fast + delivery checklist.

## 1. Contexto

Teste técnico de 72h para vaga de **Gerente de Automações** na Ticto. Entregar:
1. Landing page em Next.js + React, pixel-perfect ao Figma fornecido
2. Formulário YayForms embedado (inline)
3. Integração funcional com CRM Datacrazy
4. Captura e repasse de 7 parâmetros (`utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term`, `sck`, `src`)
5. Deploy em Vercel, repositório GitHub público, README explicativo
6. URL de teste parametrizada + print/vídeo mostrando lead criado no Datacrazy com parâmetros mapeados

Peso da nota: **75% integração** (form 25% + CRM 25% + UTM 25%), 10% código, 10% deploy, 5% pixel-perfect.

**Postura arquitetural** (coerência com pitch da entrevista): integrações via API direta + código, sem middleware SaaS (Zapier/Make/n8n). Trato isso como pragmatismo de engenharia — controle, latência, falhas visíveis —, não como manifesto.

## 2. Stack (abril/2026)

Versões fixadas apenas onde verificadas em docs oficiais; resto usa carets pra permitir patches.

| Camada | Escolha | Motivo |
|---|---|---|
| Framework | **Next.js ^16.2** (current stable) | App Router; `proxy.ts` substitui `middleware.ts`; async Request APIs; Turbopack default |
| Linguagem | TypeScript ^5.1 | Mínimo Next 16 |
| Runtime | **Node.js 24 LTS** em **Fluid Compute** | Default Vercel 2026; `node:crypto` nativo; timeout 300s |
| Rendering | **RSC padrão** (sem `cacheComponents`) | LP é essencialmente estática; Cache Components/PPR não traz ganho concreto no cenário e adiciona surface area |
| UI | **Tailwind CSS ^4** (CSS-first via `@theme`) + **shadcn/ui CLI ^4** | Velocidade máxima; sem `tailwind.config.ts`; shadcn v4 usa Radix primitives com `data-slot` (sem `forwardRef`) |
| Animações | `tw-animate-css` | `tailwindcss-animate` deprecated em mar/2025 |
| Fonts | `next/font` (Google Fonts) | Auto-optimize; injetado via CSS variable |
| E2E | **Playwright ^1.59** | `page.frameLocator()` pra iframe |
| Unit | Vitest | Nativo TS |
| Package manager | **pnpm** | Battle-tested com Next + Vercel |
| Deploy | Vercel + GitHub integration | Push em `main` = produção; PRs = Preview |
| E2E em CI | **GitHub Actions contra Preview URL, Datacrazy mockado** | Vercel build não roda browsers; real CRM em CI = flakiness + rate limits |

**Sem:** `vercel.ts` (overkill); `tailwind.config.ts` (Tailwind v4 CSS-first); `cacheComponents: true` (ganho não justifica complexidade pra LP simples).

**Nota sobre CVEs:** Next.js publicou múltiplas advisories em 2025–2026. A mitigação correta é usar a release estável mais atual (`^16.2`) que já incorpora patches. Não vou citar CVE específica no README sem cross-check via NVD como fonte primária.

## 3. Arquitetura (fluxo end-to-end)

```
User arrives: https://<project>.vercel.app/?utm_source=...&sck=...&src=...
      │
      ▼
app/page.tsx (RSC) renders LP shell
      │
      ▼
<UTMRehydrator> (client, useLayoutEffect):
  • If URL has UTMs AND no saved first-touch → save to localStorage
  • If URL missing UTMs AND have saved → history.replaceState BEFORE paint
    (roda antes de analytics/YayForms embed)
      │
      ▼
<YayFormsEmbed> (client, monta após rehydration) injects <script> + div
  com data-yf-transitive-search-params="utm_source,utm_medium,...,sck,src"
      │
      ▼
YayForms iframe lê URL atual, popula 7 hidden fields
User preenche nome/email/telefone → submit
      │
      ▼
YayForms dispara Webhook V2 (assinatura TBD — ver §11) → POST /api/lead
      │
      ▼
app/api/lead/route.ts (Node runtime):
  1. Read raw body
  2. Validate webhook auth (HMAC se disponível OU shared-secret path OU header custom — ver §6.1)
  3. Parse JSON
  4. Mapear answers[field_id] → campos nomeados via YAYFORMS_FIELD_MAP (env-backed)
  5. Transform → Datacrazy payload (3-layer mapping)
  6. POST https://api.g1.datacrazy.io/api/v1/leads (retry em 429)
  7. Se Datacrazy falhar → 5xx (YayForms retries naturalmente)
  8. Se sucesso → waitUntil(structured_log) + 200
      │
      ▼
Datacrazy lead criado com:
  • source = utm_source
  • sourceReferral.sourceUrl = URL original completa com query string
  • notes = JSON estruturado com todos os 7 params + metadata
```

## 4. Estrutura de arquivos

```
ticto-new/
├── src/
│   ├── app/
│   │   ├── layout.tsx               # metadata, OG tags, fonts
│   │   ├── page.tsx                 # LP (RSC) — compõe sections
│   │   ├── globals.css              # Tailwind @import + @theme + OKLCH vars
│   │   └── api/
│   │       └── lead/
│   │           └── route.ts         # webhook handler (Node runtime)
│   ├── components/
│   │   ├── ui/                      # shadcn primitives
│   │   ├── sections/                # hero, about, speakers, cta, footer (RSC)
│   │   ├── yayforms-embed.tsx       # client: injeta script YayForms
│   │   └── utm-rehydrator.tsx       # client: first-touch + re-injection
│   ├── lib/
│   │   ├── env.ts                   # env-var schema (Zod) + fail-fast no boot
│   │   ├── datacrazy.ts             # CRM fetch client com retry/backoff
│   │   ├── yayforms-fields.ts       # field-ID registry (env-backed map)
│   │   ├── utm-mapping.ts           # YayForms payload → Datacrazy (3-layer)
│   │   ├── webhook-auth.ts          # validação multi-modo (HMAC/secret/header)
│   │   ├── attribution.ts           # localStorage helpers
│   │   └── logger.ts                # JSON structured log + PII redaction
│   └── proxy.ts                     # APENAS security headers (sem rate limit)
├── tests/
│   ├── e2e/
│   │   └── lead-flow.spec.ts        # happy-path com Datacrazy MOCKADO
│   └── unit/
│       ├── utm-mapping.test.ts
│       ├── webhook-auth.test.ts
│       ├── yayforms-fields.test.ts
│       ├── attribution.test.ts
│       └── env.test.ts
├── docs/
│   ├── research/                    # pesquisas YayForms/Datacrazy/NotebookLM + Codex review
│   └── superpowers/
│       ├── specs/                   # este arquivo
│       └── plans/                   # implementation plan (próximo passo)
├── public/                          # imagens, favicon, OG image
├── .env.example                     # template (keys vazias + comentários)
├── .env.local                       # gitignored (tokens reais)
├── .gitignore
├── next.config.ts                   # images.remotePatterns; nada de cacheComponents
├── postcss.config.mjs               # { plugins: { '@tailwindcss/postcss': {} } }
├── tsconfig.json
├── playwright.config.ts
├── vitest.config.ts
├── package.json
├── pnpm-lock.yaml
├── README.md                        # exigido pelo teste (ver §12)
├── CLAUDE.md                        # regras Claude-specific
└── AGENTS.md                        # regras do projeto (fonte de verdade)
```

## 5. Decisões de design

### 5.1 Handler síncrono; `waitUntil` só pra não-crítico

HMAC/auth + Datacrazy fetch são síncronos. Se Datacrazy falhar, retornamos 5xx e o YayForms retry nativo resolve. `waitUntil` apenas pra logging estruturado (não-crítico pra entrega do lead).

### 5.2 Mapeamento 3-layer (simplificado) de UTMs pro Datacrazy

Codex argumentou que 4 camadas é overengineering. Concordo. Mapeamento final:

- `source` ← `utm_source` (campo nativo, indexado no CRM)
- `sourceReferral.sourceUrl` ← URL original completa com query string (auditoria; o Datacrazy preserva)
- `notes` ← JSON estruturado contendo os 7 params + landing_page + captured_at (human-legível como bloco e parseável como JSON)

Removido: `tags[]` e `sourceReferral.sourceId`. Não sabemos se o CRM usa tags de forma útil nessa conta free, e `sourceId` mapeado pra `utm_campaign` era especulativo. JSON em `notes` preserva 100% do dado original sem inventar estrutura.

### 5.3 First-touch attribution com `history.replaceState` + `useLayoutEffect`

`useLayoutEffect` (não `useEffect`): roda sincronicamente antes do paint e antes do script YayForms ser anexado ao DOM. Analytics do Vercel (se ativo) já terá registrado o pageview antes da reescrita, então o polling de URL visível é momento ok (user já "chegou"). O trade-off de poluir URL copiada é consciente e documentado.

### 5.4 Next.js ^16.2

Stable atual. App Router, `proxy.ts`, async Request APIs (`searchParams`/`cookies`/`headers` agora Promises), Turbopack default em `next dev`, Streaming Metadata, `next/image` com `remotePatterns`. `serverRuntimeConfig`/`publicRuntimeConfig` removidos (não usamos mesmo).

### 5.5 Sem dedup durável — Datacrazy carrega idempotência nativamente (limitação aceita)

Vercel KV descontinuado. Marketplace (Upstash) = tempo não justificado pra volume esperado em 72h. **O que efetivamente faz idempotência pra nós é a regra documentada do Datacrazy: leads são identificados por `nome + email` ou `nome + telefone`** — submissões duplicadas convergem pro mesmo lead no CRM. Isso não é nosso código, é comportamento da plataforma alvo. README explicita isso em §12.8 pra não parecer que ignoramos o risco; é uma decisão consciente de delegar a função pro CRM.

### 5.6 Sem BotID no webhook (correção vs v1)

Codex pegou: BotID exige client challenge; YayForms é server-to-server, não completa o desafio. No webhook BotID ou não faz nada ou bloqueia o sender legítimo. **Removido.** Proteção do webhook = validação de auth (§6.1) + schema validation + Vercel Firewall se necessário.

### 5.7 Sem rate limit custom no `proxy.ts` pro webhook (correção vs v1)

Codex pegou: serverless proxy state não é durável (cada invocation pode ser nova instância), e retries do YayForms vêm de IPs compartilhados. Rate limit custom aí quebra delivery legítima sem impedir abuso real. **Removido.** Se spam virar problema real, configuro regra na Vercel Firewall (zero custo, state correto).

### 5.8 Embed YayForms STANDARD inline

Maximiza fidelidade pixel-perfect ao Figma. Menos moving parts. Briefing permite inline.

### 5.9 Field-ID registry (`lib/yayforms-fields.ts`)

YayForms V2 webhook paia com `{field_id: {content}}`. Field IDs são ambíguos/opacos. Strategy:
- Ao criar o form no YayForms, anotar field_id de cada campo (nome, email, telefone, + 7 hidden UTMs)
- Expor via env var `YAYFORMS_FIELD_MAP` (JSON) ou arquivo TypeScript constante
- Módulo `yayforms-fields.ts` parseia e expõe map tipado `{ name: string, email: string, phone: string, utm_source: string, ... }`
- Tests validam que todos os 10 campos esperados estão no map; falha boot se algum faltar

## 6. Segurança

### 6.1 Autenticação do webhook — design multi-modo

Docs do YayForms são silentes sobre formato de assinatura. Design em 3 camadas de fallback, decidido no day-0 spike:

**Camada A (preferida) — HMAC SHA256 se YayForms enviar assinatura:**
- Descobrir header name no painel YayForms (provavelmente `X-YayForms-Signature` ou similar)
- Descobrir payload: `body` sozinho vs `timestamp.body`
- Validar com `crypto.timingSafeEqual`, length check prévio, encoding hex explícito
- Se assinatura inválida: 401

**Camada B (fallback) — URL com secret path:**
- Se YayForms não assinar: configurar webhook URL como `https://<project>.vercel.app/api/lead/<RANDOM_SECRET>`
- Route dinâmico `app/api/lead/[secret]/route.ts` compara `params.secret` com `WEBHOOK_URL_SECRET` env
- Não é HMAC, mas é secreto-por-obscuridade HTTPS-protegido; suficiente pro escopo

**Camada C (last resort) — shared secret em header custom:**
- Se conseguirmos configurar headers customizados no YayForms (docs mencionam "header customizado"): `X-Webhook-Secret: <value>`
- Route valida `headers.get('x-webhook-secret') === env.WEBHOOK_SHARED_SECRET`

**Day-0 spike task (obrigatório antes de implementar handler):**
1. Criar conta YayForms
2. Criar form de teste com 1 campo
3. Configurar webhook apontando pra endpoint temporário (webhook.site ou local ngrok)
4. Submeter → inspecionar headers recebidos
5. Decidir camada A / B / C com base no que vier
6. Documentar decisão e caminho escolhido no README

Sem esse spike, não começo implementação do handler.

**Replay protection:** se Camada A tiver timestamp, aceito janela de 5 min e rejeito fora disso. Sem timestamp, aceito trade-off (escopo 72h).

### 6.2 Env vars

Variáveis:
- `DATACRAZY_API_TOKEN` (Bearer do CRM)
- `YAYFORMS_FIELD_MAP` (JSON com field IDs)
- `WEBHOOK_AUTH_MODE` = `hmac` | `secret_path` | `shared_secret` (decidido no spike)
- `YAYFORMS_WEBHOOK_SECRET` (valor da camada escolhida)
- `NEXT_PUBLIC_SITE_URL` (só esse é público)

Locais: `.env.local` (gitignored). Produção: Vercel Dashboard > Env Variables. Sync local via `vercel env pull .env.local`.

### 6.3 Env validation fail-fast (`lib/env.ts`)

Schema Zod no boot. Se qualquer env var obrigatória faltar ou estiver malformada, throw no módulo-root. Isso explode build/start, não runtime — erro aparece no `vercel build` ou `next dev`, nunca no primeiro webhook.

### 6.4 Security headers (`proxy.ts`)

**Limitação importante do Next 16:** `proxy.ts` **não pode retornar response bodies** (não dá 401 JSON, nem abort com payload). Só pode setar headers e fazer `NextResponse.next()`. Toda lógica de auth/rejeição fica no Route Handler. Isso está correto no nosso design — proxy.ts só adiciona headers; validação de webhook fica 100% em `/api/lead/route.ts`.

Apenas headers, sem rate limiting custom. Configuração mínima e funcional:
- `X-Frame-Options: DENY` (não permitimos framing)
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Strict-Transport-Security: max-age=63072000; includeSubDomains`

**Sem CSP específica no spec.** CSP mal configurada quebra fontes, analytics e embed YayForms. Decisão: começar sem CSP; adicionar CSP via `script-src` permitindo `embed.yayforms.com` (e domínios correlatos descobertos no day-0 spike) só se implementação funcionar end-to-end e sobrar tempo.

### 6.5 Verificação de vazamento de secrets

Pós-build, antes do push: grep no bundle cliente por strings `DATACRAZY_` e `YAYFORMS_`. Script simples no `package.json` (`"check:secrets"`). Nenhum token pode aparecer fora de `/api/`.

## 7. Observabilidade

JSON structured logs via `console.log(JSON.stringify(...))` → Vercel Logs. Eventos:

| Evento | Campos |
|---|---|
| `lead.received` | request_id, auth_mode, auth_valid, timing_ms |
| `lead.mapped` | submission_id, field_count_mapped, utm_keys_present |
| `lead.forwarded` | submission_id, datacrazy_status, datacrazy_lead_id, timing_ms |
| `lead.failed` | submission_id, error_class, error_message |

**error_class values:** `auth_invalid` | `parse_error` | `field_map_incomplete` | `datacrazy_4xx` | `datacrazy_5xx` | `datacrazy_timeout`

**PII redaction:** `email` → `j***@example.com`; `phone` → `***-1234`. Correlação via `yayforms_submission_id`.

## 8. Testing

### 8.1 E2E (Playwright, 1 happy-path) — **com Datacrazy MOCKADO em CI**

`tests/e2e/lead-flow.spec.ts`:
- Navega URL com 7 UTMs
- Aguarda iframe via `page.frameLocator('iframe[title*="YayForms"]')`
- Preenche com `getByLabel` (nome, email, telefone)
- `page.route('**/api.g1.datacrazy.io/**')` intercepta e retorna 201 fake
- Submete
- Valida que o request interceptado contém o 3-layer mapping correto (inspeção do body)

**Execução CI:** GitHub Actions triggered por `deployment_status` event → `npx playwright install --with-deps` → `npx playwright test` contra Preview URL.

**Smoke manual live (separado do CI):** 1x antes de submeter o teste, rodar o fluxo completo contra Datacrazy real, gravar screencast (≤2 min) mostrando lead criado no CRM com todos os 7 params. Esse screencast É o entregável #4 do briefing.

### 8.2 Unit (Vitest, 5 arquivos)
- `utm-mapping.test.ts`: URL completa → payload Datacrazy esperado (tabela de casos)
- `webhook-auth.test.ts`: cada modo (HMAC/secret_path/shared_secret) valida e rejeita corretamente; length mismatch não throw
- `yayforms-fields.test.ts`: parse do `YAYFORMS_FIELD_MAP`; falha se campos obrigatórios faltarem
- `attribution.test.ts`: first-visit save; second-visit rehydrate; SSR guard
- `env.test.ts`: schema Zod rejeita env inválido

### 8.3 Smoke manual de UI
Playwright MCP (`--isolated`) ou gstack `/browse` → comparação lado-a-lado com Figma Dev Mode em 4 viewports (375, 768, 1280, 1920). `/design-review` skill pra auditoria final.

**Workflow Figma (com rate-limit awareness):** Figma MCP em Pro + Dev seat tem limite reportado de ~200 tool calls/dia OU 10 calls/min. **Estratégia:** rodar `get_design_context` UMA vez no início (extrair todos os tokens de cor/tipografia/spacing/layout do node raiz do Figma), salvar em `docs/design-tokens.json` como cache local, e converter manualmente pros componentes shadcn a partir desse cache. Zero chamadas MCP durante a fase final da implementação — evita surpresa de throttle nas últimas horas. Sem Code Connect (overkill pra single-page).

## 9. Deployment

- **GitHub repo:** `johansabent/ticto-outlier-lp` (public)
- **Vercel:** GitHub integration; push em `main` = produção; PRs = preview
- **Domínio:** `<project>.vercel.app` (sem custom)
- **Env vars:** via Vercel Dashboard (Preview + Production); sync local com `vercel env pull .env.local`
- **Analytics:** Vercel Analytics + Speed Insights free tier — Core Web Vitals viram evidência no README
- **E2E CI:** GitHub Actions triggered por `deployment_status` event → roda contra `${{ github.event.deployment_status.target_url }}` com Datacrazy mockado

## 10. Risk register (v2)

| # | Risco | Likelihood | Impact | Mitigação |
|---|---|---|---|---|
| 1 | **Auth do webhook YayForms indefinida** | Alta | Crítico | Day-0 spike (§6.1) antes de implementar handler; design multi-modo (HMAC/secret-path/shared-secret) |
| 2 | **Field-ID drift** (YayForms muda schema, ou copiamos ID errado) | Média | Alto | Registry em `lib/yayforms-fields.ts` + env var; testes validam map completo; falha boot se incompleto |
| 3 | Trial YayForms expira antes da avaliação | Média | Média | Criar conta já (decidido); screencast como evidência imutável; disclosure no README |
| 4 | E2E contra CRM real em CI flaky | Alta (se rodarmos) | Média | Mock Datacrazy em CI; 1 smoke manual live com screencast |
| 5 | Token Datacrazy vaza no bundle cliente | Baixa | Crítico | Só no Route Handler; nunca `NEXT_PUBLIC_`; script `check:secrets` pré-push |
| 6 | Design Figma mal lido (responsivo) | Média | Baixo | Figma Dev Mode + cross-check 4 viewports + `/design-review` |
| 7 | Race UTM rehydrator vs script YayForms | Baixa | Média | `useLayoutEffect` (não useEffect); `<UTMRehydrator />` renderiza acima do `<YayFormsEmbed />` |
| 8 | URL mutation polui analytics/URL copiada | Baixa | Baixo | Documentado como trade-off; `useLayoutEffect` minimiza janela; Vercel Analytics dispara antes |

## 11. Validações pendentes (tratamento explícito)

### 11.1 Formato de auth do webhook YayForms (DAY-0 SPIKE, BLOQUEADOR)

**Estratégia de descoberta** (não é opcional, é task #1 do plano):
1. Criar conta YayForms + form teste
2. Webhook → endpoint de inspeção (webhook.site ou ngrok local)
3. Submeter e inspecionar headers + body brutos
4. Classificar em camada A (HMAC) / B (secret path) / C (shared secret) — ver §6.1
5. Registrar decisão em `docs/decisions/2026-04-15-webhook-auth.md`
6. Só então implementar `lib/webhook-auth.ts` no modo decidido

### 11.2 CVE Next.js (não citar no README sem cross-check)

Afirmações anteriores sobre CVE-2025-55182 e version patched não foram validadas em NVD primary source. Decisão: **não citar CVE específica no README**. Usar `^16.2` como "stable atual de 2026" e deixar as patches implícitas no caret. Se o avaliador perguntar, mostro que estou na versão estável e não em release conhecidamente vulnerável.

## 12. README narrative (drafts pra copiar/colar)

**IMPORTANTE:** README precisa cobrir todos os 5 itens exigidos pelo briefing:
1. URL da página publicada
2. URL do repo GitHub
3. URL de teste parametrizada com UTMs
4. Print/vídeo do lead chegando no Datacrazy com UTMs
5. Instruções de rodar local + decisões técnicas + dificuldades

### 12.1 Quick start (local)

> **Pré-requisitos:** Node.js 24 LTS, pnpm ^9, conta Vercel (pra `vercel env pull`).
>
> ```bash
> pnpm install
> cp .env.example .env.local   # preencher DATACRAZY_API_TOKEN + YAYFORMS_*
> # ou: vercel link && vercel env pull .env.local
> pnpm dev                     # http://localhost:3000
> pnpm test                    # unit tests
> pnpm e2e                     # E2E com Datacrazy mockado
> ```

### 12.2 URL de teste

> Acesso parametrizado:
> ```
> https://<project>.vercel.app/?utm_source=linkedin&utm_medium=organic&utm_campaign=outlier2025&utm_content=hero-cta&utm_term=evento-presencial&sck=abc123&src=review
> ```
> Os 7 parâmetros são capturados no first-touch, persistidos em localStorage e repassados ao webhook até chegarem no Datacrazy.

### 12.3 Stack e racional

> Stack: Next.js ^16.2 (App Router) em Fluid Compute (Node.js 24 LTS) na Vercel, Tailwind v4 (CSS-first), shadcn/ui v4. São os defaults estáveis de 2026, sem decisões exóticas. Handler `/api/lead` roda Node (não Edge) porque valida webhook signature com `node:crypto` e chama API do Datacrazy com retry — o runtime precisa ser confiável na camada de integração.

### 12.4 Integração direta (coerência de princípio)

> A Ticto pode integrar YayForms ao Datacrazy via Zapier, Make ou n8n — são ferramentas legítimas. Pra este teste escolhi o caminho direto: handler Next.js recebe webhook, valida auth, transforma payload, chama a API REST do Datacrazy. É uma escolha de engenharia pragmática: controle total, latência mínima, falhas visíveis em Vercel Logs, zero vendor lock-in na rota crítica. Para volume e complexidade maiores, orquestradores visuais têm lugar; pra este escopo, código direto ganha.

### 12.5 Mapeamento UTM → Datacrazy (3-layer)

> A REST API pública do Datacrazy não documenta campos customizados. Mapeei os 7 parâmetros em 3 campos nativos do schema:
> - `source` recebe `utm_source` (origem primária, indexada no CRM)
> - `sourceReferral.sourceUrl` preserva a URL completa com todas as query strings (auditoria)
> - `notes` contém JSON estruturado com todos os 7 params + landing_page + captured_at (parseável downstream)
>
> Essa decisão prioriza preservação de dado bruto sobre inventar estrutura em campos que não sei se o CRM indexa.

### 12.6 First-touch attribution com re-injeção

> O atributo `data-yf-transitive-search-params` do YayForms lê apenas da URL atual. Isso quebra pra usuários de retorno. Um componente cliente salva os UTMs em localStorage na primeira visita; em visitas sem UTMs na URL, reescreve a URL via `history.replaceState` antes do paint (via `useLayoutEffect`). Trade-off consciente: URL copiada fica suja. O ganho é atribuição first-touch preservada através de sessões sem forkar a lib do YayForms.

### 12.7 Dificuldades encontradas

> 1. **Formato de auth do webhook YayForms não documentado.** Docs silentes sobre header name + formato da assinatura. Resolvi com day-0 spike: configurei webhook pra endpoint de inspeção, submetei form, decidi modo de auth com base no que veio. Documentei em `docs/decisions/2026-04-15-webhook-auth.md`.
> 2. **Datacrazy sem campos customizados.** Schema REST público não tem `customFields`. Resolvi com mapping 3-layer em campos nativos (ver §12.5).
> 3. **Trial YayForms de 7 dias.** Criei conta já pra aproveitar a janela do teste; se reviewer avaliar depois do trial, screencast serve de evidência.

### 12.8 Limitações conscientes (escopo 72h)

> Três coisas que faria em produção mas ficaram fora:
> 1. **Dedup durável de webhooks:** usaria Upstash Redis via Vercel Marketplace armazenando `yayforms_submission_id` com TTL. Aqui, a idempotência é delegada ao Datacrazy — a plataforma identifica leads por `nome + email` ou `nome + telefone`, então retries de webhook convergem pro mesmo lead no CRM. Isso não é dedup nosso; é comportamento documentado da plataforma alvo, que consciente aceitei como suficiente pro escopo.
> 2. **Observabilidade além de Vercel Logs:** Sentry ou similar em produção. Aqui, JSON structured logs via console — auditáveis em `vercel logs`, sem custo extra.
> 3. **CSP específica:** configurar CSP rigorosa sem quebrar YayForms/analytics exige iteração; comecei sem CSP (só security headers básicos) e adicionaria em segunda rodada.

## 13. Delivery checklist

Antes de submeter o teste, confirmar:

- [ ] Preview URL público funcionando
- [ ] Repo GitHub público criado e push feito
- [ ] Env vars configuradas em Production + Preview no Vercel
- [ ] URL de teste parametrizada documentada no README
- [ ] Screencast (≤2 min) gravado mostrando:
  - [ ] Acesso à URL com 7 UTMs
  - [ ] Preenchimento e submissão do form
  - [ ] Lead aparecendo no Datacrazy com nome/email/telefone
  - [ ] Lead com `source`, `sourceReferral.sourceUrl`, e `notes` contendo UTMs
- [ ] README com seções obrigatórias (§12.1 a §12.8)
- [ ] `pnpm check:secrets` passando (nenhum token no bundle cliente)
- [ ] `pnpm test` e `pnpm e2e` passando em CI
- [ ] `docs/decisions/2026-04-15-webhook-auth.md` criado após spike

## 15. GitHub repo setup

O repo é **entregável obrigatório** (briefing linhas 6, 29, 80, 89, 94). "Repositório organizado com README explicativo" entra no peso de 10% (deploy + entrega). Config:

### 15.1 Repo config

- **Nome:** `ticto-outlier-lp`
- **Owner:** `johansabent`
- **Visibility:** public
- **Description:** "Landing page Outlier Experience — Next.js 16 + YayForms + Datacrazy CRM. Teste técnico Ticto 2026."
- **Topics/tags:** `nextjs`, `typescript`, `tailwindcss`, `shadcn-ui`, `vercel`, `webhook`, `crm-integration`, `lead-capture`, `landing-page`, `automation`
- **License:** MIT (ou "nenhuma" — briefing não exige; MIT sinaliza abertura)
- **Default branch:** `main`
- **Branch protection:** OFF pra 72h (solo, direct push ok)
- **Social preview:** OG image do Figma quando render estiver pronto

### 15.2 GitHub Actions (CI)

Dois workflows, sem overengineering:

**`.github/workflows/ci.yml`** — dispara em `pull_request` e `push` em `main`:
```yaml
jobs:
  ci:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with: { node-version: 24, cache: 'pnpm' }
      - run: pnpm install --frozen-lockfile
      - run: pnpm typecheck
      - run: pnpm lint
      - run: pnpm test         # Vitest
      - run: pnpm check:secrets
```

**`.github/workflows/e2e.yml`** — dispara em `deployment_status` (sucesso) da Vercel:
```yaml
on:
  deployment_status:
jobs:
  e2e:
    if: github.event.deployment_status.state == 'success'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 24 }
      - run: pnpm install --frozen-lockfile
      - run: pnpm exec playwright install --with-deps chromium
      - run: pnpm e2e
        env:
          PLAYWRIGHT_TEST_BASE_URL: ${{ github.event.deployment_status.target_url }}
```

Datacrazy permanece mockado no E2E CI. Smoke live é manual com screencast.

### 15.3 Bots / integrações (mínimo viável)

| Integração | Status | Por quê |
|---|---|---|
| **Vercel bot** | ON (automático ao conectar) | Comenta preview URL em cada PR; grátis; útil pro evaluador ver histórico |
| **CodeQL** | ON (GitHub Advanced Security, default free em repo público) | Scan estático de segurança; 1-click enable; sinaliza maturidade |
| **Dependabot** | **OFF pra 72h** | Noise de PRs automáticos atrapalha foco; reativo em prod |
| **Claude Code Action** | **ON** | `.github/workflows/claude.yml` — bot `@claude` responde a menções em issues/PRs, pode abrir PRs via instrução, faz review automático. Em repo público requer `ANTHROPIC_API_KEY` (ou usar GitHub App auth). **Showcase direto do cargo de Gerente de Automações**: workflow agêntico ao vivo no próprio repo do teste. Config exata verificada em implementação (docs Anthropic podem ter mudado em 2026; usar skill `claude-api` ou `context7` pra validar). |
| **Codex via GitHub Action** | OFF | Setup custa tempo sem ROI vs Claude Code Action já habilitado |

### 15.4 Templates

**`.github/ISSUE_TEMPLATE/bug.md`** — bug report (repro, expected, actual, env).
**`.github/ISSUE_TEMPLATE/task.md`** — task agêntica (scope, files, acceptance criteria, dependencies).
**`.github/PULL_REQUEST_TEMPLATE.md`** — checklist (types/lint/test/secrets OK; Vercel preview link; breaking changes).

### 15.5 Apresentação (README como vitrine)

README.md abre com:
1. Título + 1-line description
2. Badges: Vercel deploy status, CI status, license
3. Live demo URL (preview)
4. URL parametrizada de teste (§12.2)
5. Screenshot hero do site
6. Seções §12.1 a §12.8 do spec (já drafted)
7. Screencast linkado (YouTube unlisted ou Vimeo; ≤2 min)
8. Link pra este spec + `docs/research/` pra quem quiser auditar raciocínio

## 16. Issue backlog pra dev agêntico

Post-spec, antes de começar implementação, criar issues no GitHub correspondendo às tasks do plano. O plano real sai de `writing-plans`, mas a estrutura de labels está fixada aqui.

### 16.1 Labels a criar

**Priority:**
- `priority:p0` (bloqueador / day-0)
- `priority:p1` (caminho crítico)
- `priority:p2` (importante mas não-bloqueador)
- `priority:p3` (nice-to-have)

**Type:**
- `type:spike` (descoberta/pesquisa)
- `type:setup` (scaffolding, tooling)
- `type:feature` (implementação)
- `type:test`
- `type:docs`
- `type:security`
- `type:deploy`

**Area:**
- `area:webhook`
- `area:crm`
- `area:attribution`
- `area:ui`
- `area:infra`

**Status:**
- `status:blocked` (aguardando outra issue)
- `status:ready` (pode ser pego)
- `status:in-progress`
- `status:done`

**Agent-dev:**
- `agent:ok` (autonomia total; agente pode pegar sem revisão humana prévia)
- `agent:review-required` (requer julgamento humano antes — ex: decisões arquiteturais)
- `agent:pair` (humano + agente lado a lado — ex: spike com análise de payload real)

### 16.2 Esqueleto do backlog (preenchido pelo writing-plans)

Ordenado por dependência:

| # | Título | Labels | Deps |
|---|---|---|---|
| 1 | [SPIKE] Day-0: descobrir formato de auth do webhook YayForms | `type:spike` `priority:p0` `area:webhook` `status:ready` `agent:pair` | — |
| 2 | [SETUP] Criar repo GitHub + push inicial + connect Vercel | `type:setup` `priority:p0` `area:infra` `agent:ok` | — |
| 3 | [SETUP] Scaffold Next.js 16 + pnpm + TypeScript + Tailwind v4 + shadcn v4 | `type:setup` `priority:p0` `area:ui` `agent:ok` | #2 |
| 4 | [SETUP] Configurar env vars (Vercel Dashboard + .env.example) | `type:setup` `priority:p0` `area:infra` `agent:ok` | #2 |
| 5 | [FEATURE] `lib/env.ts` com schema Zod fail-fast | `type:feature` `priority:p0` `area:infra` `agent:ok` | #3 |
| 6 | [FEATURE] `lib/yayforms-fields.ts` (field-ID registry) | `type:feature` `priority:p0` `area:webhook` `agent:ok` | #5 |
| 7 | [FEATURE] `lib/webhook-auth.ts` (modo decidido em #1) | `type:feature` `priority:p0` `area:webhook` `agent:review-required` | #1, #5 |
| 8 | [FEATURE] `lib/utm-mapping.ts` (3-layer → Datacrazy) | `type:feature` `priority:p0` `area:crm` `agent:ok` | #6 |
| 9 | [FEATURE] `lib/datacrazy.ts` (fetch client com retry) | `type:feature` `priority:p0` `area:crm` `agent:ok` | #5 |
| 10 | [FEATURE] `lib/logger.ts` (JSON structured log + PII redaction) | `type:feature` `priority:p1` `area:infra` `agent:ok` | — |
| 11 | [FEATURE] `app/api/lead/route.ts` (handler completo) | `type:feature` `priority:p0` `area:webhook` `agent:review-required` | #7, #8, #9, #10 |
| 12 | [FEATURE] `proxy.ts` (security headers only) | `type:feature` `priority:p1` `area:infra` `agent:ok` | #3 |
| 13 | [FEATURE] `lib/attribution.ts` (localStorage helpers) | `type:feature` `priority:p0` `area:attribution` `agent:ok` | #3 |
| 14 | [FEATURE] `components/utm-rehydrator.tsx` (useLayoutEffect) | `type:feature` `priority:p0` `area:attribution` `agent:ok` | #13 |
| 15 | [FEATURE] `components/yayforms-embed.tsx` (script injection) | `type:feature` `priority:p0` `area:ui` `agent:ok` | #14 |
| 16 | [SETUP] Figma MCP one-shot extraction → `docs/design-tokens.json` | `type:setup` `priority:p1` `area:ui` `agent:pair` | — |
| 17 | [FEATURE] LP shell (hero, sections, layout) com shadcn + tokens | `type:feature` `priority:p1` `area:ui` `agent:ok` | #3, #16 |
| 18 | [FEATURE] Integrar YayFormsEmbed na LP | `type:feature` `priority:p0` `area:ui` `agent:ok` | #15, #17 |
| 19 | [TEST] Unit tests (5 arquivos: env, fields, auth, mapping, attribution) | `type:test` `priority:p1` `agent:ok` | #5-#14 |
| 20 | [TEST] E2E Playwright com Datacrazy mockado | `type:test` `priority:p1` `agent:ok` | #11, #18 |
| 21 | [SETUP] GitHub Actions CI + E2E workflows | `type:setup` `priority:p1` `area:infra` `agent:ok` | #2, #19, #20 |
| 21b | [SETUP] Claude Code Action workflow (`.github/workflows/claude.yml`) + API key em secrets | `type:setup` `priority:p2` `area:infra` `agent:ok` | #2 |
| 22 | [DEPLOY] Preview deploy + smoke manual live com screencast | `type:deploy` `priority:p0` `area:infra` `agent:pair` | #11, #18 |
| 23 | [DOCS] README com §12 completo + badges + screencast | `type:docs` `priority:p0` `agent:ok` | #22 |
| 24 | [SECURITY] Validar `check:secrets` + revisar bundle cliente | `type:security` `priority:p0` `area:infra` `agent:ok` | #22 |
| 25 | [DEPLOY] Deploy prod + atualizar URLs no README + entregar | `type:deploy` `priority:p0` `area:infra` `agent:pair` | #23, #24 |

O writing-plans vai expandir cada item em steps executáveis (write test → run fail → implement → pass → commit).

## 17. Self-review

- [x] **Coverage do briefing:** LP Next.js ✓, YayForms inline ✓, Datacrazy integrado ✓, 7 UTMs ✓, Vercel deploy ✓, GitHub público ✓ (§15), README ✓, screencast ✓, backlog agêntico ✓ (§16)
- [x] **Sem placeholders:** §11 explicitamente flagueia day-0 spike como bloqueador + CVE tratamento explícito
- [x] **Consistência:** 3-layer mapping consistente em §3, §5.2, §12.5; `useUTMRehydration` e `mapToDatacrazy` nomeados uniformemente
- [x] **Escopo:** 1 LP + 1 handler + 7 libs + 5 unit tests + 1 E2E + GitHub/CI setup = coerente pra 72h
- [x] **Correções do Codex aplicadas:** BotID removido, rate limit removido, 4→3 layer, CRM mockado em CI, field-map adicionado, env validation fail-fast, version pins afrouxados, "sub-100ms TTFB" removido, CSP não prometido
- [x] **Refinamentos do Gemini aplicados:** proxy.ts limitação explícita (não retorna body) em §6.4, Datacrazy collision como idempotência explícito em §5.5/§12.8, Figma MCP one-shot extraction em §8.3 (evita rate limit)
- [x] **Pitch coherence:** §12.4 como pragmatismo de engenharia, não manifesto

---

## Aprovação

Este spec v2 incorpora 100% das correções críticas + major concerns do Codex. Revise e diga:

- **"aprovado"** → invoco `superpowers:writing-plans` pra gerar plano executável
- **"muda X"** → ajusto inline
- **"questiono Y"** → discutimos

**Nota importante:** o day-0 spike do §11.1 (descobrir auth do webhook YayForms) é a **primeira task** do plano de implementação. Sem ele, resto trava. Isso é consequência direta da review do Codex — ele tinha razão que `DEBUG_HMAC=true` "tática de descoberta" não é design de segurança; a descoberta agora está explicitamente bloqueando o start do handler.
