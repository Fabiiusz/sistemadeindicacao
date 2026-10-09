-- =============================================================================
-- Fase 3: Indicação por clientes (pós-festa, NPS, link /v/[codigo])
-- =============================================================================

-- Token aleatório para URL (sem depender do schema do pgcrypto no Supabase).
create or replace function public.gerar_token_url()
returns text
language sql
volatile
as $$
  select left(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 40);
$$;

-- Lote do dia: festas realizadas há X dias (config dias_pos_festa, padrão 2)
-- recebem mensagem pedindo avaliação + indicação com link /r/[token].
-- Idempotente: uma pesquisa por festa. Não volta mais de 30 dias.
create or replace function public.gerar_lote_pos_festa(
  p_espaco_id uuid,
  p_base_url text,
  p_data date default null
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_espaco public.espacos;
  v_dias int;
  v_hoje date := coalesce(p_data, (now() at time zone 'America/Sao_Paulo')::date);
  f public.festas;
  v_token text;
  v_pesquisa uuid;
  v_qtd int := 0;
begin
  -- Equipe pelo painel ou o servidor (cron com service role, sem usuário).
  if auth.uid() is not null then
    perform public.exigir_membro(p_espaco_id);
  end if;
  select * into v_espaco from public.espacos where id = p_espaco_id;
  if not found then
    raise exception 'espaco_nao_encontrado';
  end if;
  v_dias := coalesce((v_espaco.config ->> 'dias_pos_festa')::int, 2);

  for f in
    select * from public.festas
     where espaco_id = p_espaco_id
       and status <> 'cancelada'
       and anfitriao_telefone is not null
       and data_evento <= v_hoje - v_dias
       and data_evento >= v_hoje - v_dias - 30
       and not exists (select 1 from public.pesquisas_pos_festa p where p.festa_id = festas.id)
     order by data_evento
  loop
    v_token := public.gerar_token_url();
    insert into public.pesquisas_pos_festa (espaco_id, festa_id, token)
    values (p_espaco_id, f.id, v_token)
    returning id into v_pesquisa;
    -- enfileirar_mensagem respeita bloqueio_contato (fica como 'bloqueado').
    perform public.enfileirar_mensagem(p_espaco_id, f.anfitriao_telefone,
      format(E'Oi, %s! Aqui é do %s. 💜 Obrigado por celebrar com a gente!\n\nPode nos contar como foi? Leva 30 segundos: %s/r/%s',
             split_part(f.anfitriao_nome, ' ', 1), v_espaco.nome, coalesce(p_base_url, ''), v_token),
      'pos_festa', f.anfitriao_nome, 'pesquisas_pos_festa', v_pesquisa);
    v_qtd := v_qtd + 1;
  end loop;
  return v_qtd;
end;
$$;

-- Dados para a página pública /r/[token] (só o necessário).
create or replace function public.pesquisa_publica(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_p public.pesquisas_pos_festa;
  v_f public.festas;
  v_cli public.indicadores_clientes;
begin
  select * into v_p from public.pesquisas_pos_festa where token = p_token;
  if not found then
    return null;
  end if;
  select * into v_f from public.festas where id = v_p.festa_id;
  select * into v_cli from public.indicadores_clientes where festa_id = v_p.festa_id;
  return jsonb_build_object(
    'espaco_id', v_p.espaco_id,
    'primeiro_nome', split_part(v_f.anfitriao_nome, ' ', 1),
    'tipo_evento', v_f.tipo_evento,
    'respondida', v_p.respondida_em is not null,
    'nota', v_p.nota,
    'codigo', v_cli.codigo
  );
end;
$$;

-- Resposta do NPS. 9-10: vira cliente indicador (código /v). 0-6: alerta ao
-- dono e NÃO mostra indicação. Uma resposta por pesquisa.
create or replace function public.responder_pesquisa(
  p_token text,
  p_nota int,
  p_comentario text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_p public.pesquisas_pos_festa;
  v_f public.festas;
  v_codigo text;
  v_cli_id uuid;
begin
  perform set_config('app.ator_tipo', 'publico', true);
  select * into v_p from public.pesquisas_pos_festa where token = p_token for update;
  if not found then
    raise exception 'token_invalido';
  end if;
  if v_p.respondida_em is not null then
    raise exception 'pesquisa_ja_respondida';
  end if;
  if p_nota is null or p_nota < 0 or p_nota > 10 then
    raise exception 'nota_invalida';
  end if;
  select * into v_f from public.festas where id = v_p.festa_id;

  if p_nota >= 9 then
    select id, codigo into v_cli_id, v_codigo from public.indicadores_clientes where festa_id = v_f.id;
    if v_cli_id is null then
      v_codigo := public.gerar_codigo_parceiro();
      insert into public.indicadores_clientes (espaco_id, festa_id, nome, telefone, email, codigo)
      values (v_f.espaco_id, v_f.id, v_f.anfitriao_nome, v_f.anfitriao_telefone, lower(v_f.anfitriao_email), v_codigo)
      returning id into v_cli_id;
    end if;
  elsif p_nota <= 6 then
    insert into public.alertas (espaco_id, tipo, titulo, descricao, referencia_tabela, referencia_id, para_papeis)
    values (v_f.espaco_id, 'nps_detrator',
            format('Cliente insatisfeito (nota %s): %s', p_nota, v_f.anfitriao_nome),
            coalesce(nullif(trim(coalesce(p_comentario, '')), ''), 'Sem comentário.') ||
              format(E'\nFesta em %s. Entre em contato para entender e resolver.', to_char(v_f.data_evento, 'DD/MM/YYYY')),
            'festas', v_f.id, array['dono', 'gerente']);
  end if;

  update public.pesquisas_pos_festa
     set nota = p_nota,
         comentario = nullif(trim(coalesce(p_comentario, '')), ''),
         respondida_em = now(),
         indicador_cliente_id = v_cli_id
   where id = v_p.id;

  return jsonb_build_object('nota', p_nota, 'codigo', v_codigo);
end;
$$;

-- Equipe transforma um anfitrião em cliente indicador manualmente
-- (ex.: cliente pediu o link no balcão).
create or replace function public.criar_indicador_cliente(p_festa_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_f public.festas;
  v_codigo text;
begin
  select * into v_f from public.festas where id = p_festa_id;
  if not found then
    raise exception 'festa_nao_encontrada';
  end if;
  perform public.exigir_membro(v_f.espaco_id);
  select codigo into v_codigo from public.indicadores_clientes where festa_id = p_festa_id;
  if v_codigo is null then
    v_codigo := public.gerar_codigo_parceiro();
    insert into public.indicadores_clientes (espaco_id, festa_id, nome, telefone, email, codigo)
    values (v_f.espaco_id, v_f.id, v_f.anfitriao_nome, v_f.anfitriao_telefone, lower(v_f.anfitriao_email), v_codigo);
  end if;
  return v_codigo;
end;
$$;

revoke execute on function public.gerar_lote_pos_festa(uuid, text, date) from public, anon;
revoke execute on function public.pesquisa_publica(text) from public, anon, authenticated;
revoke execute on function public.responder_pesquisa(text, int, text) from public, anon, authenticated;
revoke execute on function public.criar_indicador_cliente(uuid) from public, anon;
grant execute on function public.gerar_lote_pos_festa(uuid, text, date) to service_role;
grant execute on function public.pesquisa_publica(text) to service_role;
grant execute on function public.responder_pesquisa(text, int, text) to service_role;
