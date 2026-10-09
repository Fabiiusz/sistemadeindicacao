-- =============================================================================
-- Módulo Indicações: regras de negócio no servidor (Fase 1)
--  * normalização de telefone (E.164) e máscara de nome
--  * regra vigente (com exceção por parceiro) congelada na indicação
--  * registro de indicação: atribuição (1ª válida na janela vence),
--    duplicidade (já era lead/cliente), autoindicação, consentimento,
--    opt-out e rate limit
--  * fechamento e cálculo de recompensas com valores armazenados
--  * aprovação condicionada (nunca paga automaticamente)
-- Erros são lançados com códigos curtos (ex.: 'telefone_invalido') que o app
-- traduz para mensagens em pt-BR (lib/indicacoes/erros.ts).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Utilitários
-- -----------------------------------------------------------------------------
create or replace function public.normalizar_telefone(p text)
returns text
language plpgsql
immutable
as $$
declare
  d text;
begin
  if p is null then
    return null;
  end if;
  d := regexp_replace(p, '\D', '', 'g');
  if p ~ '^\s*\+' then
    if length(d) between 8 and 15 and left(d, 1) <> '0' then
      return '+' || d;
    end if;
    return null;
  end if;
  d := regexp_replace(d, '^0+', '');
  if length(d) in (10, 11) then
    return '+55' || d;
  end if;
  if length(d) in (12, 13) and left(d, 2) = '55' then
    return '+' || d;
  end if;
  return null;
end;
$$;

-- "Maria Clara Souza" -> "Maria S."
create or replace function public.mascarar_nome(p text)
returns text
language plpgsql
immutable
as $$
declare
  partes text[];
begin
  if p is null or trim(p) = '' then
    return null;
  end if;
  partes := regexp_split_to_array(trim(p), '\s+');
  -- sem initcap: ele quebra em letras acentuadas dependendo do locale ("PatríCia")
  if array_length(partes, 1) = 1 then
    return upper(left(partes[1], 1)) || lower(substr(partes[1], 2));
  end if;
  return upper(left(partes[1], 1)) || lower(substr(partes[1], 2)) || ' ' || upper(left(partes[array_length(partes, 1)], 1)) || '.';
end;
$$;

create or replace function public.codigo_aleatorio(p_tamanho int default 6)
returns text
language plpgsql
volatile
as $$
declare
  alfabeto constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; -- sem 0/O/1/I/L
  resultado text := '';
begin
  for i in 1..p_tamanho loop
    resultado := resultado || substr(alfabeto, 1 + floor(random() * length(alfabeto))::int, 1);
  end loop;
  return resultado;
end;
$$;

create or replace function public.gerar_codigo_parceiro()
returns text
language plpgsql
volatile
set search_path = public
as $$
declare
  c text;
begin
  loop
    c := public.codigo_aleatorio(6);
    exit when not exists (select 1 from public.parceiros where codigo_indicacao = c)
          and not exists (select 1 from public.indicadores_clientes where codigo = c);
  end loop;
  return c;
end;
$$;

create or replace function public.data_br(p timestamptz)
returns text
language sql
stable
as $$
  select to_char(p at time zone 'America/Sao_Paulo', 'DD/MM/YYYY');
$$;

-- Quem está agindo: equipe, parceiro, público (formulário) ou sistema.
create or replace function public.ator_tipo_atual(p_espaco_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return coalesce(nullif(current_setting('app.ator_tipo', true), ''), 'sistema');
  end if;
  if public.eh_membro(p_espaco_id) then
    return 'equipe';
  end if;
  if exists (select 1 from public.parceiros where user_id = auth.uid() and espaco_id = p_espaco_id) then
    return 'parceiro';
  end if;
  return 'sistema';
end;
$$;

create or replace function public.registrar_evento(
  p_espaco_id uuid,
  p_tipo text,
  p_indicacao_id uuid default null,
  p_recompensa_id uuid default null,
  p_parceiro_id uuid default null,
  p_de text default null,
  p_para text default null,
  p_dados jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.indicacao_eventos (espaco_id, indicacao_id, recompensa_id, parceiro_id, tipo, de, para, dados, ator_id, ator_tipo)
  values (p_espaco_id, p_indicacao_id, p_recompensa_id, p_parceiro_id, p_tipo, p_de, p_para,
          coalesce(p_dados, '{}'::jsonb), auth.uid(), public.ator_tipo_atual(p_espaco_id));
end;
$$;

-- -----------------------------------------------------------------------------
-- Fila de mensagens (MessageProvider). Respeita bloqueio_contato SEMPRE.
-- -----------------------------------------------------------------------------
create or replace function public.enfileirar_mensagem(
  p_espaco_id uuid,
  p_destino text,
  p_mensagem text,
  p_tipo text,
  p_destinatario_nome text default null,
  p_referencia_tabela text default null,
  p_referencia_id uuid default null,
  p_canal text default 'whatsapp'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_destino text;
  v_status text := 'pendente';
  v_id uuid;
begin
  if p_destino is null or trim(p_destino) = '' then
    return null;
  end if;
  if p_canal = 'whatsapp' then
    v_destino := public.normalizar_telefone(p_destino);
    if v_destino is null then
      return null;
    end if;
    if exists (select 1 from public.bloqueio_contato b where b.espaco_id = p_espaco_id and b.telefone = v_destino) then
      v_status := 'bloqueado';
    end if;
  else
    v_destino := lower(trim(p_destino));
  end if;
  insert into public.fila_envios (espaco_id, canal, destino, destinatario_nome, mensagem, tipo,
                                  referencia_tabela, referencia_id, status)
  values (p_espaco_id, p_canal, v_destino, p_destinatario_nome, p_mensagem, p_tipo,
          p_referencia_tabela, p_referencia_id, v_status)
  returning id into v_id;
  return v_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Regra vigente: exceção do parceiro > regra geral; mais recente vence.
-- -----------------------------------------------------------------------------
create or replace function public.regra_vigente(
  p_espaco_id uuid,
  p_publico text,
  p_parceiro_id uuid default null,
  p_data timestamptz default now()
)
returns setof public.regras_indicacao
language sql
stable
security definer
set search_path = public
as $$
  select r.*
  from public.regras_indicacao r
  where r.espaco_id = p_espaco_id
    and r.publico = p_publico
    and r.ativa
    and r.vigencia_inicio <= (p_data at time zone 'America/Sao_Paulo')::date
    and (r.vigencia_fim is null or r.vigencia_fim >= (p_data at time zone 'America/Sao_Paulo')::date)
    and (r.parceiro_id is null or r.parceiro_id = p_parceiro_id)
  order by (r.parceiro_id is not null) desc, r.vigencia_inicio desc, r.criado_em desc
  limit 1;
$$;

-- Campos financeiros de uma regra já usada não mudam: crie uma nova versão.
create or replace function public.proteger_regra_em_uso()
returns trigger
language plpgsql
as $$
begin
  if exists (select 1 from public.indicacoes i where i.regra_id = old.id)
     and (new.tipo_recompensa, new.valor, new.base_calculo, new.condicao_pagamento, new.validade_dias_atribuicao,
          new.beneficio_indicado_tipo, new.beneficio_indicado_valor, new.limite_por_indicador, new.publico,
          new.parceiro_id, new.vigencia_inicio)
       is distinct from
         (old.tipo_recompensa, old.valor, old.base_calculo, old.condicao_pagamento, old.validade_dias_atribuicao,
          old.beneficio_indicado_tipo, old.beneficio_indicado_valor, old.limite_por_indicador, old.publico,
          old.parceiro_id, old.vigencia_inicio)
  then
    raise exception 'regra_em_uso';
  end if;
  return new;
end;
$$;

drop trigger if exists regras_protecao on public.regras_indicacao;
create trigger regras_protecao before update on public.regras_indicacao
  for each row execute function public.proteger_regra_em_uso();

create or replace function public.auditar_regra()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.registrar_evento(new.espaco_id, case when tg_op = 'INSERT' then 'regra_criada' else 'regra_alterada' end,
    null, null, new.parceiro_id, null, null,
    jsonb_build_object('regra_id', new.id, 'regra', to_jsonb(new), 'justificativa', new.justificativa));
  return new;
end;
$$;

drop trigger if exists regras_auditoria on public.regras_indicacao;
create trigger regras_auditoria after insert or update on public.regras_indicacao
  for each row execute function public.auditar_regra();

-- -----------------------------------------------------------------------------
-- Status: carimbo de data e auditoria de toda mudança de status
-- -----------------------------------------------------------------------------
create or replace function public.indicacao_status_antes()
returns trigger
language plpgsql
as $$
begin
  if new.status is distinct from old.status then
    new.status_atualizado_em := now();
  end if;
  return new;
end;
$$;

drop trigger if exists indicacoes_status_antes on public.indicacoes;
create trigger indicacoes_status_antes before update on public.indicacoes
  for each row execute function public.indicacao_status_antes();

create or replace function public.indicacao_status_depois()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is distinct from old.status then
    perform public.registrar_evento(new.espaco_id, 'status', new.id, null, new.indicador_parceiro_id,
      old.status, new.status, jsonb_build_object('motivo', new.motivo_status));
  end if;
  return new;
end;
$$;

drop trigger if exists indicacoes_status_depois on public.indicacoes;
create trigger indicacoes_status_depois after update on public.indicacoes
  for each row execute function public.indicacao_status_depois();

-- -----------------------------------------------------------------------------
-- Antifraude: parceiro com muitas indicações inválidas/duplicadas -> alerta
-- -----------------------------------------------------------------------------
create or replace function public.avaliar_parceiro_suspeito(p_parceiro_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total int;
  v_ruins int;
  v_parc public.parceiros;
begin
  if p_parceiro_id is null then
    return false;
  end if;
  select * into v_parc from public.parceiros where id = p_parceiro_id;
  select count(*), count(*) filter (where status in ('invalida', 'duplicada'))
    into v_total, v_ruins
  from public.indicacoes
  where indicador_parceiro_id = p_parceiro_id and criado_em > now() - interval '30 days';

  if v_total >= 4 and v_ruins::numeric / v_total >= 0.5 then
    if not exists (select 1 from public.alertas a where a.referencia_id = p_parceiro_id
                     and a.tipo = 'parceiro_suspeito' and a.resolvido_em is null) then
      insert into public.alertas (espaco_id, tipo, titulo, descricao, referencia_tabela, referencia_id, para_papeis)
      values (v_parc.espaco_id, 'parceiro_suspeito', 'Revisar parceiro: ' || v_parc.nome,
              format('%s de %s indicações nos últimos 30 dias foram inválidas ou duplicadas.', v_ruins, v_total),
              'parceiros', p_parceiro_id, array['dono', 'gerente']);
    end if;
    return true;
  end if;
  return false;
end;
$$;

-- -----------------------------------------------------------------------------
-- Registro de indicação (núcleo). Não é exposta: use os wrappers abaixo.
-- -----------------------------------------------------------------------------
create or replace function public._registrar_indicacao(
  p_espaco_id uuid,
  p_origem text,
  p_canal text,
  p_parceiro_id uuid,
  p_indicador_cliente_id uuid,
  p_indicador_nome text,
  p_indicador_telefone text,
  p_nome text,
  p_telefone text,
  p_email text,
  p_tipo_evento text,
  p_data_evento date,
  p_convidados int,
  p_observacoes text,
  p_consentimento boolean,
  p_consentimento_texto text,
  p_base_legal text,
  p_ip text,
  p_ip_hash text,
  p_user_agent text,
  p_documento_indicado text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tel text;
  v_email text;
  v_doc text;
  v_cfg jsonb;
  v_espaco public.espacos;
  v_parc public.parceiros;
  v_cli public.indicadores_clientes;
  v_festa_indicador public.festas;
  v_limite int;
  v_qtd int;
  v_status text := 'recebida';
  v_motivo text;
  v_dup uuid;
  v_lead_id uuid;
  v_regra public.regras_indicacao;
  v_snapshot jsonb;
  v_validade int := 90;
  v_id uuid;
  v_origem_contato text;
  v_indicador_label text;
  v_suspeitas text[] := '{}';
  v_prev public.indicacoes;
  v_lead public.leads;
  v_festa public.festas;
  v_sem_recompensa boolean := false;
  v_obs_sistema text;
  v_rec_id uuid;
begin
  if p_origem not in ('parceiro', 'cliente') then
    raise exception 'origem_invalida';
  end if;
  if coalesce(trim(p_nome), '') = '' then
    raise exception 'nome_obrigatorio';
  end if;
  v_tel := public.normalizar_telefone(p_telefone);
  if v_tel is null then
    raise exception 'telefone_invalido';
  end if;
  if p_consentimento is not true then
    raise exception 'consentimento_obrigatorio';
  end if;
  v_email := nullif(lower(trim(coalesce(p_email, ''))), '');
  v_doc := nullif(regexp_replace(coalesce(p_documento_indicado, ''), '\D', '', 'g'), '');

  select * into v_espaco from public.espacos where id = p_espaco_id;
  if not found then
    raise exception 'espaco_nao_encontrado';
  end if;
  v_cfg := v_espaco.config;

  -- Serializa indicações do mesmo telefone no mesmo espaço (1ª vence).
  perform pg_advisory_xact_lock(hashtext(p_espaco_id::text || ':' || v_tel));

  -- Opt-out: quem pediu para não ser contatado não entra.
  if exists (select 1 from public.bloqueio_contato b where b.espaco_id = p_espaco_id and b.telefone = v_tel) then
    raise exception 'contato_bloqueado';
  end if;

  -- Indicador
  if p_origem = 'parceiro' then
    if p_parceiro_id is not null then
      select * into v_parc from public.parceiros where id = p_parceiro_id and espaco_id = p_espaco_id;
      if not found or v_parc.status <> 'ativo' then
        raise exception 'parceiro_inativo';
      end if;
      v_indicador_label := v_parc.nome;
    elsif coalesce(trim(p_indicador_nome), '') = '' then
      raise exception 'indicador_obrigatorio';
    end if;
  else
    if p_indicador_cliente_id is not null then
      select * into v_cli from public.indicadores_clientes where id = p_indicador_cliente_id and espaco_id = p_espaco_id;
      if not found then
        raise exception 'indicador_nao_encontrado';
      end if;
      select * into v_festa_indicador from public.festas where id = v_cli.festa_id;
      v_indicador_label := v_cli.nome;
    elsif coalesce(trim(p_indicador_nome), '') = '' then
      raise exception 'indicador_obrigatorio';
    end if;
  end if;
  v_indicador_label := coalesce(v_indicador_label, trim(p_indicador_nome));

  -- Rate limit por dispositivo/IP e por parceiro
  if p_ip_hash is not null then
    v_limite := coalesce((v_cfg ->> 'rate_limit_por_ip')::int, 5);
    select count(*) into v_qtd from public.tentativas_indicacao
     where ip_hash = p_ip_hash and criado_em > now() - interval '10 minutes';
    if v_qtd >= v_limite then
      raise exception 'muitas_tentativas';
    end if;
  end if;
  if v_parc.id is not null then
    v_limite := coalesce((v_cfg ->> 'rate_limit_parceiro_dia')::int, 20);
    select count(*) into v_qtd from public.tentativas_indicacao
     where parceiro_id = v_parc.id and criado_em > now() - interval '1 day';
    if v_qtd >= v_limite then
      raise exception 'muitas_tentativas';
    end if;
  end if;
  insert into public.tentativas_indicacao (espaco_id, ip_hash, parceiro_id, canal)
  values (p_espaco_id, p_ip_hash, v_parc.id, p_canal);

  -- Padrão suspeito: mesmo IP com vários envios em 24h
  if p_ip_hash is not null then
    select count(*) into v_qtd from public.tentativas_indicacao
     where ip_hash = p_ip_hash and criado_em > now() - interval '24 hours';
    if v_qtd >= 4 then
      v_suspeitas := array_append(v_suspeitas, 'muitos_envios_mesmo_dispositivo');
    end if;
  end if;

  -- Autoindicação (mesmo telefone, e-mail ou documento do indicador)
  if (v_parc.id is not null and (v_parc.telefone = v_tel
        or (v_email is not null and lower(v_parc.email) = v_email)
        or (v_doc is not null and v_parc.documento = v_doc)))
     or (v_cli.id is not null and (v_cli.telefone = v_tel
        or (v_email is not null and lower(v_cli.email) = v_email)
        or v_festa_indicador.anfitriao_telefone = v_tel))
     or (public.normalizar_telefone(p_indicador_telefone) = v_tel)
  then
    v_status := 'invalida';
    v_motivo := 'Autoindicação: o indicado é o próprio indicador.';
    v_suspeitas := array_append(v_suspeitas, 'autoindicacao');
  end if;

  -- Atribuição: vale a 1ª indicação válida dentro da janela
  if v_status = 'recebida' then
    select * into v_prev from public.indicacoes
     where espaco_id = p_espaco_id and telefone_indicado = v_tel
       and status not in ('invalida', 'duplicada')
       and atribuida_ate >= now()
     order by criado_em
     limit 1;
    if found then
      v_status := 'duplicada';
      v_dup := v_prev.id;
      v_lead_id := v_prev.lead_id;
      v_motivo := format('Este contato já foi indicado em %s%s. Vale a primeira indicação dentro do prazo de atribuição.',
        public.data_br(v_prev.criado_em),
        case when (v_parc.id is not null and v_prev.indicador_parceiro_id = v_parc.id)
               or (v_cli.id is not null and v_prev.indicador_cliente_id = v_cli.id)
             then ' por você' else ' por outro indicador' end);
    end if;
  end if;

  -- Já era lead ou cliente antes da indicação
  if v_status = 'recebida' then
    select * into v_lead from public.leads
     where espaco_id = p_espaco_id and telefone = v_tel
     order by criado_em limit 1;
    if found then
      v_status := 'duplicada';
      v_lead_id := v_lead.id;
      v_motivo := format('Este contato já era lead do espaço desde %s (antes da indicação).', public.data_br(v_lead.criado_em));
    else
      select * into v_festa from public.festas
       where espaco_id = p_espaco_id and anfitriao_telefone = v_tel
       order by data_evento limit 1;
      if found then
        v_status := 'duplicada';
        v_motivo := format('Este contato já era cliente do espaço (festa em %s).', to_char(v_festa.data_evento, 'DD/MM/YYYY'));
      end if;
    end if;
  end if;

  -- Regra vigente na data da indicação (congelada)
  select * into v_regra from public.regra_vigente(p_espaco_id, p_origem, v_parc.id, now());
  if v_regra.id is not null then
    v_snapshot := to_jsonb(v_regra);
    v_validade := v_regra.validade_dias_atribuicao;
  end if;

  v_origem_contato := case p_canal
    when 'link_parceiro' then format('Formulário público pelo link do parceiro %s; dados informados pelo próprio indicado.', v_indicador_label)
    when 'painel_parceiro' then format('Informado pelo parceiro %s no painel; o parceiro declarou ter autorização do indicado.', v_indicador_label)
    when 'link_cliente' then format('Formulário público pelo link do cliente %s; dados informados pelo próprio indicado.', v_indicador_label)
    else format('Registrado pela equipe do espaço a partir de indicação de %s.', coalesce(v_indicador_label, 'indicador não identificado'))
  end;

  if v_status = 'recebida' then
    insert into public.leads (espaco_id, nome, telefone, email, origem, etapa, tipo_evento, data_evento,
                              num_convidados, observacoes)
    values (p_espaco_id, trim(p_nome), v_tel, v_email, 'indicacao_' || p_origem, 'novo', p_tipo_evento, p_data_evento,
            p_convidados, nullif(trim(coalesce(p_observacoes, '')), ''))
    returning id into v_lead_id;
  end if;

  insert into public.indicacoes (
    espaco_id, origem, canal, indicador_parceiro_id, indicador_cliente_id, indicador_festa_id,
    indicador_nome, indicador_telefone, nome_indicado, telefone_indicado, email_indicado,
    tipo_evento_interesse, data_evento_estimada, num_convidados_estimado, observacoes,
    status, motivo_status, duplicada_de, lead_id, regra_id, regra_snapshot, atribuida_ate,
    consentimento, consentimento_texto, consentimento_em, consentimento_ip, base_legal, origem_contato,
    user_agent, ip_hash, suspeita, motivos_suspeita, criado_por
  ) values (
    p_espaco_id, p_origem, p_canal, v_parc.id, v_cli.id, v_cli.festa_id,
    case when v_parc.id is null and v_cli.id is null then trim(p_indicador_nome) end,
    case when v_parc.id is null and v_cli.id is null then public.normalizar_telefone(p_indicador_telefone) end,
    trim(p_nome), v_tel, v_email,
    p_tipo_evento, p_data_evento, p_convidados, nullif(trim(coalesce(p_observacoes, '')), ''),
    v_status, v_motivo, v_dup, v_lead_id, v_regra.id, v_snapshot, now() + make_interval(days => v_validade),
    true, p_consentimento_texto, now(), p_ip, coalesce(p_base_legal, 'consentimento'), v_origem_contato,
    left(p_user_agent, 400), p_ip_hash, cardinality(v_suspeitas) > 0, v_suspeitas, auth.uid()
  ) returning id into v_id;

  perform public.registrar_evento(p_espaco_id, 'criada', v_id, null, v_parc.id, null, v_status,
    jsonb_build_object('canal', p_canal, 'motivo', v_motivo, 'regra_id', v_regra.id, 'suspeitas', v_suspeitas));

  -- Recompensas previstas (só para indicação válida com regra vigente)
  if v_status = 'recebida' and v_regra.id is not null then
    if v_parc.id is not null or v_cli.id is not null then
      if v_regra.limite_por_indicador is not null then
        select count(distinct r.indicacao_id) into v_qtd
          from public.recompensas r
         where r.beneficiario in ('parceiro', 'cliente_indicador')
           and r.status <> 'cancelada'
           and ((v_parc.id is not null and r.parceiro_id = v_parc.id)
             or (v_cli.id is not null and r.indicador_cliente_id = v_cli.id));
        if v_qtd >= v_regra.limite_por_indicador then
          v_sem_recompensa := true;
          v_obs_sistema := format('Limite de %s indicações recompensadas por indicador atingido.', v_regra.limite_por_indicador);
          perform public.registrar_evento(p_espaco_id, 'limite_atingido', v_id, null, v_parc.id, null, null,
            jsonb_build_object('limite', v_regra.limite_por_indicador));
        end if;
      end if;

      if not v_sem_recompensa then
        insert into public.recompensas (espaco_id, indicacao_id, regra_id, beneficiario, parceiro_id, indicador_cliente_id,
                                        tipo, percentual, base_calculo, valor, descricao, condicao)
        values (p_espaco_id, v_id, v_regra.id,
                case when v_parc.id is not null then 'parceiro' else 'cliente_indicador' end,
                v_parc.id, v_cli.id, v_regra.tipo_recompensa,
                case when v_regra.tipo_recompensa = 'percentual' then v_regra.valor end,
                v_regra.base_calculo,
                case when v_regra.tipo_recompensa in ('valor_fixo', 'credito') then v_regra.valor end,
                coalesce(v_regra.descricao_recompensa,
                  case v_regra.tipo_recompensa
                    when 'percentual' then format('Comissão de %s%%', trim(to_char(v_regra.valor, 'FM990D##')))
                    when 'valor_fixo' then 'Comissão fixa'
                    when 'credito' then 'Crédito na próxima festa'
                    else 'Brinde' end),
                v_regra.condicao_pagamento)
        returning id into v_rec_id;
        perform public.registrar_evento(p_espaco_id, 'recompensa_prevista', v_id, v_rec_id, v_parc.id);
      end if;
    end if;

    if v_regra.beneficio_indicado_tipo is not null then
      insert into public.recompensas (espaco_id, indicacao_id, regra_id, beneficiario, tipo, valor, descricao, condicao)
      values (p_espaco_id, v_id, v_regra.id, 'indicado', v_regra.beneficio_indicado_tipo, v_regra.beneficio_indicado_valor,
              coalesce(v_regra.beneficio_indicado_descricao, 'Benefício para quem foi indicado'), 'fechamento')
      returning id into v_rec_id;
      perform public.registrar_evento(p_espaco_id, 'recompensa_prevista', v_id, v_rec_id, v_parc.id);
    end if;
  end if;

  if v_obs_sistema is not null then
    update public.indicacoes set observacoes = concat_ws(E'\n', observacoes, '[Sistema] ' || v_obs_sistema) where id = v_id;
  end if;

  -- Avisar o comercial
  if v_status = 'recebida' then
    insert into public.alertas (espaco_id, tipo, titulo, descricao, referencia_tabela, referencia_id)
    values (p_espaco_id, 'nova_indicacao', 'Nova indicação: ' || trim(p_nome),
            format('Indicado por %s. Entre em contato em até 24h.', coalesce(v_indicador_label, 'indicador')),
            'indicacoes', v_id);
    perform public.enfileirar_mensagem(p_espaco_id, v_espaco.whatsapp_comercial,
      format('Nova indicação no PortaCheia: %s (%s), indicado(a) por %s. Entre em contato em até 24h.',
             trim(p_nome), coalesce(p_tipo_evento, 'evento'), coalesce(v_indicador_label, 'indicador')),
      'nova_indicacao', 'Comercial', 'indicacoes', v_id);
  end if;

  if v_parc.id is not null then
    perform public.avaliar_parceiro_suspeito(v_parc.id);
  end if;

  return jsonb_build_object('id', v_id, 'status', v_status, 'motivo', v_motivo, 'lead_id', v_lead_id);
end;
$$;

-- Público (formulários /i/[codigo] e /v/[codigo]). Chamado SOMENTE pelo
-- servidor com service role, que informa IP e user agent reais.
create or replace function public.registrar_indicacao_publica(
  p_codigo text,
  p_tipo_link text,                 -- 'parceiro' (/i) ou 'cliente' (/v)
  p_nome text,
  p_telefone text,
  p_email text,
  p_tipo_evento text,
  p_data_evento date,
  p_convidados int,
  p_observacoes text,
  p_consentimento boolean,
  p_consentimento_texto text,
  p_ip text,
  p_ip_hash text,
  p_user_agent text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_parc public.parceiros;
  v_cli public.indicadores_clientes;
begin
  perform set_config('app.ator_tipo', 'publico', true);
  if p_tipo_link = 'parceiro' then
    select * into v_parc from public.parceiros where codigo_indicacao = upper(trim(p_codigo));
    if not found then
      raise exception 'codigo_invalido';
    end if;
    return public._registrar_indicacao(v_parc.espaco_id, 'parceiro', 'link_parceiro', v_parc.id, null, null, null,
      p_nome, p_telefone, p_email, p_tipo_evento, p_data_evento, p_convidados, p_observacoes,
      p_consentimento, p_consentimento_texto, 'consentimento', p_ip, p_ip_hash, p_user_agent);
  elsif p_tipo_link = 'cliente' then
    select * into v_cli from public.indicadores_clientes where codigo = upper(trim(p_codigo));
    if not found then
      raise exception 'codigo_invalido';
    end if;
    return public._registrar_indicacao(v_cli.espaco_id, 'cliente', 'link_cliente', null, v_cli.id, null, null,
      p_nome, p_telefone, p_email, p_tipo_evento, p_data_evento, p_convidados, p_observacoes,
      p_consentimento, p_consentimento_texto, 'consentimento', p_ip, p_ip_hash, p_user_agent);
  end if;
  raise exception 'codigo_invalido';
end;
$$;

-- Equipe registra uma indicação recebida (telefone, balcão, Instagram...).
create or replace function public.registrar_indicacao_comercial(
  p_espaco_id uuid,
  p_origem text,
  p_parceiro_id uuid,
  p_indicador_cliente_id uuid,
  p_indicador_nome text,
  p_indicador_telefone text,
  p_nome text,
  p_telefone text,
  p_email text,
  p_tipo_evento text,
  p_data_evento date,
  p_convidados int,
  p_observacoes text,
  p_consentimento_confirmado boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.exigir_membro(p_espaco_id);
  return public._registrar_indicacao(p_espaco_id, p_origem, 'manual_comercial', p_parceiro_id, p_indicador_cliente_id,
    p_indicador_nome, p_indicador_telefone, p_nome, p_telefone, p_email, p_tipo_evento, p_data_evento, p_convidados,
    p_observacoes, p_consentimento_confirmado,
    'A equipe confirmou que o indicado autorizou o contato do espaço.',
    'consentimento (confirmado pela equipe)', null, null, null);
end;
$$;

-- -----------------------------------------------------------------------------
-- Aprovação condicionada. Aprova automaticamente quando a condição é
-- atendida; o PAGAMENTO é sempre manual (marcar_recompensa_paga).
-- -----------------------------------------------------------------------------
create or replace function public.condicao_atendida(p_condicao text, p_ind public.indicacoes)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_festa public.festas;
begin
  if p_ind.status not in ('fechada', 'evento_realizado') then
    return false;
  end if;
  if p_ind.festa_id is not null then
    select * into v_festa from public.festas where id = p_ind.festa_id;
  end if;
  return coalesce(case p_condicao
    when 'fechamento' then true
    when 'sinal_pago' then v_festa.sinal_pago_em is not null or p_ind.status = 'evento_realizado'
    when 'evento_realizado' then p_ind.status = 'evento_realizado' or v_festa.status = 'realizada'
    else false
  end, false);
end;
$$;

create or replace function public.verificar_recompensas(p_indicacao_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ind public.indicacoes;
  r public.recompensas;
  v_aprovadas int := 0;
begin
  select * into v_ind from public.indicacoes where id = p_indicacao_id;
  if not found then
    return 0;
  end if;
  for r in select * from public.recompensas where indicacao_id = p_indicacao_id and status = 'prevista' loop
    if v_ind.fechada_em is not null and v_ind.fechada_em > v_ind.atribuida_ate then
      update public.recompensas
         set status = 'cancelada',
             motivo_cancelamento = format('Fechamento após o prazo de atribuição (válido até %s).', public.data_br(v_ind.atribuida_ate))
       where id = r.id;
      perform public.registrar_evento(v_ind.espaco_id, 'recompensa_cancelada', v_ind.id, r.id, r.parceiro_id, 'prevista', 'cancelada',
        jsonb_build_object('motivo', 'fora_da_janela'));
      continue;
    end if;
    if (r.valor is not null or r.tipo = 'brinde') and public.condicao_atendida(r.condicao, v_ind) then
      update public.recompensas set status = 'aprovada', aprovada_em = now(), aprovada_por = auth.uid() where id = r.id;
      perform public.registrar_evento(v_ind.espaco_id, 'recompensa_aprovada', v_ind.id, r.id, r.parceiro_id, 'prevista', 'aprovada',
        jsonb_build_object('condicao', r.condicao, 'valor', r.valor));
      v_aprovadas := v_aprovadas + 1;
    end if;
  end loop;
  return v_aprovadas;
end;
$$;

-- Calcula valores (percentual sobre a base) com o percentual CONGELADO na
-- recompensa (vindo da regra vigente na data da indicação).
create or replace function public.calcular_recompensas(p_indicacao_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ind public.indicacoes;
  v_festa public.festas;
  r public.recompensas;
  v_base numeric;
begin
  select * into v_ind from public.indicacoes where id = p_indicacao_id;
  if v_ind.festa_id is not null then
    select * into v_festa from public.festas where id = v_ind.festa_id;
  end if;
  for r in select * from public.recompensas
            where indicacao_id = p_indicacao_id and status = 'prevista' and tipo = 'percentual' loop
    v_base := case r.base_calculo
      when 'sinal_pago' then coalesce(v_ind.valor_sinal, v_festa.valor_sinal)
      else v_ind.valor_fechado
    end;
    if v_base is not null then
      update public.recompensas
         set base_valor = v_base, valor = round(v_base * r.percentual / 100.0, 2)
       where id = r.id;
    end if;
  end loop;
  perform public.verificar_recompensas(p_indicacao_id);
end;
$$;

-- Comercial fecha a indicação informando valor (e festa, se já existir).
create or replace function public.fechar_indicacao(
  p_indicacao_id uuid,
  p_valor_fechado numeric,
  p_festa_id uuid default null,
  p_valor_sinal numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ind public.indicacoes;
  v_festa public.festas;
begin
  select * into v_ind from public.indicacoes where id = p_indicacao_id for update;
  if not found then
    raise exception 'indicacao_nao_encontrada';
  end if;
  perform public.exigir_membro(v_ind.espaco_id);
  if v_ind.status in ('invalida', 'duplicada', 'perdida', 'evento_realizado') then
    raise exception 'status_nao_permite_fechar';
  end if;
  if p_valor_fechado is null or p_valor_fechado <= 0 then
    raise exception 'valor_obrigatorio';
  end if;
  if p_festa_id is not null then
    select * into v_festa from public.festas where id = p_festa_id and espaco_id = v_ind.espaco_id;
    if not found then
      raise exception 'festa_nao_encontrada';
    end if;
  end if;

  update public.indicacoes
     set status = 'fechada',
         valor_fechado = p_valor_fechado,
         valor_sinal = coalesce(p_valor_sinal, v_festa.valor_sinal, valor_sinal),
         festa_id = coalesce(p_festa_id, festa_id),
         fechada_em = coalesce(fechada_em, now()),
         motivo_status = null
   where id = p_indicacao_id;

  perform public.registrar_evento(v_ind.espaco_id, 'fechamento', v_ind.id, null, v_ind.indicador_parceiro_id, null, null,
    jsonb_build_object('valor_fechado', p_valor_fechado, 'festa_id', p_festa_id, 'valor_sinal', p_valor_sinal));
  perform public.calcular_recompensas(p_indicacao_id);

  return jsonb_build_object('id', p_indicacao_id, 'status', 'fechada');
end;
$$;

-- Mudança manual de status (funil). "fechada" exige fechar_indicacao().
create or replace function public.alterar_status_indicacao(
  p_indicacao_id uuid,
  p_status text,
  p_motivo text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ind public.indicacoes;
  r public.recompensas;
begin
  select * into v_ind from public.indicacoes where id = p_indicacao_id for update;
  if not found then
    raise exception 'indicacao_nao_encontrada';
  end if;
  perform public.exigir_membro(v_ind.espaco_id);

  if p_status not in ('recebida', 'contatada', 'visita_agendada', 'orcamento_enviado', 'evento_realizado',
                      'perdida', 'invalida', 'duplicada') then
    raise exception 'status_invalido';
  end if;
  if p_status = v_ind.status then
    return jsonb_build_object('id', p_indicacao_id, 'status', p_status);
  end if;
  -- Revisão manual de inválida/duplicada: só dono/gerente, com motivo.
  if v_ind.status in ('invalida', 'duplicada') then
    perform public.exigir_membro(v_ind.espaco_id, array['dono', 'gerente']);
    if coalesce(trim(p_motivo), '') = '' then
      raise exception 'motivo_obrigatorio';
    end if;
  end if;
  if p_status in ('invalida', 'duplicada', 'perdida') and coalesce(trim(p_motivo), '') = '' then
    raise exception 'motivo_obrigatorio';
  end if;
  if p_status = 'evento_realizado' and v_ind.status <> 'fechada' then
    raise exception 'evento_exige_fechamento';
  end if;
  if v_ind.status in ('fechada', 'evento_realizado') and p_status not in ('evento_realizado', 'perdida') then
    raise exception 'status_nao_permite_voltar';
  end if;

  update public.indicacoes set status = p_status, motivo_status = nullif(trim(coalesce(p_motivo, '')), '')
   where id = p_indicacao_id;

  if p_status in ('perdida', 'invalida', 'duplicada') then
    for r in select * from public.recompensas where indicacao_id = p_indicacao_id and status in ('prevista', 'aprovada') loop
      update public.recompensas set status = 'cancelada', motivo_cancelamento = 'Indicação ' || p_status || ': ' || p_motivo
       where id = r.id;
      perform public.registrar_evento(v_ind.espaco_id, 'recompensa_cancelada', v_ind.id, r.id, r.parceiro_id, r.status, 'cancelada',
        jsonb_build_object('motivo', p_motivo));
    end loop;
  end if;

  perform public.verificar_recompensas(p_indicacao_id);
  return jsonb_build_object('id', p_indicacao_id, 'status', p_status);
end;
$$;

-- Edição manual de dados da indicação (auditada com antes/depois).
create or replace function public.editar_indicacao(
  p_indicacao_id uuid,
  p_dados jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ind public.indicacoes;
  v_antes jsonb;
begin
  select * into v_ind from public.indicacoes where id = p_indicacao_id for update;
  if not found then
    raise exception 'indicacao_nao_encontrada';
  end if;
  perform public.exigir_membro(v_ind.espaco_id);
  v_antes := jsonb_build_object('nome_indicado', v_ind.nome_indicado, 'email_indicado', v_ind.email_indicado,
    'tipo_evento_interesse', v_ind.tipo_evento_interesse, 'data_evento_estimada', v_ind.data_evento_estimada,
    'num_convidados_estimado', v_ind.num_convidados_estimado, 'observacoes', v_ind.observacoes);
  update public.indicacoes set
    nome_indicado = coalesce(nullif(trim(p_dados ->> 'nome_indicado'), ''), nome_indicado),
    email_indicado = case when p_dados ? 'email_indicado' then nullif(lower(trim(p_dados ->> 'email_indicado')), '') else email_indicado end,
    tipo_evento_interesse = case when p_dados ? 'tipo_evento_interesse' then p_dados ->> 'tipo_evento_interesse' else tipo_evento_interesse end,
    data_evento_estimada = case when p_dados ? 'data_evento_estimada' then nullif(p_dados ->> 'data_evento_estimada', '')::date else data_evento_estimada end,
    num_convidados_estimado = case when p_dados ? 'num_convidados_estimado' then nullif(p_dados ->> 'num_convidados_estimado', '')::int else num_convidados_estimado end,
    observacoes = case when p_dados ? 'observacoes' then p_dados ->> 'observacoes' else observacoes end
  where id = p_indicacao_id;
  perform public.registrar_evento(v_ind.espaco_id, 'edicao', v_ind.id, null, v_ind.indicador_parceiro_id, null, null,
    jsonb_build_object('antes', v_antes, 'alteracoes', p_dados));
end;
$$;

-- -----------------------------------------------------------------------------
-- Permissões: funções internas não ficam expostas pela API.
-- -----------------------------------------------------------------------------
revoke execute on function public._registrar_indicacao(uuid, text, text, uuid, uuid, text, text, text, text, text, text, date, int, text, boolean, text, text, text, text, text, text) from public, anon, authenticated;
revoke execute on function public.registrar_indicacao_publica(text, text, text, text, text, text, date, int, text, boolean, text, text, text, text) from public, anon, authenticated;
revoke execute on function public.calcular_recompensas(uuid) from public, anon, authenticated;
revoke execute on function public.verificar_recompensas(uuid) from public, anon, authenticated;
revoke execute on function public.enfileirar_mensagem(uuid, text, text, text, text, text, uuid, text) from public, anon, authenticated;
revoke execute on function public.registrar_evento(uuid, text, uuid, uuid, uuid, text, text, jsonb) from public, anon, authenticated;
revoke execute on function public.avaliar_parceiro_suspeito(uuid) from public, anon, authenticated;
revoke execute on function public.condicao_atendida(text, public.indicacoes) from public, anon, authenticated;
grant execute on function public.registrar_indicacao_publica(text, text, text, text, text, text, date, int, text, boolean, text, text, text, text) to service_role;
grant execute on function public._registrar_indicacao(uuid, text, text, uuid, uuid, text, text, text, text, text, text, date, int, text, boolean, text, text, text, text, text, text) to service_role;
grant execute on function public.verificar_recompensas(uuid) to service_role;
grant execute on function public.calcular_recompensas(uuid) to service_role;
grant execute on function public.enfileirar_mensagem(uuid, text, text, text, text, text, uuid, text) to service_role;
revoke execute on function public.registrar_indicacao_comercial(uuid, text, uuid, uuid, text, text, text, text, text, text, date, int, text, boolean) from public, anon;
revoke execute on function public.fechar_indicacao(uuid, numeric, uuid, numeric) from public, anon;
revoke execute on function public.alterar_status_indicacao(uuid, text, text) from public, anon;
revoke execute on function public.editar_indicacao(uuid, jsonb) from public, anon;
