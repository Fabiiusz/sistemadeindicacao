"use server";
import { revalidatePath } from "next/cache";
import { contextoEquipe } from "@/lib/auth";
import { voltarCom } from "@/lib/painel/flash";
import { normalizarTelefone } from "@/lib/indicacoes/telefone";

export async function criarLead(form: FormData) {
  const { supabase, espaco } = await contextoEquipe();
  const telefone = normalizarTelefone(String(form.get("telefone") ?? ""));
  if (!telefone) voltarCom("/painel/leads", { erro: "telefone_invalido" });
  const { error } = await supabase.from("leads").insert({
    espaco_id: espaco.id,
    nome: String(form.get("nome") ?? "").trim(),
    telefone,
    origem: String(form.get("origem") ?? "outro"),
    tipo_evento: String(form.get("tipo_evento") ?? "") || null,
  });
  revalidatePath("/painel/leads");
  voltarCom("/painel/leads", error ? { erro: error } : { ok: "Lead criado." });
}

export async function moverLead(form: FormData) {
  const { supabase } = await contextoEquipe();
  const valor = String(form.get("valor_fechado") ?? "").trim();
  const etapa = String(form.get("etapa"));
  const dados: Record<string, unknown> = { etapa };
  if (valor) dados.valor_fechado = Number(valor.includes(",") ? valor.replace(/\./g, "").replace(",", ".") : valor);
  const { error } = await supabase.from("leads").update(dados).eq("id", String(form.get("id")));
  revalidatePath("/painel/leads");
  voltarCom("/painel/leads", error ? { erro: error } : { ok: "Lead atualizado (indicação vinculada sincronizada)." });
}
