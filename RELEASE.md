# 📦 Política de Release

Para este projeto da **Ticto (Outlier Experience 2025)**, as entregas de versões seguem as métricas de integração contínua (CI) e deploy contínuo (CD). Abaixo está o fluxo sugerido e aplicado como melhor prática de release para produção:

## 1. Branching Strategy e Commits
- **Padrão de Branches:** Adotamos o modelo simplificado do _Trunk-Based Development_ aliado a Feature Branches (`feature/*`, `bugfix/*`, `hotfix/*`).
- **Commits:** Recomendado o uso do [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) para manter o controle de versão e ChangeLogs automáticos (ex: `feat: integra typeform`, `fix: alinhamento pixel-perfect do figma`, `chore: ...`).

## 2. CI/CD Automático (Vercel)
A plataforma de deploy é a **Vercel**, conectada diretamente ao repositório público no GitHub.
- **Preview Deployments:** Cada Pull Request criado aciona automaticamente um ambiente de pré-visualização. Revisores do teste podem visualizar as alterações de UI/UX *antes* de irem para a branch principal.
- **Production Deployments:** Somente aprovações ou merges direcionados à branch `main` ativam o release em produção.

## 3. Checklist de Lançamento (Release / PR)
Antes de mesclar (merge) na `main`, todo PR deve passar pelos checks obrigatórios (enforced por branch protection):
1.  Type-check e lint limpos (`pnpm typecheck`, `pnpm lint`).
2.  Testes unitários e E2E passando (`pnpm test`, `pnpm e2e`).
3.  `pnpm check:secrets` limpo (guarda contra vazamento de chaves server-only no bundle client).
4.  Validação manual do envio de UTMs no Preview antes de aprovar o merge.
5.  Design condizente com as aprovações pixel-perfect.
6.  Acessibilidade (WCAG 2.2 AA) e navegação via teclado validadas.
7.  Verificação de HMAC no webhook e mascaramento de PII em logs (conforme Core Invariants em `AGENTS.md`).

## 4. Geração de Tags (Opcional, porém prático)
Após entregas de grandes marcos operacionais (como "1.0.0 - Entrega Desafio Técnico"), gera-se um GitHub Release usando as tags clássicas de SemVer:
```bash
git tag -a v1.0.0 -m "Entrega Final: Teste Técnico"
git push origin v1.0.0
```
Isso encapsula o estado funcional entregue em um pacote fechado, sendo ideal para apresentação aos avaliadores.
