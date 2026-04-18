# 🛡️ Manual de Arquitetura, Revisão e Segurança

Boas vindas à tríade de engenharia desta aplicação! Este documento tem o objetivo de detalhar como garantimos excelência de código desde o primeiro commit até o deploy no ambiente Vercel. Aqui unimos **Automação Contínua (CI/CD)** ao uso de **Agentes Autônomos** em um fluxo profissional de Pull Requests.

---

## 🔁 1. Fluxo de Revisão e Pull Requests (O Ciclo `@[/review-pr]`)

Desenvolver num ambiente rápido necessita de processos sólidos. Qualquer alteração neste repositório passa por um fluxo estrito de avaliação:

1. **Nunca Envie Direto para a `main`:** Temos "Branch Protection" ativo no GitHub. Tudo deve seguir obrigatoriamente através da abertura de Pull Requests (sejam Features ou Bugfixes).
2. **Template Limpo Obrigatório:** O autor deve preencher nosso `.github/PULL_REQUEST_TEMPLATE.md` atestando e provando a estabilidade da interface gráfica (o famoso pixel-perfect) e o envio firme de todos os repasses UTM.
3. **Revisão Auxiliada por IA (`@[/review-pr]`):** Dispomos de um Workflow interno e autônomo (presente em `.agent/workflows/review-pr.md`). Sempre que ativado, este workflow tem a responsabilidade primária de assumir o volante e:
   - Analisar "Diffs" procurando vulnerabilidades esquecidas pelo autor.
   - Sumarizar o código classificando falhas em baldes lógicos: `BLOCKING`, `SUGGESTION`, e `NITS`.
   - Oferecer Resolução Local Automatizada: A IA possui autonomia para fixar os itens levantados na própria máquina em frações de segundos, e empurrar as correções direto de volta pro GitHub já confirmadas se validadas manualmente.

---

## 🤖 2. Bots em Ação e o "Quality Gate"

Não dependemos de sorte, implementamos verificações brutais de comportamento (Quality Gates):

- **O Agente Validador Genérico (`GEMINI.md`):** Configurado globalmente como o nosso 'Adversarial Frontend Reviewer', ele vigia a integridade diária deste projeto. Sua missão é nos proibir ativamente de quebrar nosso contrato primário de arquitetura (ex: Não usar middleware SaaS de terceiros como o Zapier/Make) e auditar requisitos visuais de Acessibilidade (WCAG 2.2).
- **Testes Preventivos Locais e CI:** Nosso ambiente na nuvem atua engatilhado. Temos verificação pesada TypeScript e as vitais ferramentas de teste (Mais de 60 unitários via `vitest` em paralelo e varredura via `playwright`). O Código não flui até passar nesses guardiões brancos.
- **Detector de Vazamentos Oculto (`check:secrets`):** Nossas secret keys ficam trancafiadas (Token HTTP do HubSpot e o Webhook Secret do Typeform). Temos um "Cão de Guarda" de build (`node scripts/check-secrets.mjs`) operando silenciosamente com a função singular de fazer o _Build Falhar_ caso encontre um único resquício criptográfico derrapando solto para os diretórios públicos.

---

## 🔒 3. Invariantes de Segurança: A Lei do Código

Temos lealdade absoluta ao escrito no arquivo de contrato local `AGENTS.md` para lidar na recepção tracional de leads.

1. **A Máscara PII (Proteção Anti-Vazamento):** O código proíbe a escrita em log não redigida. O seu e-mail sempre será impresso como `j***@domain.com`. Nós enxergamos dados e classes de erro; as informações restritamente pessoais nunca cruzam livremente barreiras de debugs. 
2. **Defesa "Fail-fast" com HMAC:** Uma assinatura maliciosa tem que ser julgada em *bytes crus* instantaneamente no _stream_, em até de `< 10ms`. Errou ou mentiu na verificação da procedência? A comunicação corta. Não gastamos sequer processamento valioso preenchendo vetores de memória falsos em caso de ataques externos DDoS simulando contatos perdidos.

---
> Adotar "Boas Práticas" não é apenas perfumaria. É a fundação arquitetural para se garantir noites de sono limpas no olho do furacão dos Lançamentos da **Ticto**. 🚀
