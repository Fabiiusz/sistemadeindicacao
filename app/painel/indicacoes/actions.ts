"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { contextoEquipe } from "@/lib/auth";
import { voltarCom } from "@/lib/painel/flash";

const texto = (f: FormData, k: string) => {
  const v = String(f.get(k) ?? "").trim();
  return v === "" ? null : v;
};
const numero = (f: FormData, k: string) => {
  const v = texto(f, k);
  if (v === null) return null;
  const n = Number(v.includes(",") ? v.replace(/\./g, "").replace(",", ".") : v);
  return Number.isFinite(n) ? n : null;
};

export async function registrarIndicacaoComercial(form: FormData) {
  const { supabase, espaco } = await contextoEquipe();
  const indicador = String(form.get("indicador") ?? "");
  const [tipo, id] = indicador.split(":");
  const { data, error } = await supabase.rpc("registrar_indicacao_comercial", {
    p_espaco_id: espaco.id,
    p_origem: tipo === "cliente" ? "cliente" : "parceiro",
    p_parceiro_id: tipo === "parceiro" ? id : null,
    p_indicador_cliente_id: tipo === "cliente" ? id : null,
    p_indicador_nome: tipo === "outro" ? texto(form, "indicador_nome") : null,
    p_indicador_telefone: tipo === "outro" ? texto(form, "indicador_telefone") : null,
    p_nome: texto(form, "nome"),
    p_telefone: texto(form, "telefone"),
    p_email: texto(form, "email"),
    p_tipo_evento: texto(form, "tipo_evento"),
    p_data_evento: texto(form, "data_evento"),
    p_convidados: numero(form, "convidados"),
    p_observacoes: texto(form, "observacoes"),
    p_consentimento_confirmado: form.get("consentimento") === "on",
  });
  if (error) voltarCom("/painel/indicacoes/nova", { erro: error });
  revalidatePath("/painel/indicacoes");
  const r = data as { id: string; status: string; motivo: string | null };
  redirect(
    `/painel/indicacoes/${r.id}?${r.status === "recebida" ? "ok=Indicação registrada." : `erro=${encodeURIComponent(`Registrada como ${r.status}: ${r.motivo}`)}`}`,
  );
}

export async function alterarStatus(form: FormData) {
  const id = String(form.get("id"));
  const { supabase } = await contextoEquipe();
  const { error } = await supabase.rpc("alterar_status_indicacao", {
    p_indicacao_id: id,
    p_status: String(form.get("status")),
    p_motivo: texto(form, "motivo"),
  });
  revalidatePath(`/painel/indicacoes/${id}`);
  voltarCom(`/painel/indicacoes/${id}`, error ? { erro: error } : { ok: "Status atualizado." });
}

export async function fecharIndicacao(form: FormData) {
  const id = String(form.get("id"));
  const { supabase } = await contextoEquipe();
  const { error } = await supabase.rpc("fechar_indicacao", {
    p_indicacao_id: id,
    p_valor_fechado: numero(form, "valor_fechado"),
    p_festa_id: texto(form, "festa_id"),
    p_valor_sinal: numero(form, "valor_sinal"),
  });
  revalidatePath(`/painel/indicacoes/${id}`);
  voltarCom(`/painel/indicacoes/${id}`, error ? { erro: error } : { ok: "Indicação fechada e recompensas calculadas." });
}

export async function editarIndicacao(form: FormData) {
  const id = String(form.get("id"));
  const { supabase } = await contextoEquipe();
  const campos = ["nome_indicado", "email_indicado", "tipo_evento_interesse", "data_evento_estimada", "num_convidados_estimado", "observacoes"];
  const dados = Object.fromEntries(campos.map((c) => [c, String(form.get(c) ?? "")]));
  const { error } = await supabase.rpc("editar_indicacao", { p_indicacao_id: id, p_dados: dados });
  revalidatePath(`/painel/indicacoes/${id}`);
  voltarCom(`/painel/indicacoes/${id}`, error ? { erro: error } : { ok: "Dados atualizados (registrado no histórico)." });
}

export async function acaoRecompensa(form: FormData) {
  const volta = String(form.get("voltar") ?? "/painel/recompensas");
  const id = String(form.get("recompensa_id"));
  const acao = String(form.get("acao"));
  const { supabase } = await contextoEquipe(["dono", "gerente"]);
  const { error } =
    acao === "pagar"
      ? await supabase.rpc("marcar_recompensa_paga", {
          p_recompensa_id: id,
          p_paga_em: texto(form, "paga_em"),
          p_forma: texto(form, "forma") ?? "pix",
          p_comprovante_url: texto(form, "comprovante_url"),
          p_observacoes: texto(form, "observacoes"),
        })
      : acao === "cancelar"
        ? await supabase.rpc("cancelar_recompensa", { p_recompensa_id: id, p_motivo: texto(form, "motivo") })
        : await supabase.rpc("ajustar_valor_recompensa", {
            p_recompensa_id: id,
            p_valor: numero(form, "valor"),
            p_justificativa: texto(form, "justificativa"),
          });
  revalidatePath(volta.split("?")[0]);
  voltarCom(volta, error ? { erro: error } : { ok: acao === "pagar" ? "Pagamento registrado." : "Recompensa atualizada." });
}
