import Link from "next/link";
import { contextoEquipe, podeGerir } from "@/lib/auth";
import { env } from "@/lib/env";
import { Flash } from "@/components/Flash";
import { Botao, Cartao, Entrada, EstadoVazio, Metrica, Selo } from "@/components/ui";
import { Copiar } from "@/components/Copiar";
import { formatarMoeda, TIPOS_PARCEIRO } from "@/lib/indicacoes/status";
import { alterarStatusParceiro } from "./actions";

type Linha = {
  parceiro_id: string;
  nome: string;
  empresa: string | null;
  tipo: string;
  status: "pendente" | "ativo" | "pausado" | "bloqueado";
  codigo_indicacao: string;
  indicacoes: number;
  validas: number;
  invalidas: number;
  fechamentos: number;
  taxa_conversao: number;
  receita: number;
  comissao_prevista: number;
  comissao_devida: number;
  comissao_paga: number;
  suspeito: boolean;
};

const COR_STATUS_PARCEIRO = {
  pendente: "bg-amber-100 text-amber-800",
  ativo: "bg-emerald-100 text-emerald-800",
  pausado: "bg-gray-200 text-gray-700",
  bloqueado: "bg-red-100 text-red-800",
};
const rotuloTipo = Object.fromEntries(TIPOS_PARCEIRO) as Record<string, string>;

export default async function Parceiros({
  searchParams,
}: {
  searchParams: Promise<{ de?: string; ate?: string; ok?: string; erro?: string }>;
}) {
  const sp = await searchParams;
  const { supabase, espaco, papel } = await contextoEquipe();
  const { data, error } = await supabase.rpc("ranking_parceiros", {
    p_espaco_id: espaco.id,
    p_de: sp.de || null,
    p_ate: sp.ate || null,
  });
  const linhas = (data ?? []) as Linha[];
  const pendentes = linhas.filter((l) => l.status === "pendente");
  const gestao = podeGerir(papel);
  const total = (c: keyof Linha) => linhas.reduce((t, l) => t + Number(l[c] ?? 0), 0);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-2xl font-bold">Parceiros indicadores</h1>
        <form className="flex flex-wrap items-end gap-2">
          <label className="text-sm">
            De <Entrada type="date" name="de" defaultValue={sp.de} className="!py-2" />
          </label>
          <label className="text-sm">
            Até <Entrada type="date" name="ate" defaultValue={sp.ate} className="!py-2" />
          </label>
          <Botao variante="secundario" className="!min-h-10 !py-2">Filtrar</Botao>
        </form>
      </div>
      <Flash ok={sp.ok} erro={sp.erro ?? (error ? "Erro ao carregar o ranking." : undefined)} />

      <Cartao titulo="Link de cadastro de parceiros">
        <p className="mb-2 text-sm text-gray-600">Envie para profissionais que você quer no programa:</p>
        <Copiar texto={`${env.appUrl()}/parceiros/cadastro?espaco=${espaco.slug}`} rotulo="Copiar link de cadastro" />
      </Cartao>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Metrica rotulo="Indicações" valor={total("indicacoes")} />
        <Metrica rotulo="Fechamentos" valor={total("fechamentos")} />
        <Metrica rotulo="Receita gerada" valor={formatarMoeda(total("receita"))} />
        <Metrica rotulo="Comissão devida" valor={formatarMoeda(total("comissao_devida"))} detalhe="aprovada, a pagar" />
      </div>

      {gestao && pendentes.length > 0 ? (
        <Cartao titulo={`Aguardando aprovação (${pendentes.length})`}>
          <ul className="divide-y divide-gray-100">
            {pendentes.map((p) => (
              <li key={p.parceiro_id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <Link href={`/painel/parceiros/${p.parceiro_id}`} className="font-semibold underline">
                  {p.nome} {p.empresa ? `· ${p.empresa}` : ""} <span className="text-sm font-normal text-gray-500">({rotuloTipo[p.tipo]})</span>
                </Link>
                <form action={alterarStatusParceiro}>
                  <input type="hidden" name="parceiro_id" value={p.parceiro_id} />
                  <input type="hidden" name="status" value="ativo" />
                  <Botao variante="sucesso">Aprovar</Botao>
                </form>
              </li>
            ))}
          </ul>
        </Cartao>
      ) : null}

      <Cartao titulo="Ranking">
        {linhas.length === 0 ? (
          <EstadoVazio titulo="Nenhum parceiro ainda.">Compartilhe o link de cadastro com cerimonialistas, fotógrafos e buffets.</EstadoVazio>
        ) : (
          <div className="-mx-4 overflow-x-auto sm:mx-0">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="text-left text-gray-500">
                <tr>
                  <th className="p-2">#</th>
                  <th className="p-2">Parceiro</th>
                  <th className="p-2 text-right">Indicações</th>
                  <th className="p-2 text-right">Fechou</th>
                  <th className="p-2 text-right">Conversão</th>
                  <th className="p-2 text-right">Receita</th>
                  <th className="p-2 text-right">Comissão devida</th>
                  <th className="p-2 text-right">Paga</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {linhas.map((l, i) => (
                  <tr key={l.parceiro_id}>
                    <td className="p-2 text-gray-400">{i + 1}</td>
                    <td className="p-2">
                      <Link href={`/painel/parceiros/${l.parceiro_id}`} className="font-semibold underline">
                        {l.nome}
                      </Link>
                      <div className="mt-1 flex flex-wrap gap-1">
                        <Selo className={COR_STATUS_PARCEIRO[l.status]}>{l.status}</Selo>
                        <Selo>{rotuloTipo[l.tipo]}</Selo>
                        {l.suspeito ? <Selo className="bg-red-100 text-red-800">revisar</Selo> : null}
                      </div>
                    </td>
                    <td className="p-2 text-right">
                      {l.indicacoes}
                      {Number(l.invalidas) > 0 ? <span className="block text-xs text-gray-400">{l.invalidas} não contab.</span> : null}
                    </td>
                    <td className="p-2 text-right">{l.fechamentos}</td>
                    <td className="p-2 text-right">{Number(l.taxa_conversao).toLocaleString("pt-BR")}%</td>
                    <td className="p-2 text-right">{formatarMoeda(l.receita)}</td>
                    <td className="p-2 text-right font-semibold">{formatarMoeda(l.comissao_devida)}</td>
                    <td className="p-2 text-right">{formatarMoeda(l.comissao_paga)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Cartao>
    </div>
  );
}
