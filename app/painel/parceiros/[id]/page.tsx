/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { notFound } from "next/navigation";
import { contextoEquipe, podeGerir } from "@/lib/auth";
import { env } from "@/lib/env";
import { Flash } from "@/components/Flash";
import { Copiar } from "@/components/Copiar";
import { CamposRegra } from "@/components/painel/CamposRegra";
import { AreaTexto, Botao, Campo, Cartao, Entrada, Selecao, Selo } from "@/components/ui";
import { linkParceiro } from "@/lib/indicacoes/divulgacao";
import { COR_STATUS, formatarData, formatarMoeda, ROTULO_STATUS, TIPOS_PARCEIRO, type StatusIndicacao } from "@/lib/indicacoes/status";
import { formatarTelefone } from "@/lib/indicacoes/telefone";
import { alterarStatusParceiro, criarExcecaoRegra, desativarRegra, editarParceiro, enviarAcessoWhatsApp } from "../actions";

export default async function DetalheParceiro({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; erro?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const { supabase, papel } = await contextoEquipe();
  const { data: p } = await supabase.from("parceiros").select("*").eq("id", id).maybeSingle();
  if (!p) notFound();
  const gestao = podeGerir(papel);

  const [{ data: indicacoes }, { data: regras }, { data: eventos }] = await Promise.all([
    supabase
      .from("indicacoes")
      .select("id, nome_indicado, status, criado_em, valor_fechado, motivo_status")
      .eq("indicador_parceiro_id", id)
      .order("criado_em", { ascending: false })
      .limit(50),
    supabase.from("regras_indicacao").select("*").eq("parceiro_id", id).order("criado_em", { ascending: false }),
    supabase
      .from("indicacao_eventos")
      .select("id, tipo, de, para, dados, ator_tipo, criado_em")
      .eq("parceiro_id", id)
      .is("indicacao_id", null)
      .order("criado_em", { ascending: false })
      .limit(20),
  ]);
  const voltar = `/painel/parceiros/${id}`;
  const rotuloTipo = Object.fromEntries(TIPOS_PARCEIRO) as Record<string, string>;

  return (
    <div className="flex flex-col gap-5">
      <Link href="/painel/parceiros" className="text-marca">← Parceiros</Link>
      <div>
        <h1 className="text-2xl font-bold">{p.nome}</h1>
        <p className="text-gray-600">
          {rotuloTipo[p.tipo]} {p.empresa ? `· ${p.empresa}` : ""} · status <strong>{p.status}</strong>
          {p.motivo_status ? ` (${p.motivo_status})` : ""}
        </p>
      </div>
      <Flash ok={sp.ok} erro={sp.erro} />

      {gestao ? (
        <Cartao titulo="Situação no programa">
          <form action={alterarStatusParceiro} className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <input type="hidden" name="parceiro_id" value={p.id} />
            <input type="hidden" name="voltar" value={voltar} />
            <Campo rotulo="Novo status">
              <Selecao name="status" defaultValue={p.status === "ativo" ? "pausado" : "ativo"}>
                <option value="ativo">Ativo (aprovar/reativar)</option>
                <option value="pausado">Pausado</option>
                <option value="bloqueado">Bloqueado</option>
              </Selecao>
            </Campo>
            <div className="flex-1">
              <Campo rotulo="Motivo (obrigatório para pausar/bloquear)">
                <Entrada name="motivo" />
              </Campo>
            </div>
            <Botao>Salvar</Botao>
          </form>
        </Cartao>
      ) : null}

      <div className="grid gap-5 md:grid-cols-2">
        <Cartao titulo="Link e QR Code">
          {p.status === "ativo" ? (
            <div className="flex flex-col gap-3">
              <Copiar texto={linkParceiro(env.appUrl(), p.codigo_indicacao)} rotulo="Copiar link" />
              <img src={`/api/qr/${p.codigo_indicacao}`} alt="QR Code" className="mx-auto h-40 w-40" />
              <div className="grid grid-cols-2 gap-2 text-center font-semibold">
                <a className="rounded-xl border p-2" href={`/api/qr/${p.codigo_indicacao}?formato=png`}>PNG</a>
                <a className="rounded-xl border p-2" href={`/api/qr/${p.codigo_indicacao}?formato=pdf`}>Cartão PDF</a>
              </div>
              {gestao ? (
                <form action={enviarAcessoWhatsApp}>
                  <input type="hidden" name="parceiro_id" value={p.id} />
                  <Botao variante="whatsapp" className="w-full">Enviar acesso ao painel pelo WhatsApp</Botao>
                </form>
              ) : null}
            </div>
          ) : (
            <p className="text-gray-600">O link fica disponível quando o parceiro estiver ativo.</p>
          )}
        </Cartao>

        <Cartao titulo="Dados cadastrais">
          {gestao ? (
            <form action={editarParceiro} className="flex flex-col gap-3">
              <input type="hidden" name="parceiro_id" value={p.id} />
              <Campo rotulo="Nome"><Entrada name="nome" defaultValue={p.nome} /></Campo>
              <Campo rotulo="Empresa"><Entrada name="empresa" defaultValue={p.empresa ?? ""} /></Campo>
              <Campo rotulo="Tipo">
                <Selecao name="tipo" defaultValue={p.tipo}>
                  {TIPOS_PARCEIRO.map(([v, r]) => <option key={v} value={v}>{r}</option>)}
                </Selecao>
              </Campo>
              <Campo rotulo="WhatsApp"><Entrada name="telefone" defaultValue={formatarTelefone(p.telefone)} /></Campo>
              <Campo rotulo="E-mail"><Entrada name="email" type="email" defaultValue={p.email ?? ""} /></Campo>
              <Campo rotulo="CPF/CNPJ"><Entrada name="documento" defaultValue={p.documento ?? ""} /></Campo>
              <Campo rotulo="Chave Pix"><Entrada name="chave_pix" defaultValue={p.chave_pix ?? ""} /></Campo>
              <p className="text-xs text-gray-500">
                Termos aceitos: {p.versao_termos ?? "—"} em {formatarData(p.aceite_termos_em)} (IP {p.aceite_ip ?? "—"})
              </p>
              <Botao variante="secundario">Salvar dados</Botao>
            </form>
          ) : (
            <p>{formatarTelefone(p.telefone)} · {p.email}</p>
          )}
        </Cartao>
      </div>

      {gestao ? (
        <Cartao titulo="Regra de comissão específica (exceção)">
          {(regras ?? []).length > 0 ? (
            <ul className="mb-4 divide-y divide-gray-100">
              {(regras ?? []).map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                  <span>
                    <strong>{r.tipo_recompensa === "percentual" ? `${r.valor}%` : formatarMoeda(r.valor)}</strong> ({r.tipo_recompensa}) desde{" "}
                    {formatarData(r.vigencia_inicio)} — {r.justificativa}{" "}
                    {r.ativa ? <Selo className="bg-emerald-100 text-emerald-800">ativa</Selo> : <Selo>inativa</Selo>}
                  </span>
                  {r.ativa ? (
                    <form action={desativarRegra}>
                      <input type="hidden" name="regra_id" value={r.id} />
                      <input type="hidden" name="voltar" value={voltar} />
                      <Botao variante="secundario" className="!min-h-9 !py-1 text-sm">Desativar</Botao>
                    </form>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mb-3 text-sm text-gray-600">Sem exceção: este parceiro segue a regra geral.</p>
          )}
          <details>
            <summary className="cursor-pointer font-semibold text-marca">Criar exceção para este parceiro</summary>
            <form action={criarExcecaoRegra} className="mt-3 flex flex-col gap-3">
              <input type="hidden" name="parceiro_id" value={p.id} />
              <input type="hidden" name="parceiro_nome" value={p.nome} />
              <CamposRegra comBeneficioIndicado={false} />
              <Campo rotulo="Justificativa (obrigatória, fica registrada)">
                <AreaTexto name="justificativa" required minLength={5} />
              </Campo>
              <Botao>Criar exceção</Botao>
            </form>
          </details>
        </Cartao>
      ) : null}

      <Cartao titulo="Indicações deste parceiro">
        {(indicacoes ?? []).length === 0 ? (
          <p className="text-gray-600">Nenhuma indicação ainda.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {(indicacoes ?? []).map((i) => (
              <li key={i.id} className="flex items-center justify-between gap-2 py-2">
                <Link href={`/painel/indicacoes/${i.id}`} className="underline">{i.nome_indicado}</Link>
                <span className="flex items-center gap-2 text-sm">
                  {formatarData(i.criado_em)}
                  <Selo className={COR_STATUS[i.status as StatusIndicacao]}>{ROTULO_STATUS[i.status as StatusIndicacao]}</Selo>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Cartao>

      <Cartao titulo="Histórico do parceiro">
        <ul className="space-y-1 text-sm text-gray-700">
          {(eventos ?? []).map((e) => (
            <li key={e.id}>
              {new Date(e.criado_em).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })} — {e.tipo}
              {e.de || e.para ? ` (${e.de ?? "—"} → ${e.para ?? "—"})` : ""} · {e.ator_tipo}
              {e.dados?.motivo ? ` · ${e.dados.motivo}` : ""}
            </li>
          ))}
        </ul>
      </Cartao>
    </div>
  );
}
