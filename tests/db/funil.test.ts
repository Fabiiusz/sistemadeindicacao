import { afterAll, describe, expect, it } from "vitest";
import { criarEspaco, criarMembro, criarParceiro, criarRegra, erroDe, fecharPool, indicarPorLink, sql, tel, temBanco, usuario } from "./helpers";

afterAll(fecharPool);

describe.skipIf(!temBanco)("funil lead <-> indicação", () => {
  it("mudar a etapa do lead atualiza a indicação e avisa o parceiro na visita", async () => {
    const espaco = await criarEspaco();
    const comercial = await criarMembro(espaco, "comercial");
    const a = await criarParceiro(espaco);
    const r = await indicarPorLink(a.codigo_indicacao, tel());
    await usuario(comercial, (c) => c.query("update leads set etapa = 'contatado' where id = $1", [r.lead_id]));
    expect((await sql("select status from indicacoes where id = $1", [r.id]))[0].status).toBe("contatada");
    await usuario(comercial, (c) => c.query("update leads set etapa = 'visita_agendada' where id = $1", [r.lead_id]));
    expect((await sql("select status from indicacoes where id = $1", [r.id]))[0].status).toBe("visita_agendada");
    const avisos = await sql("select mensagem from fila_envios where referencia_id = $1 and tipo = 'aviso_parceiro'", [r.id]);
    expect(avisos).toHaveLength(1);
    expect(avisos[0].mensagem).toMatch(/agendou uma visita/);
    expect(avisos[0].mensagem).not.toContain("Lima"); // nome mascarado
  });

  it("mudar o status da indicação atualiza o lead", async () => {
    const espaco = await criarEspaco();
    const comercial = await criarMembro(espaco, "comercial");
    const a = await criarParceiro(espaco);
    const r = await indicarPorLink(a.codigo_indicacao, tel());
    await usuario(comercial, (c) => c.query("select alterar_status_indicacao($1, 'orcamento_enviado')", [r.id]));
    expect((await sql("select etapa from leads where id = $1", [r.lead_id]))[0].etapa).toBe("orcamento_enviado");
    await usuario(comercial, (c) => c.query("select fechar_indicacao($1, 12000)", [r.id]));
    const [lead] = await sql("select etapa, valor_fechado from leads where id = $1", [r.lead_id]);
    expect(lead.etapa).toBe("ganho");
    expect(Number(lead.valor_fechado)).toBe(12000);
  });

  it("lead ganho sem valor alerta; informar o valor depois calcula a comissão", async () => {
    const espaco = await criarEspaco();
    const comercial = await criarMembro(espaco, "comercial");
    await criarRegra(espaco, { valor: 10, condicao_pagamento: "fechamento" });
    const a = await criarParceiro(espaco);
    const r = await indicarPorLink(a.codigo_indicacao, tel());
    await usuario(comercial, (c) => c.query("update leads set etapa = 'ganho' where id = $1", [r.lead_id]));
    expect((await sql("select status from indicacoes where id = $1", [r.id]))[0].status).toBe("fechada");
    expect(await sql("select 1 from alertas where referencia_id = $1 and tipo = 'informar_valor'", [r.id])).toHaveLength(1);
    expect((await sql("select status, valor from recompensas where indicacao_id = $1", [r.id]))[0]).toMatchObject({ status: "prevista", valor: null });
    await usuario(comercial, (c) => c.query("update leads set valor_fechado = 9000 where id = $1", [r.lead_id]));
    const [rec] = await sql("select status, valor from recompensas where indicacao_id = $1", [r.id]);
    expect(rec.status).toBe("aprovada");
    expect(Number(rec.valor)).toBe(900);
  });

  it("lead perdido cancela recompensas previstas", async () => {
    const espaco = await criarEspaco();
    const comercial = await criarMembro(espaco, "comercial");
    await criarRegra(espaco);
    const a = await criarParceiro(espaco);
    const r = await indicarPorLink(a.codigo_indicacao, tel());
    await usuario(comercial, (c) => c.query("update leads set etapa = 'perdido' where id = $1", [r.lead_id]));
    expect((await sql("select status from indicacoes where id = $1", [r.id]))[0].status).toBe("perdida");
    expect((await sql("select status from recompensas where indicacao_id = $1", [r.id]))[0].status).toBe("cancelada");
  });
});

describe.skipIf(!temBanco)("festa -> aprovação e pagamento manual", () => {
  it("festa realizada aprova; dono marca como paga; parceiro é avisado em cada etapa", async () => {
    const espaco = await criarEspaco();
    const dono = await criarMembro(espaco, "dono");
    const comercial = await criarMembro(espaco, "comercial");
    await criarRegra(espaco, { valor: 5, condicao_pagamento: "evento_realizado" });
    const a = await criarParceiro(espaco);
    const r = await indicarPorLink(a.codigo_indicacao, tel());
    await usuario(comercial, (c) => c.query("select fechar_indicacao($1, 40000)", [r.id]));
    // festa criada a partir do lead é ligada automaticamente à indicação
    const [festa] = await sql<{ id: string }>(
      "insert into festas (espaco_id, lead_id, anfitriao_nome, data_evento, valor_total) values ($1, $2, 'Ana', current_date, 40000) returning id",
      [espaco, r.lead_id],
    );
    expect((await sql("select festa_id from indicacoes where id = $1", [r.id]))[0].festa_id).toBe(festa.id);
    expect((await sql("select status from recompensas where indicacao_id = $1", [r.id]))[0].status).toBe("prevista");

    await usuario(comercial, (c) => c.query("update festas set status = 'realizada' where id = $1", [festa.id]));
    expect((await sql("select status from indicacoes where id = $1", [r.id]))[0].status).toBe("evento_realizado");
    const [rec] = await sql("select id, status, valor from recompensas where indicacao_id = $1", [r.id]);
    expect(rec.status).toBe("aprovada");
    expect(Number(rec.valor)).toBe(2000);

    // comercial não paga; dono paga
    expect(await erroDe(usuario(comercial, (c) => c.query("select marcar_recompensa_paga($1, current_date, 'pix')", [rec.id])))).toBe("sem_permissao");
    await usuario(dono, (c) => c.query("select marcar_recompensa_paga($1, '2026-10-01', 'pix', 'https://comprovante', 'ok')", [rec.id]));
    const [paga] = await sql("select status, paga_em, forma_pagamento, pago_por from recompensas where id = $1", [rec.id]);
    expect(paga).toMatchObject({ status: "paga", forma_pagamento: "pix", pago_por: dono });
    // não paga duas vezes
    expect(await erroDe(usuario(dono, (c) => c.query("select marcar_recompensa_paga($1, current_date, 'pix')", [rec.id])))).toBe("recompensa_nao_aprovada");

    const avisos = await sql(
      "select mensagem from fila_envios where espaco_id = $1 and tipo = 'aviso_parceiro' order by criado_em, id",
      [espaco],
    );
    const textos = avisos.map((x) => x.mensagem).join("\n");
    expect(textos).toMatch(/FECHOU/);
    expect(textos).toMatch(/APROVADA/);
    expect(textos).toMatch(/PAGA em 01\/10\/2026/);
    expect(textos).toMatch(/R\$ 2\.000,00/);
  });

  it("festa cancelada derruba a indicação e cancela recompensas previstas", async () => {
    const espaco = await criarEspaco();
    const comercial = await criarMembro(espaco, "comercial");
    await criarRegra(espaco);
    const a = await criarParceiro(espaco);
    const r = await indicarPorLink(a.codigo_indicacao, tel());
    const [festa] = await sql<{ id: string }>(
      "insert into festas (espaco_id, anfitriao_nome, data_evento) values ($1, 'Ana', current_date + 30) returning id",
      [espaco],
    );
    await usuario(comercial, (c) => c.query("select fechar_indicacao($1, 10000, $2)", [r.id, festa.id]));
    await usuario(comercial, (c) => c.query("update festas set status = 'cancelada' where id = $1", [festa.id]));
    expect((await sql("select status from indicacoes where id = $1", [r.id]))[0].status).toBe("perdida");
    expect((await sql("select etapa from leads where id = $1", [r.lead_id]))[0].etapa).toBe("perdido");
    expect((await sql("select status from recompensas where indicacao_id = $1", [r.id]))[0].status).toBe("cancelada");
  });
});

describe.skipIf(!temBanco)("alertas de prazo e métricas", () => {
  it("lista sem contato 24h, parada 5 dias e pagamento atrasado", async () => {
    const espaco = await criarEspaco();
    const dono = await criarMembro(espaco);
    await criarRegra(espaco, { condicao_pagamento: "fechamento" });
    const a = await criarParceiro(espaco);
    const r1 = await indicarPorLink(a.codigo_indicacao, tel());
    const r2 = await indicarPorLink(a.codigo_indicacao, tel());
    const r3 = await indicarPorLink(a.codigo_indicacao, tel());
    await sql("update indicacoes set criado_em = now() - interval '25 hours' where id = $1", [r1.id]);
    await usuario(dono, (c) => c.query("select alterar_status_indicacao($1, 'contatada')", [r2.id]));
    await sql("update indicacoes set status_atualizado_em = now() - interval '6 days' where id = $1", [r2.id]);
    await usuario(dono, (c) => c.query("select fechar_indicacao($1, 1000)", [r3.id]));
    await sql("update recompensas set aprovada_em = now() - interval '16 days' where indicacao_id = $1", [r3.id]);

    const alertas = await usuario(dono, async (c) => (await c.query("select tipo, referencia_id from alertas_prazos")).rows);
    expect(alertas.map((x) => x.tipo).sort()).toEqual(["pagamento_atrasado", "parada_5_dias", "sem_contato_24h"]);
    // outro espaço não vê
    const outro = await criarMembro(await criarEspaco());
    expect(await usuario(outro, async (c) => (await c.query("select * from alertas_prazos")).rows)).toHaveLength(0);
  });

  it("métricas: funil, receita, custo e comparação com outros canais", async () => {
    const espaco = await criarEspaco();
    const dono = await criarMembro(espaco);
    await criarRegra(espaco, { tipo_recompensa: "valor_fixo", valor: 500, condicao_pagamento: "fechamento" });
    const a = await criarParceiro(espaco);
    const r1 = await indicarPorLink(a.codigo_indicacao, tel());
    const r2 = await indicarPorLink(a.codigo_indicacao, tel());
    await indicarPorLink(a.codigo_indicacao, a.telefone); // inválida
    await usuario(dono, (c) => c.query("select alterar_status_indicacao($1, 'visita_agendada')", [r2.id]));
    await usuario(dono, (c) => c.query("select alterar_status_indicacao($1, 'perdida', 'Sem data')", [r2.id]));
    await usuario(dono, (c) => c.query("select fechar_indicacao($1, 20000)", [r1.id]));
    await sql("insert into leads (espaco_id, nome, telefone, origem, etapa, valor_fechado) values ($1, 'X', $2, 'instagram', 'ganho', 15000), ($1, 'Y', $3, 'instagram', 'perdido', null)", [espaco, tel(), tel()]);

    const m = await usuario(dono, async (c) => (await c.query("select metricas_indicacoes($1) as m", [espaco])).rows[0].m);
    expect(m).toMatchObject({ recebidas: 3, validas: 2, invalidas: 1, contatadas: 2, visitas: 2, fechamentos: 1, perdidas: 1 });
    expect(Number(m.receita)).toBe(20000);
    expect(Number(m.taxa_conversao)).toBe(50);
    expect(Number(m.custo_por_fechamento)).toBe(500);
    const insta = m.canais.find((c: { origem: string }) => c.origem === "instagram");
    expect(insta).toMatchObject({ leads: 2, ganhos: 1 });
    const ind = m.canais.find((c: { origem: string }) => c.origem === "indicacao_parceiro");
    expect(ind).toMatchObject({ leads: 2, ganhos: 1 });
  });
});
