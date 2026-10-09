import { contextoEquipe } from "@/lib/auth";
import { Flash } from "@/components/Flash";
import { Botao, Cartao, EstadoVazio, LinkExterno, Selo } from "@/components/ui";
import { obterProvider, type ItemFila } from "@/lib/mensagens/provider";
import { formatarData } from "@/lib/indicacoes/status";
import { formatarTelefone } from "@/lib/indicacoes/telefone";
import { atualizarItemFila, gerarLoteHoje } from "./actions";

const ROTULO_TIPO: Record<string, string> = {
  pos_festa: "Pós-festa",
  aviso_parceiro: "Aviso ao parceiro",
  nova_indicacao: "Nova indicação (equipe)",
  acesso_parceiro: "Acesso do parceiro",
};

export default async function FilaEnvios({
  searchParams,
}: {
  searchParams: Promise<{ ver?: string; ok?: string; erro?: string }>;
}) {
  const sp = await searchParams;
  const { supabase, espaco } = await contextoEquipe();
  const verHistorico = sp.ver === "historico";
  let consulta = supabase.from("fila_envios").select("*").eq("espaco_id", espaco.id);
  consulta = verHistorico
    ? consulta.neq("status", "pendente").order("criado_em", { ascending: false }).limit(100)
    : consulta.eq("status", "pendente").order("agendado_para").order("criado_em");
  const { data } = await consulta;
  const itens = (data ?? []) as (ItemFila & { status: string; agendado_para: string; enviado_em: string | null })[];
  const preparados = await Promise.all(itens.map(async (i) => ({ ...i, envio: await obterProvider(i.canal).preparar(i).catch(() => null) })));

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Fila de envios</h1>
        <form action={gerarLoteHoje}>
          <Botao>Gerar lote pós-festa de hoje</Botao>
        </form>
      </div>
      <Flash ok={sp.ok} erro={sp.erro} />
      <p className="text-sm text-gray-600">
        Toque em <strong>Abrir no WhatsApp</strong>, envie a mensagem e depois marque como enviado. Contatos que pediram
        para não receber mensagens aparecem como bloqueados e não podem ser enviados.
      </p>
      <div className="flex gap-2 text-sm">
        <a href="/painel/fila" className={`rounded-lg px-3 py-2 ${!verHistorico ? "bg-marca text-white" : "bg-white"}`}>Pendentes</a>
        <a href="/painel/fila?ver=historico" className={`rounded-lg px-3 py-2 ${verHistorico ? "bg-marca text-white" : "bg-white"}`}>Histórico</a>
      </div>

      {preparados.length === 0 ? (
        <EstadoVazio titulo={verHistorico ? "Nada no histórico ainda." : "Nenhuma mensagem pendente. 🎉"}>
          O lote pós-festa é gerado automaticamente todo dia (ou pelo botão acima).
        </EstadoVazio>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {preparados.map((i) => (
            <Cartao key={i.id}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">{i.destinatario_nome ?? "Contato"}</p>
                  <p className="text-sm text-gray-500">
                    {i.canal === "whatsapp" ? formatarTelefone(i.destino) : i.destino} · {formatarData(i.agendado_para)}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <Selo>{ROTULO_TIPO[i.tipo] ?? i.tipo}</Selo>
                  {i.status !== "pendente" ? <Selo className={i.status === "bloqueado" ? "bg-red-100 text-red-800" : ""}>{i.status}</Selo> : null}
                </div>
              </div>
              <p className="mt-3 whitespace-pre-wrap rounded-xl bg-gray-50 p-3 text-sm">{i.mensagem}</p>
              {i.status === "pendente" ? (
                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
                  {i.envio?.modo === "manual" ? (
                    <LinkExterno href={i.envio.url} variante="whatsapp" className="sm:col-span-3">
                      {i.canal === "email" ? "Abrir e-mail" : "Abrir no WhatsApp"}
                    </LinkExterno>
                  ) : null}
                  <form action={atualizarItemFila} className="sm:col-span-2">
                    <input type="hidden" name="id" value={i.id} />
                    <input type="hidden" name="status" value="enviado" />
                    <Botao variante="sucesso" className="w-full">Marcar como enviado</Botao>
                  </form>
                  <form action={atualizarItemFila}>
                    <input type="hidden" name="id" value={i.id} />
                    <input type="hidden" name="status" value="cancelado" />
                    <Botao variante="secundario" className="w-full">Cancelar</Botao>
                  </form>
                </div>
              ) : null}
            </Cartao>
          ))}
        </div>
      )}
    </div>
  );
}
