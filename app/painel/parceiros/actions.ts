"use server";
import { revalidatePath } from "next/cache";
import { contextoEquipe } from "@/lib/auth";
import { env } from "@/lib/env";
import { voltarCom } from "@/lib/painel/flash";
import { supabaseServico } from "@/lib/supabase/server";

export async function alterarStatusParceiro(form: FormData) {
  const id = String(form.get("parceiro_id"));
  const volta = String(form.get("voltar") ?? "/painel/parceiros");
  const { supabase } = await contextoEquipe(["dono", "gerente"]);
  const { error } = await supabase.rpc("alterar_status_parceiro", {
    p_parceiro_id: id,
    p_status: String(form.get("status")),
    p_motivo: String(form.get("motivo") ?? "") || null,
    p_base_url: env.appUrl(),
  });
  revalidatePath("/painel/parceiros");
  voltarCom(volta, error ? { erro: error } : { ok: "Status do parceiro atualizado." });
}

export async function criarExcecaoRegra(form: FormData) {
  const parceiroId = String(form.get("parceiro_id"));
  const volta = `/painel/parceiros/${parceiroId}`;
  const { supabase, espaco, user } = await contextoEquipe(["dono", "gerente"]);
  const justificativa = String(form.get("justificativa") ?? "").trim();
  if (justificativa.length < 5) voltarCom(volta, { erro: "justificativa_obrigatoria" });
  const valor = Number(String(form.get("valor") ?? "").replace(",", "."));
  const { error } = await supabase.from("regras_indicacao").insert({
    espaco_id: espaco.id,
    nome: `Exceção — ${String(form.get("parceiro_nome") ?? "parceiro")}`,
    publico: "parceiro",
    parceiro_id: parceiroId,
    justificativa,
    tipo_recompensa: String(form.get("tipo_recompensa")),
    valor: Number.isFinite(valor) ? valor : null,
    descricao_recompensa: String(form.get("descricao_recompensa") ?? "") || null,
    base_calculo: String(form.get("base_calculo") ?? "valor_fechado"),
    condicao_pagamento: String(form.get("condicao_pagamento") ?? "evento_realizado"),
    validade_dias_atribuicao: Number(form.get("validade_dias_atribuicao") ?? 90),
    vigencia_inicio: String(form.get("vigencia_inicio") || new Date().toISOString().slice(0, 10)),
    limite_por_indicador: Number(form.get("limite_por_indicador")) || null,
    criado_por: user.id,
  });
  revalidatePath(volta);
  voltarCom(volta, error ? { erro: error } : { ok: "Exceção criada. Vale para novas indicações deste parceiro." });
}

export async function desativarRegra(form: FormData) {
  const volta = String(form.get("voltar") ?? "/painel/regras");
  const { supabase } = await contextoEquipe(["dono", "gerente"]);
  const { error } = await supabase
    .from("regras_indicacao")
    .update({ ativa: false, vigencia_fim: new Date().toISOString().slice(0, 10) })
    .eq("id", String(form.get("regra_id")));
  revalidatePath(volta);
  voltarCom(volta, error ? { erro: error } : { ok: "Regra desativada." });
}

/**
 * Gera um link mágico de acesso (Supabase Admin) e coloca na fila de envios
 * para o comercial mandar pelo WhatsApp. O link expira (padrão do Supabase: 1h).
 */
export async function enviarAcessoWhatsApp(form: FormData) {
  const id = String(form.get("parceiro_id"));
  const volta = `/painel/parceiros/${id}`;
  const { supabase, espaco } = await contextoEquipe(["dono", "gerente"]);
  const { data: parceiro } = await supabase.from("parceiros").select("id, nome, email, telefone, status").eq("id", id).single();
  if (!parceiro) voltarCom(volta, { erro: "parceiro_nao_encontrado" });
  if (!parceiro.email) voltarCom(volta, { erro: "Cadastre um e-mail para o parceiro antes de enviar o acesso." });

  const admin = supabaseServico();
  const { data, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: parceiro.email,
    options: { redirectTo: `${env.appUrl()}/auth/callback?voltar=/parceiro` },
  });
  if (error || !data?.properties?.hashed_token) voltarCom(volta, { erro: "Não foi possível gerar o link de acesso." });
  const link = `${env.appUrl()}/auth/callback?token_hash=${data.properties.hashed_token}&type=magiclink&voltar=/parceiro`;
  const { error: erroFila } = await admin.rpc("enfileirar_mensagem", {
    p_espaco_id: espaco.id,
    p_destino: parceiro.telefone,
    p_mensagem: `Olá, ${parceiro.nome.split(" ")[0]}! Seu acesso ao painel de parceiros do ${espaco.nome}: ${link}\n(O link expira em 1 hora.)`,
    p_tipo: "acesso_parceiro",
    p_destinatario_nome: parceiro.nome,
    p_referencia_tabela: "parceiros",
    p_referencia_id: parceiro.id,
  });
  voltarCom(volta, erroFila ? { erro: erroFila } : { ok: "Link de acesso colocado na fila de envios. Envie agora pela tela Fila de envios." });
}

export async function editarParceiro(form: FormData) {
  const id = String(form.get("parceiro_id"));
  const volta = `/painel/parceiros/${id}`;
  const { supabase } = await contextoEquipe(["dono", "gerente"]);
  const campos = ["nome", "empresa", "tipo", "telefone", "email", "documento", "chave_pix"] as const;
  const dados = Object.fromEntries(campos.map((c) => [c, String(form.get(c) ?? "")]));
  const { error } = await supabase.rpc("editar_parceiro", { p_parceiro_id: id, p_dados: dados });
  revalidatePath(volta);
  voltarCom(volta, error ? { erro: error } : { ok: "Dados salvos." });
}
