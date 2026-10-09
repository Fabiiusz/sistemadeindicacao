"use server";
import { revalidatePath } from "next/cache";
import { contextoEquipe } from "@/lib/auth";
import { env } from "@/lib/env";
import { voltarCom } from "@/lib/painel/flash";

export async function gerarLoteHoje() {
  const { supabase, espaco } = await contextoEquipe();
  const { data, error } = await supabase.rpc("gerar_lote_pos_festa", { p_espaco_id: espaco.id, p_base_url: env.appUrl() });
  revalidatePath("/painel/fila");
  voltarCom("/painel/fila", error ? { erro: error } : { ok: `${data ?? 0} mensagem(ns) pós-festa adicionada(s) à fila.` });
}

export async function atualizarItemFila(form: FormData) {
  const { supabase, user } = await contextoEquipe();
  const id = String(form.get("id"));
  const status = String(form.get("status"));
  if (!["enviado", "cancelado", "pendente"].includes(status)) voltarCom("/painel/fila", { erro: "status_invalido" });
  const { error } = await supabase
    .from("fila_envios")
    .update({
      status,
      enviado_em: status === "enviado" ? new Date().toISOString() : null,
      enviado_por: status === "enviado" ? user.id : null,
    })
    .eq("id", id)
    .neq("status", "bloqueado"); // opt-out nunca é reaberto
  revalidatePath("/painel/fila");
  if (error) voltarCom("/painel/fila", { erro: error });
}
