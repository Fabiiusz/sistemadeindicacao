import Link from "next/link";
import { contextoEquipe } from "@/lib/auth";
import { Botao, Cartao, EstadoVazio, Selo } from "@/components/ui";
import { formatarData } from "@/lib/indicacoes/status";
import { resolverAlerta } from "./actions";

const ROTULO: Record<string, string> = {
  sem_contato_24h: "Sem contato 24h",
  parada_5_dias: "Parada há 5+ dias",
  pagamento_atrasado: "Pagamento atrasado",
  nps_detrator: "Cliente insatisfeito",
  parceiro_suspeito: "Revisão antifraude",
  parceiro_pendente: "Parceiro pendente",
  nova_indicacao: "Nova indicação",
  informar_valor: "Informar valor",
  revisar_recompensa: "Revisar recompensa",
  solicitacao_lgpd: "Pedido LGPD",
};

function linkReferencia(tabela: string | null, id: string | null) {
  if (!id) return null;
  if (tabela === "indicacoes") return `/painel/indicacoes/${id}`;
  if (tabela === "parceiros") return `/painel/parceiros/${id}`;
  if (tabela === "recompensas") return "/painel/recompensas";
  if (tabela === "festas") return "/painel/festas";
  if (tabela === "solicitacoes_lgpd") return "/painel/lgpd";
  return null;
}

export default async function Alertas() {
  const { supabase, espaco, papel } = await contextoEquipe();
  const [{ data: prazos }, { data: alertas }] = await Promise.all([
    supabase.from("alertas_prazos").select("*").eq("espaco_id", espaco.id).order("desde"),
    supabase
      .from("alertas")
      .select("*")
      .eq("espaco_id", espaco.id)
      .is("resolvido_em", null)
      .contains("para_papeis", [papel])
      .order("criado_em", { ascending: false }),
  ]);
  const prazosVisiveis = (prazos ?? []).filter((p) => p.tipo !== "pagamento_atrasado" || papel !== "comercial");

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-2xl font-bold">Alertas</h1>
      <Cartao titulo={`Prazos (${prazosVisiveis.length})`}>
        {prazosVisiveis.length === 0 ? (
          <p className="text-gray-600">Tudo em dia. ✅</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {prazosVisiveis.map((p) => (
              <li key={`${p.tipo}-${p.referencia_id}`} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <div>
                  <Selo className="bg-amber-100 text-amber-800">{ROTULO[p.tipo]}</Selo>
                  <p className="mt-1 font-medium">{p.titulo}</p>
                  <p className="text-sm text-gray-500">{p.descricao}</p>
                </div>
                {linkReferencia(p.referencia_tabela, p.referencia_id) ? (
                  <Link href={linkReferencia(p.referencia_tabela, p.referencia_id)!} className="font-semibold text-marca underline">Abrir</Link>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Cartao>
      <Cartao titulo={`Avisos (${(alertas ?? []).length})`}>
        {(alertas ?? []).length === 0 ? (
          <EstadoVazio titulo="Nenhum aviso pendente." />
        ) : (
          <ul className="divide-y divide-gray-100">
            {(alertas ?? []).map((a) => (
              <li key={a.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                <div className="max-w-xl">
                  <Selo className={a.tipo === "nps_detrator" || a.tipo === "parceiro_suspeito" ? "bg-red-100 text-red-800" : undefined}>
                    {ROTULO[a.tipo] ?? a.tipo}
                  </Selo>
                  <p className="mt-1 font-medium">{a.titulo}</p>
                  {a.descricao ? <p className="whitespace-pre-wrap text-sm text-gray-600">{a.descricao}</p> : null}
                  <p className="text-xs text-gray-400">{formatarData(a.criado_em)}</p>
                </div>
                <div className="flex items-center gap-3">
                  {linkReferencia(a.referencia_tabela, a.referencia_id) ? (
                    <Link href={linkReferencia(a.referencia_tabela, a.referencia_id)!} className="font-semibold text-marca underline">Abrir</Link>
                  ) : null}
                  <form action={resolverAlerta}>
                    <input type="hidden" name="id" value={a.id} />
                    <Botao variante="secundario" className="!min-h-10 !py-2">Resolvido</Botao>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Cartao>
    </div>
  );
}
