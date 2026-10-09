# PortaCheia — Módulo Indicações

Programa de indicações para espaço de festas: **parceiros indicadores** (B2B, com comissão) e **clientes
indicadores** (B2C, pós-festa, com benefício para quem indica e para quem é indicado).

Stack: Next.js 15 (App Router) · TypeScript · Tailwind · Supabase (Postgres + Auth + RLS). Tudo em pt-BR,
mobile-first.

> Documentação do módulo, decisões, pendências e roteiro de testes: [`docs/indicacoes.md`](docs/indicacoes.md).
> Rascunho do regulamento para revisão jurídica: [`docs/regulamento-indicacao.md`](docs/regulamento-indicacao.md).

## Como rodar

```bash
npm install
cp .env.example .env.local   # preencha as variáveis (abaixo)
npm run dev                  # http://localhost:3000
```

### Banco (Supabase)

1. Crie um projeto no Supabase (ou use o do PortaCheia).
2. Aplique as migrations de `supabase/migrations/` **em ordem** (SQL Editor ou `supabase db push`).
   - `20261009000100_base_portacheia.sql` cria o núcleo mínimo (espaços, membros, leads, festas, fila de envios,
     bloqueio de contato, alertas) com `if not exists`. **Se o PortaCheia já tem essas tabelas, revise esta
     migration antes** (veja "Suposições" em `docs/indicacoes.md`).
3. (Opcional) Rode `supabase/seed.sql` para dados de demonstração (espaço `porta-cheia-demo`).
4. Entre uma vez em `/login` com seu e-mail e, no SQL Editor, dê acesso de dono:
   ```sql
   select adicionar_membro_por_email('porta-cheia-demo', 'seu@email.com', 'dono');
   ```
5. Em Auth → URL Configuration, adicione `https://SEU-DOMINIO/auth/callback` às Redirect URLs.

### Variáveis de ambiente

| Variável | Para quê |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Cliente Supabase (RLS) |
| `SUPABASE_SERVICE_ROLE_KEY` | Só no servidor: formulários públicos e geração de link mágico. Nunca exponha. |
| `NEXT_PUBLIC_APP_URL` | URL pública usada nos links `/i`, `/r`, `/v` e QR Codes |
| `NEXT_PUBLIC_ESPACO_PADRAO` | Slug do espaço usado em `/parceiros/cadastro` sem `?espaco=` |
| `CRON_SECRET` | Protege `/api/cron/pos-festa` (a Vercel envia `Authorization: Bearer`) |
| `IP_HASH_SALT` | Sal do hash de IP usado no rate limit |
| `WHATSAPP_PROVIDER` | (futuro) `cloud` para usar a API oficial; padrão = wa.me |

### Cron

`vercel.json` agenda `/api/cron/pos-festa` todo dia às 12h UTC (9h em Brasília). Fora da Vercel, chame:
`curl -H "Authorization: Bearer $CRON_SECRET" https://SEU-DOMINIO/api/cron/pos-festa`.
O botão "Gerar lote pós-festa de hoje" na tela Fila de envios faz o mesmo manualmente.

## Testes

```bash
npm run lint && npm run typecheck
npm test            # unitários (telefone, máscara, CPF/CNPJ, CSV, MessageProvider)
npm run test:db     # banco: sobe um Postgres local descartável, aplica migrations + seed e testa
```

`test:db` precisa dos binários do PostgreSQL 15+ (`initdb`, `pg_ctl`, `psql`). Cobre: atribuição (primeira
indicação vence, janela), duplicidade (lead/cliente pré-existente), autoindicação, consentimento, opt-out, rate
limit, regra vigente na data, exceção por parceiro, aprovação condicionada, pagamento manual, RLS (parceiro não vê
dados de outros; equipe de outro espaço não vê nada), pós-festa/NPS, sincronização lead ↔ indicação, alertas,
métricas, LGPD e seeds.

## Como configurar as regras

Painel → **Regras** (dono/gerente):

- **Público**: parceiros (B2B) ou clientes (pós-festa).
- **Recompensa**: percentual (sobre valor fechado ou sobre o sinal), valor fixo, crédito ou brinde.
- **Quando aprovar**: no fechamento, com sinal pago ou após o evento realizado. Aprovar ≠ pagar: o pagamento é
  sempre registrado à mão em **Recompensas**.
- **Validade da atribuição** (ex.: 90 dias): janela em que a primeira indicação de um telefone "vale".
- **Limite por indicador**: máximo de indicações recompensadas por parceiro/cliente.
- **Benefício do indicado**: desconto (% ou R$) ou brinde mostrado nas páginas `/i` e `/v`.
- **Vigência**: a regra vale para indicações feitas a partir da data. A indicação congela a regra do dia em que foi
  feita; regras já usadas não podem ter valores alterados (desative e crie outra).
- **Exceção por parceiro**: na página do parceiro, "Criar exceção" (justificativa obrigatória, auditada).

Em **Regras → Configurações do espaço**: nome, logo, cor da marca, WhatsApp do comercial, dias após a festa para o
pedido de avaliação (padrão 2) e limites antifraude.

## Mapa de rotas

| Rota | Quem | O quê |
| --- | --- | --- |
| `/parceiros/cadastro` | público | cadastro de parceiro com aceite dos termos |
| `/i/[codigo]` | público | formulário do indicado pelo link do parceiro |
| `/r/[token]` | anfitrião | pesquisa NPS pós-festa + convite para indicar (9–10) |
| `/v/[codigo]` | amigo indicado | formulário curto com benefício |
| `/privacidade`, `/termos/parceiros`, `/termos/clientes` | público | textos versionados |
| `/privacidade/exclusao` | titular | pedido de exclusão / não contato |
| `/parceiro`, `/parceiro/indicar` | parceiro logado | painel, comissões, material de divulgação |
| `/painel/*` | equipe | indicações, parceiros, recompensas, fila, alertas, leads, festas, regras, LGPD |
| `/api/qr/[codigo]?formato=png\|pdf` | público | QR Code / cartão do parceiro |
| `/api/painel/recompensas/csv` | dono/gerente | exportação para o financeiro |
