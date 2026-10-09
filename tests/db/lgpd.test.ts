import { afterAll, describe, expect, it } from "vitest";
import { criarEspaco, criarMembro, criarParceiro, erroDe, fecharPool, indicarPorLink, servico, sql, tel, temBanco, usuario } from "./helpers";

afterAll(fecharPool);

describe.skipIf(!temBanco)("LGPD", () => {
  it("toda indicação registra origem, consentimento (texto, data, IP) e base legal", async () => {
    const espaco = await criarEspaco();
    const a = await criarParceiro(espaco);
    const r = await indicarPorLink(a.codigo_indicacao, tel());
    const [i] = await sql(
      "select consentimento, consentimento_texto, consentimento_em, consentimento_ip, base_legal, origem_contato from indicacoes where id = $1",
      [r.id],
    );
    expect(i.consentimento).toBe(true);
    expect(i.consentimento_texto).toBe("Fui indicado e autorizo");
    expect(i.consentimento_em).toBeTruthy();
    expect(i.consentimento_ip).toBe("200.1.1.1");
    expect(i.base_legal).toBe("consentimento");
    expect(i.origem_contato).toMatch(/link do parceiro/);
  });

  it("pedido do titular bloqueia na hora, cancela a fila e impede novas indicações", async () => {
    const espaco = await criarEspaco();
    const [{ slug }] = await sql("select slug from espacos where id = $1", [espaco]);
    const comercial = await criarMembro(espaco, "comercial");
    const a = await criarParceiro(espaco);
    const t = tel();
    await indicarPorLink(a.codigo_indicacao, t);
    const [msg] = await sql<{ id: string }>(
      "select id from fila_envios where espaco_id = $1 limit 1",
      [espaco],
    );
    await sql("select enfileirar_mensagem($1, $2, 'promo', 'pos_festa')", [espaco, t]);

    await servico((c) => c.query("select solicitar_lgpd_publico($1, 'exclusao', 'Ana', $2, null, 'Não quero contato', '1.2.3.4')", [slug, t]));
    expect(await sql("select 1 from bloqueio_contato where espaco_id = $1 and telefone = $2", [espaco, t])).toHaveLength(1);
    const fila = await sql("select status from fila_envios where espaco_id = $1 and destino = $2", [espaco, t]);
    expect(fila.every((f) => f.status === "bloqueado")).toBe(true);
    expect(await sql("select 1 from alertas where espaco_id = $1 and tipo = 'solicitacao_lgpd'", [espaco])).toHaveLength(1);

    // ninguém reabre um envio bloqueado
    const [bloq] = await sql("select id from fila_envios where espaco_id = $1 and destino = $2 limit 1", [espaco, t]);
    expect(await erroDe(usuario(comercial, (c) => c.query("update fila_envios set status = 'enviado' where id = $1", [bloq.id])))).toBe("contato_bloqueado");
    expect(msg).toBeTruthy();

    // novas indicações do mesmo telefone são recusadas
    const b = await criarParceiro(espaco);
    expect(await erroDe(indicarPorLink(b.codigo_indicacao, t))).toBe("contato_bloqueado");
  });

  it("anonimização apaga dados pessoais, mantém valores e o bloqueio", async () => {
    const espaco = await criarEspaco();
    const dono = await criarMembro(espaco, "dono");
    const comercial = await criarMembro(espaco, "comercial");
    const a = await criarParceiro(espaco);
    const t = tel();
    const r = await indicarPorLink(a.codigo_indicacao, t, { email: "ana@ex.com" });
    await usuario(dono, (c) => c.query("select fechar_indicacao($1, 5000)", [r.id]));

    expect(await erroDe(usuario(comercial, (c) => c.query("select anonimizar_contato($1, $2)", [espaco, t])))).toBe("sem_permissao");
    const [{ res }] = await usuario(dono, async (c) => (await c.query("select anonimizar_contato($1, $2) as res", [espaco, t])).rows);
    expect(res).toEqual({ indicacoes: 1, leads: 1 });
    const [i] = await sql("select nome_indicado, telefone_indicado, email_indicado, valor_fechado, anonimizada_em from indicacoes where id = $1", [r.id]);
    expect(i.nome_indicado).toBe("Anonimizado");
    expect(i.telefone_indicado).toMatch(/^anonimizado-/);
    expect(i.email_indicado).toBeNull();
    expect(Number(i.valor_fechado)).toBe(5000);
    const [lead] = await sql("select nome, telefone from leads where id = $1", [r.lead_id]);
    expect(lead).toEqual({ nome: "Anonimizado", telefone: null });
    expect(await sql("select 1 from bloqueio_contato where espaco_id = $1 and telefone = $2", [espaco, t])).toHaveLength(1);
  });

  it("dados de indicados nunca vão para outro parceiro (nem pelo motivo de duplicidade)", async () => {
    const espaco = await criarEspaco();
    const a = await criarParceiro(espaco);
    const b = await criarParceiro(espaco);
    const t = tel();
    await indicarPorLink(a.codigo_indicacao, t, { nome: "Fulana de Tal" });
    const r = await indicarPorLink(b.codigo_indicacao, t, { nome: "Fulana de Tal" });
    expect(r.motivo).not.toMatch(/Carla|Fulana/);
    expect(r.motivo).toMatch(/outro indicador/);
  });

  it("retenção anonimiza indicações antigas sem andamento", async () => {
    const espaco = await criarEspaco();
    const a = await criarParceiro(espaco);
    const r = await indicarPorLink(a.codigo_indicacao, tel());
    await sql("update indicacoes set status_atualizado_em = now() - interval '25 months' where id = $1", [r.id]);
    const [{ n }] = await servico(async (c) => (await c.query("select anonimizar_indicacoes_antigas($1, 24) as n", [espaco])).rows);
    expect(n).toBe(1);
  });
});
