import { afterAll, describe, expect, it } from "vitest";
import { fecharPool, sql, temBanco } from "./helpers";

afterAll(fecharPool);

describe.skipIf(!temBanco || process.env.SEM_SEED === "1")("seeds de demonstração", () => {
  it("cria 3 parceiros e 10 indicações em estágios variados", async () => {
    const [e] = await sql("select id from espacos where slug = 'porta-cheia-demo'");
    expect(e).toBeTruthy();
    const parceiros = await sql("select status from parceiros where espaco_id = $1 order by status", [e.id]);
    expect(parceiros.map((p) => p.status)).toEqual(["ativo", "ativo", "pendente"]);
    const ind = await sql("select status, count(*)::int as n from indicacoes where espaco_id = $1 group by status order by status", [e.id]);
    const porStatus = Object.fromEntries(ind.map((x) => [x.status, x.n]));
    expect(porStatus).toEqual({
      contatada: 1,
      duplicada: 1,
      evento_realizado: 2,
      fechada: 2,
      invalida: 1,
      perdida: 1,
      recebida: 1,
      visita_agendada: 1,
    });
    const rec = await sql("select beneficiario, status, valor from recompensas where espaco_id = $1 and beneficiario <> 'indicado' and valor is not null order by valor", [e.id]);
    expect(rec.map((r) => `${r.beneficiario}:${r.status}:${r.valor}`)).toEqual([
      "cliente_indicador:aprovada:200.00",
      "parceiro:paga:700.00",
      "parceiro:aprovada:1120.00",
      "parceiro:prevista:1960.00",
    ]);
    const alertas = await sql("select tipo from alertas_prazos where espaco_id = $1 order by tipo", [e.id]);
    expect(alertas.map((a) => a.tipo)).toEqual(["pagamento_atrasado", "parada_5_dias", "sem_contato_24h"]);
    expect(await sql("select 1 from membros_espaco where espaco_id = $1", [e.id])).toHaveLength(0);
  });
});
