"use server";
import { revalidatePath } from "next/cache";
import { contextoEquipe } from "@/lib/auth";
import { voltarCom } from "@/lib/painel/flash";
import { normalizarTelefone } from "@/lib/indicacoes/telefone";

const num = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const n = Number(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s);
  return Number.isFinite(n) ? n : null;
};

export async function criarRegra(form: FormData) {
  const { supabase, espaco, user } = await contextoEquipe(["dono", "gerente"]);
  const publico = String(form.get("publico")) === "cliente" ? "cliente" : "parceiro";
  const beneficioTipo = String(form.get("beneficio_indicado_tipo") ?? "") || null;
  const { error } = await supabase.from("regras_indicacao").insert({
    espaco_id: espaco.id,
    nome: String(form.get("nome") ?? "").trim() || (publico === "parceiro" ? "Regra de parceiros" : "Regra de clientes"),
    publico,
    tipo_recompensa: String(form.get("tipo_recompensa")),
    valor: num(form.get("valor")),
    descricao_recompensa: String(form.get("descricao_recompensa") ?? "") || null,
    base_calculo: String(form.get("base_calculo") ?? "valor_fechado"),
    condicao_pagamento: String(form.get("condicao_pagamento") ?? "evento_realizado"),
    validade_dias_atribuicao: Number(form.get("validade_dias_atribuicao") || 90),
    vigencia_inicio: String(form.get("vigencia_inicio") || new Date().toISOString().slice(0, 10)),
    limite_por_indicador: Number(form.get("limite_por_indicador")) || null,
    beneficio_indicado_tipo: beneficioTipo,
    beneficio_indicado_valor: beneficioTipo ? num(form.get("beneficio_indicado_valor")) : null,
    beneficio_indicado_descricao: beneficioTipo ? String(form.get("beneficio_indicado_descricao") ?? "") || null : null,
    criado_por: user.id,
  });
  revalidatePath("/painel/regras");
  voltarCom("/painel/regras", error ? { erro: error } : { ok: "Regra criada. Vale para indicações feitas a partir da vigência." });
}

export async function salvarConfiguracoes(form: FormData) {
  const { supabase, espaco } = await contextoEquipe(["dono", "gerente"]);
  const inteiro = (k: string, padrao: number, min: number, max: number) =>
    Math.min(max, Math.max(min, Number(form.get(k)) || padrao));
  const cor = String(form.get("cor_primaria") ?? "");
  const whats = String(form.get("whatsapp_comercial") ?? "").trim();
  const { error } = await supabase
    .from("espacos")
    .update({
      nome: String(form.get("nome") ?? "").trim() || espaco.nome,
      logo_url: String(form.get("logo_url") ?? "").trim() || null,
      cor_primaria: /^#[0-9a-f]{6}$/i.test(cor) ? cor : espaco.cor_primaria,
      whatsapp_comercial: whats ? normalizarTelefone(whats) : null,
      config: {
        ...(espaco.config ?? {}),
        dias_pos_festa: inteiro("dias_pos_festa", 2, 0, 60),
        rate_limit_por_ip: inteiro("rate_limit_por_ip", 5, 1, 100),
        rate_limit_parceiro_dia: inteiro("rate_limit_parceiro_dia", 20, 1, 500),
      },
    })
    .eq("id", espaco.id);
  revalidatePath("/painel", "layout");
  voltarCom("/painel/regras", error ? { erro: error } : { ok: "Configurações salvas." });
}
