import { contextoEquipe } from "@/lib/auth";
import { Flash } from "@/components/Flash";
import { Botao, Cartao, Entrada, Selecao, Selo } from "@/components/ui";
import { formatarData, formatarMoeda, TIPOS_EVENTO } from "@/lib/indicacoes/status";
import { formatarTelefone } from "@/lib/indicacoes/telefone";
import { acaoFesta, criarFesta } from "./actions";

/** Cadastro mínimo de festas (o PortaCheia real já tem o seu). */
export default async function Festas({ searchParams }: { searchParams: Promise<{ ok?: string; erro?: string }> }) {
  const sp = await searchParams;
  const { supabase, espaco } = await contextoEquipe();
  const [{ data: festas }, { data: leads }] = await Promise.all([
    supabase
      .from("festas")
      .select("*, pesquisas_pos_festa(nota, respondida_em), indicadores_clientes(codigo)")
      .eq("espaco_id", espaco.id)
      .order("data_evento", { ascending: false })
      .limit(200),
    supabase.from("leads").select("id, nome").eq("espaco_id", espaco.id).eq("etapa", "ganho").order("nome"),
  ]);

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-2xl font-bold">Festas</h1>
      <Flash ok={sp.ok} erro={sp.erro} />
      <Cartao titulo="Nova festa">
        <form action={criarFesta} className="grid gap-2 sm:grid-cols-4">
          <Entrada name="anfitriao_nome" placeholder="Anfitrião" required />
          <Entrada name="anfitriao_telefone" placeholder="WhatsApp do anfitrião" />
          <Entrada name="data_evento" type="date" required />
          <Selecao name="tipo_evento" defaultValue="">
            <option value="">Tipo de evento</option>
            {TIPOS_EVENTO.map((t) => <option key={t}>{t}</option>)}
          </Selecao>
          <Entrada name="valor_total" placeholder="Valor total" inputMode="decimal" />
          <Entrada name="valor_sinal" placeholder="Valor do sinal" inputMode="decimal" />
          <Selecao name="lead_id" defaultValue="">
            <option value="">Lead de origem (opcional)</option>
            {(leads ?? []).map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}
          </Selecao>
          <Botao>Cadastrar</Botao>
        </form>
      </Cartao>
      <div className="grid gap-3 md:grid-cols-2">
        {(festas ?? []).map((f) => {
          const pesquisa = Array.isArray(f.pesquisas_pos_festa) ? f.pesquisas_pos_festa[0] : f.pesquisas_pos_festa;
          const indicador = Array.isArray(f.indicadores_clientes) ? f.indicadores_clientes[0] : f.indicadores_clientes;
          return (
            <Cartao key={f.id}>
              <div className="flex justify-between gap-2">
                <div>
                  <p className="font-semibold">{f.anfitriao_nome}</p>
                  <p className="text-sm text-gray-500">
                    {formatarData(f.data_evento)} · {f.tipo_evento ?? "evento"} · {formatarTelefone(f.anfitriao_telefone)}
                  </p>
                  <p className="text-sm">
                    {formatarMoeda(f.valor_total)} · sinal {formatarMoeda(f.valor_sinal)} {f.sinal_pago_em ? "(pago)" : "(pendente)"}
                  </p>
                  {pesquisa?.respondida_em ? <p className="text-sm">NPS: <strong>{pesquisa.nota}</strong></p> : null}
                  {indicador?.codigo ? <p className="text-sm text-violet-700">Link de indicação: /v/{indicador.codigo}</p> : null}
                </div>
                <Selo className={f.status === "realizada" ? "bg-emerald-100 text-emerald-800" : f.status === "cancelada" ? "bg-gray-200" : undefined}>
                  {f.status}
                </Selo>
              </div>
              {f.status !== "cancelada" ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {!f.sinal_pago_em ? <FormAcao id={f.id} acao="sinal" rotulo="Sinal pago" /> : null}
                  {f.status === "agendada" ? <FormAcao id={f.id} acao="realizada" rotulo="Festa realizada" /> : null}
                  {!indicador ? <FormAcao id={f.id} acao="link" rotulo="Gerar link de indicação" /> : null}
                  {f.status === "agendada" ? <FormAcao id={f.id} acao="cancelada" rotulo="Cancelar" /> : null}
                </div>
              ) : null}
            </Cartao>
          );
        })}
      </div>
    </div>
  );
}

function FormAcao({ id, acao, rotulo }: { id: string; acao: string; rotulo: string }) {
  return (
    <form action={acaoFesta}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="acao" value={acao} />
      <Botao variante={acao === "cancelada" ? "perigo" : "secundario"} className="!min-h-10 !py-2 text-sm">{rotulo}</Botao>
    </form>
  );
}
