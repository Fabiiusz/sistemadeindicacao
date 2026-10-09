import { afterAll, describe, expect, it } from "vitest";
import {
  criarEspaco,
  criarMembro,
  criarParceiro,
  criarRegra,
  erroDe,
  fecharPool,
  indicarPorLink,
  sql,
  tel,
  temBanco,
  usuario,
} from "./helpers";

afterAll(fecharPool);

describe.skipIf(!temBanco)("atribuição e duplicidade", () => {
  it("a primeira indicação válida vence; a segunda vira duplicada com motivo", async () => {
    const espaco = await criarEspaco();
    await criarRegra(espaco);
    const a = await criarParceiro(espaco);
    const b = await criarParceiro(espaco);
    const t = tel();

    const r1 = await indicarPorLink(a.codigo_indicacao, t);
    expect(r1.status).toBe("recebida");
    expect(r1.lead_id).toBeTruthy();

    const r2 = await indicarPorLink(b.codigo_indicacao, t);
    expect(r2.status).toBe("duplicada");
    expect(r2.motivo).toMatch(/por outro indicador/);

    const recB = await sql("select * from recompensas where indicacao_id = $1", [r2.id]);
    expect(recB).toHaveLength(0);
    const recA = await sql("select * from recompensas where indicacao_id = $1", [r1.id]);
    expect(recA).toHaveLength(1);
    expect(recA[0].status).toBe("prevista");
  });

  it("telefone com formatos diferentes é o mesmo contato", async () => {
    const espaco = await criarEspaco();
    const a = await criarParceiro(espaco);
    const t = tel(); // +5511 9xxxxxxxx
    const local = `(${t.slice(3, 5)}) ${t.slice(5, 10)}-${t.slice(10)}`;
    await indicarPorLink(a.codigo_indicacao, t);
    const r = await indicarPorLink(a.codigo_indicacao, local);
    expect(r.status).toBe("duplicada");
    expect(r.motivo).toMatch(/por você/);
  });

  it("se o indicado já era lead antes, é duplicada e não gera recompensa", async () => {
    const espaco = await criarEspaco();
    await criarRegra(espaco);
    const a = await criarParceiro(espaco);
    const t = tel();
    await sql("insert into leads (espaco_id, nome, telefone, origem, criado_em) values ($1, 'Lead antigo', $2, 'instagram', '2026-01-10 15:00-03')", [espaco, t]);
    const r = await indicarPorLink(a.codigo_indicacao, t);
    expect(r.status).toBe("duplicada");
    expect(r.motivo).toMatch(/já era lead do espaço desde 10\/01\/2026/);
    expect(await sql("select 1 from recompensas where indicacao_id = $1", [r.id])).toHaveLength(0);
  });

  it("se o indicado já era cliente (festa), é duplicada", async () => {
    const espaco = await criarEspaco();
    const a = await criarParceiro(espaco);
    const t = tel();
    await sql("insert into festas (espaco_id, anfitriao_nome, anfitriao_telefone, data_evento) values ($1, 'Cliente', $2, '2025-05-05')", [espaco, t]);
    const r = await indicarPorLink(a.codigo_indicacao, t);
    expect(r.status).toBe("duplicada");
    expect(r.motivo).toMatch(/já era cliente/);
  });

  it("fora da janela de atribuição a indicação anterior não bloqueia, mas o lead existente sim", async () => {
    const espaco = await criarEspaco();
    const a = await criarParceiro(espaco);
    const b = await criarParceiro(espaco);
    const t = tel();
    const r1 = await indicarPorLink(a.codigo_indicacao, t);
    // viagem no tempo: indicação antiga, janela vencida
    await sql("update indicacoes set criado_em = now() - interval '200 days', atribuida_ate = now() - interval '110 days' where id = $1", [r1.id]);
    await sql("update leads set criado_em = now() - interval '200 days' where id = $1", [r1.lead_id]);
    const r2 = await indicarPorLink(b.codigo_indicacao, t);
    expect(r2.status).toBe("duplicada");
    expect(r2.motivo).toMatch(/já era lead/);
  });

  it("fechamento depois da janela cancela a recompensa", async () => {
    const espaco = await criarEspaco();
    await criarRegra(espaco, { condicao_pagamento: "fechamento" });
    const dono = await criarMembro(espaco);
    const a = await criarParceiro(espaco);
    const r = await indicarPorLink(a.codigo_indicacao, tel());
    await sql("update indicacoes set atribuida_ate = now() - interval '1 day' where id = $1", [r.id]);
    await usuario(dono, (c) => c.query("select fechar_indicacao($1, 10000)", [r.id]));
    const [rec] = await sql("select status, motivo_cancelamento from recompensas where indicacao_id = $1", [r.id]);
    expect(rec.status).toBe("cancelada");
    expect(rec.motivo_cancelamento).toMatch(/prazo de atribuição/);
  });

  it("atribuida_ate usa a validade da regra vigente", async () => {
    const espaco = await criarEspaco();
    await criarRegra(espaco, { validade_dias_atribuicao: 30 });
    const a = await criarParceiro(espaco);
    const r = await indicarPorLink(a.codigo_indicacao, tel());
    const [i] = await sql("select (atribuida_ate - criado_em) as d from indicacoes where id = $1", [r.id]);
    expect(i.d.days).toBe(30);
  });
});

describe.skipIf(!temBanco)("autoindicação, consentimento e bloqueio", () => {
  it("parceiro não pode indicar o próprio telefone", async () => {
    const espaco = await criarEspaco();
    await criarRegra(espaco);
    const a = await criarParceiro(espaco);
    const r = await indicarPorLink(a.codigo_indicacao, a.telefone);
    expect(r.status).toBe("invalida");
    expect(r.motivo).toMatch(/Autoindicação/);
    expect(await sql("select 1 from recompensas where indicacao_id = $1", [r.id])).toHaveLength(0);
    expect(await sql("select 1 from leads where espaco_id = $1", [espaco])).toHaveLength(0);
  });

  it("parceiro não pode indicar o próprio e-mail", async () => {
    const espaco = await criarEspaco();
    const a = await criarParceiro(espaco, { email: "carla@exemplo.com" });
    const r = await indicarPorLink(a.codigo_indicacao, tel(), { email: "CARLA@exemplo.com " });
    expect(r.status).toBe("invalida");
  });

  it("documento igual ao do parceiro é autoindicação", async () => {
    const espaco = await criarEspaco();
    const dono = await criarMembro(espaco);
    const a = await criarParceiro(espaco, { documento: "52998224725" });
    const [{ r }] = await usuario(dono, async (c) =>
      (await c.query(
        `select _registrar_indicacao($1, 'parceiro', 'manual_comercial', $2, null, null, null, 'Fulano', $3, null,
           null, null, null, null, true, 'ok', 'consentimento', null, null, null, '529.982.247-25') as r`,
        [espaco, a.id, tel()],
      ).catch(() => ({ rows: [{ r: { status: "sem_acesso" } }] }))).rows,
    );
    // função interna não é exposta para usuários autenticados
    expect(r.status).toBe("sem_acesso");
    const [{ r: r2 }] = await sql(
      `select _registrar_indicacao($1, 'parceiro', 'manual_comercial', $2, null, null, null, 'Fulano', $3, null,
         null, null, null, null, true, 'ok', 'consentimento', null, null, null, '529.982.247-25') as r`,
      [espaco, a.id, tel()],
    );
    expect(r2.status).toBe("invalida");
  });

  it("sem consentimento não registra", async () => {
    const espaco = await criarEspaco();
    const a = await criarParceiro(espaco);
    expect(await erroDe(indicarPorLink(a.codigo_indicacao, tel(), { consentimento: false }))).toBe("consentimento_obrigatorio");
  });

  it("telefone na lista de bloqueio não registra", async () => {
    const espaco = await criarEspaco();
    const a = await criarParceiro(espaco);
    const t = tel();
    await sql("insert into bloqueio_contato (espaco_id, telefone) values ($1, $2)", [espaco, t]);
    expect(await erroDe(indicarPorLink(a.codigo_indicacao, t))).toBe("contato_bloqueado");
  });

  it("parceiro pendente/pausado não recebe indicação", async () => {
    const espaco = await criarEspaco();
    const a = await criarParceiro(espaco, { status: "pendente" });
    expect(await erroDe(indicarPorLink(a.codigo_indicacao, tel()))).toBe("parceiro_inativo");
  });
});

describe.skipIf(!temBanco)("rate limit", () => {
  it("bloqueia o mesmo IP após o limite em 10 minutos", async () => {
    const espaco = await criarEspaco({ rate_limit_por_ip: 3 });
    const a = await criarParceiro(espaco);
    const ip = `ip-${Math.random()}`;
    for (let i = 0; i < 3; i++) {
      const r = await indicarPorLink(a.codigo_indicacao, tel(), { ipHash: ip });
      expect(r.status).toBe("recebida");
    }
    expect(await erroDe(indicarPorLink(a.codigo_indicacao, tel(), { ipHash: ip }))).toBe("muitas_tentativas");
    // outro IP segue funcionando
    expect((await indicarPorLink(a.codigo_indicacao, tel(), { ipHash: `${ip}-2` })).status).toBe("recebida");
    // janela expira
    await sql("update tentativas_indicacao set criado_em = now() - interval '11 minutes' where ip_hash = $1", [ip]);
    expect((await indicarPorLink(a.codigo_indicacao, tel(), { ipHash: ip })).status).toBe("recebida");
  });

  it("marca como suspeita quando o mesmo dispositivo envia muitas em 24h", async () => {
    const espaco = await criarEspaco({ rate_limit_por_ip: 50 });
    const a = await criarParceiro(espaco);
    const ip = `ip-${Math.random()}`;
    let ultima;
    for (let i = 0; i < 4; i++) ultima = await indicarPorLink(a.codigo_indicacao, tel(), { ipHash: ip });
    const [i] = await sql("select suspeita, motivos_suspeita from indicacoes where id = $1", [ultima!.id]);
    expect(i.suspeita).toBe(true);
    expect(i.motivos_suspeita).toContain("muitos_envios_mesmo_dispositivo");
  });

  it("limita indicações por parceiro por dia", async () => {
    const espaco = await criarEspaco({ rate_limit_parceiro_dia: 2 });
    const a = await criarParceiro(espaco);
    await indicarPorLink(a.codigo_indicacao, tel());
    await indicarPorLink(a.codigo_indicacao, tel());
    expect(await erroDe(indicarPorLink(a.codigo_indicacao, tel()))).toBe("muitas_tentativas");
  });
});

describe.skipIf(!temBanco)("cálculo de comissão e aprovação condicionada", () => {
  it("usa a regra vigente na DATA DA INDICAÇÃO, mesmo se a regra mudar depois", async () => {
    const espaco = await criarEspaco();
    const dono = await criarMembro(espaco);
    const regraAntiga = await criarRegra(espaco, { valor: 5, condicao_pagamento: "fechamento" });
    const a = await criarParceiro(espaco);
    const r = await indicarPorLink(a.codigo_indicacao, tel());

    // a regra antiga não pode ter valores alterados...
    expect(await erroDe(sql("update regras_indicacao set valor = 50 where id = $1", [regraAntiga]))).toBe("regra_em_uso");
    // ...então o dono desativa e cria outra de 10%
    await sql("update regras_indicacao set ativa = false where id = $1", [regraAntiga]);
    await criarRegra(espaco, { valor: 10, condicao_pagamento: "fechamento" });

    await usuario(dono, (c) => c.query("select fechar_indicacao($1, 20000)", [r.id]));
    const [rec] = await sql("select valor, percentual, status, base_valor from recompensas where indicacao_id = $1", [r.id]);
    expect(Number(rec.percentual)).toBe(5);
    expect(Number(rec.valor)).toBe(1000);
    expect(Number(rec.base_valor)).toBe(20000);
    expect(rec.status).toBe("aprovada");

    // nova indicação usa a nova regra
    const r2 = await indicarPorLink(a.codigo_indicacao, tel());
    await usuario(dono, (c) => c.query("select fechar_indicacao($1, 20000)", [r2.id]));
    const [rec2] = await sql("select valor from recompensas where indicacao_id = $1", [r2.id]);
    expect(Number(rec2.valor)).toBe(2000);
  });

  it("exceção por parceiro prevalece sobre a regra geral e exige justificativa", async () => {
    const espaco = await criarEspaco();
    await criarRegra(espaco, { valor: 5 });
    const a = await criarParceiro(espaco);
    const b = await criarParceiro(espaco);
    expect(await erroDe(criarRegra(espaco, { valor: 8, parceiro_id: a.id }))).toMatch(/regra_excecao_exige_justificativa/);
    await criarRegra(espaco, { valor: 8, parceiro_id: a.id, justificativa: "Parceira estratégica, volume alto" });
    const ra = await indicarPorLink(a.codigo_indicacao, tel());
    const rb = await indicarPorLink(b.codigo_indicacao, tel());
    const [reca] = await sql("select percentual from recompensas where indicacao_id = $1", [ra.id]);
    const [recb] = await sql("select percentual from recompensas where indicacao_id = $1", [rb.id]);
    expect(Number(reca.percentual)).toBe(8);
    expect(Number(recb.percentual)).toBe(5);
  });

  it("regra fora da vigência não é usada", async () => {
    const espaco = await criarEspaco();
    await criarRegra(espaco, { valor: 7, vigencia_inicio: "2099-01-01" });
    const a = await criarParceiro(espaco);
    const r = await indicarPorLink(a.codigo_indicacao, tel());
    expect(await sql("select 1 from recompensas where indicacao_id = $1", [r.id])).toHaveLength(0);
  });

  it("condição 'evento realizado': fechar não aprova; realizar o evento aprova; nada é pago", async () => {
    const espaco = await criarEspaco();
    const dono = await criarMembro(espaco);
    await criarRegra(espaco, { tipo_recompensa: "valor_fixo", valor: 300, condicao_pagamento: "evento_realizado" });
    const a = await criarParceiro(espaco);
    const r = await indicarPorLink(a.codigo_indicacao, tel());
    await usuario(dono, (c) => c.query("select fechar_indicacao($1, 15000)", [r.id]));
    let [rec] = await sql("select status, valor from recompensas where indicacao_id = $1", [r.id]);
    expect(rec.status).toBe("prevista");
    expect(Number(rec.valor)).toBe(300);

    await usuario(dono, (c) => c.query("select alterar_status_indicacao($1, 'evento_realizado')", [r.id]));
    [rec] = await sql("select status, paga_em from recompensas where indicacao_id = $1", [r.id]);
    expect(rec.status).toBe("aprovada");
    expect(rec.paga_em).toBeNull();
  });

  it("condição 'sinal pago' sobre o valor do sinal", async () => {
    const espaco = await criarEspaco();
    const dono = await criarMembro(espaco);
    await criarRegra(espaco, { valor: 10, base_calculo: "sinal_pago", condicao_pagamento: "sinal_pago" });
    const a = await criarParceiro(espaco);
    const r = await indicarPorLink(a.codigo_indicacao, tel());
    const [festa] = await sql<{ id: string }>(
      "insert into festas (espaco_id, anfitriao_nome, data_evento, valor_total, valor_sinal) values ($1, 'Ana', '2026-12-01', 20000, 6000) returning id",
      [espaco],
    );
    await usuario(dono, (c) => c.query("select fechar_indicacao($1, 20000, $2)", [r.id, festa.id]));
    let [rec] = await sql("select status, valor from recompensas where indicacao_id = $1", [r.id]);
    expect(Number(rec.valor)).toBe(600);
    expect(rec.status).toBe("prevista");
    await sql("select verificar_recompensas($1)", [r.id]); // sem sinal ainda
    await sql("update festas set sinal_pago_em = now() where id = $1", [festa.id]);
    await sql("select verificar_recompensas($1)", [r.id]);
    [rec] = await sql("select status from recompensas where indicacao_id = $1", [r.id]);
    expect(rec.status).toBe("aprovada");
  });

  it("limite de indicações recompensadas por indicador", async () => {
    const espaco = await criarEspaco();
    await criarRegra(espaco, { tipo_recompensa: "valor_fixo", valor: 100, limite_por_indicador: 2 });
    const a = await criarParceiro(espaco);
    await indicarPorLink(a.codigo_indicacao, tel());
    await indicarPorLink(a.codigo_indicacao, tel());
    const r3 = await indicarPorLink(a.codigo_indicacao, tel());
    expect(r3.status).toBe("recebida");
    expect(await sql("select 1 from recompensas where indicacao_id = $1", [r3.id])).toHaveLength(0);
    const [i] = await sql("select observacoes from indicacoes where id = $1", [r3.id]);
    expect(i.observacoes).toMatch(/Limite de 2/);
  });

  it("benefício do indicado é registrado como recompensa", async () => {
    const espaco = await criarEspaco();
    await criarRegra(espaco, {
      beneficio_indicado_tipo: "desconto_percentual",
      beneficio_indicado_valor: 5,
      beneficio_indicado_descricao: "5% de desconto",
    });
    const a = await criarParceiro(espaco);
    const r = await indicarPorLink(a.codigo_indicacao, tel());
    const recs = await sql("select beneficiario from recompensas where indicacao_id = $1 order by beneficiario", [r.id]);
    expect(recs.map((x) => x.beneficiario)).toEqual(["indicado", "parceiro"]);
  });

  it("perder a indicação cancela recompensas e registra auditoria", async () => {
    const espaco = await criarEspaco();
    const dono = await criarMembro(espaco);
    await criarRegra(espaco);
    const a = await criarParceiro(espaco);
    const r = await indicarPorLink(a.codigo_indicacao, tel());
    expect(await erroDe(usuario(dono, (c) => c.query("select alterar_status_indicacao($1, 'perdida')", [r.id])))).toBe("motivo_obrigatorio");
    await usuario(dono, (c) => c.query("select alterar_status_indicacao($1, 'perdida', 'Escolheu outro espaço')", [r.id]));
    const [rec] = await sql("select status from recompensas where indicacao_id = $1", [r.id]);
    expect(rec.status).toBe("cancelada");
    const eventos = await sql("select tipo, de, para, ator_tipo, ator_id from indicacao_eventos where indicacao_id = $1 order by id", [r.id]);
    const status = eventos.find((e) => e.tipo === "status");
    expect(status).toMatchObject({ de: "recebida", para: "perdida", ator_tipo: "equipe", ator_id: dono });
    expect(eventos[0]).toMatchObject({ tipo: "criada", ator_tipo: "publico" });
  });

  it("comercial de outro espaço não consegue fechar", async () => {
    const espaco = await criarEspaco();
    const outro = await criarEspaco();
    const intruso = await criarMembro(outro);
    const a = await criarParceiro(espaco);
    const r = await indicarPorLink(a.codigo_indicacao, tel());
    expect(await erroDe(usuario(intruso, (c) => c.query("select fechar_indicacao($1, 100)", [r.id])))).toBe("sem_permissao");
  });
});
