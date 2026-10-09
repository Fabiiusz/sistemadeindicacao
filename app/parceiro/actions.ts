"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { supabaseServidor } from "@/lib/supabase/server";
import { mensagemErro } from "@/lib/indicacoes/erros";
import { normalizarTelefone } from "@/lib/indicacoes/telefone";

export type EstadoForm = { ok: boolean; mensagem: string; erros?: Record<string, string> };

const esquemaIndicacao = z.object({
  nome: z.string().trim().min(2, "Informe o nome do cliente."),
  telefone: z.string().refine((v) => normalizarTelefone(v) !== null, "WhatsApp inválido. Use DDD + número."),
  tipo_evento: z.string().optional(),
  data_evento: z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]).optional(),
  convidados: z.union([z.literal(""), z.coerce.number().int().min(1).max(100000)]).optional(),
  observacoes: z.string().max(1000).optional(),
  declaracao: z.literal("on", { message: "Confirme que o cliente autorizou o contato." }),
});

export async function indicarPeloPainel(_: EstadoForm, form: FormData): Promise<EstadoForm> {
  const dados = esquemaIndicacao.safeParse(Object.fromEntries(form));
  if (!dados.success) {
    const erros: Record<string, string> = {};
    for (const issue of dados.error.issues) erros[String(issue.path[0])] = issue.message;
    return { ok: false, mensagem: "Confira os campos destacados.", erros };
  }
  const d = dados.data;
  const supabase = await supabaseServidor();
  const { data, error } = await supabase.rpc("registrar_indicacao_parceiro", {
    p_nome: d.nome,
    p_telefone: d.telefone,
    p_tipo_evento: d.tipo_evento || null,
    p_data_evento: d.data_evento || null,
    p_convidados: d.convidados === "" || d.convidados === undefined ? null : d.convidados,
    p_observacoes: d.observacoes || null,
    p_declaracao_autorizacao: true,
  });
  if (error) return { ok: false, mensagem: mensagemErro(error) };
  revalidatePath("/parceiro");
  const r = data as { status: string; motivo: string | null };
  if (r.status === "recebida")
    return { ok: true, mensagem: "Indicação registrada! A equipe vai entrar em contato com o cliente. Acompanhe pelo painel." };
  return {
    ok: false,
    mensagem: `Indicação registrada, mas não será contabilizada: ${r.motivo ?? "contato já conhecido pelo espaço."}`,
  };
}

export async function atualizarMeusDados(_: EstadoForm, form: FormData): Promise<EstadoForm> {
  const email = String(form.get("email") ?? "").trim();
  if (email && !z.string().email().safeParse(email).success) return { ok: false, mensagem: "E-mail inválido." };
  const supabase = await supabaseServidor();
  const { error } = await supabase.rpc("atualizar_meus_dados", {
    p_email: email || null,
    p_chave_pix: String(form.get("chave_pix") ?? ""),
  });
  if (error) return { ok: false, mensagem: mensagemErro(error) };
  revalidatePath("/parceiro");
  return { ok: true, mensagem: "Dados atualizados." };
}
