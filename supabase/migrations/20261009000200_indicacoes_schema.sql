-- =============================================================================
-- Módulo Indicações: tabelas e RLS (Fase 1)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Parceiros indicadores (B2B)
-- -----------------------------------------------------------------------------
create table if not exists public.parceiros (
  id uuid primary key default gen_random_uuid(),
  espaco_id uuid not null references public.espacos(id) on delete cascade,
  user_id uuid,                                  -- auth.users.id após 1º login
  nome text not null,
  tipo text not null default 'outro'
    check (tipo in ('cerimonialista', 'assessor', 'fotografo', 'decorador', 'buffet', 'dj', 'escola', 'formatura', 'outro')),
  empresa text,
  telefone text not null check (telefone ~ '^\+[1-9][0-9]{7,14}$'),  -- E.164
  email text,
  documento text,                                -- CPF/CNPJ só dígitos
  chave_pix text,
  codigo_indicacao text not null unique check (codigo_indicacao ~ '^[A-Z0-9]{4,12}$'),
  status text not null default 'pendente'
    check (status in ('pendente', 'ativo', 'pausado', 'bloqueado')),
  motivo_status text,
  aprovado_em timestamptz,
  aprovado_por uuid,
  aceite_termos_em timestamptz,
  versao_termos text,
  aceite_ip text,
  criado_em timestamptz not null default now(),
  unique (espaco_id, telefone)
);
create index if not exists parceiros_user_idx on public.parceiros(user_id);
create index if not exists parceiros_email_idx on public.parceiros(lower(email));

-- -----------------------------------------------------------------------------
-- Regras do programa. Regra com parceiro_id = exceção para um parceiro.
-- Campos financeiros são imutáveis depois que a regra foi usada (crie outra).
-- -----------------------------------------------------------------------------
create table if not exists public.regras_indicacao (
  id uuid primary key default gen_random_uuid(),
  espaco_id uuid not null references public.espacos(id) on delete cascade,
  nome text not null default 'Regra geral',
  publico text not null check (publico in ('parceiro', 'cliente')),
  parceiro_id uuid references public.parceiros(id) on delete cascade,
  justificativa text,
  tipo_recompensa text not null check (tipo_recompensa in ('percentual', 'valor_fixo', 'credito', 'brinde')),
  valor numeric(12, 2) check (valor is null or valor >= 0),
  descricao_recompensa text,                     -- ex.: "Kit de doces" (brinde)
  base_calculo text not null default 'valor_fechado' check (base_calculo in ('valor_fechado', 'sinal_pago')),
  condicao_pagamento text not null default 'evento_realizado'
    check (condicao_pagamento in ('fechamento', 'sinal_pago', 'evento_realizado')),
  validade_dias_atribuicao int not null default 90 check (validade_dias_atribuicao between 1 and 730),
  vigencia_inicio date not null default current_date,
  vigencia_fim date,
  ativa boolean not null default true,
  beneficio_indicado_tipo text check (beneficio_indicado_tipo in ('desconto_percentual', 'desconto_valor', 'brinde')),
  beneficio_indicado_valor numeric(12, 2),
  beneficio_indicado_descricao text,
  limite_por_indicador int check (limite_por_indicador is null or limite_por_indicador > 0),
  criado_por uuid,
  criado_em timestamptz not null default now(),
  constraint regra_excecao_exige_justificativa
    check (parceiro_id is null or (publico = 'parceiro' and length(coalesce(trim(justificativa), '')) >= 5)),
  constraint regra_percentual_ate_100
    check (tipo_recompensa <> 'percentual' or (valor is not null and valor <= 100)),
  constraint regra_valor_obrigatorio
    check (tipo_recompensa = 'brinde' or valor is not null),
  constraint regra_vigencia_valida
    check (vigencia_fim is null or vigencia_fim >= vigencia_inicio)
);
create index if not exists regras_espaco_idx on public.regras_indicacao(espaco_id, publico, ativa);

-- -----------------------------------------------------------------------------
-- Clientes indicadores (anfitriões que toparam indicar após a festa).
-- -----------------------------------------------------------------------------
create table if not exists public.indicadores_clientes (
  id uuid primary key default gen_random_uuid(),
  espaco_id uuid not null references public.espacos(id) on delete cascade,
  festa_id uuid not null unique references public.festas(id) on delete cascade,
  nome text not null,
  telefone text,
  email text,
  codigo text not null unique check (codigo ~ '^[A-Z0-9]{4,12}$'),
  criado_em timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Pesquisa pós-festa (NPS) com link único /r/[token].
-- -----------------------------------------------------------------------------
create table if not exists public.pesquisas_pos_festa (
  id uuid primary key default gen_random_uuid(),
  espaco_id uuid not null references public.espacos(id) on delete cascade,
  festa_id uuid not null unique references public.festas(id) on delete cascade,
  token text not null unique,
  criada_em timestamptz not null default now(),
  nota int check (nota between 0 and 10),
  comentario text,
  respondida_em timestamptz,
  indicador_cliente_id uuid references public.indicadores_clientes(id) on delete set null
);

-- -----------------------------------------------------------------------------
-- Indicações
-- -----------------------------------------------------------------------------
create table if not exists public.indicacoes (
  id uuid primary key default gen_random_uuid(),
  espaco_id uuid not null references public.espacos(id) on delete cascade,
  origem text not null check (origem in ('parceiro', 'cliente')),
  canal text not null default 'manual_comercial'
    check (canal in ('link_parceiro', 'painel_parceiro', 'link_cliente', 'manual_comercial')),
  indicador_parceiro_id uuid references public.parceiros(id) on delete set null,
  indicador_cliente_id uuid references public.indicadores_clientes(id) on delete set null,
  indicador_festa_id uuid references public.festas(id) on delete set null,
  indicador_nome text,                            -- quando registrado à mão pelo comercial
  indicador_telefone text,
  nome_indicado text not null,
  telefone_indicado text not null check (telefone_indicado ~ '^\+[1-9][0-9]{7,14}$|^anonimizado-'),
  email_indicado text,
  tipo_evento_interesse text,
  data_evento_estimada date,
  num_convidados_estimado int check (num_convidados_estimado is null or num_convidados_estimado between 1 and 100000),
  observacoes text,
  status text not null default 'recebida'
    check (status in ('recebida', 'contatada', 'visita_agendada', 'orcamento_enviado', 'fechada',
                      'evento_realizado', 'perdida', 'invalida', 'duplicada')),
  motivo_status text,                             -- explica duplicada/invalida/perdida
  duplicada_de uuid references public.indicacoes(id) on delete set null,
  status_atualizado_em timestamptz not null default now(),
  lead_id uuid references public.leads(id) on delete set null,
  festa_id uuid references public.festas(id) on delete set null,
  valor_fechado numeric(12, 2) check (valor_fechado is null or valor_fechado >= 0),
  valor_sinal numeric(12, 2),
  fechada_em timestamptz,
  regra_id uuid references public.regras_indicacao(id) on delete set null,
  regra_snapshot jsonb,                           -- regra vigente congelada na data da indicação
  atribuida_ate timestamptz not null,
  -- LGPD
  consentimento boolean not null default false,
  consentimento_texto text,
  consentimento_em timestamptz,
  consentimento_ip text,
  base_legal text not null default 'consentimento',
  origem_contato text not null,                   -- descrição legível de onde veio o dado
  user_agent text,
  ip_hash text,
  anonimizada_em timestamptz,
  -- antifraude
  suspeita boolean not null default false,
  motivos_suspeita text[] not null default '{}',
  criado_por uuid,
  criado_em timestamptz not null default now(),
  constraint indicacao_indicador_coerente check (
    (origem = 'parceiro' and indicador_cliente_id is null)
    or (origem = 'cliente' and indicador_parceiro_id is null)
  )
);
create index if not exists indicacoes_espaco_tel_idx on public.indicacoes(espaco_id, telefone_indicado);
create index if not exists indicacoes_espaco_status_idx on public.indicacoes(espaco_id, status);
create index if not exists indicacoes_parceiro_idx on public.indicacoes(indicador_parceiro_id);
create index if not exists indicacoes_cliente_idx on public.indicacoes(indicador_cliente_id);
create index if not exists indicacoes_lead_idx on public.indicacoes(lead_id);
create index if not exists indicacoes_festa_idx on public.indicacoes(festa_id);

-- -----------------------------------------------------------------------------
-- Recompensas (comissões, créditos, descontos, brindes). Valores armazenados.
-- -----------------------------------------------------------------------------
create table if not exists public.recompensas (
  id uuid primary key default gen_random_uuid(),
  espaco_id uuid not null references public.espacos(id) on delete cascade,
  indicacao_id uuid not null references public.indicacoes(id) on delete cascade,
  regra_id uuid references public.regras_indicacao(id) on delete set null,
  beneficiario text not null check (beneficiario in ('parceiro', 'cliente_indicador', 'indicado')),
  parceiro_id uuid references public.parceiros(id) on delete set null,
  indicador_cliente_id uuid references public.indicadores_clientes(id) on delete set null,
  tipo text not null check (tipo in ('percentual', 'valor_fixo', 'credito', 'brinde', 'desconto_percentual', 'desconto_valor')),
  percentual numeric(6, 2),                       -- quando tipo = percentual
  base_calculo text,
  base_valor numeric(12, 2),                      -- base usada no cálculo
  valor numeric(12, 2),                           -- calculado no servidor; null = a calcular
  descricao text,
  condicao text not null default 'evento_realizado'
    check (condicao in ('fechamento', 'sinal_pago', 'evento_realizado')),
  status text not null default 'prevista' check (status in ('prevista', 'aprovada', 'paga', 'cancelada')),
  aprovada_por uuid,                              -- null = aprovação automática pela condição
  aprovada_em timestamptz,
  paga_em date,
  forma_pagamento text,
  comprovante_url text,
  pago_por uuid,
  observacoes text,
  motivo_cancelamento text,
  criado_em timestamptz not null default now()
);
create index if not exists recompensas_espaco_status_idx on public.recompensas(espaco_id, status);
create index if not exists recompensas_parceiro_idx on public.recompensas(parceiro_id);
create index if not exists recompensas_indicacao_idx on public.recompensas(indicacao_id);

-- -----------------------------------------------------------------------------
-- Auditoria
-- -----------------------------------------------------------------------------
create table if not exists public.indicacao_eventos (
  id bigint generated always as identity primary key,
  espaco_id uuid not null references public.espacos(id) on delete cascade,
  indicacao_id uuid references public.indicacoes(id) on delete cascade,
  recompensa_id uuid references public.recompensas(id) on delete cascade,
  parceiro_id uuid references public.parceiros(id) on delete cascade,
  tipo text not null,           -- criada, status, edicao, recompensa_*, parceiro_status, regra_*
  de text,
  para text,
  dados jsonb not null default '{}'::jsonb,
  ator_id uuid,
  ator_tipo text not null default 'sistema' check (ator_tipo in ('equipe', 'parceiro', 'publico', 'sistema')),
  criado_em timestamptz not null default now()
);
create index if not exists indicacao_eventos_ind_idx on public.indicacao_eventos(indicacao_id, criado_em);
create index if not exists indicacao_eventos_parc_idx on public.indicacao_eventos(parceiro_id, criado_em);

-- -----------------------------------------------------------------------------
-- Rate limit / antifraude: tentativas de envio por IP (hash) e parceiro
-- -----------------------------------------------------------------------------
create table if not exists public.tentativas_indicacao (
  id bigint generated always as identity primary key,
  espaco_id uuid not null references public.espacos(id) on delete cascade,
  ip_hash text,
  parceiro_id uuid,
  canal text,
  criado_em timestamptz not null default now()
);
create index if not exists tentativas_ip_idx on public.tentativas_indicacao(ip_hash, criado_em);
create index if not exists tentativas_parceiro_idx on public.tentativas_indicacao(parceiro_id, criado_em);

-- -----------------------------------------------------------------------------
-- Pedidos do titular (LGPD)
-- -----------------------------------------------------------------------------
create table if not exists public.solicitacoes_lgpd (
  id uuid primary key default gen_random_uuid(),
  espaco_id uuid not null references public.espacos(id) on delete cascade,
  tipo text not null default 'exclusao' check (tipo in ('exclusao', 'oposicao', 'acesso')),
  telefone text,
  email text,
  nome text,
  mensagem text,
  ip text,
  status text not null default 'aberta' check (status in ('aberta', 'concluida', 'recusada')),
  resposta text,
  concluida_em timestamptz,
  concluida_por uuid,
  criado_em timestamptz not null default now()
);

-- =============================================================================
-- RLS
-- Regra geral: equipe do espaço lê tudo do seu espaço; mutações sensíveis
-- (indicações, recompensas, status de parceiro) só por funções SECURITY
-- DEFINER, que validam papel e registram auditoria. Parceiro NÃO lê a tabela
-- indicacoes diretamente: usa minhas_indicacoes(), que mascara o indicado.
-- =============================================================================
alter table public.parceiros enable row level security;
alter table public.regras_indicacao enable row level security;
alter table public.indicadores_clientes enable row level security;
alter table public.pesquisas_pos_festa enable row level security;
alter table public.indicacoes enable row level security;
alter table public.recompensas enable row level security;
alter table public.indicacao_eventos enable row level security;
alter table public.tentativas_indicacao enable row level security;
alter table public.solicitacoes_lgpd enable row level security;

drop policy if exists parceiros_equipe_select on public.parceiros;
create policy parceiros_equipe_select on public.parceiros
  for select to authenticated using (public.eh_membro(espaco_id));
drop policy if exists parceiros_proprio_select on public.parceiros;
create policy parceiros_proprio_select on public.parceiros
  for select to authenticated using (user_id = auth.uid());

-- Parceiro enxerga a marca do seu espaço
drop policy if exists espacos_parceiro_select on public.espacos;
create policy espacos_parceiro_select on public.espacos
  for select to authenticated using (
    exists (select 1 from public.parceiros p where p.espaco_id = espacos.id and p.user_id = auth.uid())
  );

drop policy if exists regras_equipe_select on public.regras_indicacao;
create policy regras_equipe_select on public.regras_indicacao
  for select to authenticated using (public.eh_membro(espaco_id));
drop policy if exists regras_gestao_insert on public.regras_indicacao;
create policy regras_gestao_insert on public.regras_indicacao
  for insert to authenticated with check (public.eh_membro(espaco_id, array['dono', 'gerente']));
drop policy if exists regras_gestao_update on public.regras_indicacao;
create policy regras_gestao_update on public.regras_indicacao
  for update to authenticated using (public.eh_membro(espaco_id, array['dono', 'gerente']))
  with check (public.eh_membro(espaco_id, array['dono', 'gerente']));

drop policy if exists indicadores_clientes_equipe on public.indicadores_clientes;
create policy indicadores_clientes_equipe on public.indicadores_clientes
  for select to authenticated using (public.eh_membro(espaco_id));

drop policy if exists pesquisas_equipe on public.pesquisas_pos_festa;
create policy pesquisas_equipe on public.pesquisas_pos_festa
  for select to authenticated using (public.eh_membro(espaco_id));

drop policy if exists indicacoes_equipe_select on public.indicacoes;
create policy indicacoes_equipe_select on public.indicacoes
  for select to authenticated using (public.eh_membro(espaco_id));

drop policy if exists recompensas_equipe_select on public.recompensas;
create policy recompensas_equipe_select on public.recompensas
  for select to authenticated using (public.eh_membro(espaco_id));

drop policy if exists eventos_equipe_select on public.indicacao_eventos;
create policy eventos_equipe_select on public.indicacao_eventos
  for select to authenticated using (public.eh_membro(espaco_id));

drop policy if exists solicitacoes_gestao on public.solicitacoes_lgpd;
create policy solicitacoes_gestao on public.solicitacoes_lgpd
  for select to authenticated using (public.eh_membro(espaco_id, array['dono', 'gerente']));

-- tentativas_indicacao: sem policies (só service role / funções definer).
