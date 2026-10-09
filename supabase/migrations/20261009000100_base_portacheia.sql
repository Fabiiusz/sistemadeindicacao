-- =============================================================================
-- PortaCheia: base mínima (espaços, membros, leads, festas, fila de envios,
-- bloqueio de contato, alertas).
--
-- SUPOSIÇÃO (ver docs/indicacoes.md): o repositório chegou vazio, sem o schema
-- do PortaCheia. Estas tabelas representam o "núcleo" que o módulo de
-- indicações precisa. Tudo usa CREATE ... IF NOT EXISTS para não duplicar
-- tabelas caso o núcleo real já exista; se os nomes/colunas reais forem
-- diferentes, ajuste as referências nas migrations de indicações.
-- =============================================================================

create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- Espaços (tenant). Cada espaço de festas tem sua marca e configurações.
-- -----------------------------------------------------------------------------
create table if not exists public.espacos (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  slug text not null unique,
  logo_url text,
  cor_primaria text not null default '#7c3aed',
  whatsapp_comercial text,          -- E.164, recebe aviso de nova indicação
  email_comercial text,
  config jsonb not null default '{}'::jsonb,
  -- chaves usadas em config:
  --   dias_pos_festa (int, padrão 2)
  --   rate_limit_por_ip (int, padrão 5 envios / 10 min)
  --   rate_limit_parceiro_dia (int, padrão 20)
  criado_em timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Membros da equipe do espaço (dono, gerente, comercial).
-- -----------------------------------------------------------------------------
create table if not exists public.membros_espaco (
  espaco_id uuid not null references public.espacos(id) on delete cascade,
  user_id uuid not null,
  papel text not null check (papel in ('dono', 'gerente', 'comercial')),
  criado_em timestamptz not null default now(),
  primary key (espaco_id, user_id)
);
create index if not exists membros_espaco_user_idx on public.membros_espaco(user_id);

-- -----------------------------------------------------------------------------
-- Leads (pipeline comercial).
-- -----------------------------------------------------------------------------
create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  espaco_id uuid not null references public.espacos(id) on delete cascade,
  nome text not null,
  telefone text,                     -- E.164
  email text,
  origem text not null default 'outro',
  -- origens usadas: instagram, google, site, indicacao_parceiro,
  -- indicacao_cliente, passante, outro
  etapa text not null default 'novo'
    check (etapa in ('novo', 'contatado', 'visita_agendada', 'orcamento_enviado', 'ganho', 'perdido')),
  tipo_evento text,
  data_evento date,
  num_convidados int,
  valor_fechado numeric(12, 2),
  observacoes text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists leads_espaco_tel_idx on public.leads(espaco_id, telefone);

-- -----------------------------------------------------------------------------
-- Festas (eventos contratados).
-- -----------------------------------------------------------------------------
create table if not exists public.festas (
  id uuid primary key default gen_random_uuid(),
  espaco_id uuid not null references public.espacos(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  anfitriao_nome text not null,
  anfitriao_telefone text,           -- E.164
  anfitriao_email text,
  tipo_evento text,
  data_evento date not null,
  num_convidados int,
  valor_total numeric(12, 2),
  valor_sinal numeric(12, 2),
  sinal_pago_em timestamptz,
  status text not null default 'agendada'
    check (status in ('agendada', 'realizada', 'cancelada')),
  criado_em timestamptz not null default now()
);
create index if not exists festas_espaco_tel_idx on public.festas(espaco_id, anfitriao_telefone);
create index if not exists festas_data_idx on public.festas(espaco_id, data_evento);

-- -----------------------------------------------------------------------------
-- Bloqueio de contato (opt-out). Respeitado por TODA fila de envio.
-- -----------------------------------------------------------------------------
create table if not exists public.bloqueio_contato (
  id uuid primary key default gen_random_uuid(),
  espaco_id uuid not null references public.espacos(id) on delete cascade,
  telefone text not null,            -- E.164
  motivo text,
  origem text not null default 'manual', -- manual, pedido_titular, descadastro
  criado_em timestamptz not null default now(),
  unique (espaco_id, telefone)
);

-- -----------------------------------------------------------------------------
-- Fila de envios (camada MessageProvider). No MVP o provedor é "wa.me":
-- o comercial abre o link e envia manualmente; depois marca como enviado.
-- -----------------------------------------------------------------------------
create table if not exists public.fila_envios (
  id uuid primary key default gen_random_uuid(),
  espaco_id uuid not null references public.espacos(id) on delete cascade,
  canal text not null default 'whatsapp' check (canal in ('whatsapp', 'email')),
  provedor text not null default 'wame',
  destino text not null,             -- E.164 ou e-mail
  destinatario_nome text,
  mensagem text not null,
  tipo text not null,                -- pos_festa, aviso_parceiro, nova_indicacao, acesso_parceiro...
  referencia_tabela text,
  referencia_id uuid,
  status text not null default 'pendente'
    check (status in ('pendente', 'enviado', 'cancelado', 'erro', 'bloqueado')),
  agendado_para date not null default current_date,
  enviado_em timestamptz,
  enviado_por uuid,
  erro text,
  criado_em timestamptz not null default now()
);
create index if not exists fila_envios_espaco_idx on public.fila_envios(espaco_id, status, agendado_para);

-- -----------------------------------------------------------------------------
-- Alertas persistentes (ex.: NPS detrator, padrão suspeito, nova indicação).
-- Alertas de prazo (24h sem contato etc.) são calculados em view.
-- -----------------------------------------------------------------------------
create table if not exists public.alertas (
  id uuid primary key default gen_random_uuid(),
  espaco_id uuid not null references public.espacos(id) on delete cascade,
  tipo text not null,
  titulo text not null,
  descricao text,
  referencia_tabela text,
  referencia_id uuid,
  para_papeis text[] not null default array['dono', 'gerente', 'comercial'],
  criado_em timestamptz not null default now(),
  resolvido_em timestamptz,
  resolvido_por uuid
);
create index if not exists alertas_espaco_idx on public.alertas(espaco_id, resolvido_em);

-- -----------------------------------------------------------------------------
-- Helpers de autorização
-- -----------------------------------------------------------------------------
create or replace function public.eh_membro(p_espaco_id uuid, p_papeis text[] default null)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.membros_espaco m
    where m.espaco_id = p_espaco_id
      and m.user_id = auth.uid()
      and (p_papeis is null or m.papel = any (p_papeis))
  );
$$;

create or replace function public.exigir_membro(p_espaco_id uuid, p_papeis text[] default null)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.eh_membro(p_espaco_id, p_papeis) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.tocar_atualizado_em()
returns trigger language plpgsql as $$
begin
  new.atualizado_em := now();
  return new;
end;
$$;

drop trigger if exists leads_atualizado_em on public.leads;
create trigger leads_atualizado_em before update on public.leads
  for each row execute function public.tocar_atualizado_em();

-- -----------------------------------------------------------------------------
-- RLS do núcleo
-- -----------------------------------------------------------------------------
alter table public.espacos enable row level security;
alter table public.membros_espaco enable row level security;
alter table public.leads enable row level security;
alter table public.festas enable row level security;
alter table public.bloqueio_contato enable row level security;
alter table public.fila_envios enable row level security;
alter table public.alertas enable row level security;

drop policy if exists espacos_membros_select on public.espacos;
create policy espacos_membros_select on public.espacos
  for select to authenticated using (public.eh_membro(id));
drop policy if exists espacos_dono_update on public.espacos;
create policy espacos_dono_update on public.espacos
  for update to authenticated using (public.eh_membro(id, array['dono', 'gerente']))
  with check (public.eh_membro(id, array['dono', 'gerente']));

drop policy if exists membros_select on public.membros_espaco;
create policy membros_select on public.membros_espaco
  for select to authenticated using (user_id = auth.uid() or public.eh_membro(espaco_id, array['dono']));

drop policy if exists leads_equipe_all on public.leads;
create policy leads_equipe_all on public.leads
  for all to authenticated using (public.eh_membro(espaco_id)) with check (public.eh_membro(espaco_id));

drop policy if exists festas_equipe_all on public.festas;
create policy festas_equipe_all on public.festas
  for all to authenticated using (public.eh_membro(espaco_id)) with check (public.eh_membro(espaco_id));

drop policy if exists bloqueio_equipe_all on public.bloqueio_contato;
create policy bloqueio_equipe_all on public.bloqueio_contato
  for all to authenticated using (public.eh_membro(espaco_id)) with check (public.eh_membro(espaco_id));

drop policy if exists fila_equipe_select on public.fila_envios;
create policy fila_equipe_select on public.fila_envios
  for select to authenticated using (public.eh_membro(espaco_id));
drop policy if exists fila_equipe_update on public.fila_envios;
create policy fila_equipe_update on public.fila_envios
  for update to authenticated using (public.eh_membro(espaco_id)) with check (public.eh_membro(espaco_id));

drop policy if exists alertas_equipe_select on public.alertas;
create policy alertas_equipe_select on public.alertas
  for select to authenticated using (public.eh_membro(espaco_id));
drop policy if exists alertas_equipe_update on public.alertas;
create policy alertas_equipe_update on public.alertas
  for update to authenticated using (public.eh_membro(espaco_id)) with check (public.eh_membro(espaco_id));
