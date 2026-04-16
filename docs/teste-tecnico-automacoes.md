# TESTE TÉCNICO — Gerente de Automações

**Empresa:** Ticto  
**Cargo:** Gerente de Automações  
**Prazo de entrega:** 72 horas após recebimento  
**Formato de entrega:** Link do deploy + repositório GitHub

---

## Contexto

A Ticto realizou em 2025 o **Outlier Experience**, seu principal evento presencial de marketing digital. Você deve desenvolver a **página de captura (landing page)** desse evento utilizando o layout disponibilizado no Figma.

Este teste simula uma demanda real de produção. A expectativa é avaliar sua capacidade de executar com autonomia, fidelidade visual e integração técnica entre ferramentas.

---

## O que deve ser entregue

### 1. Landing Page — React / Next.js

- Desenvolver a página seguindo **exatamente** o layout do Figma abaixo:

> **Figma:** [LPs 2025 — Node 8304-51](https://www.figma.com/design/KhdDl0T5xLwOjUJHB1g0SA/LPs-2025?node-id=8304-51&t=VfdR5mr6iRwiheoO-1)

- O padrão esperado é **pixel perfect**: espaçamentos, tipografia, cores, hierarquia visual e responsividade devem refletir fielmente o design.
- **Stack obrigatória:** React com Next.js (App Router ou Pages Router — a escolha é sua).
- O deploy deve ser feito em plataforma gratuita (Vercel, Netlify, ou equivalente).
- O código deve estar em um repositório público no GitHub.

### 2. Formulário — YayForms

- O formulário de captura deve ser criado no **YayForms** (https://yayforms.com).
- O formulário **não precisa** seguir o visual do Figma — pode usar o estilo padrão do YayForms.
- O formulário **deve ser funcional**: coletar nome, e-mail e telefone no mínimo.
- O formulário deve estar **embeddado** na landing page (inline, pop-up ou slider — a escolha é sua).

### 3. Integração com CRM — Datacrazy

- O formulário do YayForms deve estar integrado ao **CRM Datacrazy** (https://datacrazy.io).
- Ao submeter o formulário, o lead deve ser criado automaticamente no Datacrazy com os campos mapeados corretamente.

### 4. Rastreamento de parâmetros — UTM, SCK, SRC

- A página deve capturar e repassar ao formulário os seguintes parâmetros da URL:
  - `utm_source`
  - `utm_medium`
  - `utm_campaign`
  - `utm_content`
  - `utm_term`
  - `sck`
  - `src`
- Esses parâmetros devem ser transmitidos ao YayForms utilizando o atributo `data-yf-transitive-search-params` ou campos hidden equivalentes.
- Os parâmetros devem chegar ao Datacrazy junto com os dados do lead.

---

## Instruções para acesso às ferramentas

Crie sua própria conta em cada ferramenta **utilizando seu e-mail pessoal**. As contas são exclusivamente para o teste.

| Ferramenta | URL | Plano |
|---|---|---|
| YayForms | https://yayforms.com | Free (suficiente para o teste) |
| Datacrazy | https://crm2.datacrazy.io/register | Free / Trial |
| Vercel | https://vercel.com | Hobby (gratuito) |
| Figma | Acesso pelo link acima (view-only) | — |

---

## Critérios de avaliação

| Critério | Peso | O que será observado |
|---|---|---|
| **Fidelidade ao layout** | 5% | Pixel perfect: espaçamentos, tipografia, cores, responsividade. Comparação lado a lado com o Figma. |
| **Qualidade do código** | 10% | Organização de componentes, boas práticas de React/Next.js, semântica HTML, CSS limpo (Tailwind, CSS Modules ou Styled Components). |
| **Formulário funcional** | 25% | O YayForms está embeddado, coleta dados e funciona corretamente no fluxo. |
| **Integração CRM** | 25% | Lead chega ao Datacrazy com campos mapeados após submit do formulário. |
| **Rastreamento UTM/SCK/SRC** | 25% | Parâmetros da URL são capturados e repassados junto com os dados do lead. |
| **Deploy e entrega** | 10% | Página online acessível, repositório organizado com README explicativo. |

---

## Formato de entrega

Envie os seguintes itens:

1. **URL da página publicada** (ex: `https://seu-projeto.vercel.app`)
2. **URL do repositório GitHub** (público)
3. **URL de teste com parâmetros** (ex: `https://seu-projeto.vercel.app?utm_source=teste&utm_medium=email&utm_campaign=avaliacao&sck=123&src=linkedin`)
4. **Print ou vídeo curto** (máx. 2 min) mostrando:
   - O lead criado no Datacrazy após submissão do formulário
   - Os parâmetros UTM/SCK/SRC chegando junto com o lead
5. **README no repositório** contendo:
   - Instruções para rodar o projeto localmente
   - Decisões técnicas tomadas (stack, bibliotecas, motivos)
   - Dificuldades encontradas e como foram resolvidas

---

## Regras

- **Não** peça acesso a nenhuma conta da Ticto. Crie as suas.
- **Não** é permitido usar builders como Webflow, WordPress, Elementor ou similares. O código deve ser escrito manualmente ou com IA.
- Pode usar qualquer biblioteca de UI ou CSS que preferir, desde que o resultado respeite o Figma.
- Em caso de dúvidas sobre o layout, tome a decisão que considerar mais coerente com o design e registre no README.
- O prazo de 72h é contado a partir do recebimento deste documento. Se precisar de mais tempo, comunique antes do vencimento.

---

*Este teste avalia competências reais do dia a dia da operação: leitura de Figma, desenvolvimento frontend, integração entre ferramentas e rastreamento de dados. Boa sorte.*
