-- =============================================================================
-- Fase 2: Indicação por parceiros (cadastro, aprovação, painel do parceiro,
-- indicação manual pelo parceiro, ranking)
-- =============================================================================

-- Cadastro público (/parceiros/cadastro). Chamado pelo servidor (service role).
create or replace function public.cadastrar_parceiro_publico(
  p_espaco_slug text,
  p_nome text,
  p_empresa text,
  p_tipo text,
  p_telefone text,
  p_email text,
  p_documento text,
  p_chave_pix text,
  p_aceite_termos boolean,
  p_versao_termos text,
  p_ip text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_espaco public.espacos;
  v_tel text;
  v_id uuid;
  v_codigo text;
begin
  perform set_config('app.ator_tipo', 'publico', true);
  select * into v_espaco from public.espacos where slug = p_espaco_slug;
  if not found then
    raise exception 'espaco_nao_encontrado';
  end if;
  if coalesce(trim(p_nome), '') = '' then
    raise exception 'nome_obrigatorio';
  end if;
  v_tel := public.normalizar_telefone(p_telefone);
  if v_tel is null then
    raise exception 'telefone_invalido';
  end if;
  if p_aceite_termos is not true or coalesce(p_versao_termos, '') = '' then
    raise exception 'termos_obrigatorios';
  end if;
  if exists (select 1 from public.parceiros where espaco_id = v_espaco.id and telefone = v_tel) then
    raise exception 'parceiro_ja_cadastrado';
  end if;

  v_codigo := public.gerar_codigo_parceiro();
  insert into public.parceiros (espaco_id, nome, tipo, empresa, telefone, email, documento, chave_pix,
                                codigo_indicacao, status, aceite_termos_em, versao_termos, aceite_ip)
  values (v_espaco.id, trim(p_nome), coalesce(nullif(p_tipo, ''), 'outro'), nullif(trim(coalesce(p_empresa, '')), ''),
          v_tel, nullif(lower(trim(coalesce(p_email, ''))), ''),
          nullif(regexp_replace(coalesce(p_documento, ''), '\D', '', 'g'), ''),
          nullif(trim(coalesce(p_chave_pix, '')), ''), v_codigo, 'pendente', now(), p_versao_termos, p_ip)
  returning id into v_id;

  perform public.registrar_evento(v_espaco.id, 'parceiro_cadastrado', null, null, v_id, null, 'pendente',
    jsonb_build_object('versao_termos', p_versao_termos, 'ip', p_ip));
  insert into public.alertas (espaco_id, tipo, titulo, descricao, referencia_tabela, referencia_id, para_papeis)
  values (v_espaco.id, 'parceiro_pendente', 'Novo parceiro aguardando aprovação: ' || trim(p_nome),
          'Revise o cadastro e aprove ou recuse no painel de parceiros.', 'parceiros', v_id, array['dono', 'gerente']);

  return jsonb_build_object('id', v_id, 'status', 'pendente');
end;
$$;

-- Dono/gerente aprova, pausa ou bloqueia (com motivo auditado).
create or replace function public.alterar_status_parceiro(
  p_parceiro_id uuid,
  p_status text,
  p_motivo text default null,
  p_base_url text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_parc public.parceiros;
  v_espaco public.espacos;
begin
  select * into v_parc from public.parceiros where id = p_parceiro_id for update;
  if not found then
    raise exception 'parceiro_nao_encontrado';
  end if;
  perform public.exigir_membro(v_parc.espaco_id, array['dono', 'gerente']);
  if p_status not in ('pendente', 'ativo', 'pausado', 'bloqueado') then
    raise exception 'status_invalido';
  end if;
  if p_status in ('pausado', 'bloqueado') and coalesce(trim(p_motivo), '') = '' then
    raise exception 'motivo_obrigatorio';
  end if;
  if p_status = v_parc.status then
    return;
  end if;

  update public.parceiros
     set status = p_status,
         motivo_status = nullif(trim(coalesce(p_motivo, '')), ''),
         aprovado_em = case when p_status = 'ativo' and aprovado_em is null then now() else aprovado_em end,
         aprovado_por = case when p_status = 'ativo' and aprovado_em is null then auth.uid() else aprovado_por end
   where id = p_parceiro_id;

  perform public.registrar_evento(v_parc.espaco_id, 'parceiro_status', null, null, v_parc.id, v_parc.status, p_status,
    jsonb_build_object('motivo', p_motivo));

  if p_status = 'ativo' and v_parc.aprovado_em is null then
    select * into v_espaco from public.espacos where id = v_parc.espaco_id;
    perform public.enfileirar_mensagem(v_parc.espaco_id, v_parc.telefone,
      format(E'Olá, %s! Seu cadastro no programa de parceiros do %s foi aprovado. 🎉\n\nSeu link de indicação: %s/i/%s\nAcompanhe suas indicações e comissões em: %s/parceiro',
             split_part(v_parc.nome, ' ', 1), v_espaco.nome, coalesce(p_base_url, ''), v_parc.codigo_indicacao, coalesce(p_base_url, '')),
      'aviso_parceiro', v_parc.nome, 'parceiros', v_parc.id);
  end if;
end;
$$;

-- Liga o usuário logado ao cadastro de parceiro pelo e-mail ou telefone.
create or replace function public.vincular_parceiro_usuario()
returns setof public.parceiros
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(coalesce(auth.email(), auth.jwt() ->> 'email', ''));
  v_fone text := public.normalizar_telefone('+' || coalesce(auth.jwt() ->> 'phone', ''));
begin
  if auth.uid() is null then
    return;
  end if;
  update public.parceiros p
     set user_id = auth.uid()
   where p.user_id is null
     and ((v_email <> '' and lower(p.email) = v_email) or (v_fone is not null and p.telefone = v_fone));
  return query select * from public.parceiros where user_id = auth.uid() order by criado_em;
end;
$$;

-- Indicações do parceiro logado. NUNCA expõe telefone/e-mail e mascara o nome.
create or replace function public.minhas_indicacoes()
returns table (
  id uuid,
  nome_indicado text,
  tipo_evento_interesse text,
  data_evento_estimada date,
  status text,
  motivo_status text,
  criado_em timestamptz,
  canal text,
  recompensa_prevista numeric,
  recompensa_aprovada numeric,
  recompensa_paga numeric,
  recompensa_descricao text
)
language sql
stable
security definer
set search_path = public
as $$
  select i.id,
         public.mascarar_nome(i.nome_indicado),
         i.tipo_evento_interesse,
         i.data_evento_estimada,
         i.status,
         case when i.status in ('duplicada', 'invalida', 'perdida') then i.motivo_status end,
         i.criado_em,
         i.canal,
         sum(r.valor) filter (where r.status = 'prevista'),
         sum(r.valor) filter (where r.status = 'aprovada'),
         sum(r.valor) filter (where r.status = 'paga'),
         string_agg(distinct r.descricao, ', ') filter (where r.status <> 'cancelada')
    from public.indicacoes i
    join public.parceiros p on p.id = i.indicador_parceiro_id and p.user_id = auth.uid()
    left join public.recompensas r on r.indicacao_id = i.id and r.beneficiario = 'parceiro'
   where auth.uid() is not null
   group by i.id
   order by i.criado_em desc;
$$;

create or replace function public.minhas_recompensas()
returns table (
  id uuid,
  indicado text,
  tipo text,
  descricao text,
  valor numeric,
  status text,
  condicao text,
  aprovada_em timestamptz,
  paga_em date,
  forma_pagamento text,
  criado_em timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select r.id, public.mascarar_nome(i.nome_indicado), r.tipo, r.descricao, r.valor, r.status, r.condicao,
         r.aprovada_em, r.paga_em, r.forma_pagamento, r.criado_em
    from public.recompensas r
    join public.parceiros p on p.id = r.parceiro_id and p.user_id = auth.uid()
    join public.indicacoes i on i.id = r.indicacao_id
   where auth.uid() is not null and r.beneficiario = 'parceiro'
   order by r.criado_em desc;
$$;

-- Parceiro indica manualmente pelo painel (declara que o cliente autorizou).
create or replace function public.registrar_indicacao_parceiro(
  p_nome text,
  p_telefone text,
  p_tipo_evento text,
  p_data_evento date,
  p_convidados int,
  p_observacoes text,
  p_declaracao_autorizacao boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_parc public.parceiros;
  v_res jsonb;
begin
  select * into v_parc from public.parceiros where user_id = auth.uid() and status = 'ativo' order by criado_em limit 1;
  if not found then
    raise exception 'parceiro_inativo';
  end if;
  v_res := public._registrar_indicacao(v_parc.espaco_id, 'parceiro', 'painel_parceiro', v_parc.id, null, null, null,
    p_nome, p_telefone, null, p_tipo_evento, p_data_evento, p_convidados, p_observacoes,
    p_declaracao_autorizacao,
    'O parceiro declarou que o indicado autorizou ser contatado pelo espaço.',
    'consentimento (declarado pelo parceiro)', null, null, null);
  -- devolve só o necessário ao parceiro
  return jsonb_build_object('status', v_res ->> 'status', 'motivo', v_res ->> 'motivo');
end;
$$;

-- Ranking de parceiros (painel do dono).
create or replace function public.ranking_parceiros(
  p_espaco_id uuid,
  p_de date default null,
  p_ate date default null
)
returns table (
  parceiro_id uuid,
  nome text,
  empresa text,
  tipo text,
  status text,
  codigo_indicacao text,
  indicacoes bigint,
  validas bigint,
  invalidas bigint,
  fechamentos bigint,
  taxa_conversao numeric,
  receita numeric,
  comissao_prevista numeric,
  comissao_devida numeric,
  comissao_paga numeric,
  suspeito boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.exigir_membro(p_espaco_id);
  return query
  with ind as (
    select i.* from public.indicacoes i
     where i.espaco_id = p_espaco_id and i.indicador_parceiro_id is not null
       and (p_de is null or i.criado_em >= p_de)
       and (p_ate is null or i.criado_em < p_ate + 1)
  ), rec as (
    select r.parceiro_id,
           sum(r.valor) filter (where r.status = 'prevista') as prev,
           sum(r.valor) filter (where r.status = 'aprovada') as dev,
           sum(r.valor) filter (where r.status = 'paga') as paga
      from public.recompensas r
      join ind on ind.id = r.indicacao_id
     where r.beneficiario = 'parceiro'
     group by r.parceiro_id
  )
  select p.id, p.nome, p.empresa, p.tipo, p.status, p.codigo_indicacao,
         count(ind.id),
         count(ind.id) filter (where ind.status not in ('invalida', 'duplicada')),
         count(ind.id) filter (where ind.status in ('invalida', 'duplicada')),
         count(ind.id) filter (where ind.status in ('fechada', 'evento_realizado')),
         case when count(ind.id) filter (where ind.status not in ('invalida', 'duplicada')) = 0 then 0
              else round(100.0 * count(ind.id) filter (where ind.status in ('fechada', 'evento_realizado'))
                         / count(ind.id) filter (where ind.status not in ('invalida', 'duplicada')), 1) end,
         coalesce(sum(ind.valor_fechado) filter (where ind.status in ('fechada', 'evento_realizado')), 0),
         coalesce(max(rec.prev), 0), coalesce(max(rec.dev), 0), coalesce(max(rec.paga), 0),
         exists (select 1 from public.alertas a where a.referencia_id = p.id and a.tipo = 'parceiro_suspeito' and a.resolvido_em is null)
    from public.parceiros p
    left join ind on ind.indicador_parceiro_id = p.id
    left join rec on rec.parceiro_id = p.id
   where p.espaco_id = p_espaco_id
   group by p.id
   order by count(ind.id) filter (where ind.status in ('fechada', 'evento_realizado')) desc,
            coalesce(sum(ind.valor_fechado), 0) desc, count(ind.id) desc, p.nome;
end;
$$;

-- Dados do parceiro editáveis pelo próprio parceiro (Pix, e-mail).
create or replace function public.atualizar_meus_dados(p_email text, p_chave_pix text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_parc public.parceiros;
begin
  select * into v_parc from public.parceiros where user_id = auth.uid() order by criado_em limit 1;
  if not found then
    raise exception 'parceiro_nao_encontrado';
  end if;
  update public.parceiros
     set email = coalesce(nullif(lower(trim(coalesce(p_email, ''))), ''), email),
         chave_pix = nullif(trim(coalesce(p_chave_pix, '')), '')
   where id = v_parc.id;
  perform public.registrar_evento(v_parc.espaco_id, 'parceiro_dados', null, null, v_parc.id, null, null,
    jsonb_build_object('email_alterado', p_email is distinct from v_parc.email, 'pix_alterado', p_chave_pix is distinct from v_parc.chave_pix));
end;
$$;

-- Dono/gerente edita dados cadastrais do parceiro (auditado).
create or replace function public.editar_parceiro(p_parceiro_id uuid, p_dados jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_parc public.parceiros;
  v_tel text;
begin
  select * into v_parc from public.parceiros where id = p_parceiro_id for update;
  if not found then
    raise exception 'parceiro_nao_encontrado';
  end if;
  perform public.exigir_membro(v_parc.espaco_id, array['dono', 'gerente']);
  if p_dados ? 'telefone' then
    v_tel := public.normalizar_telefone(p_dados ->> 'telefone');
    if v_tel is null then
      raise exception 'telefone_invalido';
    end if;
  end if;
  update public.parceiros set
    nome = coalesce(nullif(trim(p_dados ->> 'nome'), ''), nome),
    empresa = case when p_dados ? 'empresa' then nullif(trim(p_dados ->> 'empresa'), '') else empresa end,
    tipo = coalesce(nullif(p_dados ->> 'tipo', ''), tipo),
    telefone = coalesce(v_tel, telefone),
    email = case when p_dados ? 'email' then nullif(lower(trim(p_dados ->> 'email')), '') else email end,
    documento = case when p_dados ? 'documento' then nullif(regexp_replace(p_dados ->> 'documento', '\D', '', 'g'), '') else documento end,
    chave_pix = case when p_dados ? 'chave_pix' then nullif(trim(p_dados ->> 'chave_pix'), '') else chave_pix end
  where id = p_parceiro_id;
  perform public.registrar_evento(v_parc.espaco_id, 'parceiro_editado', null, null, v_parc.id, null, null,
    jsonb_build_object('antes', to_jsonb(v_parc) - 'user_id', 'alteracoes', p_dados));
end;
$$;

revoke execute on function public.cadastrar_parceiro_publico(text, text, text, text, text, text, text, text, boolean, text, text) from public, anon, authenticated;
grant execute on function public.cadastrar_parceiro_publico(text, text, text, text, text, text, text, text, boolean, text, text) to service_role;
revoke execute on function public.alterar_status_parceiro(uuid, text, text, text) from public, anon;
revoke execute on function public.vincular_parceiro_usuario() from public, anon;
revoke execute on function public.minhas_indicacoes() from public, anon;
revoke execute on function public.minhas_recompensas() from public, anon;
revoke execute on function public.registrar_indicacao_parceiro(text, text, text, date, int, text, boolean) from public, anon;
revoke execute on function public.ranking_parceiros(uuid, date, date) from public, anon;
revoke execute on function public.atualizar_meus_dados(text, text) from public, anon;
revoke execute on function public.editar_parceiro(uuid, jsonb) from public, anon;

-- A regra vigente (inclusive exceções) só é lida pelo servidor.
revoke execute on function public.regra_vigente(uuid, text, uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.regra_vigente(uuid, text, uuid, timestamptz) to service_role;
