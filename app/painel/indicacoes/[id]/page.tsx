import Link from "next/link";
import { notFound } from "next/navigation";
import { contextoEquipe, podeGerir } from "@/lib/auth";
import { Flash } from "@/components/Flash";
import { AreaTexto, Aviso, Botao, Campo, Cartao, Entrada, LinkExterno, Selecao, Selo } from "@/components/ui";
import {
  COR_STATUS,
  formatarData,
  formatarMoeda,
  ROTULO_RECOMPENSA,
  ROTULO_STATUS,
  type StatusIndicacao,
  type StatusRecompensa,
} from "@/lib/indicacoes/status";
import { formatarTelefone, linkWhatsApp } from "@/lib/indicacoes/telefone";
import { acaoRecompensa, alterarStatus, editarIndicacao, fecharIndicacao } from "../actions";

const ROTULO_BENEFICIARIO = { parceiro: "Parceiro", cliente_indicador: "Cliente indicador", indicado: "Indicado" } as const;
const ROTULO_CONDICAO = { fechamento: "no fechamento", sinal_pago: "com sinal pago", evento_realizado: "após o evento" } as const;

export default async function DetalheIndicacao({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; erro?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const { supabase, espaco, papel } = await contextoEquipe();
  const { data: i } = await supabase
    .from("indicacoes")
    .select("*, parceiros(id, nome, empresa, telefone), indicadores_clientes(id, nome, telefone), leads(id, etapa), festas!indicacoes_festa_id_fkey(id, anfitriao_nome, data_evento, status, sinal_pago_em)")
    .eq("id", id)
    .maybeSingle();
  if (!i) notFound();
  const [{ data: recompensas }, { data: eventos }, { data: festas }] = await Promise.all([
    supabase.from("recompensas").select("*").eq("indicacao_id", id).order("criado_em"),
    supabase.from("indicacao_eventos").select("*").eq("indicacao_id", id).order("criado_em", { ascending: false }),
    supabase.from("festas").select("id, anfitriao_nome, data_evento").eq("espaco_id", espaco.id).neq("status", "cancelada").order("data_evento", { ascending: false }).limit(100),
  ]);
  const status = i.status as StatusIndicacao;
  const gestao = podeGerir(papel);
  const aberta = !["fechada", "evento_realizado", "perdida", "invalida", "duplicada"].includes(status);
  const volta = `/painel/indicacoes/${id}`;
  const indicador = i.parceiros?.nome ?? i.indicadores_clientes?.nome ?? i.indicador_nome ?? "—";
  const msgContato = `Olá, ${i.nome_indicado.split(" ")[0]}! Aqui é do ${espaco.nome}. Recebemos sua indicação por ${indicador.split(" ")[0]} e queremos ajudar a planejar seu evento. 😊`;

  return (
    <div className="flex flex-col gap-5">
      <Link href="/painel/indicacoes" className="text-marca">← Indicações</Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{i.nome_indicado}</h1>
          <p className="text-gray-600">
            {formatarTelefone(i.telefone_indicado)} {i.email_indicado ? `· ${i.email_indicado}` : ""}
          </p>
          <p className="text-sm text-gray-500">
            Indicado por <strong>{indicador}</strong> ({i.origem}, {i.canal.replace("_", " ")}) em {formatarData(i.criado_em)} · atribuição válida
            até {formatarData(i.atribuida_ate)}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Selo className={COR_STATUS[status]}>{ROTULO_STATUS[status]}</Selo>
          {i.suspeita ? <Selo className="bg-red-100 text-red-800">suspeita: {i.motivos_suspeita.join(", ")}</Selo> : null}
        </div>
      </div>
      <Flash ok={sp.ok} erro={sp.erro} />
      {i.motivo_status ? <Aviso tipo={status === "perdida" ? "info" : "alerta"}>{i.motivo_status}</Aviso> : null}

      {aberta ? (
        <LinkExterno href={linkWhatsApp(i.telefone_indicado, msgContato)} variante="whatsapp">
          Chamar no WhatsApp
        </LinkExterno>
      ) : null}

      <div className="grid gap-5 md:grid-cols-2">
        {aberta || (gestao && (status === "duplicada" || status === "invalida")) || status === "fechada" ? (
          <Cartao titulo="Mudar etapa">
            <form action={alterarStatus} className="flex flex-col gap-3">
              <input type="hidden" name="id" value={id} />
              <Selecao name="status" defaultValue="">
                <option value="" disabled>Selecione</option>
                {status === "fechada" ? (
                  <>
                    <option value="evento_realizado">Evento realizado</option>
                    <option value="perdida">Perdida (contrato desfeito)</option>
                  </>
                ) : (
                  <>
                    <option value="recebida">Recebida</option>
                    <option value="contatada">Contatada</option>
                    <option value="visita_agendada">Visita agendada</option>
                    <option value="orcamento_enviado">Orçamento enviado</option>
                    <option value="perdida">Perdida</option>
                    <option value="invalida">Inválida</option>
                    <option value="duplicada">Duplicada</option>
                  </>
                )}
              </Selecao>
              <Entrada name="motivo" placeholder="Motivo (obrigatório para perdida/inválida/duplicada)" />
              <Botao variante="secundario">Salvar etapa</Botao>
            </form>
          </Cartao>
        ) : null}

        {aberta || (status === "fechada" && !i.valor_fechado) ? (
          <Cartao titulo="Fechou! 🎉">
            <form action={fecharIndicacao} className="flex flex-col gap-3">
              <input type="hidden" name="id" value={id} />
              <Campo rotulo="Valor fechado (R$)"><Entrada name="valor_fechado" inputMode="decimal" required placeholder="15000,00" /></Campo>
              <Campo rotulo="Festa (opcional)">
                <Selecao name="festa_id" defaultValue="">
                  <option value="">Ainda não cadastrada</option>
                  {(festas ?? []).map((f) => <option key={f.id} value={f.id}>{f.anfitriao_nome} · {formatarData(f.data_evento)}</option>)}
                </Selecao>
              </Campo>
              <Campo rotulo="Valor do sinal (opcional)"><Entrada name="valor_sinal" inputMode="decimal" /></Campo>
              <p className="text-xs text-gray-500">A recompensa é calculada pelo servidor com a regra vigente na data da indicação.</p>
              <Botao variante="sucesso">Registrar fechamento</Botao>
            </form>
          </Cartao>
        ) : null}
      </div>

      <Cartao titulo="Recompensas">
        {(recompensas ?? []).length === 0 ? (
          <p className="text-gray-600">Nenhuma recompensa para esta indicação.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {(recompensas ?? []).map((r) => (
              <li key={r.id} className="flex flex-col gap-2 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    <strong>{ROTULO_BENEFICIARIO[r.beneficiario as keyof typeof ROTULO_BENEFICIARIO]}</strong>: {r.descricao} ·{" "}
                    {r.valor !== null ? formatarMoeda(r.valor) : r.tipo === "percentual" ? `${r.percentual}% (aguardando valor)` : "—"}
                    <span className="text-sm text-gray-500"> · aprova {ROTULO_CONDICAO[r.condicao as keyof typeof ROTULO_CONDICAO]}</span>
                  </span>
                  <Selo>{ROTULO_RECOMPENSA[r.status as StatusRecompensa]}</Selo>
                </div>
                {r.motivo_cancelamento ? <p className="text-sm text-gray-500">{r.motivo_cancelamento}</p> : null}
                {r.status === "paga" ? (
                  <p className="text-sm text-gray-500">
                    Paga em {formatarData(r.paga_em)} via {r.forma_pagamento}
                    {r.comprovante_url ? <> · <a className="underline" href={r.comprovante_url} target="_blank" rel="noreferrer">comprovante</a></> : null}
                  </p>
                ) : null}
                {gestao && (r.status === "prevista" || r.status === "aprovada") ? (
                  <details className="text-sm">
                    <summary className="cursor-pointer text-marca">Ajustar / cancelar</summary>
                    <div className="mt-2 grid gap-3 sm:grid-cols-2">
                      <form action={acaoRecompensa} className="flex flex-col gap-2">
                        <input type="hidden" name="recompensa_id" value={r.id} />
                        <input type="hidden" name="acao" value="ajustar" />
                        <input type="hidden" name="voltar" value={volta} />
                        <Entrada name="valor" inputMode="decimal" placeholder="Novo valor" required />
                        <Entrada name="justificativa" placeholder="Justificativa" required minLength={5} />
                        <Botao variante="secundario">Ajustar valor</Botao>
                      </form>
                      <form action={acaoRecompensa} className="flex flex-col gap-2">
                        <input type="hidden" name="recompensa_id" value={r.id} />
                        <input type="hidden" name="acao" value="cancelar" />
                        <input type="hidden" name="voltar" value={volta} />
                        <Entrada name="motivo" placeholder="Motivo do cancelamento" required />
                        <Botao variante="perigo">Cancelar recompensa</Botao>
                      </form>
                    </div>
                  </details>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {gestao ? <p className="mt-2 text-sm"><Link href="/painel/recompensas" className="text-marca underline">Ir para Recompensas a pagar</Link></p> : null}
      </Cartao>

      <div className="grid gap-5 md:grid-cols-2">
        <Cartao titulo="Dados do evento">
          <form action={editarIndicacao} className="flex flex-col gap-3">
            <input type="hidden" name="id" value={id} />
            <Campo rotulo="Nome"><Entrada name="nome_indicado" defaultValue={i.nome_indicado} /></Campo>
            <Campo rotulo="E-mail"><Entrada name="email_indicado" defaultValue={i.email_indicado ?? ""} /></Campo>
            <Campo rotulo="Tipo de evento"><Entrada name="tipo_evento_interesse" defaultValue={i.tipo_evento_interesse ?? ""} /></Campo>
            <div className="grid grid-cols-2 gap-3">
              <Campo rotulo="Data estimada"><Entrada type="date" name="data_evento_estimada" defaultValue={i.data_evento_estimada ?? ""} /></Campo>
              <Campo rotulo="Convidados"><Entrada type="number" name="num_convidados_estimado" defaultValue={i.num_convidados_estimado ?? ""} /></Campo>
            </div>
            <Campo rotulo="Observações"><AreaTexto name="observacoes" defaultValue={i.observacoes ?? ""} /></Campo>
            <Botao variante="secundario">Salvar</Botao>
          </form>
          <p className="mt-3 text-sm text-gray-500">
            Lead no pipeline: {i.leads ? <Link className="underline" href="/painel/leads">{i.leads.etapa}</Link> : "—"} · Festa:{" "}
            {i.festas ? `${i.festas.anfitriao_nome} em ${formatarData(i.festas.data_evento)} (${i.festas.status})` : "—"}
            {i.valor_fechado ? ` · Valor ${formatarMoeda(i.valor_fechado)}` : ""}
          </p>
        </Cartao>

        <Cartao titulo="LGPD e origem do contato">
          <dl className="space-y-2 text-sm">
            <div><dt className="text-gray-500">Origem</dt><dd>{i.origem_contato}</dd></div>
            <div><dt className="text-gray-500">Base legal</dt><dd>{i.base_legal}</dd></div>
            <div><dt className="text-gray-500">Consentimento</dt><dd>{i.consentimento_texto ?? "—"}</dd></div>
            <div>
              <dt className="text-gray-500">Registrado em</dt>
              <dd>
                {i.consentimento_em ? new Date(i.consentimento_em).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—"}
                {i.consentimento_ip ? ` · IP ${i.consentimento_ip}` : ""}
              </dd>
            </div>
            {i.regra_snapshot ? (
              <div>
                <dt className="text-gray-500">Regra aplicada (congelada)</dt>
                <dd>
                  {i.regra_snapshot.nome}: {i.regra_snapshot.tipo_recompensa} {i.regra_snapshot.valor ?? ""} · aprova{" "}
                  {ROTULO_CONDICAO[i.regra_snapshot.condicao_pagamento as keyof typeof ROTULO_CONDICAO]}
                </dd>
              </div>
            ) : null}
          </dl>
        </Cartao>
      </div>

      <Cartao titulo="Histórico (auditoria)">
        <ul className="space-y-1 text-sm text-gray-700">
          {(eventos ?? []).map((e) => (
            <li key={e.id}>
              <span className="text-gray-500">{new Date(e.criado_em).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</span> — {e.tipo}
              {e.de || e.para ? ` (${e.de ?? "—"} → ${e.para ?? "—"})` : ""} · {e.ator_tipo}
              {e.dados?.motivo ? ` · ${e.dados.motivo}` : ""}
              {e.dados?.justificativa ? ` · ${e.dados.justificativa}` : ""}
            </li>
          ))}
        </ul>
      </Cartao>
    </div>
  );
}
