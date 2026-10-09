"use server";
import { supabaseServico } from "@/lib/supabase/server";
import { dadosRequisicao } from "@/lib/requisicao";
import { mensagemErro } from "@/lib/indicacoes/erros";

export type EstadoExclusao = { ok: boolean; mensagem: string };

export async function pedirExclusao(_: EstadoExclusao, form: FormData): Promise<EstadoExclusao> {
  const { ip } = await dadosRequisicao();
  const { error } = await supabaseServico().rpc("solicitar_lgpd_publico", {
    p_espaco_slug: String(form.get("espaco") ?? ""),
    p_tipo: String(form.get("tipo") ?? "exclusao"),
    p_nome: String(form.get("nome") ?? ""),
    p_telefone: String(form.get("telefone") ?? ""),
    p_email: String(form.get("email") ?? ""),
    p_mensagem: String(form.get("mensagem") ?? "").slice(0, 2000),
    p_ip: ip,
  });
  if (error) return { ok: false, mensagem: mensagemErro(error) };
  return {
    ok: true,
    mensagem:
      "Pedido recebido. Seu telefone já foi bloqueado para mensagens do espaço. Responderemos o restante do pedido em até 15 dias.",
  };
}
