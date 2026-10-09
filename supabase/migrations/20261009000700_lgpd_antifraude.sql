-- =============================================================================
-- Fase 5: LGPD (pedido do titular, bloqueio, anonimização) e travas extras
-- =============================================================================

-- Qualquer bloqueio novo cancela na hora o que estiver pendente na fila.
create or replace function public.bloqueio_aplica_fila()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.fila_envios
     set status = 'bloqueado'
   where espaco_id = new.espaco_id and destino = new.telefone and status = 'pendente';
  return new;
end;
$$;

drop trigger if exists bloqueio_contato_fila on public.bloqueio_contato;
create trigger bloqueio_contato_fila after insert on public.bloqueio_contato
  for each row execute function public.bloqueio_aplica_fila();

-- A fila não pode ser "desbloqueada" nem redirecionada pela API.
create or replace function public.proteger_fila_envios()
returns trigger
language plpgsql
as $$
begin
  if old.status = 'bloqueado' and new.status <> 'bloqueado' then
    raise exception 'contato_bloqueado';
  end if;
  if new.destino is distinct from old.destino or new.mensagem is distinct from old.mensagem then
    raise exception 'sem_permissao';
  end if;
  if new.status = 'pendente' and old.status <> 'pendente'
     and exists (select 1 from public.bloqueio_contato b where b.espaco_id = new.espaco_id and b.telefone = new.destino) then
    raise exception 'contato_bloqueado';
  end if;
  return new;
end;
$$;

drop trigger if exists fila_envios_protecao on public.fila_envios;
create trigger fila_envios_protecao before update on public.fila_envios
  for each row execute function public.proteger_fila_envios();

-- Pedido do titular pela página pública /privacidade/exclusao.
-- O bloqueio de contato é IMEDIATO; a exclusão/anonimização é feita pelo
-- dono após conferir a identidade (evita apagar dados de terceiros por engano).
create or replace function public.solicitar_lgpd_publico(
  p_espaco_slug text,
  p_tipo text,
  p_nome text,
  p_telefone text,
  p_email text,
  p_mensagem text,
  p_ip text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_espaco public.espacos;
  v_tel text := public.normalizar_telefone(p_telefone);
  v_id uuid;
begin
  perform set_config('app.ator_tipo', 'publico', true);
  select * into v_espaco from public.espacos where slug = p_espaco_slug;
  if not found then
    raise exception 'espaco_nao_encontrado';
  end if;
  if v_tel is null and coalesce(trim(p_email), '') = '' then
    raise exception 'telefone_invalido';
  end if;
  if p_tipo not in ('exclusao', 'oposicao', 'acesso') then
    raise exception 'status_invalido';
  end if;

  insert into public.solicitacoes_lgpd (espaco_id, tipo, nome, telefone, email, mensagem, ip)
  values (v_espaco.id, p_tipo, nullif(trim(coalesce(p_nome, '')), ''), v_tel, nullif(lower(trim(coalesce(p_email, ''))), ''),
          nullif(trim(coalesce(p_mensagem, '')), ''), p_ip)
  returning id into v_id;

  if v_tel is not null and p_tipo in ('exclusao', 'oposicao') then
    insert into public.bloqueio_contato (espaco_id, telefone, motivo, origem)
    values (v_espaco.id, v_tel, 'Pedido do titular (' || p_tipo || ')', 'pedido_titular')
    on conflict (espaco_id, telefone) do nothing;
  end if;

  insert into public.alertas (espaco_id, tipo, titulo, descricao, referencia_tabela, referencia_id, para_papeis)
  values (v_espaco.id, 'solicitacao_lgpd', 'Pedido LGPD (' || p_tipo || ')',
          'Prazo recomendado de resposta: 15 dias. O contato já foi bloqueado para mensagens.',
          'solicitacoes_lgpd', v_id, array['dono', 'gerente']);
  return jsonb_build_object('id', v_id);
end;
$$;

-- Anonimiza os dados pessoais de um contato no espaço. Mantém valores e
-- registros financeiros (obrigação legal/contábil) e o telefone na lista de
-- bloqueio (necessário para continuar respeitando o opt-out).
create or replace function public.anonimizar_contato(p_espaco_id uuid, p_telefone text, p_solicitacao_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tel text := public.normalizar_telefone(p_telefone);
  v_ind int;
  v_leads int;
begin
  perform public.exigir_membro(p_espaco_id, array['dono', 'gerente']);
  if v_tel is null then
    raise exception 'telefone_invalido';
  end if;

  insert into public.bloqueio_contato (espaco_id, telefone, motivo, origem)
  values (p_espaco_id, v_tel, 'Anonimização a pedido do titular', 'pedido_titular')
  on conflict (espaco_id, telefone) do nothing;

  update public.indicacoes
     set nome_indicado = 'Anonimizado', telefone_indicado = 'anonimizado-' || left(id::text, 8), email_indicado = null,
         observacoes = null, consentimento_ip = null, user_agent = null, ip_hash = null, anonimizada_em = now()
   where espaco_id = p_espaco_id and telefone_indicado = v_tel;
  get diagnostics v_ind = row_count;

  update public.leads
     set nome = 'Anonimizado', telefone = null, email = null, observacoes = null
   where espaco_id = p_espaco_id and telefone = v_tel;
  get diagnostics v_leads = row_count;

  update public.fila_envios
     set status = case when status = 'pendente' then 'bloqueado' else status end
   where espaco_id = p_espaco_id and destino = v_tel;

  if p_solicitacao_id is not null then
    update public.solicitacoes_lgpd
       set status = 'concluida', concluida_em = now(), concluida_por = auth.uid(),
           resposta = coalesce(resposta, format('Dados anonimizados (%s indicações, %s leads).', v_ind, v_leads))
     where id = p_solicitacao_id and espaco_id = p_espaco_id;
  end if;

  perform public.registrar_evento(p_espaco_id, 'lgpd_anonimizacao', null, null, null, null, null,
    jsonb_build_object('indicacoes', v_ind, 'leads', v_leads, 'solicitacao_id', p_solicitacao_id));
  return jsonb_build_object('indicacoes', v_ind, 'leads', v_leads);
end;
$$;

create or replace function public.responder_solicitacao_lgpd(p_id uuid, p_status text, p_resposta text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_s public.solicitacoes_lgpd;
begin
  select * into v_s from public.solicitacoes_lgpd where id = p_id;
  if not found then
    raise exception 'indicacao_nao_encontrada';
  end if;
  perform public.exigir_membro(v_s.espaco_id, array['dono', 'gerente']);
  if p_status not in ('concluida', 'recusada') then
    raise exception 'status_invalido';
  end if;
  update public.solicitacoes_lgpd
     set status = p_status, resposta = p_resposta, concluida_em = now(), concluida_por = auth.uid()
   where id = p_id;
end;
$$;

-- Retenção: anonimiza indicações sem andamento há mais de N meses
-- (recebidas/perdidas/inválidas/duplicadas, sem festa). Rodar mensalmente.
create or replace function public.anonimizar_indicacoes_antigas(p_espaco_id uuid, p_meses int default 24)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_qtd int;
begin
  if auth.uid() is not null then
    perform public.exigir_membro(p_espaco_id, array['dono']);
  end if;
  update public.indicacoes
     set nome_indicado = 'Anonimizado', telefone_indicado = 'anonimizado-' || left(id::text, 8), email_indicado = null,
         observacoes = null, consentimento_ip = null, user_agent = null, ip_hash = null, anonimizada_em = now()
   where espaco_id = p_espaco_id and anonimizada_em is null and festa_id is null
     and status in ('recebida', 'perdida', 'invalida', 'duplicada')
     and status_atualizado_em < now() - make_interval(months => p_meses);
  get diagnostics v_qtd = row_count;
  return v_qtd;
end;
$$;

-- Utilitário de implantação: dá acesso de equipe a um usuário já cadastrado
-- no Supabase Auth (rodar no SQL Editor).
create or replace function public.adicionar_membro_por_email(p_espaco_slug text, p_email text, p_papel text default 'dono')
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user uuid;
  v_espaco uuid;
begin
  select id into v_user from auth.users where lower(email) = lower(trim(p_email));
  if v_user is null then
    raise exception 'Usuário % não existe no Supabase Auth: entre uma vez pelo /login e rode de novo.', p_email;
  end if;
  select id into v_espaco from public.espacos where slug = p_espaco_slug;
  if v_espaco is null then
    raise exception 'espaco_nao_encontrado';
  end if;
  insert into public.membros_espaco (espaco_id, user_id, papel) values (v_espaco, v_user, p_papel)
  on conflict (espaco_id, user_id) do update set papel = excluded.papel;
  return v_user;
end;
$$;

revoke execute on function public.solicitar_lgpd_publico(text, text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.solicitar_lgpd_publico(text, text, text, text, text, text, text) to service_role;
revoke execute on function public.anonimizar_contato(uuid, text, uuid) from public, anon;
revoke execute on function public.responder_solicitacao_lgpd(uuid, text, text) from public, anon;
revoke execute on function public.anonimizar_indicacoes_antigas(uuid, int) from public, anon;
grant execute on function public.anonimizar_indicacoes_antigas(uuid, int) to service_role;
revoke execute on function public.adicionar_membro_por_email(text, text, text) from public, anon, authenticated;
revoke execute on function public.bloqueio_aplica_fila() from public, anon, authenticated;
