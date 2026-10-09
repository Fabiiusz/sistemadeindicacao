import { contextoEquipe } from "@/lib/auth";
import { env } from "@/lib/env";
import { Flash } from "@/components/Flash";
import { Copiar } from "@/components/Copiar";
import { Botao, Cartao, Entrada, EstadoVazio, Selo } from "@/components/ui";
import { formatarData } from "@/lib/indicacoes/status";
import { formatarTelefone } from "@/lib/indicacoes/telefone";
import { anonimizar, bloquear, responder } from "./actions";

const TIPO = { exclusao: "Exclusão", oposicao: "Não contatar", acesso: "Acesso aos dados" } as const;

export default async function Lgpd({ searchParams }: { searchParams: Promise<{ ok?: string; erro?: string }> }) {
  const sp = await searchParams;
  const { supabase, espaco } = await contextoEquipe(["dono", "gerente"]);
  const [{ data: solicitacoes }, { data: bloqueios }] = await Promise.all([
    supabase.from("solicitacoes_lgpd").select("*").eq("espaco_id", espaco.id).order("criado_em", { ascending: false }).limit(100),
    supabase.from("bloqueio_contato").select("*").eq("espaco_id", espaco.id).order("criado_em", { ascending: false }).limit(300),
  ]);

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-2xl font-bold">Privacidade (LGPD)</h1>
      <Flash ok={sp.ok} erro={sp.erro} />
      <Cartao titulo="Página pública para o titular">
        <Copiar texto={`${env.appUrl()}/privacidade/exclusao?espaco=${espaco.slug}`} rotulo="Copiar link" />
      </Cartao>

      <Cartao titulo="Pedidos dos titulares">
        {(solicitacoes ?? []).length === 0 ? (
          <EstadoVazio titulo="Nenhum pedido." />
        ) : (
          <ul className="divide-y divide-gray-100">
            {(solicitacoes ?? []).map((s) => (
              <li key={s.id} className="flex flex-col gap-2 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    <strong>{TIPO[s.tipo as keyof typeof TIPO]}</strong> · {s.nome ?? "sem nome"} · {formatarTelefone(s.telefone)} {s.email ?? ""} ·{" "}
                    {formatarData(s.criado_em)}
                  </span>
                  <Selo className={s.status === "aberta" ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}>{s.status}</Selo>
                </div>
                {s.mensagem ? <p className="text-sm text-gray-600">{s.mensagem}</p> : null}
                {s.resposta ? <p className="text-sm text-gray-500">Resposta: {s.resposta}</p> : null}
                {s.status === "aberta" ? (
                  <div className="flex flex-wrap gap-2">
                    {s.telefone && s.tipo === "exclusao" ? (
                      <form action={anonimizar}>
                        <input type="hidden" name="telefone" value={s.telefone} />
                        <input type="hidden" name="solicitacao_id" value={s.id} />
                        <Botao variante="perigo" className="!min-h-10 !py-2 text-sm">Conferi a identidade: anonimizar</Botao>
                      </form>
                    ) : null}
                    <form action={responder} className="flex flex-wrap gap-2">
                      <input type="hidden" name="id" value={s.id} />
                      <Entrada name="resposta" placeholder="Resposta / observação" className="!py-2" />
                      <Botao name="status" value="concluida" variante="secundario" className="!min-h-10 !py-2 text-sm">Concluir</Botao>
                      <Botao name="status" value="recusada" variante="secundario" className="!min-h-10 !py-2 text-sm">Recusar</Botao>
                    </form>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Cartao>

      <Cartao titulo={`Lista de bloqueio (${(bloqueios ?? []).length})`}>
        <form action={bloquear} className="mb-3 flex flex-wrap gap-2">
          <Entrada name="telefone" placeholder="WhatsApp" required className="!py-2 sm:max-w-xs" />
          <Entrada name="motivo" placeholder="Motivo" className="!py-2 sm:max-w-xs" />
          <Botao variante="secundario" className="!min-h-10 !py-2">Bloquear</Botao>
        </form>
        <ul className="divide-y divide-gray-100 text-sm">
          {(bloqueios ?? []).map((b) => (
            <li key={b.id} className="flex justify-between py-2">
              <span>{formatarTelefone(b.telefone)} · {b.motivo}</span>
              <span className="text-gray-500">{b.origem} · {formatarData(b.criado_em)}</span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-gray-500">
          Telefones bloqueados não recebem nenhuma mensagem da fila e não podem ser indicados de novo.
        </p>
      </Cartao>
    </div>
  );
}
