"use server";
import { z } from "zod";
import { supabaseServico } from "@/lib/supabase/server";
import { dadosRequisicao } from "@/lib/requisicao";
import { mensagemErro } from "@/lib/indicacoes/erros";
import { normalizarTelefone } from "@/lib/indicacoes/telefone";
import { clienteIndicadorPorCodigo, parceiroPorCodigo } from "@/lib/indicacoes/publico";
import { nomeExibicaoParceiro, textoConsentimentoIndicado } from "@/lib/indicacoes/termos";

export type EstadoIndicado = { ok: boolean; mensagem: string; erros?: Record<string, string> };

const esquema = z.object({
  codigo: z.string().min(4).max(12),
  tipo_link: z.enum(["parceiro", "cliente"]),
  nome: z.string().trim().min(2, "Informe seu nome."),
  telefone: z.string().refine((v) => normalizarTelefone(v) !== null, "WhatsApp inválido. Use DDD + número."),
  email: z.union([z.literal(""), z.string().trim().email("E-mail inválido.")]).optional(),
  tipo_evento: z.string().optional(),
  data_evento: z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]).optional(),
  convidados: z.union([z.literal(""), z.coerce.number().int().min(1).max(100000)]).optional(),
  mensagem: z.string().max(1000).optional(),
  consentimento: z.literal("on", { message: "Marque a autorização para podermos falar com você." }),
  site: z.string().max(0).optional(), // honeypot anti-robô
});

/** Formulário público do indicado (/i/[codigo] e /v/[codigo]). */
export async function enviarIndicacaoPublica(_: EstadoIndicado, form: FormData): Promise<EstadoIndicado> {
  const dados = esquema.safeParse(Object.fromEntries(form));
  if (!dados.success) {
    const erros: Record<string, string> = {};
    for (const issue of dados.error.issues) erros[String(issue.path[0])] = issue.message;
    if (erros.site) return { ok: true, mensagem: "Recebemos seu contato!" };
    return { ok: false, mensagem: "Confira os campos destacados.", erros };
  }
  const d = dados.data;

  // Texto do consentimento é montado no servidor (não confiamos no cliente).
  const origem = d.tipo_link === "parceiro" ? await parceiroPorCodigo(d.codigo) : await clienteIndicadorPorCodigo(d.codigo);
  if (!origem) return { ok: false, mensagem: mensagemErro("codigo_invalido") };
  const nomeIndicador =
    "parceiro" in origem ? nomeExibicaoParceiro(origem.parceiro) : origem.cliente.nome;
  const consentimento = textoConsentimentoIndicado(nomeIndicador, origem.espaco.nome);

  const { ip, ipHash, userAgent } = await dadosRequisicao();
  const { data, error } = await supabaseServico().rpc("registrar_indicacao_publica", {
    p_codigo: d.codigo,
    p_tipo_link: d.tipo_link,
    p_nome: d.nome,
    p_telefone: d.telefone,
    p_email: d.email || null,
    p_tipo_evento: d.tipo_evento || null,
    p_data_evento: d.data_evento || null,
    p_convidados: d.convidados === "" || d.convidados === undefined ? null : d.convidados,
    p_observacoes: d.mensagem || null,
    p_consentimento: true,
    p_consentimento_texto: consentimento,
    p_ip: ip,
    p_ip_hash: ipHash,
    p_user_agent: userAgent,
  });
  if (error) return { ok: false, mensagem: mensagemErro(error) };

  const status = (data as { status: string }).status;
  if (status === "invalida")
    return { ok: false, mensagem: "Não foi possível registrar: quem indica não pode indicar a si mesmo." };
  if (status === "duplicada")
    return {
      ok: true,
      mensagem: "Recebemos seu contato! Vimos que você já está em contato com o espaço, então seguimos pelo seu atendimento atual.",
    };
  return { ok: true, mensagem: "Recebemos seu contato! A equipe do espaço vai falar com você pelo WhatsApp em breve." };
}
