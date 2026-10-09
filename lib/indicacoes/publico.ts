import "server-only";
import { cache } from "react";
import { supabaseServico } from "@/lib/supabase/server";
import type { EspacoMarca } from "@/components/Marca";

/** Leituras para páginas públicas (sem login). Retornam só o necessário. */

export type EspacoPublico = EspacoMarca & { id: string; slug: string };

const CAMPOS_ESPACO = "id, slug, nome, logo_url, cor_primaria";

export const espacoPorSlug = cache(async (slug: string): Promise<EspacoPublico | null> => {
  const { data } = await supabaseServico().from("espacos").select(CAMPOS_ESPACO).eq("slug", slug).maybeSingle();
  return data;
});

export type RegraPublica = {
  tipo_recompensa: string;
  valor: number | null;
  descricao_recompensa: string | null;
  condicao_pagamento: string;
  validade_dias_atribuicao: number;
  beneficio_indicado_tipo: string | null;
  beneficio_indicado_valor: number | null;
  beneficio_indicado_descricao: string | null;
  limite_por_indicador: number | null;
};

export async function regraPublica(espacoId: string, publico: "parceiro" | "cliente", parceiroId?: string | null) {
  const { data } = await supabaseServico().rpc("regra_vigente", {
    p_espaco_id: espacoId,
    p_publico: publico,
    p_parceiro_id: parceiroId ?? null,
  });
  return ((data as RegraPublica[] | null) ?? [])[0] ?? null;
}

export const parceiroPorCodigo = cache(async (codigo: string) => {
  const { data } = await supabaseServico()
    .from("parceiros")
    .select(`id, nome, empresa, status, codigo_indicacao, espacos(${CAMPOS_ESPACO})`)
    .eq("codigo_indicacao", codigo.toUpperCase())
    .maybeSingle();
  if (!data) return null;
  const { espacos, ...parceiro } = data as unknown as {
    id: string;
    nome: string;
    empresa: string | null;
    status: string;
    codigo_indicacao: string;
    espacos: EspacoPublico;
  };
  return { parceiro, espaco: espacos };
});

export const clienteIndicadorPorCodigo = cache(async (codigo: string) => {
  const { data } = await supabaseServico()
    .from("indicadores_clientes")
    .select(`id, nome, codigo, espacos(${CAMPOS_ESPACO})`)
    .eq("codigo", codigo.toUpperCase())
    .maybeSingle();
  if (!data) return null;
  const { espacos, ...cliente } = data as unknown as { id: string; nome: string; codigo: string; espacos: EspacoPublico };
  return { cliente, espaco: espacos };
});

export function descreverBeneficioIndicado(regra: RegraPublica | null): string | null {
  if (!regra?.beneficio_indicado_tipo) return null;
  if (regra.beneficio_indicado_descricao) return regra.beneficio_indicado_descricao;
  const v = Number(regra.beneficio_indicado_valor ?? 0);
  if (regra.beneficio_indicado_tipo === "desconto_percentual") return `${v}% de desconto na sua festa`;
  if (regra.beneficio_indicado_tipo === "desconto_valor")
    return `${v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} de desconto na sua festa`;
  return "Um brinde especial na sua festa";
}

export function descreverRecompensa(regra: RegraPublica | null): string | null {
  if (!regra) return null;
  const v = Number(regra.valor ?? 0);
  const moeda = v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  switch (regra.tipo_recompensa) {
    case "percentual":
      return `${v}% do valor fechado`;
    case "valor_fixo":
      return `${moeda} por festa fechada`;
    case "credito":
      return `${moeda} de crédito na sua próxima festa`;
    default:
      return regra.descricao_recompensa ?? "Um brinde";
  }
}

export const CONDICAO_TEXTO: Record<string, string> = {
  fechamento: "quando o contrato for fechado",
  sinal_pago: "quando o sinal for pago",
  evento_realizado: "depois que o evento acontecer",
};
