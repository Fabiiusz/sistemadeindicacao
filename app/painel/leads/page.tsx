import { contextoEquipe } from "@/lib/auth";
import { Flash } from "@/components/Flash";
import { Botao, Cartao, Entrada, Selecao, Selo } from "@/components/ui";
import { formatarMoeda, TIPOS_EVENTO } from "@/lib/indicacoes/status";
import { formatarTelefone } from "@/lib/indicacoes/telefone";
import { criarLead, moverLead } from "./actions";

const ETAPAS = [
  ["novo", "Novo"],
  ["contatado", "Contatado"],
  ["visita_agendada", "Visita agendada"],
  ["orcamento_enviado", "Orçamento enviado"],
  ["ganho", "Ganho"],
  ["perdido", "Perdido"],
] as const;

/**
 * Pipeline mínimo (o PortaCheia real já tem o seu; esta tela existe para o
 * módulo de indicações ser testável de ponta a ponta).
 */
export default async function Leads({ searchParams }: { searchParams: Promise<{ ok?: string; erro?: string }> }) {
  const sp = await searchParams;
  const { supabase, espaco } = await contextoEquipe();
  const { data } = await supabase
    .from("leads")
    .select("id, nome, telefone, origem, etapa, tipo_evento, valor_fechado, criado_em")
    .eq("espaco_id", espaco.id)
    .order("criado_em", { ascending: false })
    .limit(300);
  const leads = data ?? [];

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-2xl font-bold">Leads (pipeline)</h1>
      <Flash ok={sp.ok} erro={sp.erro} />
      <Cartao titulo="Novo lead">
        <form action={criarLead} className="grid gap-2 sm:grid-cols-5">
          <Entrada name="nome" placeholder="Nome" required />
          <Entrada name="telefone" placeholder="WhatsApp" required />
          <Selecao name="origem" defaultValue="instagram">
            <option value="instagram">Instagram</option>
            <option value="google">Google</option>
            <option value="site">Site</option>
            <option value="passante">Passante</option>
            <option value="outro">Outro</option>
          </Selecao>
          <Selecao name="tipo_evento" defaultValue="">
            <option value="">Tipo de evento</option>
            {TIPOS_EVENTO.map((t) => <option key={t}>{t}</option>)}
          </Selecao>
          <Botao>Criar</Botao>
        </form>
      </Cartao>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {ETAPAS.map(([etapa, rotulo]) => {
          const itens = leads.filter((l) => l.etapa === etapa);
          return (
            <div key={etapa} className="w-72 shrink-0 rounded-2xl bg-gray-100 p-2">
              <p className="px-2 py-1 font-semibold">
                {rotulo} <span className="text-gray-500">({itens.length})</span>
              </p>
              <div className="flex flex-col gap-2">
                {itens.map((l) => (
                  <div key={l.id} className="rounded-xl bg-white p-3 shadow-sm">
                    <p className="font-medium">{l.nome}</p>
                    <p className="text-xs text-gray-500">{formatarTelefone(l.telefone)} · {l.tipo_evento ?? "—"}</p>
                    <div className="mt-1 flex gap-1">
                      <Selo className={l.origem.startsWith("indicacao") ? "bg-violet-100 text-violet-800" : undefined}>{l.origem}</Selo>
                      {l.valor_fechado ? <Selo className="bg-emerald-100 text-emerald-800">{formatarMoeda(l.valor_fechado)}</Selo> : null}
                    </div>
                    <form action={moverLead} className="mt-2 flex flex-col gap-1">
                      <input type="hidden" name="id" value={l.id} />
                      <Selecao name="etapa" defaultValue={l.etapa} className="!py-1 text-sm">
                        {ETAPAS.map(([v, r]) => <option key={v} value={v}>{r}</option>)}
                      </Selecao>
                      <Entrada name="valor_fechado" placeholder="Valor (se ganho)" className="!py-1 text-sm" />
                      <Botao variante="secundario" className="!min-h-9 !py-1 text-sm">Mover</Botao>
                    </form>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
