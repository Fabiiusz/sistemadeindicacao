import Link from "next/link";
import { contextoEquipe } from "@/lib/auth";
import { Flash } from "@/components/Flash";
import { Botao, BotaoLink, Cartao, Entrada, EstadoVazio, Metrica, Selecao, Selo } from "@/components/ui";
import {
  COR_STATUS,
  formatarData,
  formatarMoeda,
  ROTULO_STATUS,
  STATUS_INDICACAO,
  TIPOS_EVENTO,
  type StatusIndicacao,
} from "@/lib/indicacoes/status";

type Filtros = { de?: string; ate?: string; origem?: string; parceiro?: string; status?: string; tipo?: string; ok?: string; erro?: string };

type Metricas = {
  recebidas: number;
  validas: number;
  invalidas: number;
  duplicadas: number;
  contatadas: number;
  visitas: number;
  fechamentos: number;
  receita: number;
  comissao_paga: number;
  comissao_aprovada: number;
  comissao_prevista: number;
  taxa_contato: number;
  taxa_conversao: number;
  custo_por_fechamento: number;
  custo_por_indicacao: number;
  canais: { origem: string; leads: number; ganhos: number; receita: number; conversao: number }[];
};

const ROTULO_CANAL: Record<string, string> = {
  indicacao_parceiro: "Indicação de parceiro",
  indicacao_cliente: "Indicação de cliente",
  instagram: "Instagram",
  google: "Google",
  site: "Site",
  passante: "Passante",
  outro: "Outro",
};

export default async function Indicacoes({ searchParams }: { searchParams: Promise<Filtros> }) {
  const f = await searchParams;
  const { supabase, espaco } = await contextoEquipe();

  let consulta = supabase
    .from("indicacoes")
    .select(
      "id, nome_indicado, origem, status, tipo_evento_interesse, criado_em, valor_fechado, suspeita, motivo_status, indicador_nome, parceiros(nome), indicadores_clientes(nome)",
    )
    .eq("espaco_id", espaco.id)
    .order("criado_em", { ascending: false })
    .limit(200);
  if (f.de) consulta = consulta.gte("criado_em", f.de);
  if (f.ate) consulta = consulta.lt("criado_em", new Date(new Date(f.ate).getTime() + 86400000).toISOString());
  if (f.origem) consulta = consulta.eq("origem", f.origem);
  if (f.parceiro) consulta = consulta.eq("indicador_parceiro_id", f.parceiro);
  if (f.status) consulta = consulta.eq("status", f.status);
  if (f.tipo) consulta = consulta.eq("tipo_evento_interesse", f.tipo);

  const [{ data: lista }, { data: metricas }, { data: parceiros }] = await Promise.all([
    consulta,
    supabase.rpc("metricas_indicacoes", {
      p_espaco_id: espaco.id,
      p_de: f.de || null,
      p_ate: f.ate || null,
      p_origem: f.origem || null,
      p_parceiro_id: f.parceiro || null,
      p_tipo_evento: f.tipo || null,
    }),
    supabase.from("parceiros").select("id, nome").eq("espaco_id", espaco.id).order("nome"),
  ]);
  const m = metricas as Metricas | null;
  const itens = (lista ?? []) as unknown as {
    id: string;
    nome_indicado: string;
    origem: string;
    status: StatusIndicacao;
    tipo_evento_interesse: string | null;
    criado_em: string;
    valor_fechado: number | null;
    suspeita: boolean;
    motivo_status: string | null;
    indicador_nome: string | null;
    parceiros: { nome: string } | null;
    indicadores_clientes: { nome: string } | null;
  }[];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Indicações</h1>
        <BotaoLink href="/painel/indicacoes/nova">+ Registrar indicação</BotaoLink>
      </div>
      <Flash ok={f.ok} erro={f.erro} />

      <Cartao>
        <form className="grid grid-cols-2 gap-2 md:grid-cols-7 md:items-end">
          <label className="text-sm">De<Entrada type="date" name="de" defaultValue={f.de} className="!py-2" /></label>
          <label className="text-sm">Até<Entrada type="date" name="ate" defaultValue={f.ate} className="!py-2" /></label>
          <label className="text-sm">Origem
            <Selecao name="origem" defaultValue={f.origem ?? ""} className="!py-2">
              <option value="">Todas</option>
              <option value="parceiro">Parceiro</option>
              <option value="cliente">Cliente</option>
            </Selecao>
          </label>
          <label className="text-sm">Parceiro
            <Selecao name="parceiro" defaultValue={f.parceiro ?? ""} className="!py-2">
              <option value="">Todos</option>
              {(parceiros ?? []).map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </Selecao>
          </label>
          <label className="text-sm">Status
            <Selecao name="status" defaultValue={f.status ?? ""} className="!py-2">
              <option value="">Todos</option>
              {STATUS_INDICACAO.map((s) => <option key={s} value={s}>{ROTULO_STATUS[s]}</option>)}
            </Selecao>
          </label>
          <label className="text-sm">Tipo de evento
            <Selecao name="tipo" defaultValue={f.tipo ?? ""} className="!py-2">
              <option value="">Todos</option>
              {TIPOS_EVENTO.map((t) => <option key={t}>{t}</option>)}
            </Selecao>
          </label>
          <Botao variante="secundario" className="!min-h-10 !py-2">Filtrar</Botao>
        </form>
      </Cartao>

      {m ? (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
            <Metrica rotulo="Recebidas" valor={m.recebidas} detalhe={`${m.validas} válidas · ${m.invalidas + m.duplicadas} não contab.`} />
            <Metrica rotulo="Taxa de contato" valor={`${m.taxa_contato}%`} detalhe={`${m.contatadas} contatadas`} />
            <Metrica rotulo="Visitas" valor={m.visitas} />
            <Metrica rotulo="Fechamentos" valor={m.fechamentos} detalhe={`${m.taxa_conversao}% de conversão`} />
            <Metrica rotulo="Receita atribuída" valor={formatarMoeda(m.receita)} />
            <Metrica
              rotulo="Comissão paga"
              valor={formatarMoeda(m.comissao_paga)}
              detalhe={`${formatarMoeda(m.comissao_aprovada)} a pagar · ${formatarMoeda(m.comissao_prevista)} prevista`}
            />
            <Metrica rotulo="Custo por fechamento" valor={formatarMoeda(m.custo_por_fechamento)} detalhe="comissões aprovadas + pagas" />
            <Metrica rotulo="Custo por indicação" valor={formatarMoeda(m.custo_por_indicacao)} />
          </div>
          <Cartao titulo="Comparação com outros canais (leads no período)">
            <div className="-mx-4 overflow-x-auto sm:mx-0">
              <table className="w-full min-w-[480px] text-sm">
                <thead className="text-left text-gray-500">
                  <tr><th className="p-2">Canal</th><th className="p-2 text-right">Leads</th><th className="p-2 text-right">Fechados</th><th className="p-2 text-right">Conversão</th><th className="p-2 text-right">Receita</th></tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {m.canais.map((c) => (
                    <tr key={c.origem} className={c.origem.startsWith("indicacao") ? "font-semibold" : ""}>
                      <td className="p-2">{ROTULO_CANAL[c.origem] ?? c.origem}</td>
                      <td className="p-2 text-right">{c.leads}</td>
                      <td className="p-2 text-right">{c.ganhos}</td>
                      <td className="p-2 text-right">{c.conversao}%</td>
                      <td className="p-2 text-right">{formatarMoeda(c.receita)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Cartao>
        </>
      ) : null}

      <Cartao titulo={`Lista (${itens.length})`}>
        {itens.length === 0 ? (
          <EstadoVazio titulo="Nenhuma indicação encontrada." acao={<BotaoLink href="/painel/parceiros" variante="secundario">Convidar parceiros</BotaoLink>}>
            Quando parceiros ou clientes indicarem alguém, aparece aqui. Ajuste os filtros ou registre uma indicação recebida.
          </EstadoVazio>
        ) : (
          <ul className="divide-y divide-gray-100">
            {itens.map((i) => (
              <li key={i.id}>
                <Link href={`/painel/indicacoes/${i.id}`} className="flex items-start justify-between gap-3 py-3 hover:bg-gray-50">
                  <div>
                    <p className="font-semibold">{i.nome_indicado}</p>
                    <p className="text-sm text-gray-500">
                      {i.origem === "parceiro" ? "Parceiro" : "Cliente"}: {i.parceiros?.nome ?? i.indicadores_clientes?.nome ?? i.indicador_nome ?? "—"} ·{" "}
                      {i.tipo_evento_interesse ?? "evento"} · {formatarData(i.criado_em)}
                    </p>
                    {i.motivo_status && (i.status === "duplicada" || i.status === "invalida") ? (
                      <p className="text-xs text-orange-700">{i.motivo_status}</p>
                    ) : null}
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Selo className={COR_STATUS[i.status]}>{ROTULO_STATUS[i.status]}</Selo>
                    {i.suspeita ? <Selo className="bg-red-100 text-red-800">suspeita</Selo> : null}
                    {i.valor_fechado ? <span className="text-sm">{formatarMoeda(i.valor_fechado)}</span> : null}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Cartao>
    </div>
  );
}
