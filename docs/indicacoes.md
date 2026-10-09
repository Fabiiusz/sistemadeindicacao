# Módulo Indicações — PortaCheia

> Resumo da entrega noturna. Leia nesta ordem: **Resumo por fase → Como testar → Pendências → Riscos jurídicos**.
> As decisões/suposições detalhadas (numeradas) estão no meio do documento.

## Resumo rápido

- **O repositório estava vazio**: criei o app do zero (Next.js 15 + Supabase) com um núcleo mínimo do PortaCheia
  (espaços, leads, festas, fila de envios). Se o PortaCheia real já existe em outro repositório, as migrations de
  indicações (`…0200` a `…0700`) são o que importa; a `…0100` precisa ser conciliada (ver suposição 1).
- 5 fases, 1 commit por fase, todas com lint + typecheck + testes verdes.
- **54 testes de banco + 19 unitários**, e um smoke test de navegador (Playwright) contra Postgres + PostgREST
  locais com o seed: todas as telas abrem sem erro e os fluxos (indicar pelo link, repetir → duplicada, NPS,
  painel do parceiro mascarado, indicação manual, fechar com 7% da exceção, marcar paga, lote pós-festa,
  cadastro de parceiro) passaram.
- Nada foi aplicado em nenhum Supabase de produção: o único projeto conectado é de outro sistema e não foi tocado.

## Resumo por fase

**Fase 1 — Modelagem e regras.** Tabelas `parceiros`, `regras_indicacao`, `indicacoes`, `recompensas`,
`indicacao_eventos` (auditoria), `indicadores_clientes`, `pesquisas_pos_festa`, `tentativas_indicacao` (rate
limit), `solicitacoes_lgpd`, com RLS por espaço. `bloqueio_contato` fica na base (reaproveitável). Funções SQL
para registrar indicação (atribuição, duplicidade, autoindicação, consentimento, opt-out, rate limit), regra
vigente congelada, cálculo e aprovação condicionada.

**Fase 2 — Parceiros.** Cadastro público com termos versionados (versão, data, IP); aprovação/pausa/bloqueio com
motivo; link `/i/[codigo]` com formulário do indicado e consentimento; QR Code PNG e cartão PDF; painel do
parceiro (indicações mascaradas, comissões previstas/aprovadas/pagas, material de divulgação, indicação manual
com declaração); painel do dono com ranking, exceção de regra com justificativa e envio de acesso por WhatsApp.

**Fase 3 — Clientes (pós-festa).** Lote diário (cron + botão) X dias após a festa; MessageProvider (wa.me) e tela
Fila de envios; `/r/[token]` com NPS — 9–10 mostra convite e compartilhamento no WhatsApp, 0–6 alerta o dono;
`/v/[codigo]` para o amigo; crédito do cliente "previsto" até o fechamento; limite por cliente; regulamento curto.

**Fase 4 — Funil e pagamentos.** Sincronização lead ↔ indicação; festa (sinal/realizada/cancelada) dispara
aprovação; tela Recompensas a pagar (agrupada por beneficiário, marcar como paga com data/forma/comprovante, CSV,
total por período); painel de indicações com filtros, métricas e comparação com outros canais; alertas de 24h,
5 dias e 15 dias; avisos automáticos ao parceiro (visita, fechou, aprovada, paga).

**Fase 5 — Antifraude, LGPD e acabamento.** Página pública de exclusão (bloqueio imediato), anonimização pelo
dono, retenção, trava para não reabrir envio bloqueado, alerta de parceiro suspeito, seeds, README, regulamento.

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
17. **Pós-festa**: `gerar_lote_pos_festa` pega festas não canceladas com data entre `hoje - dias_pos_festa - 30` e
    `hoje - dias_pos_festa` (padrão 2 dias; o limite de 30 dias evita disparar para festas antigas quando o módulo é
    ligado). Não exige status "realizada" porque é comum a equipe não atualizar o status. É idempotente (uma
    pesquisa por festa), roda via cron diário (`vercel.json`, 12h UTC = 9h de Brasília) e pelo botão
    "Gerar lote pós-festa de hoje" na Fila de envios.
18. **MessageProvider**: não existia no repositório; criei `lib/mensagens/provider.ts` com `WaMeProvider` (MVP,
    envio assistido), `MailtoProvider` e um `WhatsAppCloudProvider` (TODO). Toda mensagem passa pela
    `fila_envios`, e `enfileirar_mensagem` marca como `bloqueado` quem está em `bloqueio_contato`.
19. **NPS**: 9–10 cria o "cliente indicador" (código `/v/[codigo]`) e mostra o convite; 7–8 só agradece; 0–6 não
    mostra indicação e cria alerta `nps_detrator` para dono/gerente com o comentário. Uma resposta por link.
20. **Regulamento do cliente** e limite de indicações recompensadas aparecem na página após nota 9–10
    (`/termos/clientes`). O limite vem de `regras_indicacao.limite_por_indicador` da regra do público "cliente".
21. **Sincronização lead ↔ indicação** por triggers (`leads_sincroniza_indicacao`, `indicacoes_sincroniza_lead`),
    com guardas de igualdade para não entrar em loop. Indicação fechada só "volta" se o lead for perdido. Lead
    marcado como "ganho" sem valor gera alerta "Informe o valor"; ao informar o valor no lead, a comissão
    percentual prevista é calculada. Indicações inválidas/duplicadas não mexem no lead.
22. **Festa**: festa criada com `lead_id` é ligada à indicação desse lead; "sinal pago" e "realizada" disparam a
    verificação das condições; festa cancelada marca a indicação como perdida, cancela recompensas previstas e,
    se já houver recompensa aprovada, cria alerta para o dono decidir (não cancelamos dinheiro aprovado sozinhos).
23. **Pagamentos**: só dono/gerente marcam como paga (`marcar_recompensa_paga`), com data, forma e link de
    comprovante (upload de arquivo fica como TODO — hoje é um link, ex.: Google Drive). CSV com `;` e BOM para abrir
    no Excel em pt-BR. Ajuste manual de valor e cancelamento exigem justificativa e ficam na auditoria.
24. **Alertas de prazo** são uma view calculada (`alertas_prazos`), sem cron. Alertas de evento (NPS detrator,
    parceiro suspeito, parceiro pendente, nova indicação, informar valor) ficam na tabela `alertas`.
25. **Métricas**: "contatadas" e "visitas" contam a etapa máxima alcançada (pelo histórico), para que indicações
    perdidas depois da visita também contem. Custo de aquisição = comissões aprovadas + pagas ÷ fechamentos.
    A comparação com outros canais usa a origem dos leads no mesmo período.
26. **Telas de Leads e Festas** são mínimas, só para o módulo ser testável de ponta a ponta; no PortaCheia real use
    as telas existentes (os triggers fazem a ponte).

27. **Pedido de exclusão**: o bloqueio de contato é imediato e automático; a anonimização exige o clique do
    dono/gerente ("Conferi a identidade") para evitar que alguém apague dados de terceiros só sabendo o telefone.
    Anonimizar mantém valores financeiros (obrigação contábil) e o telefone na lista de bloqueio (para continuar
    respeitando o opt-out — base: legítimo interesse/cumprimento do pedido).
28. **Fila protegida**: um envio `bloqueado` não pode voltar a `pendente/enviado`, e destino/mensagem não podem ser
    alterados pela API. Novo bloqueio cancela na hora o que estava pendente para aquele telefone.
29. **Exceção por parceiro** não carrega o "benefício do indicado" (o formulário de exceção não tem esses campos);
    nesse caso a página `/i` do parceiro com exceção não mostra benefício. Se quiser, crie a exceção já com
    benefício via SQL ou ajuste `CamposRegra` (TODO simples).
30. **Banco de testes** em UTF-8 (igual ao Supabase). A máscara de nome não usa `initcap` (quebrava acentos).

## Como testar cada fluxo (passo a passo)

Preparação: aplique migrations + `supabase/seed.sql`, entre em `/login` com seu e-mail e rode
`select adicionar_membro_por_email('porta-cheia-demo', 'seu@email.com', 'dono');`. Para testar o painel do
parceiro com o seu e-mail: `update parceiros set email = 'seu-outro@email.com', user_id = null where codigo_indicacao = 'CARLA7';`
e entre com esse e-mail.

Dados do seed: parceiros **Carla Mendes** (`/i/CARLA7`, exceção 7%), **Bruno Lima** (`/i/BRUNO5`, regra geral 5%),
**Rafael Souza** (pendente); cliente indicadora **Fernanda Rocha** (`/v/FERNA2`, pesquisa `/r/demo-token-fernanda-nps10`);
10 indicações: recebida (há 2 dias → alerta 24h), contatada (parada há 7 dias → alerta), visita agendada,
perdida, fechada (comissão prevista R$ 1.960), evento realizado com comissão aprovada há 20 dias (alerta de
pagamento), evento realizado e paga, duplicada (já era lead do Instagram), inválida (autoindicação), fechada por
indicação de cliente (crédito R$ 200 aprovado).

1. **Cadastro de parceiro**: abra `/parceiros/cadastro`, preencha e aceite os termos → "Cadastro recebido".
   No painel → Parceiros aparece em "Aguardando aprovação" → Aprovar → a mensagem de boas-vindas aparece na
   Fila de envios.
2. **Indicação pelo link**: abra `/i/CARLA7` no celular, preencha e marque a autorização → em Painel →
   Indicações aparece como "Recebida" com lead criado (Leads) e alerta de nova indicação. Envie de novo o mesmo
   telefone → "Duplicada" com o motivo. Tente com o telefone da Carla (+55 11 99111-0001) → "Inválida".
3. **Painel do parceiro**: entre como parceiro → veja nomes mascarados ("Juliana P."), comissões, QR (PNG/PDF) e
   textos prontos. "Indicar um cliente" registra pelo painel (exige declaração de autorização).
4. **Funil**: em Leads mova "Juliana Prado" para "Visita agendada" → a indicação muda junto e o aviso ao parceiro
   entra na fila. Na indicação, "Fechou!" com valor 20.000 → comissão de 7% (R$ 1.400) prevista; em Festas cadastre
   a festa escolhendo o lead da Juliana (ela é ligada à indicação) e marque "Festa realizada" → comissão aprovada.
5. **Pagamento**: Recompensas → "Marcar como paga" (data, forma, comprovante) → some de "A pagar", aparece em
   "Pagas", aviso "comissão paga" na fila. "Exportar CSV" baixa a planilha.
6. **Pós-festa**: Fila de envios → "Gerar lote pós-festa de hoje" → mensagens para festas de 2 dias atrás. Abra o
   link `/r/...` da mensagem: nota 10 → convite com botão do WhatsApp e link `/v/...`; nota 3 (em outra festa) →
   alerta "Cliente insatisfeito" para o dono, sem convite.
7. **Amigo indicado**: `/v/FERNA2` → benefício destacado → enviar → indicação de origem "cliente" com crédito
   previsto para a Fernanda e benefício para o amigo.
8. **Regras**: crie uma regra nova; tente editar o valor de uma regra já usada → bloqueado (desative e crie outra).
   Na página da Carla, crie uma exceção (justificativa obrigatória).
9. **Alertas**: aba Alertas mostra 24h sem contato, parada 5 dias e pagamento atrasado (do seed).
10. **LGPD**: `/privacidade/exclusao` com um telefone indicado → bloqueio imediato (Painel → LGPD) e envios
    pendentes viram "bloqueado"; "Conferi a identidade: anonimizar" apaga nome/telefone/e-mail.
11. **Antifraude**: envie 6 indicações seguidas do mesmo navegador em 10 min → "Muitos envios"; um parceiro com
    4+ indicações e metade inválidas/duplicadas gera alerta "Revisão antifraude".
12. **Automatizados**: `npm run lint && npm run typecheck && npm test && npm run test:db`.

## Pendências (TODOs)

- **Integração com o PortaCheia real**: conciliar a migration base (nomes de tabelas/colunas de leads, festas,
  fila, bloqueio, membros) e apontar os triggers de sincronização para as tabelas reais; trocar as telas mínimas de
  Leads/Festas pelas existentes.
- **WhatsApp API oficial** (`WhatsAppCloudProvider`) com templates aprovados; hoje o envio é assistido (wa.me).
  E-mail automático (ex.: Resend) também não foi implementado — o canal e-mail usa `mailto:`.
- **Login do parceiro só por WhatsApp/SMS** (OTP de telefone do Supabase) exige configurar Twilio/MessageBird.
  Hoje: link mágico por e-mail, ou link mágico gerado pela equipe e enviado pelo WhatsApp (exige e-mail cadastrado).
- **Upload de comprovante** (Supabase Storage); hoje é um campo de link.
- **Cron mensal de retenção** (`anonimizar_indicacoes_antigas`, 24 meses) — função pronta, falta agendar.
- **Gestão de membros da equipe pela interface** (hoje via SQL `adicionar_membro_por_email`).
- **Múltiplos espaços por usuário**: o painel usa o primeiro espaço do usuário; falta seletor.
- Exceção de parceiro com benefício do indicado (ver suposição 29) e edição do texto de mensagens pela interface.
- Paginação nas listas (hoje limite de 200–300 itens por tela).
- Remover alguém da lista de bloqueio não tem botão de propósito (só via SQL, mediante pedido do titular).

## Riscos jurídicos a validar com advogado

1. **Comissão a parceiro pessoa física**: pagamentos recorrentes podem caracterizar vínculo ou prestação de
   serviço sujeita a retenções (INSS 11%/20% patronal via RPA, IRRF pela tabela progressiva, ISS municipal).
   Definir se PF recebe via RPA, exigir MEI/PJ acima de um volume, e guardar documentos (o sistema já guarda
   CPF/CNPJ, Pix, data/forma do pagamento e comprovante). Evitar exclusividade/metas para não parecer
   representação comercial (Lei 4.886/65).
2. **Dados dos indicados**: o caminho mais seguro é o próprio indicado preencher o formulário (consentimento
   registrado com texto, data e IP). A indicação manual pelo parceiro se apoia em "consentimento declarado pelo
   parceiro" — validar se é suficiente ou se o primeiro contato do espaço deve pedir confirmação explícita (e o
   que fazer se o indicado negar: o sistema permite marcar "inválida" e bloquear). Confirmar bases legais,
   prazo de retenção (sugestão: 24 meses sem andamento), encarregado (DPO) e canal de atendimento do titular.
3. **Compartilhamento com parceiros**: o parceiro vê só primeiro nome + inicial e o status. Validar se até isso
   precisa de consentimento (o texto do formulário menciona o nome do parceiro, o que ajuda).
4. **Termos do programa e regulamento**: rascunhos em `lib/indicacoes/termos.ts` e
   `docs/regulamento-indicacao.md`. Verificar se o programa B2C (crédito/brinde por indicação) se enquadra como
   promoção comercial que exige autorização (Lei 5.768/71 / SPA-MF), cláusulas de alteração unilateral frente ao
   CDC e regras de não acumulação.
5. **Mensagens de WhatsApp**: mensagens pós-festa e avisos são relacionamento com cliente/parceiro; manter opt-out
   claro (link `/privacidade/exclusao` no rodapé das páginas) e, na API oficial, usar templates de utilidade.
6. **Registro de IP**: guardamos IP do consentimento (prova) e hash de IP para rate limit; validar tempo de
   guarda e menção na política de privacidade (já mencionado na v1).
