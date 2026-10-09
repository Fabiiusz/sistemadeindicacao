-- =============================================================================
-- Fase 4: funil (lead <-> indicação), festa -> aprovação, pagamentos manuais,
-- alertas de prazo, métricas e avisos automáticos ao indicador
-- =============================================================================

-- "R$ 1.234,50" independente do locale do servidor
create or replace function public.moeda_br(p numeric)
returns text
language sql
immutable
as $$
  select case when p is null then null else
    'R$ ' || replace(replace(replace(to_char(p, 'FM999,999,999,990.00'), ',', '#'), '.', ','), '#', '.') end;
$$;

create or replace function public.etapa_para_status(p_etapa text)
returns text
language sql
immutable
as $$
  select case p_etapa
    when 'novo' then 'recebida'
    when 'contatado' then 'contatada'
    when 'visita_agendada' then 'visita_agendada'
    when 'orcamento_enviado' then 'orcamento_enviado'
    when 'ganho' then 'fechada'
    when 'perdido' then 'perdida'
  end;
$$;

create or replace function public.status_para_etapa(p_status text)
returns text
language sql
immutable
as $$
  select case p_status
    when 'recebida' then 'novo'
    when 'contatada' then 'contatado'
    when 'visita_agendada' then 'visita_agendada'
    when 'orcamento_enviado' then 'orcamento_enviado'
    when 'fechada' then 'ganho'
    when 'evento_realizado' then 'ganho'
    when 'perdida' then 'perdido'
  end;
$$;

create or replace function public.ordem_status(p_status text)
returns int
language sql
immutable
as $$
  select case p_status
    when 'recebida' then 0 when 'contatada' then 1 when 'visita_agendada' then 2
    when 'orcamento_enviado' then 3 when 'fechada' then 4 when 'evento_realizado' then 5
  end;
$$;

create or replace function public.cancelar_recompensas_abertas(p_indicacao_id uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.recompensas;
begin
  for r in select * from public.recompensas where indicacao_id = p_indicacao_id and status = 'prevista' loop
    update public.recompensas set status = 'cancelada', motivo_cancelamento = p_motivo where id = r.id;
    perform public.registrar_evento(r.espaco_id, 'recompensa_cancelada', p_indicacao_id, r.id, r.parceiro_id,
      'prevista', 'cancelada', jsonb_build_object('motivo', p_motivo));
  end loop;
end;
$$;

-- -----------------------------------------------------------------------------
-- Lead (pipeline) -> indicação
-- -----------------------------------------------------------------------------
create or replace function public.sincronizar_lead_para_indicacao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  i public.indicacoes;
  v_status text := public.etapa_para_status(new.etapa);
begin
  -- Sem checar profundidade: os guardas de igualdade encerram o ciclo lead <-> indicação.
  if v_status is null or (new.etapa is not distinct from old.etapa and new.valor_fechado is not distinct from old.valor_fechado) then
    return new;
  end if;
  for i in select * from public.indicacoes
            where lead_id = new.id and status not in ('invalida', 'duplicada') for update loop
    if v_status = 'fechada' and i.status in ('fechada', 'evento_realizado') then
      -- valor informado/corrigido no lead: recalcula só o que ainda está previsto
      if new.valor_fechado is not null and new.valor_fechado is distinct from i.valor_fechado then
        update public.indicacoes set valor_fechado = new.valor_fechado where id = i.id;
        perform public.registrar_evento(i.espaco_id, 'edicao', i.id, null, i.indicador_parceiro_id, null, null,
          jsonb_build_object('valor_fechado_antes', i.valor_fechado, 'valor_fechado', new.valor_fechado, 'via', 'pipeline'));
        perform public.calcular_recompensas(i.id);
      end if;
      continue;
    end if;
    if v_status = i.status then
      continue;
    end if;
    -- indicação fechada só "volta" se o lead for perdido (contrato desfeito)
    if i.status in ('fechada', 'evento_realizado') and v_status <> 'perdida' then
      continue;
    end if;
    if v_status = 'fechada' then
      update public.indicacoes
         set status = 'fechada', fechada_em = coalesce(fechada_em, now()),
             valor_fechado = coalesce(new.valor_fechado, valor_fechado), motivo_status = null
       where id = i.id;
      perform public.calcular_recompensas(i.id);
      if new.valor_fechado is null then
        insert into public.alertas (espaco_id, tipo, titulo, descricao, referencia_tabela, referencia_id)
        values (i.espaco_id, 'informar_valor', 'Informe o valor fechado: ' || i.nome_indicado,
                'O lead foi marcado como ganho, mas sem valor. A comissão percentual só é calculada com o valor.',
                'indicacoes', i.id);
      end if;
    elsif v_status = 'perdida' then
      update public.indicacoes set status = 'perdida', motivo_status = 'Lead marcado como perdido no pipeline' where id = i.id;
      perform public.cancelar_recompensas_abertas(i.id, 'Indicação perdida (pipeline)');
    else
      update public.indicacoes set status = v_status where id = i.id;
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists leads_sincroniza_indicacao on public.leads;
create trigger leads_sincroniza_indicacao after update of etapa, valor_fechado on public.leads
  for each row execute function public.sincronizar_lead_para_indicacao();

-- -----------------------------------------------------------------------------
-- Indicação -> lead (pipeline) e avisos ao indicador
-- -----------------------------------------------------------------------------
create or replace function public.sincronizar_indicacao_para_lead()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_etapa text := public.status_para_etapa(new.status);
  v_parc public.parceiros;
  v_espaco public.espacos;
  v_msg text;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  if new.lead_id is not null and v_etapa is not null
     and new.status not in ('invalida', 'duplicada') then
    update public.leads
       set etapa = v_etapa,
           valor_fechado = case when v_etapa = 'ganho' then coalesce(new.valor_fechado, valor_fechado) else valor_fechado end
     where id = new.lead_id and (etapa is distinct from v_etapa
       or (v_etapa = 'ganho' and valor_fechado is distinct from coalesce(new.valor_fechado, valor_fechado)));
  end if;

  -- Avisos ao parceiro (fila wa.me), só para marcos importantes
  if new.indicador_parceiro_id is not null and new.status in ('visita_agendada', 'fechada', 'evento_realizado') then
    select * into v_parc from public.parceiros where id = new.indicador_parceiro_id;
    if v_parc.status = 'ativo' then
      select * into v_espaco from public.espacos where id = new.espaco_id;
      v_msg := case new.status
        when 'visita_agendada' then format('Boa notícia, %s! Sua indicação %s agendou uma visita no %s. 🙌',
                                           split_part(v_parc.nome, ' ', 1), public.mascarar_nome(new.nome_indicado), v_espaco.nome)
        when 'fechada' then format('%s, sua indicação %s FECHOU com o %s! 🎉 Sua comissão aparece no painel e é aprovada conforme as regras do programa.',
                                   split_part(v_parc.nome, ' ', 1), public.mascarar_nome(new.nome_indicado), v_espaco.nome)
        else format('%s, o evento da sua indicação %s aconteceu! Obrigado pela parceria. 💜',
                    split_part(v_parc.nome, ' ', 1), public.mascarar_nome(new.nome_indicado))
      end;
      perform public.enfileirar_mensagem(new.espaco_id, v_parc.telefone, v_msg, 'aviso_parceiro', v_parc.nome, 'indicacoes', new.id);
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists indicacoes_sincroniza_lead on public.indicacoes;
create trigger indicacoes_sincroniza_lead after update of status on public.indicacoes
  for each row execute function public.sincronizar_indicacao_para_lead();

-- -----------------------------------------------------------------------------
-- Festa: sinal pago / realizada / cancelada -> indicação e recompensas
-- -----------------------------------------------------------------------------
create or replace function public.festa_atualiza_indicacoes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  i public.indicacoes;
begin
  if tg_op = 'INSERT' then
    -- liga a festa à indicação fechada do mesmo lead
    if new.lead_id is not null then
      update public.indicacoes set festa_id = new.id
       where lead_id = new.lead_id and festa_id is null and status not in ('invalida', 'duplicada');
    end if;
    return new;
  end if;

  for i in select * from public.indicacoes where festa_id = new.id and status not in ('invalida', 'duplicada') loop
    if new.status = 'realizada' and old.status is distinct from 'realizada' and i.status = 'fechada' then
      update public.indicacoes set status = 'evento_realizado' where id = i.id;
    elsif new.status = 'cancelada' and old.status is distinct from 'cancelada' and i.status in ('fechada', 'evento_realizado') then
      update public.indicacoes set status = 'perdida', motivo_status = 'Festa cancelada' where id = i.id;
      perform public.cancelar_recompensas_abertas(i.id, 'Festa cancelada');
      if exists (select 1 from public.recompensas where indicacao_id = i.id and status = 'aprovada') then
        insert into public.alertas (espaco_id, tipo, titulo, descricao, referencia_tabela, referencia_id, para_papeis)
        values (i.espaco_id, 'revisar_recompensa', 'Festa cancelada com recompensa aprovada: ' || i.nome_indicado,
                'Decida se a recompensa aprovada deve ser cancelada ou mantida.', 'indicacoes', i.id, array['dono', 'gerente']);
      end if;
    end if;
    if new.valor_sinal is distinct from old.valor_sinal and i.valor_sinal is null then
      update public.indicacoes set valor_sinal = new.valor_sinal where id = i.id;
    end if;
    perform public.calcular_recompensas(i.id);
  end loop;
  return new;
end;
$$;

drop trigger if exists festas_atualiza_indicacoes on public.festas;
create trigger festas_atualiza_indicacoes after insert or update on public.festas
  for each row execute function public.festa_atualiza_indicacoes();

-- -----------------------------------------------------------------------------
-- Recompensas: avisos e pagamento manual
-- -----------------------------------------------------------------------------
create or replace function public.recompensa_avisos()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_parc public.parceiros;
  v_cli public.indicadores_clientes;
  v_valor text := coalesce(public.moeda_br(new.valor), '');
begin
  if new.status is not distinct from old.status or new.status not in ('aprovada', 'paga') then
    return new;
  end if;
  if new.beneficiario = 'parceiro' and new.parceiro_id is not null then
    select * into v_parc from public.parceiros where id = new.parceiro_id;
    perform public.enfileirar_mensagem(new.espaco_id, v_parc.telefone,
      case new.status
        when 'aprovada' then format('%s, sua comissão %s foi APROVADA! ✅ O pagamento é feito pelo espaço via Pix; acompanhe no painel.',
                                    split_part(v_parc.nome, ' ', 1), nullif(v_valor, ''))
        else format('%s, sua comissão %s foi PAGA em %s. 💸 Obrigado pela parceria!',
                    split_part(v_parc.nome, ' ', 1), nullif(v_valor, ''), to_char(new.paga_em, 'DD/MM/YYYY'))
      end,
      'aviso_parceiro', v_parc.nome, 'recompensas', new.id);
  elsif new.beneficiario = 'cliente_indicador' and new.indicador_cliente_id is not null and new.status = 'aprovada' then
    select * into v_cli from public.indicadores_clientes where id = new.indicador_cliente_id;
    perform public.enfileirar_mensagem(new.espaco_id, v_cli.telefone,
      format('%s, seu amigo fechou a festa com a gente! 🎉 Seu benefício (%s) foi liberado. Fale com a equipe para usar.',
             split_part(v_cli.nome, ' ', 1), coalesce(new.descricao, 'recompensa')),
      'aviso_cliente', v_cli.nome, 'recompensas', new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists recompensas_avisos on public.recompensas;
create trigger recompensas_avisos after update of status on public.recompensas
  for each row execute function public.recompensa_avisos();

-- Pagamento é SEMPRE manual: dono/gerente registra data, forma e comprovante.
create or replace function public.marcar_recompensa_paga(
  p_recompensa_id uuid,
  p_paga_em date,
  p_forma text,
  p_comprovante_url text default null,
  p_observacoes text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.recompensas;
begin
  select * into r from public.recompensas where id = p_recompensa_id for update;
  if not found then
    raise exception 'recompensa_nao_encontrada';
  end if;
  perform public.exigir_membro(r.espaco_id, array['dono', 'gerente']);
  if r.status <> 'aprovada' then
    raise exception 'recompensa_nao_aprovada';
  end if;
  update public.recompensas
     set status = 'paga', paga_em = coalesce(p_paga_em, current_date), forma_pagamento = nullif(trim(coalesce(p_forma, '')), ''),
         comprovante_url = nullif(trim(coalesce(p_comprovante_url, '')), ''),
         observacoes = coalesce(nullif(trim(coalesce(p_observacoes, '')), ''), observacoes), pago_por = auth.uid()
   where id = p_recompensa_id;
  perform public.registrar_evento(r.espaco_id, 'recompensa_paga', r.indicacao_id, r.id, r.parceiro_id, 'aprovada', 'paga',
    jsonb_build_object('paga_em', coalesce(p_paga_em, current_date), 'forma', p_forma, 'valor', r.valor));
end;
$$;

create or replace function public.cancelar_recompensa(p_recompensa_id uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.recompensas;
begin
  select * into r from public.recompensas where id = p_recompensa_id for update;
  if not found then
    raise exception 'recompensa_nao_encontrada';
  end if;
  perform public.exigir_membro(r.espaco_id, array['dono', 'gerente']);
  if coalesce(trim(p_motivo), '') = '' then
    raise exception 'motivo_obrigatorio';
  end if;
  if r.status = 'paga' then
    raise exception 'status_invalido';
  end if;
  update public.recompensas set status = 'cancelada', motivo_cancelamento = p_motivo where id = p_recompensa_id;
  perform public.registrar_evento(r.espaco_id, 'recompensa_cancelada', r.indicacao_id, r.id, r.parceiro_id, r.status, 'cancelada',
    jsonb_build_object('motivo', p_motivo));
end;
$$;

-- Ajuste manual de valor (ex.: brinde precificado, acordo) com justificativa.
create or replace function public.ajustar_valor_recompensa(p_recompensa_id uuid, p_valor numeric, p_justificativa text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.recompensas;
begin
  select * into r from public.recompensas where id = p_recompensa_id for update;
  if not found then
    raise exception 'recompensa_nao_encontrada';
  end if;
  perform public.exigir_membro(r.espaco_id, array['dono', 'gerente']);
  if coalesce(length(trim(p_justificativa)), 0) < 5 then
    raise exception 'justificativa_obrigatoria';
  end if;
  if r.status not in ('prevista', 'aprovada') or p_valor is null or p_valor < 0 then
    raise exception 'status_invalido';
  end if;
  update public.recompensas set valor = round(p_valor, 2) where id = p_recompensa_id;
  perform public.registrar_evento(r.espaco_id, 'recompensa_ajustada', r.indicacao_id, r.id, r.parceiro_id,
    r.valor::text, round(p_valor, 2)::text, jsonb_build_object('justificativa', p_justificativa));
  perform public.verificar_recompensas(r.indicacao_id);
end;
$$;

-- -----------------------------------------------------------------------------
-- Alertas de prazo (calculados; RLS da equipe via security_invoker)
-- -----------------------------------------------------------------------------
create or replace view public.alertas_prazos
with (security_invoker = true)
as
  select i.espaco_id, 'sem_contato_24h'::text as tipo,
         'Indicação sem contato há mais de 24h: ' || i.nome_indicado as titulo,
         'Recebida em ' || public.data_br(i.criado_em) || '. Fale com o indicado o quanto antes.' as descricao,
         'indicacoes'::text as referencia_tabela, i.id as referencia_id, i.criado_em as desde
    from public.indicacoes i
   where i.status = 'recebida' and i.criado_em < now() - interval '24 hours'
  union all
  select i.espaco_id, 'parada_5_dias',
         'Indicação parada há mais de 5 dias: ' || i.nome_indicado,
         'Na etapa "' || replace(i.status, '_', ' ') || '" desde ' || public.data_br(i.status_atualizado_em) || '.',
         'indicacoes', i.id, i.status_atualizado_em
    from public.indicacoes i
   where i.status in ('contatada', 'visita_agendada', 'orcamento_enviado')
     and i.status_atualizado_em < now() - interval '5 days'
  union all
  select r.espaco_id, 'pagamento_atrasado',
         'Recompensa aprovada há mais de 15 dias sem pagamento',
         coalesce(p.nome, c.nome, 'Indicado') || ' · ' || coalesce(public.moeda_br(r.valor), r.descricao, '') ||
           ' · aprovada em ' || public.data_br(r.aprovada_em),
         'recompensas', r.id, r.aprovada_em
    from public.recompensas r
    left join public.parceiros p on p.id = r.parceiro_id
    left join public.indicadores_clientes c on c.id = r.indicador_cliente_id
   where r.status = 'aprovada' and r.aprovada_em < now() - interval '15 days';

grant select on public.alertas_prazos to authenticated;

-- -----------------------------------------------------------------------------
-- Métricas do painel de indicações (com comparação entre canais)
-- -----------------------------------------------------------------------------
create or replace function public.metricas_indicacoes(
  p_espaco_id uuid,
  p_de date default null,
  p_ate date default null,
  p_origem text default null,
  p_parceiro_id uuid default null,
  p_tipo_evento text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v jsonb;
  v_canais jsonb;
begin
  perform public.exigir_membro(p_espaco_id);

  with base as (
    select i.* from public.indicacoes i
     where i.espaco_id = p_espaco_id
       and (p_de is null or i.criado_em >= p_de)
       and (p_ate is null or i.criado_em < p_ate + 1)
       and (p_origem is null or i.origem = p_origem)
       and (p_parceiro_id is null or i.indicador_parceiro_id = p_parceiro_id)
       and (p_tipo_evento is null or i.tipo_evento_interesse = p_tipo_evento)
  ), alcance as (
    -- etapa máxima alcançada (status atual ou histórico), p/ perdidas também contarem
    select b.id,
           greatest(coalesce(public.ordem_status(b.status), -1),
                    coalesce((select max(public.ordem_status(e.para)) from public.indicacao_eventos e
                               where e.indicacao_id = b.id and e.tipo = 'status'), -1)) as etapa
      from base b where b.status not in ('invalida', 'duplicada')
  ), rec as (
    select r.* from public.recompensas r join base b on b.id = r.indicacao_id
     where r.beneficiario in ('parceiro', 'cliente_indicador')
  )
  select jsonb_build_object(
    'recebidas', (select count(*) from base),
    'validas', (select count(*) from alcance),
    'invalidas', (select count(*) from base where status = 'invalida'),
    'duplicadas', (select count(*) from base where status = 'duplicada'),
    'contatadas', (select count(*) from alcance where etapa >= 1),
    'visitas', (select count(*) from alcance where etapa >= 2),
    'fechamentos', (select count(*) from base where status in ('fechada', 'evento_realizado')),
    'perdidas', (select count(*) from base where status = 'perdida'),
    'receita', (select coalesce(sum(valor_fechado), 0) from base where status in ('fechada', 'evento_realizado')),
    'comissao_paga', (select coalesce(sum(valor), 0) from rec where status = 'paga'),
    'comissao_aprovada', (select coalesce(sum(valor), 0) from rec where status = 'aprovada'),
    'comissao_prevista', (select coalesce(sum(valor), 0) from rec where status = 'prevista')
  ) into v;

  v := v || jsonb_build_object(
    'taxa_contato', case when (v ->> 'validas')::int = 0 then 0 else round(100.0 * (v ->> 'contatadas')::int / (v ->> 'validas')::int, 1) end,
    'taxa_conversao', case when (v ->> 'validas')::int = 0 then 0 else round(100.0 * (v ->> 'fechamentos')::int / (v ->> 'validas')::int, 1) end,
    'custo_por_fechamento', case when (v ->> 'fechamentos')::int = 0 then 0
      else round(((v ->> 'comissao_paga')::numeric + (v ->> 'comissao_aprovada')::numeric) / (v ->> 'fechamentos')::int, 2) end,
    'custo_por_indicacao', case when (v ->> 'validas')::int = 0 then 0
      else round(((v ->> 'comissao_paga')::numeric + (v ->> 'comissao_aprovada')::numeric) / (v ->> 'validas')::int, 2) end
  );

  -- Comparação com outros canais (leads do pipeline por origem)
  select coalesce(jsonb_agg(c order by c.leads desc), '[]'::jsonb) into v_canais
  from (
    select l.origem,
           count(*) as leads,
           count(*) filter (where l.etapa = 'ganho') as ganhos,
           coalesce(sum(l.valor_fechado) filter (where l.etapa = 'ganho'), 0) as receita,
           case when count(*) = 0 then 0 else round(100.0 * count(*) filter (where l.etapa = 'ganho') / count(*), 1) end as conversao
      from public.leads l
     where l.espaco_id = p_espaco_id
       and (p_de is null or l.criado_em >= p_de)
       and (p_ate is null or l.criado_em < p_ate + 1)
     group by l.origem
  ) c;

  return v || jsonb_build_object('canais', v_canais);
end;
$$;

revoke execute on function public.cancelar_recompensas_abertas(uuid, text) from public, anon, authenticated;
revoke execute on function public.marcar_recompensa_paga(uuid, date, text, text, text) from public, anon;
revoke execute on function public.cancelar_recompensa(uuid, text) from public, anon;
revoke execute on function public.ajustar_valor_recompensa(uuid, numeric, text) from public, anon;
revoke execute on function public.metricas_indicacoes(uuid, date, date, text, uuid, text) from public, anon;
