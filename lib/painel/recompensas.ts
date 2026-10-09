import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { LinhaRecompensa } from "./csv";

/** Recompensas aprovadas (a pagar) e pagas no período, com beneficiário. */
export async function buscarRecompensas(
  supabase: SupabaseClient,
  espacoId: string,
  filtros: { status: "aprovada" | "paga"; de?: string; ate?: string },
) {
  let q = supabase
    .from("recompensas")
    .select(
      "id, beneficiario, tipo, descricao, valor, status, aprovada_em, paga_em, forma_pagamento, comprovante_url, indicacao_id, parceiros(id, nome, chave_pix, documento, telefone), indicadores_clientes(id, nome, telefone), indicacoes(nome_indicado, valor_fechado)",
    )
    .eq("espaco_id", espacoId)
    .eq("status", filtros.status);
  const campo = filtros.status === "paga" ? "paga_em" : "aprovada_em";
  if (filtros.de) q = q.gte(campo, filtros.de);
  if (filtros.ate) q = q.lte(campo, filtros.status === "paga" ? filtros.ate : `${filtros.ate}T23:59:59.999-03:00`);
  const { data, error } = await q.order(campo, { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as LinhaRecompensa[];
}
