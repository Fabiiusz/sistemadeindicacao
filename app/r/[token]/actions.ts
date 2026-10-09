"use server";
import { supabaseServico } from "@/lib/supabase/server";
import { mensagemErro } from "@/lib/indicacoes/erros";

export type EstadoPesquisa = { etapa: "form" | "promotor" | "neutro" | "detrator"; codigo?: string | null; mensagem?: string };

export async function responderPesquisa(_: EstadoPesquisa, form: FormData): Promise<EstadoPesquisa> {
  const token = String(form.get("token") ?? "");
  const nota = Number(form.get("nota"));
  const comentario = String(form.get("comentario") ?? "").slice(0, 2000);
  if (!Number.isInteger(nota) || nota < 0 || nota > 10) return { etapa: "form", mensagem: mensagemErro("nota_invalida") };
  const { data, error } = await supabaseServico().rpc("responder_pesquisa", {
    p_token: token,
    p_nota: nota,
    p_comentario: comentario,
  });
  if (error) return { etapa: "form", mensagem: mensagemErro(error) };
  const r = data as { nota: number; codigo: string | null };
  if (r.nota >= 9) return { etapa: "promotor", codigo: r.codigo };
  if (r.nota <= 6) return { etapa: "detrator" };
  return { etapa: "neutro" };
}
