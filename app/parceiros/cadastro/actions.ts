"use server";
import { z } from "zod";
import { supabaseServico } from "@/lib/supabase/server";
import { dadosRequisicao } from "@/lib/requisicao";
import { mensagemErro } from "@/lib/indicacoes/erros";
import { normalizarTelefone } from "@/lib/indicacoes/telefone";
import { validarDocumento } from "@/lib/indicacoes/documento";
import { termoAtual } from "@/lib/indicacoes/termos";

export type EstadoCadastro = { ok: boolean; mensagem: string; erros?: Record<string, string> };

const esquema = z.object({
  espaco: z.string().min(1),
  nome: z.string().trim().min(3, "Informe seu nome completo."),
  empresa: z.string().trim().optional(),
  tipo: z.string().min(1),
  telefone: z.string().refine((v) => normalizarTelefone(v) !== null, "WhatsApp inválido. Use DDD + número."),
  email: z.union([z.literal(""), z.string().trim().email("E-mail inválido.")]),
  documento: z.string().optional().refine((v) => !v || validarDocumento(v), "CPF/CNPJ inválido."),
  chave_pix: z.string().optional(),
  aceite: z.literal("on", { message: "É preciso aceitar os termos." }),
});

export async function cadastrarParceiro(_: EstadoCadastro, form: FormData): Promise<EstadoCadastro> {
  const dados = esquema.safeParse(Object.fromEntries(form));
  if (!dados.success) {
    const erros: Record<string, string> = {};
    for (const issue of dados.error.issues) erros[String(issue.path[0])] = issue.message;
    return { ok: false, mensagem: "Confira os campos destacados.", erros };
  }
  const d = dados.data;
  const { ip } = await dadosRequisicao();
  const { error } = await supabaseServico().rpc("cadastrar_parceiro_publico", {
    p_espaco_slug: d.espaco,
    p_nome: d.nome,
    p_empresa: d.empresa ?? null,
    p_tipo: d.tipo,
    p_telefone: d.telefone,
    p_email: d.email || null,
    p_documento: d.documento || null,
    p_chave_pix: d.chave_pix || null,
    p_aceite_termos: true,
    p_versao_termos: termoAtual("parceiros").versao,
    p_ip: ip,
  });
  if (error) return { ok: false, mensagem: mensagemErro(error) };
  return {
    ok: true,
    mensagem:
      "Cadastro recebido! O espaço vai revisar e você receberá no WhatsApp o seu link pessoal de indicação assim que for aprovado.",
  };
}
