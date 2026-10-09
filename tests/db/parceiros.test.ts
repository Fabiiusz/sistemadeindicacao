import { randomUUID } from "crypto";
import { afterAll, describe, expect, it } from "vitest";
import {
  como,
  criarEspaco,
  criarMembro,
  criarParceiro,
  criarRegra,
  erroDe,
  fecharPool,
  indicarPorLink,
  servico,
  sql,
  tel,
  temBanco,
  usuario,
} from "./helpers";

afterAll(fecharPool);

async function usuarioAuth(email: string) {
  const id = randomUUID();
  await sql("insert into auth.users (id, email) values ($1, $2)", [id, email]);
  return id;
}

describe.skipIf(!temBanco)("cadastro e aprovação de parceiros", () => {
  it("cadastro público cria parceiro pendente com aceite dos termos e alerta o dono", async () => {
    const espaco = await criarEspaco();
    const [{ slug }] = await sql("select slug from espacos where id = $1", [espaco]);
    const t = tel();
    const [{ r }] = await servico(async (c) =>
      (await c.query(
        "select cadastrar_parceiro_publico($1, 'Bia Fotos', 'Bia Studio', 'fotografo', $2, 'BIA@ex.com', null, 'pix@bia', true, 'parceiros-v1', '10.0.0.1') as r",
        [slug, t],
      )).rows,
    );
    expect(r.status).toBe("pendente");
    const [p] = await sql("select * from parceiros where id = $1", [r.id]);
    expect(p).toMatchObject({ status: "pendente", email: "bia@ex.com", versao_termos: "parceiros-v1", aceite_ip: "10.0.0.1" });
    expect(p.codigo_indicacao).toMatch(/^[A-Z0-9]{6}$/);
    expect(await sql("select 1 from alertas where referencia_id = $1 and tipo = 'parceiro_pendente'", [r.id])).toHaveLength(1);

    // mesmo WhatsApp não cadastra de novo
    const erro = await erroDe(
      servico((c) => c.query("select cadastrar_parceiro_publico($1, 'Outra', null, 'dj', $2, null, null, null, true, 'parceiros-v1', null)", [slug, t])),
    );
    expect(erro).toBe("parceiro_ja_cadastrado");
    // sem aceite não cadastra
    const erro2 = await erroDe(
      servico((c) => c.query("select cadastrar_parceiro_publico($1, 'Outra', null, 'dj', $2, null, null, null, false, 'parceiros-v1', null)", [slug, tel()])),
    );
    expect(erro2).toBe("termos_obrigatorios");
  });

  it("anon e usuários comuns não chamam o cadastro direto (só o servidor)", async () => {
    const erro = await erroDe(
      como({ role: "anon" }, (c) => c.query("select cadastrar_parceiro_publico('x', 'a', null, 'dj', '11999999999', null, null, null, true, 'v1', null)")),
    );
    expect(erro).toMatch(/permission denied/);
  });

  it("só dono/gerente aprova; aprovar enfileira WhatsApp com o link", async () => {
    const espaco = await criarEspaco();
    const comercial = await criarMembro(espaco, "comercial");
    const gerente = await criarMembro(espaco, "gerente");
    const p = await criarParceiro(espaco, { status: "pendente" });
    expect(await erroDe(usuario(comercial, (c) => c.query("select alterar_status_parceiro($1, 'ativo')", [p.id])))).toBe("sem_permissao");
    await usuario(gerente, (c) => c.query("select alterar_status_parceiro($1, 'ativo', null, 'https://app.test')", [p.id]));
    const [pp] = await sql("select status, aprovado_por from parceiros where id = $1", [p.id]);
    expect(pp).toMatchObject({ status: "ativo", aprovado_por: gerente });
    const [msg] = await sql("select mensagem, destino from fila_envios where referencia_id = $1", [p.id]);
    expect(msg.mensagem).toContain(`https://app.test/i/${p.codigo_indicacao}`);
    expect(msg.destino).toBe(p.telefone);
    // bloquear exige motivo
    expect(await erroDe(usuario(gerente, (c) => c.query("select alterar_status_parceiro($1, 'bloqueado')", [p.id])))).toBe("motivo_obrigatorio");
  });
});

describe.skipIf(!temBanco)("RLS: parceiro só vê o que é dele", () => {
  it("parceiro não lê a tabela de indicações nem dados de outros parceiros", async () => {
    const espaco = await criarEspaco();
    await criarRegra(espaco, { tipo_recompensa: "valor_fixo", valor: 250 });
    const userA = await usuarioAuth(`a-${randomUUID()}@ex.com`);
    const userB = await usuarioAuth(`b-${randomUUID()}@ex.com`);
    const a = await criarParceiro(espaco, { userId: userA });
    const b = await criarParceiro(espaco, { userId: userB });
    const ta = tel();
    await indicarPorLink(a.codigo_indicacao, ta, { nome: "maria clara souza" });
    await indicarPorLink(b.codigo_indicacao, tel(), { nome: "Pedro Henrique Alves" });

    await usuario(userA, async (c) => {
      // leitura direta bloqueada por RLS
      expect((await c.query("select * from indicacoes")).rows).toHaveLength(0);
      expect((await c.query("select * from recompensas")).rows).toHaveLength(0);
      expect((await c.query("select * from leads")).rows).toHaveLength(0);
      expect((await c.query("select * from indicacao_eventos")).rows).toHaveLength(0);
      // só o próprio cadastro
      const parceiros = (await c.query("select id from parceiros")).rows;
      expect(parceiros.map((x) => x.id)).toEqual([a.id]);
      // painel mascarado
      const minhas = (await c.query("select * from minhas_indicacoes()")).rows;
      expect(minhas).toHaveLength(1);
      expect(minhas[0].nome_indicado).toBe("Maria S.");
      expect(Object.keys(minhas[0])).not.toContain("telefone_indicado");
      expect(JSON.stringify(minhas)).not.toContain(ta);
      expect(Number(minhas[0].recompensa_prevista)).toBe(250);
      const recs = (await c.query("select * from minhas_recompensas()")).rows;
      expect(recs).toHaveLength(1);
      // vê a marca do seu espaço
      expect((await c.query("select id from espacos")).rows).toHaveLength(1);
    });

    await usuario(userB, async (c) => {
      const minhas = (await c.query("select nome_indicado from minhas_indicacoes()")).rows;
      expect(minhas.map((m) => m.nome_indicado)).toEqual(["Pedro A."]);
    });
  });

  it("parceiro não chama ranking nem funções da equipe", async () => {
    const espaco = await criarEspaco();
    const user = await usuarioAuth(`c-${randomUUID()}@ex.com`);
    const a = await criarParceiro(espaco, { userId: user });
    const r = await indicarPorLink(a.codigo_indicacao, tel());
    expect(await erroDe(usuario(user, (c) => c.query("select * from ranking_parceiros($1)", [espaco])))).toBe("sem_permissao");
    expect(await erroDe(usuario(user, (c) => c.query("select fechar_indicacao($1, 999999)", [r.id])))).toBe("sem_permissao");
    expect(await erroDe(usuario(user, (c) => c.query("select alterar_status_parceiro($1, 'ativo')", [a.id])))).toBe("sem_permissao");
  });

  it("equipe de outro espaço não vê nada", async () => {
    const espaco = await criarEspaco();
    const outro = await criarEspaco();
    const intruso = await criarMembro(outro, "dono");
    const a = await criarParceiro(espaco);
    await indicarPorLink(a.codigo_indicacao, tel());
    await usuario(intruso, async (c) => {
      expect((await c.query("select * from indicacoes where espaco_id = $1", [espaco])).rows).toHaveLength(0);
      expect((await c.query("select * from parceiros where espaco_id = $1", [espaco])).rows).toHaveLength(0);
      expect((await c.query("select * from leads where espaco_id = $1", [espaco])).rows).toHaveLength(0);
    });
  });

  it("vincula o login ao parceiro pelo e-mail", async () => {
    const espaco = await criarEspaco();
    const email = `vinc-${randomUUID()}@ex.com`;
    const a = await criarParceiro(espaco, { email });
    const user = await usuarioAuth(email);
    const rows = await como({ role: "authenticated", userId: user, email: email.toUpperCase() }, async (c) =>
      (await c.query("select id from vincular_parceiro_usuario()")).rows,
    );
    expect(rows.map((x) => x.id)).toEqual([a.id]);
  });
});

describe.skipIf(!temBanco)("indicação manual pelo parceiro", () => {
  it("exige declaração de autorização e registra a base legal", async () => {
    const espaco = await criarEspaco();
    const user = await usuarioAuth(`m-${randomUUID()}@ex.com`);
    await criarParceiro(espaco, { userId: user });
    const t = tel();
    expect(
      await erroDe(usuario(user, (c) => c.query("select registrar_indicacao_parceiro('Joana Dias', $1, 'Casamento', null, null, null, false)", [t]))),
    ).toBe("consentimento_obrigatorio");
    const [{ r }] = await usuario(user, async (c) =>
      (await c.query("select registrar_indicacao_parceiro('Joana Dias', $1, 'Casamento', null, 80, null, true) as r", [t])).rows,
    );
    expect(r).toEqual({ status: "recebida", motivo: null });
    const [i] = await sql("select canal, base_legal, origem_contato from indicacoes where telefone_indicado = $1 and espaco_id = $2", [t, espaco]);
    expect(i.canal).toBe("painel_parceiro");
    expect(i.base_legal).toMatch(/declarado pelo parceiro/);
    expect(i.origem_contato).toMatch(/declarou ter autorização/);
  });

  it("parceiro pausado não indica", async () => {
    const espaco = await criarEspaco();
    const user = await usuarioAuth(`p-${randomUUID()}@ex.com`);
    await criarParceiro(espaco, { userId: user, status: "pausado" });
    expect(
      await erroDe(usuario(user, (c) => c.query("select registrar_indicacao_parceiro('X Y', $1, null, null, null, null, true)", [tel()]))),
    ).toBe("parceiro_inativo");
  });
});

describe.skipIf(!temBanco)("ranking e antifraude", () => {
  it("ranking calcula conversão, receita e comissão devida", async () => {
    const espaco = await criarEspaco();
    const dono = await criarMembro(espaco);
    await criarRegra(espaco, { valor: 10, condicao_pagamento: "fechamento" });
    const a = await criarParceiro(espaco);
    const r1 = await indicarPorLink(a.codigo_indicacao, tel());
    await indicarPorLink(a.codigo_indicacao, tel());
    await usuario(dono, (c) => c.query("select fechar_indicacao($1, 30000)", [r1.id]));
    const rows = await usuario(dono, async (c) => (await c.query("select * from ranking_parceiros($1)", [espaco])).rows);
    expect(rows[0]).toMatchObject({ parceiro_id: a.id, indicacoes: "2", fechamentos: "1" });
    expect(Number(rows[0].taxa_conversao)).toBe(50);
    expect(Number(rows[0].receita)).toBe(30000);
    expect(Number(rows[0].comissao_devida)).toBe(3000);
  });

  it("parceiro com muitas inválidas gera alerta para revisão manual", async () => {
    const espaco = await criarEspaco();
    const a = await criarParceiro(espaco);
    // 4 tentativas de autoindicação / duplicadas
    await indicarPorLink(a.codigo_indicacao, a.telefone);
    const t = tel();
    await indicarPorLink(a.codigo_indicacao, t);
    await indicarPorLink(a.codigo_indicacao, t);
    await indicarPorLink(a.codigo_indicacao, t);
    const alertas = await sql("select titulo from alertas where referencia_id = $1 and tipo = 'parceiro_suspeito'", [a.id]);
    expect(alertas).toHaveLength(1);
  });
});
