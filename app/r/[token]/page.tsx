import { notFound } from "next/navigation";
import { supabaseServico } from "@/lib/supabase/server";
import { env } from "@/lib/env";
import { PaginaMarca } from "@/components/Marca";
import { Cartao } from "@/components/ui";
import { descreverBeneficioIndicado, descreverRecompensa, regraPublica, type EspacoPublico } from "@/lib/indicacoes/publico";
import { Pesquisa } from "./Pesquisa";

export const metadata = { title: "Como foi sua festa?", robots: { index: false } };

type DadosPesquisa = {
  espaco_id: string;
  primeiro_nome: string;
  respondida: boolean;
  nota: number | null;
  codigo: string | null;
};

export default async function PaginaPesquisa({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const servico = supabaseServico();
  const { data } = await servico.rpc("pesquisa_publica", { p_token: token });
  const p = data as DadosPesquisa | null;
  if (!p) notFound();
  const { data: espaco } = await servico.from("espacos").select("id, slug, nome, logo_url, cor_primaria").eq("id", p.espaco_id).single();
  const regra = await regraPublica(p.espaco_id, "cliente");

  const inicial = !p.respondida
    ? ({ etapa: "form" } as const)
    : p.nota !== null && p.nota >= 9
      ? ({ etapa: "promotor", codigo: p.codigo } as const)
      : p.nota !== null && p.nota <= 6
        ? ({ etapa: "detrator" } as const)
        : ({ etapa: "neutro" } as const);

  return (
    <PaginaMarca espaco={espaco as EspacoPublico}>
      <div>
        <h1 className="text-2xl font-bold">Obrigado pela festa, {p.primeiro_nome}! 🎉</h1>
        <p className="mt-2 text-gray-600">Foi uma alegria fazer parte desse dia. Sua opinião ajuda muito.</p>
      </div>
      <Cartao>
        <Pesquisa
          token={token}
          primeiroNome={p.primeiro_nome}
          nomeEspaco={(espaco as EspacoPublico).nome}
          appUrl={env.appUrl()}
          beneficioAmigo={descreverBeneficioIndicado(regra)}
          recompensaIndicador={descreverRecompensa(regra)}
          limite={regra?.limite_por_indicador ?? null}
          inicial={inicial}
        />
      </Cartao>
    </PaginaMarca>
  );
}
