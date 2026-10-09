# Módulo Indicações — PortaCheia

> Documento vivo, atualizado a cada fase. Resumo final ao fim do arquivo.

## Suposições e decisões (registradas durante o trabalho)

1. **Repositório vazio.** O repositório `sistemadeindicacao` chegou sem nenhum código e não encontrei o schema
   do PortaCheia em outros repositórios/projetos acessíveis (o único projeto Supabase conectado é de outro
   sistema e **não foi tocado**). Por isso criei um app Next.js do zero e uma migration
   `20261009000100_base_portacheia.sql` com o núcleo mínimo (espaços, membros, leads, festas, fila de envios,
   bloqueio de contato, alertas) usando `create table if not exists`. Ao integrar com o PortaCheia real,
   **remova/adapte essa migration** e ajuste os nomes de colunas referenciados nas migrations de indicações.
2. **Regras de negócio no banco.** Atribuição, duplicidade, autoindicação, rate limit, cálculo de comissão e
   aprovação ficam em funções PL/pgSQL `SECURITY DEFINER`. Motivo: atomicidade (lock por telefone garante
   "a primeira vence" mesmo com envios simultâneos), cálculo sempre no servidor e uma única fonte da verdade
   para app, cron e SQL manual.
3. **Regra congelada.** A indicação guarda `regra_id` + `regra_snapshot` e as recompensas guardam o percentual/
   valor no momento da indicação. Mudar a regra não recalcula nada. Além disso, uma regra já usada não pode ter
   campos financeiros alterados (trigger `regra_em_uso`): desative e crie outra.
4. **Exceção por parceiro** é uma regra com `parceiro_id` preenchido e `justificativa` obrigatória (constraint).
   A exceção vence a regra geral. A criação/alteração fica auditada em `indicacao_eventos`.
5. **Duplicidade.** Ordem de checagem: indicação válida anterior dentro da janela → lead existente → festa
   existente (cliente). Uma indicação antiga com janela vencida não bloqueia por si só, mas o lead criado por ela
   continua existindo, então a nova indicação também vira "duplicada" (o contato "já era lead"). Isso segue à
   risca a regra "se já era lead antes da indicação, é duplicada".
6. **Fechamento fora da janela** (`fechada_em > atribuida_ate`): recompensas são canceladas com motivo.
7. **Aprovação.** A recompensa vira "aprovada" automaticamente quando a condição configurada é atendida
   (`fechamento`, `sinal_pago` ou `evento_realizado`) e o valor já está calculado. O **pagamento** é sempre manual
   (botão "marcar como paga"). Nada é pago pelo sistema.
8. **Autoindicação** e **duplicidade** não são rejeitadas silenciosamente: a indicação é registrada como
   `invalida`/`duplicada` com o motivo, sem lead e sem recompensa — isso alimenta o antifraude (parceiro com
   muitas inválidas) e dá transparência. Já **opt-out**, **falta de consentimento** e **rate limit** recusam o
   envio.
9. **Rate limit** no banco (`tentativas_indicacao`): padrão 5 envios / 10 min por IP (hash com sal) e 20 por
   parceiro / dia; configurável em `espacos.config`.
10. **Telefones** sempre em E.164; sem DDI assume +55.
11. **Login do parceiro** por link mágico de e-mail (Supabase Auth OTP). "Link mágico via WhatsApp": a equipe clica
    em "Enviar acesso ao painel pelo WhatsApp", o servidor gera o link com `auth.admin.generateLink` e coloca na fila
    de envios (wa.me). Exige e-mail no cadastro do parceiro (o Supabase precisa de um e-mail ou telefone para a
    conta). O primeiro login liga o usuário ao parceiro pelo e-mail (`vincular_parceiro_usuario`). OTP por SMS/
    WhatsApp nativo do Supabase fica como TODO (exige provedor Twilio/MessageBird configurado).
12. **Parceiro não lê a tabela `indicacoes`** (RLS só para a equipe). O painel usa `minhas_indicacoes()` e
    `minhas_recompensas()`, que devolvem apenas o primeiro nome + inicial do sobrenome e nunca telefone/e-mail.
13. **QR Code** gerado sob demanda em `/api/qr/[codigo]` (PNG 800px ou cartão PDF A6). É público porque o link
    também é; só funciona para parceiro ativo.
14. **Cadastro público** aceita `?espaco=slug`; sem parâmetro usa `NEXT_PUBLIC_ESPACO_PADRAO`. Termos
    versionados em código (`lib/indicacoes/termos.ts`) e o aceite guarda versão, data e IP.
15. **Formulários públicos** usam service role apenas no servidor, chamando funções SQL que revalidam tudo.
    O texto do consentimento é montado no servidor (o cliente não consegue alterá-lo) e há honeypot anti-robô.
16. Status do parceiro ao aprovar enfileira automaticamente a mensagem de boas-vindas com o link pessoal.
