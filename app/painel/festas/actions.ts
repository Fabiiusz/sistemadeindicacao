"use server";
import { revalidatePath } from "next/cache";
import { contextoEquipe } from "@/lib/auth";
import { env } from "@/lib/env";
import { voltarCom } from "@/lib/painel/flash";
import { normalizarTelefone } from "@/lib/indicacoes/telefone";

const num = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const n = Number(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s);
  return Number.isFinite(n) ? n : null;
};

export async function criarFesta(form: FormData) {
  const { supabase, espaco } = await contextoEquipe();
  const tel = String(form.get("anfitriao_telefone") ?? "");
  const { error } = await supabase.from("festas").insert({
    espaco_id: espaco.id,
    lead_id: String(form.get("lead_id") ?? "") || null,
    anfitriao_nome: String(form.get("anfitriao_nome") ?? "").trim(),
    anfitriao_telefone: tel ? normalizarTelefone(tel) : null,
    tipo_evento: String(form.get("tipo_evento") ?? "") || null,
    data_evento: String(form.get("data_evento")),
    valor_total: num(form.get("valor_total")),
    valor_sinal: num(form.get("valor_sinal")),
  });
  revalidatePath("/painel/festas");
  voltarCom("/painel/festas", error ? { erro: error } : { ok: "Festa cadastrada." });
}

export async function acaoFesta(form: FormData) {
  const { supabase } = await contextoEquipe();
  const id = String(form.get("id"));
  const acao = String(form.get("acao"));
  if (acao === "link") {
    const { data, error } = await supabase.rpc("criar_indicador_cliente", { p_festa_id: id });
    voltarCom("/painel/festas", error ? { erro: error } : { ok: `Link do cliente: ${env.appUrl()}/v/${data}` });
  }
  const dados =
    acao === "sinal"
      ? { sinal_pago_em: new Date().toISOString() }
      : acao === "realizada"
        ? { status: "realizada" }
        : acao === "cancelada"
          ? { status: "cancelada" }
          : null;
  if (!dados) voltarCom("/painel/festas", { erro: "status_invalido" });
  const { error } = await supabase.from("festas").update(dados).eq("id", id);
  revalidatePath("/painel/festas");
  voltarCom("/painel/festas", error ? { erro: error } : { ok: "Festa atualizada (indicações e recompensas verificadas)." });
}
