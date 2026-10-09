import "server-only";
import { redirect } from "next/navigation";
import { supabaseServidor } from "@/lib/supabase/server";

export type Papel = "dono" | "gerente" | "comercial";
export type Espaco = {
  id: string;
  nome: string;
  slug: string;
  logo_url: string | null;
  cor_primaria: string | null;
  whatsapp_comercial: string | null;
  email_comercial: string | null;
  config: Record<string, unknown>;
};

/** Contexto da equipe do espaço. Redireciona quem não é da equipe. */
export async function contextoEquipe(papeisPermitidos?: Papel[]) {
  const supabase = await supabaseServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?voltar=/painel");

  const { data: membros } = await supabase
    .from("membros_espaco")
    .select("papel, espaco_id, espacos(*)")
    .eq("user_id", user.id)
    .order("criado_em")
    .limit(1);
  const membro = membros?.[0] as unknown as { papel: Papel; espaco_id: string; espacos: Espaco } | undefined;
  if (!membro) redirect("/parceiro");
  if (papeisPermitidos && !papeisPermitidos.includes(membro.papel)) redirect("/painel?erro=sem_permissao");

  return { supabase, user, papel: membro.papel, espaco: membro.espacos };
}

export function podeGerir(papel: Papel) {
  return papel === "dono" || papel === "gerente";
}

export type ParceiroLogado = {
  id: string;
  espaco_id: string;
  nome: string;
  tipo: string;
  empresa: string | null;
  telefone: string;
  email: string | null;
  chave_pix: string | null;
  codigo_indicacao: string;
  status: "pendente" | "ativo" | "pausado" | "bloqueado";
  motivo_status: string | null;
};

/** Contexto do parceiro logado (vincula o login ao cadastro pelo e-mail). */
export async function contextoParceiro() {
  const supabase = await supabaseServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?voltar=/parceiro");

  const { data: parceiros } = await supabase.rpc("vincular_parceiro_usuario");
  const parceiro = (parceiros as ParceiroLogado[] | null)?.[0];
  if (!parceiro) {
    const { count } = await supabase.from("membros_espaco").select("*", { count: "exact", head: true }).eq("user_id", user.id);
    if (count) redirect("/painel");
    return { supabase, user, parceiro: null, espaco: null };
  }
  const { data: espaco } = await supabase.from("espacos").select("*").eq("id", parceiro.espaco_id).single();
  return { supabase, user, parceiro, espaco: espaco as Espaco };
}
