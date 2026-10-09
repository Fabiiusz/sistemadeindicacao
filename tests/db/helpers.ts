import { randomUUID } from "crypto";
import pg from "pg";

export const DB_URL = process.env.TEST_DATABASE_URL;
export const temBanco = Boolean(DB_URL);

let pool: pg.Pool | null = null;
export function getPool(): pg.Pool {
  if (!pool) pool = new pg.Pool({ connectionString: DB_URL, max: 4 });
  return pool;
}

export async function fecharPool() {
  await pool?.end();
  pool = null;
}

/** Executa como superusuário (fixtures, viagem no tempo). */
export async function sql<T extends pg.QueryResultRow = pg.QueryResultRow>(texto: string, params: unknown[] = []) {
  return (await getPool().query<T>(texto, params)).rows;
}

type Papel = { role: "authenticated" | "anon" | "service_role"; userId?: string; email?: string };

/** Executa em transação simulando o PostgREST do Supabase (role + JWT). */
export async function como<T>(papel: Papel, fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const c = await getPool().connect();
  try {
    await c.query("begin");
    await c.query(`set local role ${papel.role}`);
    await c.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify(papel.userId ? { sub: papel.userId, email: papel.email ?? null, role: papel.role } : { role: papel.role }),
    ]);
    const r = await fn(c);
    await c.query("commit");
    return r;
  } catch (e) {
    await c.query("rollback");
    throw e;
  } finally {
    c.release();
  }
}

export const servico = <T>(fn: (c: pg.PoolClient) => Promise<T>) => como({ role: "service_role" }, fn);
export const usuario = <T>(userId: string, fn: (c: pg.PoolClient) => Promise<T>) =>
  como({ role: "authenticated", userId }, fn);

let seq = 0;
/** Telefone único por chamada (evita colisões entre testes). */
export function tel(): string {
  seq += 1;
  const n = (Date.now() % 1_0000_0000) + seq * 7919;
  return `+55119${String(n % 1_0000_0000).padStart(8, "0")}`;
}

export async function criarEspaco(config: Record<string, unknown> = {}) {
  const [e] = await sql<{ id: string }>(
    "insert into espacos (nome, slug, config, whatsapp_comercial) values ($1, $2, $3, '+5511900000000') returning id",
    ["Espaço Teste", `teste-${randomUUID().slice(0, 8)}`, JSON.stringify(config)],
  );
  return e.id;
}

export async function criarMembro(espacoId: string, papel: "dono" | "gerente" | "comercial" = "dono") {
  const id = randomUUID();
  await sql("insert into auth.users (id, email) values ($1, $2)", [id, `${id}@teste.com`]);
  await sql("insert into membros_espaco (espaco_id, user_id, papel) values ($1, $2, $3)", [espacoId, id, papel]);
  return id;
}

export async function criarParceiro(espacoId: string, extra: Partial<{ status: string; email: string; documento: string; userId: string }> = {}) {
  const telefone = tel();
  const [p] = await sql<{ id: string; codigo_indicacao: string; telefone: string }>(
    `insert into parceiros (espaco_id, nome, tipo, telefone, email, documento, codigo_indicacao, status, user_id)
     values ($1, 'Carla Cerimonial', 'cerimonialista', $2, $3, $4, gerar_codigo_parceiro(), $5, $6)
     returning id, codigo_indicacao, telefone`,
    [espacoId, telefone, extra.email ?? null, extra.documento ?? null, extra.status ?? "ativo", extra.userId ?? null],
  );
  return p;
}

export async function criarRegra(espacoId: string, campos: Record<string, unknown> = {}) {
  const base: Record<string, unknown> = {
    espaco_id: espacoId,
    publico: "parceiro",
    tipo_recompensa: "percentual",
    valor: 5,
    base_calculo: "valor_fechado",
    condicao_pagamento: "evento_realizado",
    validade_dias_atribuicao: 90,
    vigencia_inicio: "2020-01-01",
    ...campos,
  };
  const cols = Object.keys(base);
  const [r] = await sql<{ id: string }>(
    `insert into regras_indicacao (${cols.join(",")}) values (${cols.map((_, i) => `$${i + 1}`).join(",")}) returning id`,
    Object.values(base),
  );
  return r.id;
}

export type ResultadoRegistro = { id: string; status: string; motivo: string | null; lead_id: string | null };

export async function indicarPorLink(
  codigo: string,
  telefone: string,
  extra: Partial<{ tipo: "parceiro" | "cliente"; ipHash: string | null; consentimento: boolean; nome: string; email: string }> = {},
): Promise<ResultadoRegistro> {
  return servico(async (c) => {
    const { rows } = await c.query(
      `select registrar_indicacao_publica($1, $2, $3, $4, $5, 'Casamento', null, 120, null, $6,
              'Fui indicado e autorizo', '200.1.1.1', $7, 'vitest') as r`,
      [codigo, extra.tipo ?? "parceiro", extra.nome ?? "Ana Paula Lima", telefone, extra.email ?? null,
       extra.consentimento ?? true, extra.ipHash === undefined ? null : extra.ipHash],
    );
    return rows[0].r as ResultadoRegistro;
  });
}

export async function erroDe(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    return (e as Error).message;
  }
  return "(sem erro)";
}
