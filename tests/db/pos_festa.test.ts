import { afterAll, describe, expect, it } from "vitest";
import { criarEspaco, criarMembro, criarRegra, erroDe, fecharPool, indicarPorLink, servico, sql, tel, temBanco, usuario } from "./helpers";

afterAll(fecharPool);

async function criarFesta(espaco: string, diasAtras: number, extra: { telefone?: string; status?: string } = {}) {
  const [f] = await sql<{ id: string; anfitriao_telefone: string }>(
    `insert into festas (espaco_id, anfitriao_nome, anfitriao_telefone, data_evento, status, tipo_evento)
     values ($1, 'Fernanda Rocha', $2, current_date - $3::int, $4, 'Aniversário infantil') returning id, anfitriao_telefone`,
    [espaco, extra.telefone ?? tel(), diasAtras, extra.status ?? "realizada"],
  );
  return f;
}

async function responder(token: string, nota: number, comentario = "") {
  return servico(async (c) => (await c.query("select responder_pesquisa($1, $2, $3) as r", [token, nota, comentario])).rows[0].r);
}

describe.skipIf(!temBanco)("pós-festa", () => {
  it("gera o lote X dias depois da festa (configurável), uma vez só, respeitando bloqueio", async () => {
    const espaco = await criarEspaco({ dias_pos_festa: 3 });
    const comercial = await criarMembro(espaco, "comercial");
    const f3 = await criarFesta(espaco, 3);
    await criarFesta(espaco, 1); // cedo demais
    await criarFesta(espaco, 5, { status: "cancelada" });
    await criarFesta(espaco, 60); // antiga demais
    const bloqueada = await criarFesta(espaco, 4);
    await sql("insert into bloqueio_contato (espaco_id, telefone) values ($1, $2)", [espaco, bloqueada.anfitriao_telefone]);

    const [{ n }] = await usuario(comercial, async (c) =>
      (await c.query("select gerar_lote_pos_festa($1, 'https://app.test') as n", [espaco])).rows,
    );
    expect(n).toBe(2);
    const fila = await sql("select destino, status, mensagem from fila_envios where espaco_id = $1 and tipo = 'pos_festa' order by status", [espaco]);
    expect(fila.map((x) => x.status)).toEqual(["bloqueado", "pendente"]);
    const pendente = fila.find((x) => x.status === "pendente")!;
    expect(pendente.destino).toBe(f3.anfitriao_telefone);
    expect(pendente.mensagem).toMatch(/https:\/\/app\.test\/r\/[0-9a-f]{40}/);

    // idempotente (cron + botão no mesmo dia)
    const [{ n: n2 }] = await servico(async (c) => (await c.query("select gerar_lote_pos_festa($1, 'x') as n", [espaco])).rows);
    expect(n2).toBe(0);
  });

  it("nota 9-10 libera indicação com código /v; 0-6 gera alerta e não libera", async () => {
    const espaco = await criarEspaco({ dias_pos_festa: 2 });
    await criarFesta(espaco, 2);
    await criarFesta(espaco, 2);
    await sql("select gerar_lote_pos_festa($1, 'x')", [espaco]);
    const [p1, p2] = await sql("select token from pesquisas_pos_festa where espaco_id = $1", [espaco]);

    const promotor = await responder(p1.token, 10, "Amei!");
    expect(promotor.codigo).toMatch(/^[A-Z0-9]{6}$/);
    expect(await erroDe(responder(p1.token, 10))).toBe("pesquisa_ja_respondida");

    const detrator = await responder(p2.token, 4, "Som muito alto e atraso no buffet");
    expect(detrator.codigo).toBeNull();
    const [alerta] = await sql("select titulo, descricao, para_papeis from alertas where espaco_id = $1 and tipo = 'nps_detrator'", [espaco]);
    expect(alerta.titulo).toMatch(/nota 4/);
    expect(alerta.descricao).toMatch(/Som muito alto/);
    expect(alerta.para_papeis).toEqual(["dono", "gerente"]);
    expect(await sql("select 1 from indicadores_clientes where espaco_id = $1", [espaco])).toHaveLength(1);
  });

  it("nota fora de 0-10 e token inválido são recusados", async () => {
    expect(await erroDe(responder("nao-existe", 9))).toBe("token_invalido");
    const espaco = await criarEspaco();
    await criarFesta(espaco, 2);
    await sql("select gerar_lote_pos_festa($1, 'x')", [espaco]);
    const [p] = await sql("select token from pesquisas_pos_festa where espaco_id = $1", [espaco]);
    expect(await erroDe(responder(p.token, 11))).toBe("nota_invalida");
  });

  it("amigo indicado pelo /v vira indicação de origem cliente com benefício previsto e vinculada ao anfitrião", async () => {
    const espaco = await criarEspaco();
    const dono = await criarMembro(espaco);
    await criarRegra(espaco, {
      publico: "cliente",
      tipo_recompensa: "credito",
      valor: 200,
      condicao_pagamento: "fechamento",
      limite_por_indicador: 1,
      beneficio_indicado_tipo: "brinde",
      beneficio_indicado_descricao: "Mesa de doces",
    });
    const festa = await criarFesta(espaco, 2);
    await sql("select gerar_lote_pos_festa($1, 'x')", [espaco]);
    const [p] = await sql("select token from pesquisas_pos_festa where espaco_id = $1", [espaco]);
    const { codigo } = await responder(p.token, 9);

    const r = await indicarPorLink(codigo, tel(), { tipo: "cliente" });
    expect(r.status).toBe("recebida");
    const [i] = await sql("select origem, canal, indicador_festa_id, indicador_cliente_id from indicacoes where id = $1", [r.id]);
    expect(i).toMatchObject({ origem: "cliente", canal: "link_cliente", indicador_festa_id: festa.id });
    const recs = await sql("select beneficiario, status, valor, descricao from recompensas where indicacao_id = $1 order by beneficiario", [r.id]);
    expect(recs.map((x) => [x.beneficiario, x.status])).toEqual([
      ["cliente_indicador", "prevista"],
      ["indicado", "prevista"],
    ]);

    await usuario(dono, (c) => c.query("select fechar_indicacao($1, 8000)", [r.id]));
    const aprov = await sql("select beneficiario, status from recompensas where indicacao_id = $1 order by beneficiario", [r.id]);
    expect(aprov.every((x) => x.status === "aprovada")).toBe(true);

    // limite de 1 indicação recompensada por cliente
    const r2 = await indicarPorLink(codigo, tel(), { tipo: "cliente" });
    expect(await sql("select 1 from recompensas where indicacao_id = $1 and beneficiario = 'cliente_indicador'", [r2.id])).toHaveLength(0);

    // anfitrião não pode indicar a si mesmo
    const r3 = await indicarPorLink(codigo, festa.anfitriao_telefone, { tipo: "cliente" });
    expect(r3.status).toBe("invalida");
  });
});
