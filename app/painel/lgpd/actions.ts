"use server";
import { revalidatePath } from "next/cache";
import { contextoEquipe } from "@/lib/auth";
import { voltarCom } from "@/lib/painel/flash";
import { normalizarTelefone } from "@/lib/indicacoes/telefone";

export async function anonimizar(form: FormData) {
  const { supabase, espaco } = await contextoEquipe(["dono", "gerente"]);
  const { data, error } = await supabase.rpc("anonimizar_contato", {
    p_espaco_id: espaco.id,
    p_telefone: String(form.get("telefone") ?? ""),
    p_solicitacao_id: String(form.get("solicitacao_id") ?? "") || null,
  });
  revalidatePath("/painel/lgpd");
  const r = data as { indicacoes: number; leads: number } | null;
  voltarCom("/painel/lgpd", error ? { erro: error } : { ok: `Anonimizado: ${r?.indicacoes ?? 0} indicação(ões) e ${r?.leads ?? 0} lead(s).` });
}

export async function responder(form: FormData) {
  const { supabase } = await contextoEquipe(["dono", "gerente"]);
  const { error } = await supabase.rpc("responder_solicitacao_lgpd", {
    p_id: String(form.get("id")),
    p_status: String(form.get("status")),
    p_resposta: String(form.get("resposta") ?? ""),
  });
  revalidatePath("/painel/lgpd");
  voltarCom("/painel/lgpd", error ? { erro: error } : { ok: "Solicitação atualizada." });
}

export async function bloquear(form: FormData) {
  const { supabase, espaco } = await contextoEquipe();
  const telefone = normalizarTelefone(String(form.get("telefone") ?? ""));
  if (!telefone) voltarCom("/painel/lgpd", { erro: "telefone_invalido" });
  const { error } = await supabase
    .from("bloqueio_contato")
    .upsert({ espaco_id: espaco.id, telefone, motivo: String(form.get("motivo") ?? "") || "Manual", origem: "manual" }, { onConflict: "espaco_id,telefone" });
  revalidatePath("/painel/lgpd");
  voltarCom("/painel/lgpd", error ? { erro: error } : { ok: "Telefone bloqueado para todas as mensagens." });
}
