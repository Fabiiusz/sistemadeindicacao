import Link from "next/link";
import { contextoEquipe } from "@/lib/auth";
import { Flash } from "@/components/Flash";
import { Botao, Cartao, Entrada, EstadoVazio, Metrica, Selecao } from "@/components/ui";
import { buscarRecompensas } from "@/lib/painel/recompensas";
import { nomeBeneficiario, type LinhaRecompensa } from "@/lib/painel/csv";
import { formatarData, formatarMoeda } from "@/lib/indicacoes/status";
import { acaoRecompensa } from "../indicacoes/actions";

export default async function Recompensas({
  searchParams,
}: {
  searchParams: Promise<{ ver?: string; de?: string; ate?: string; ok?: string; erro?: string }>;
}) {
  const sp = await searchParams;
  const { supabase, espaco } = await contextoEquipe(["dono", "gerente"]);
  const status = sp.ver === "pagas" ? "paga" : "aprovada";
  const linhas = await buscarRecompensas(supabase, espaco.id, { status, de: sp.de, ate: sp.ate });
  const total = linhas.reduce((t, r) => t + Number(r.valor ?? 0), 0);

  // agrupa por beneficiário (parceiro / cliente / indicado)
  const grupos = new Map<string, LinhaRecompensa[]>();
  for (const r of linhas) {
    const chave = r.parceiros?.id ?? r.indicadores_clientes?.id ?? `ind-${r.id}`;
    grupos.set(chave, [...(grupos.get(chave) ?? []), r]);
  }
  const query = new URLSearchParams({ status, ...(sp.de ? { de: sp.de } : {}), ...(sp.ate ? { ate: sp.ate } : {}) });
  const volta = `/painel/recompensas?${new URLSearchParams({ ...(sp.ver ? { ver: sp.ver } : {}), ...(sp.de ? { de: sp.de } : {}), ...(sp.ate ? { ate: sp.ate } : {}) })}`;
  const hoje = new Date().toISOString().slice(0, 10);

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-2xl font-bold">{status === "aprovada" ? "Recompensas a pagar" : "Recompensas pagas"}</h1>
      <Flash ok={sp.ok} erro={sp.erro} />
      <p className="text-sm text-gray-600">
        O sistema nunca paga sozinho: faça o Pix/transferência e registre aqui o pagamento (data, forma e comprovante).
      </p>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex gap-2 text-sm">
          <Link href="/painel/recompensas" className={`rounded-lg px-3 py-2 ${status === "aprovada" ? "bg-marca text-white" : "bg-white"}`}>A pagar</Link>
          <Link href="/painel/recompensas?ver=pagas" className={`rounded-lg px-3 py-2 ${status === "paga" ? "bg-marca text-white" : "bg-white"}`}>Pagas</Link>
        </div>
        <form className="flex flex-wrap items-end gap-2">
          {sp.ver ? <input type="hidden" name="ver" value={sp.ver} /> : null}
          <label className="text-sm">De<Entrada type="date" name="de" defaultValue={sp.de} className="!py-2" /></label>
          <label className="text-sm">Até<Entrada type="date" name="ate" defaultValue={sp.ate} className="!py-2" /></label>
          <Botao variante="secundario" className="!min-h-10 !py-2">Filtrar</Botao>
          <a href={`/api/painel/recompensas/csv?${query}`} className="rounded-xl border border-gray-300 bg-white px-4 py-2 font-semibold">
            Exportar CSV
          </a>
        </form>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Metrica rotulo={status === "aprovada" ? "Total a pagar" : "Total pago no período"} valor={formatarMoeda(total)} />
        <Metrica rotulo="Recompensas" valor={linhas.length} detalhe={`${grupos.size} beneficiário(s)`} />
      </div>

      {linhas.length === 0 ? (
        <EstadoVazio titulo={status === "aprovada" ? "Nada a pagar agora. 👍" : "Nenhum pagamento no período."}>
          Recompensas aparecem aqui quando a condição da regra é atendida (ex.: evento realizado).
        </EstadoVazio>
      ) : (
        [...grupos.values()].map((itens) => {
          const r0 = itens[0];
          const subtotal = itens.reduce((t, r) => t + Number(r.valor ?? 0), 0);
          return (
            <Cartao
              key={r0.id}
              titulo={
                <span className="flex flex-wrap justify-between gap-2">
                  <span>{nomeBeneficiario(r0)}</span>
                  <span>{formatarMoeda(subtotal)}</span>
                </span>
              }
            >
              {r0.parceiros ? (
                <p className="mb-2 text-sm text-gray-600">
                  Pix: <strong>{r0.parceiros.chave_pix ?? "não informado"}</strong> · CPF/CNPJ: {r0.parceiros.documento ?? "não informado"}
                </p>
              ) : null}
              <ul className="divide-y divide-gray-100">
                {itens.map((r) => (
                  <li key={r.id} className="flex flex-col gap-2 py-3">
                    <div className="flex flex-wrap justify-between gap-2 text-sm">
                      <Link href={`/painel/indicacoes/${r.indicacao_id}`} className="underline">
                        {r.indicacoes?.nome_indicado} — {r.descricao}
                      </Link>
                      <span className="font-semibold">{r.valor !== null ? formatarMoeda(r.valor) : "brinde"}</span>
                    </div>
                    <p className="text-xs text-gray-500">
                      Aprovada em {formatarData(r.aprovada_em)}
                      {r.paga_em ? ` · paga em ${formatarData(r.paga_em)} via ${r.forma_pagamento ?? "—"}` : ""}
                    </p>
                    {status === "aprovada" ? (
                      <form action={acaoRecompensa} className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                        <input type="hidden" name="recompensa_id" value={r.id} />
                        <input type="hidden" name="acao" value="pagar" />
                        <input type="hidden" name="voltar" value={volta} />
                        <Entrada type="date" name="paga_em" defaultValue={hoje} className="!py-2" aria-label="Data do pagamento" />
                        <Selecao name="forma" defaultValue="pix" className="!py-2" aria-label="Forma">
                          <option value="pix">Pix</option>
                          <option value="transferencia">Transferência</option>
                          <option value="dinheiro">Dinheiro</option>
                          <option value="credito_festa">Crédito na festa</option>
                          <option value="brinde_entregue">Brinde entregue</option>
                        </Selecao>
                        <Entrada name="comprovante_url" placeholder="Link do comprovante (opcional)" className="col-span-2 !py-2" />
                        <Botao variante="sucesso" className="col-span-2 !min-h-10 !py-2 sm:col-span-1">Marcar como paga</Botao>
                      </form>
                    ) : null}
                  </li>
                ))}
              </ul>
            </Cartao>
          );
        })
      )}
    </div>
  );
}
