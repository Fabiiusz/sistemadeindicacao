-- =============================================================================
-- Seeds de demonstração do módulo Indicações
--   * 1 espaço "Porta Cheia Demo" (slug porta-cheia-demo)
--   * regras (parceiros 5%, exceção 7% para a Carla, clientes R$ 200 de crédito)
--   * 3 parceiros (2 ativos, 1 pendente) + 1 cliente indicador (NPS 10)
--   * 10 indicações em estágios variados (passando pelas funções reais)
-- Reexecutável: apaga e recria o espaço demo. NÃO rode em produção com dados reais.
-- Para dar acesso a você: entre uma vez em /login e rode
--   select adicionar_membro_por_email('porta-cheia-demo', 'seu@email.com', 'dono');
-- =============================================================================
begin;

delete from public.espacos where slug = 'porta-cheia-demo';

do $$
declare
  v_seed constant uuid := '5eed0000-0000-4000-8000-000000000001'; -- "usuário" temporário do seed
  e uuid;
  carla uuid; bruno uuid; dj uuid;
  festa_fernanda uuid; festa_futura uuid; festa_realizada uuid; festa_thiago uuid; festa_larissa uuid;
  cli uuid;
  r jsonb;
  i1 uuid; i2 uuid; i3 uuid; i4 uuid; i5 uuid; i6 uuid; i7 uuid; i8 uuid; i9 uuid; i10 uuid;
  rec uuid;
begin
  insert into public.espacos (nome, slug, cor_primaria, whatsapp_comercial, email_comercial, config)
  values ('Porta Cheia Demo', 'porta-cheia-demo', '#7c3aed', '+5511900000000', 'comercial@portacheia.demo',
          '{"dias_pos_festa": 2, "rate_limit_por_ip": 5, "rate_limit_parceiro_dia": 20}')
  returning id into e;

  -- equipe temporária para as funções que exigem papel (removida no fim)
  insert into public.membros_espaco (espaco_id, user_id, papel) values (e, v_seed, 'dono');
  perform set_config('request.jwt.claims', json_build_object('sub', v_seed, 'role', 'authenticated')::text, true);

  -- Regras -------------------------------------------------------------------
  insert into public.regras_indicacao (espaco_id, nome, publico, tipo_recompensa, valor, base_calculo, condicao_pagamento,
    validade_dias_atribuicao, vigencia_inicio, beneficio_indicado_tipo, beneficio_indicado_descricao, criado_por)
  values (e, 'Comissão padrão de parceiros', 'parceiro', 'percentual', 5, 'valor_fechado', 'evento_realizado',
    90, '2026-01-01', 'brinde', 'Mesa de doces de cortesia', v_seed);

  insert into public.regras_indicacao (espaco_id, nome, publico, tipo_recompensa, valor, condicao_pagamento,
    validade_dias_atribuicao, vigencia_inicio, limite_por_indicador, beneficio_indicado_tipo, beneficio_indicado_valor,
    beneficio_indicado_descricao, criado_por)
  values (e, 'Indique um amigo', 'cliente', 'credito', 200, 'fechamento', 120, '2026-01-01', 3,
    'desconto_percentual', 5, '5% de desconto na sua festa', v_seed);

  -- Parceiros ----------------------------------------------------------------
  insert into public.parceiros (espaco_id, nome, tipo, empresa, telefone, email, documento, chave_pix, codigo_indicacao,
    status, aprovado_em, aceite_termos_em, versao_termos, aceite_ip)
  values (e, 'Carla Mendes', 'cerimonialista', 'Carla Mendes Cerimonial', '+5511991110001', 'carla.demo@exemplo.com',
    '52998224725', 'carla.demo@exemplo.com', 'CARLA7', 'ativo', now() - interval '60 days', now() - interval '61 days', 'parceiros-v1', '177.10.0.1')
  returning id into carla;
  insert into public.parceiros (espaco_id, nome, tipo, empresa, telefone, email, chave_pix, codigo_indicacao,
    status, aprovado_em, aceite_termos_em, versao_termos, aceite_ip)
  values (e, 'Bruno Lima', 'fotografo', 'Bruno Lima Fotografia', '+5511991110002', 'bruno.demo@exemplo.com',
    '+5511991110002', 'BRUNO5', 'ativo', now() - interval '45 days', now() - interval '46 days', 'parceiros-v1', '177.10.0.2')
  returning id into bruno;
  insert into public.parceiros (espaco_id, nome, tipo, empresa, telefone, email, codigo_indicacao,
    status, aceite_termos_em, versao_termos, aceite_ip)
  values (e, 'Rafael Souza', 'dj', 'DJ Rafa', '+5511991110003', 'rafa.demo@exemplo.com', 'DJRAFA', 'pendente',
    now() - interval '1 day', 'parceiros-v1', '177.10.0.3')
  returning id into dj;
  insert into public.alertas (espaco_id, tipo, titulo, descricao, referencia_tabela, referencia_id, para_papeis)
  values (e, 'parceiro_pendente', 'Novo parceiro aguardando aprovação: Rafael Souza',
          'Revise o cadastro e aprove ou recuse no painel de parceiros.', 'parceiros', dj, array['dono', 'gerente']);

  -- Exceção de regra para a Carla (7%)
  insert into public.regras_indicacao (espaco_id, nome, publico, parceiro_id, justificativa, tipo_recompensa, valor,
    base_calculo, condicao_pagamento, validade_dias_atribuicao, vigencia_inicio, criado_por)
  values (e, 'Exceção — Carla Mendes', 'parceiro', carla, 'Parceira estratégica: mais de 10 casamentos por ano', 'percentual', 7,
    'valor_fechado', 'evento_realizado', 90, '2026-01-01', v_seed);

  -- Festas e clientes existentes ---------------------------------------------
  insert into public.festas (espaco_id, anfitriao_nome, anfitriao_telefone, tipo_evento, data_evento, num_convidados,
    valor_total, valor_sinal, sinal_pago_em, status)
  values (e, 'Fernanda Rocha', '+5511992220001', 'Aniversário infantil', current_date - 3, 80, 12000, 3600, now() - interval '60 days', 'realizada')
  returning id into festa_fernanda;
  insert into public.festas (espaco_id, anfitriao_nome, anfitriao_telefone, tipo_evento, data_evento, num_convidados,
    valor_total, valor_sinal, sinal_pago_em, status)
  values (e, 'Gustavo Pereira', '+5511992220002', '15 anos', current_date - 2, 150, 22000, 6600, now() - interval '50 days', 'realizada');
  -- lead antigo do Instagram (vai gerar uma indicação duplicada)
  insert into public.leads (espaco_id, nome, telefone, origem, etapa, tipo_evento, criado_em)
  values (e, 'Helena Duarte', '+5511993330008', 'instagram', 'contatado', 'Casamento', now() - interval '40 days');
  insert into public.leads (espaco_id, nome, telefone, origem, etapa, tipo_evento, valor_fechado, criado_em)
  values (e, 'Igor Nunes', '+5511993330099', 'google', 'ganho', 'Corporativo', 18000, now() - interval '30 days'),
         (e, 'Joana Prates', '+5511993330098', 'instagram', 'perdido', 'Aniversário adulto', null, now() - interval '20 days');

  -- Fernanda deu nota 10 -> cliente indicadora
  insert into public.pesquisas_pos_festa (espaco_id, festa_id, token, nota, comentario, respondida_em)
  values (e, festa_fernanda, 'demo-token-fernanda-nps10', 10, 'Festa perfeita, equipe incrível!', now() - interval '1 day');
  insert into public.indicadores_clientes (espaco_id, festa_id, nome, telefone, codigo)
  values (e, festa_fernanda, 'Fernanda Rocha', '+5511992220001', 'FERNA2')
  returning id into cli;
  update public.pesquisas_pos_festa set indicador_cliente_id = cli where festa_id = festa_fernanda;

  -- Indicações (via função real: atribuição, duplicidade, autoindicação, regra congelada)
  perform set_config('app.ator_tipo', 'publico', true);
  r := public._registrar_indicacao(e, 'parceiro', 'link_parceiro', carla, null, null, null, 'Juliana Prado', '+5511993330001',
    'juliana@exemplo.com', 'Casamento', current_date + 200, 180, 'Quero visitar num sábado', true,
    'Fui indicado por Carla Mendes (Carla Mendes Cerimonial) e autorizo o espaço Porta Cheia Demo a entrar em contato comigo.',
    'consentimento', '189.20.0.1', 'seed-ip-1', 'seed');
  i1 := (r ->> 'id')::uuid;
  r := public._registrar_indicacao(e, 'parceiro', 'link_parceiro', carla, null, null, null, 'Marcos Teixeira', '+5511993330002',
    null, 'Formatura', current_date + 120, 300, null, true, 'Fui indicado por Carla Mendes e autorizo o contato.',
    'consentimento', '189.20.0.2', 'seed-ip-2', 'seed');
  i2 := (r ->> 'id')::uuid;
  r := public._registrar_indicacao(e, 'parceiro', 'painel_parceiro', carla, null, null, null, 'Patrícia Gomes', '+5511993330003',
    null, '15 anos', current_date + 90, 120, null, true, 'O parceiro declarou que o indicado autorizou ser contatado pelo espaço.',
    'consentimento (declarado pelo parceiro)', null, null, null);
  i3 := (r ->> 'id')::uuid;
  r := public._registrar_indicacao(e, 'parceiro', 'link_parceiro', carla, null, null, null, 'Renata Alves', '+5511993330004',
    null, 'Casamento', current_date + 60, 200, null, true, 'Fui indicado por Carla Mendes e autorizo o contato.',
    'consentimento', '189.20.0.4', 'seed-ip-4', 'seed');
  i4 := (r ->> 'id')::uuid;
  r := public._registrar_indicacao(e, 'parceiro', 'link_parceiro', carla, null, null, null, 'Eduardo Martins', '+5511993330005',
    null, 'Aniversário adulto', current_date - 25, 90, null, true, 'Fui indicado por Carla Mendes e autorizo o contato.',
    'consentimento', '189.20.0.5', 'seed-ip-5', 'seed');
  i5 := (r ->> 'id')::uuid;
  r := public._registrar_indicacao(e, 'parceiro', 'link_parceiro', bruno, null, null, null, 'Camila Souza', '+5511993330006',
    null, 'Chá de bebê / revelação', current_date + 45, 60, null, true, 'Fui indicado por Bruno Lima e autorizo o contato.',
    'consentimento', '189.20.0.6', 'seed-ip-6', 'seed');
  i6 := (r ->> 'id')::uuid;
  r := public._registrar_indicacao(e, 'parceiro', 'link_parceiro', bruno, null, null, null, 'Thiago Ramos', '+5511993330007',
    null, 'Aniversário infantil', current_date - 40, 70, null, true, 'Fui indicado por Bruno Lima e autorizo o contato.',
    'consentimento', '189.20.0.7', 'seed-ip-7', 'seed');
  i7 := (r ->> 'id')::uuid;
  -- já era lead (Instagram) -> duplicada
  r := public._registrar_indicacao(e, 'parceiro', 'link_parceiro', bruno, null, null, null, 'Helena Duarte', '(11) 99333-0008',
    null, 'Casamento', null, null, null, true, 'Fui indicado por Bruno Lima e autorizo o contato.',
    'consentimento', '189.20.0.8', 'seed-ip-8', 'seed');
  i8 := (r ->> 'id')::uuid;
  -- autoindicação (telefone do próprio Bruno) -> inválida
  r := public._registrar_indicacao(e, 'parceiro', 'link_parceiro', bruno, null, null, null, 'Bruno L.', '+5511991110002',
    null, null, null, null, null, true, 'Fui indicado por Bruno Lima e autorizo o contato.',
    'consentimento', '189.20.0.9', 'seed-ip-9', 'seed');
  i9 := (r ->> 'id')::uuid;
  -- amiga indicada pela cliente Fernanda (/v/FERNA2)
  r := public._registrar_indicacao(e, 'cliente', 'link_cliente', null, cli, null, null, 'Larissa Costa', '+5511993330010',
    null, 'Aniversário infantil', current_date + 75, 50, null, true,
    'Fui indicado por Fernanda Rocha e autorizo o espaço Porta Cheia Demo a entrar em contato comigo.',
    'consentimento', '189.20.0.10', 'seed-ip-10', 'seed');
  i10 := (r ->> 'id')::uuid;
  perform set_config('app.ator_tipo', '', true);

  -- Andamento do funil (como a equipe faria) ----------------------------------
  perform public.alterar_status_indicacao(i2, 'contatada');
  perform public.alterar_status_indicacao(i3, 'contatada');
  perform public.alterar_status_indicacao(i3, 'visita_agendada');
  perform public.alterar_status_indicacao(i6, 'contatada');
  perform public.alterar_status_indicacao(i6, 'perdida', 'Escolheu outro espaço (preço)');

  -- Renata fechou, festa futura (comissão 7% prevista até o evento)
  insert into public.festas (espaco_id, lead_id, anfitriao_nome, anfitriao_telefone, tipo_evento, data_evento, valor_total, valor_sinal, sinal_pago_em)
  select e, lead_id, nome_indicado, telefone_indicado, 'Casamento', current_date + 60, 28000, 8400, now() - interval '3 days'
    from public.indicacoes where id = i4
  returning id into festa_futura;
  perform public.fechar_indicacao(i4, 28000, festa_futura);

  -- Eduardo: fechou e evento realizado -> comissão aprovada (há 20 dias, sem pagar)
  insert into public.festas (espaco_id, lead_id, anfitriao_nome, anfitriao_telefone, tipo_evento, data_evento, valor_total, valor_sinal, sinal_pago_em)
  select e, lead_id, nome_indicado, telefone_indicado, 'Aniversário adulto', current_date - 25, 16000, 4800, now() - interval '50 days'
    from public.indicacoes where id = i5
  returning id into festa_realizada;
  perform public.fechar_indicacao(i5, 16000, festa_realizada);
  update public.festas set status = 'realizada' where id = festa_realizada;

  -- Thiago: evento realizado e comissão já paga
  insert into public.festas (espaco_id, lead_id, anfitriao_nome, anfitriao_telefone, tipo_evento, data_evento, valor_total, valor_sinal, sinal_pago_em)
  select e, lead_id, nome_indicado, telefone_indicado, 'Aniversário infantil', current_date - 40, 14000, 4200, now() - interval '70 days'
    from public.indicacoes where id = i7
  returning id into festa_thiago;
  perform public.fechar_indicacao(i7, 14000, festa_thiago);
  update public.festas set status = 'realizada' where id = festa_thiago;
  select id into rec from public.recompensas where indicacao_id = i7 and beneficiario = 'parceiro';
  perform public.marcar_recompensa_paga(rec, current_date - 10, 'pix', null, 'Pago via Pix (demo)');

  -- Larissa (amiga da Fernanda) fechou -> crédito de R$ 200 aprovado
  insert into public.festas (espaco_id, lead_id, anfitriao_nome, anfitriao_telefone, tipo_evento, data_evento, valor_total, valor_sinal)
  select e, lead_id, nome_indicado, telefone_indicado, 'Aniversário infantil', current_date + 75, 9500, 2850
    from public.indicacoes where id = i10
  returning id into festa_larissa;
  perform public.fechar_indicacao(i10, 9500, festa_larissa);

  -- Datas realistas (e para disparar os alertas de prazo)
  update public.indicacoes set criado_em = now() - interval '2 days', status_atualizado_em = now() - interval '2 days' where id = i1;
  update public.indicacoes set criado_em = now() - interval '12 days', status_atualizado_em = now() - interval '7 days' where id = i2;
  update public.indicacoes set criado_em = now() - interval '9 days', status_atualizado_em = now() - interval '1 day' where id = i3;
  update public.indicacoes set criado_em = now() - interval '35 days', fechada_em = now() - interval '5 days' where id = i4;
  update public.indicacoes set criado_em = now() - interval '80 days', fechada_em = now() - interval '55 days' where id = i5;
  update public.indicacoes set criado_em = now() - interval '20 days' where id = i6;
  update public.indicacoes set criado_em = now() - interval '85 days', fechada_em = now() - interval '72 days' where id = i7;
  update public.indicacoes set criado_em = now() - interval '6 days' where id in (i8, i9);
  update public.indicacoes set criado_em = now() - interval '1 day' where id = i10;
  update public.leads l set criado_em = i.criado_em from public.indicacoes i where i.lead_id = l.id and i.espaco_id = e and i.status not in ('duplicada', 'invalida');
  update public.recompensas set aprovada_em = now() - interval '20 days' where indicacao_id = i5 and status = 'aprovada';

  -- remove o "usuário" temporário do seed
  delete from public.membros_espaco where espaco_id = e and user_id = v_seed;
  perform set_config('request.jwt.claims', '', true);
end;
$$;

commit;
