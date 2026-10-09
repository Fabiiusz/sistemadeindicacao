import Link from "next/link";
import { contextoEquipe } from "@/lib/auth";
import { Flash } from "@/components/Flash";
import { AreaTexto, Botao, Caixa, Campo, Cartao, Entrada, Selecao } from "@/components/ui";
import { TIPOS_EVENTO } from "@/lib/indicacoes/status";
import { registrarIndicacaoComercial } from "../actions";

export default async function NovaIndicacao({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const { erro } = await searchParams;
  const { supabase, espaco } = await contextoEquipe();
  const [{ data: parceiros }, { data: clientes }] = await Promise.all([
    supabase.from("parceiros").select("id, nome, empresa").eq("espaco_id", espaco.id).eq("status", "ativo").order("nome"),
    supabase.from("indicadores_clientes").select("id, nome").eq("espaco_id", espaco.id).order("nome"),
  ]);
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4">
      <Link href="/painel/indicacoes" className="text-marca">← Indicações</Link>
      <h1 className="text-2xl font-bold">Registrar indicação recebida</h1>
      <Flash erro={erro} />
      <Cartao>
        <form action={registrarIndicacaoComercial} className="flex flex-col gap-4">
          <Campo rotulo="Quem indicou">
            <Selecao name="indicador" required defaultValue="">
              <option value="" disabled>Selecione</option>
              <optgroup label="Parceiros ativos">
                {(parceiros ?? []).map((p) => (
                  <option key={p.id} value={`parceiro:${p.id}`}>{p.nome}{p.empresa ? ` (${p.empresa})` : ""}</option>
                ))}
              </optgroup>
              <optgroup label="Clientes indicadores">
                {(clientes ?? []).map((c) => <option key={c.id} value={`cliente:${c.id}`}>{c.nome}</option>)}
              </optgroup>
              <option value="outro:">Outra pessoa (sem recompensa automática)</option>
            </Selecao>
          </Campo>
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo rotulo="Nome de quem indicou (se outra pessoa)"><Entrada name="indicador_nome" /></Campo>
            <Campo rotulo="WhatsApp de quem indicou"><Entrada name="indicador_telefone" type="tel" /></Campo>
          </div>
          <hr />
          <Campo rotulo="Nome do indicado"><Entrada name="nome" required /></Campo>
          <Campo rotulo="WhatsApp do indicado"><Entrada name="telefone" type="tel" required placeholder="(11) 98765-4321" /></Campo>
          <Campo rotulo="E-mail (opcional)"><Entrada name="email" type="email" /></Campo>
          <Campo rotulo="Tipo de evento">
            <Selecao name="tipo_evento" defaultValue="">
              <option value="">—</option>
              {TIPOS_EVENTO.map((t) => <option key={t}>{t}</option>)}
            </Selecao>
          </Campo>
          <div className="grid grid-cols-2 gap-3">
            <Campo rotulo="Data estimada"><Entrada name="data_evento" type="date" /></Campo>
            <Campo rotulo="Convidados"><Entrada name="convidados" type="number" min={1} /></Campo>
          </div>
          <Campo rotulo="Observações"><AreaTexto name="observacoes" /></Campo>
          <Caixa name="consentimento" required>
            Confirmo que o indicado autorizou o contato do espaço (ele falou com a gente ou o indicador confirmou a autorização).
          </Caixa>
          <Botao>Registrar</Botao>
        </form>
      </Cartao>
    </div>
  );
}
