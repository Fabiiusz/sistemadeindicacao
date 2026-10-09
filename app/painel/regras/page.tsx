import { contextoEquipe } from "@/lib/auth";
import { Flash } from "@/components/Flash";
import { CamposRegra } from "@/components/painel/CamposRegra";
import { Botao, Campo, Cartao, Entrada, EstadoVazio, Selecao, Selo } from "@/components/ui";
import { formatarData, formatarMoeda } from "@/lib/indicacoes/status";
import { formatarTelefone } from "@/lib/indicacoes/telefone";
import { desativarRegra } from "../parceiros/actions";
import { criarRegra, salvarConfiguracoes } from "./actions";

const CONDICAO: Record<string, string> = { fechamento: "no fechamento", sinal_pago: "com sinal pago", evento_realizado: "após o evento" };

export default async function Regras({ searchParams }: { searchParams: Promise<{ ok?: string; erro?: string }> }) {
  const sp = await searchParams;
  const { supabase, espaco } = await contextoEquipe(["dono", "gerente"]);
  const { data: regras } = await supabase
    .from("regras_indicacao")
    .select("*, parceiros(nome)")
    .eq("espaco_id", espaco.id)
    .order("ativa", { ascending: false })
    .order("criado_em", { ascending: false });
  const cfg = (espaco.config ?? {}) as Record<string, number>;

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-2xl font-bold">Regras do programa</h1>
      <Flash ok={sp.ok} erro={sp.erro} />
      <p className="text-sm text-gray-600">
        Cada indicação usa a regra vigente <strong>na data em que foi feita</strong>. Mudar ou criar regras não altera
        indicações antigas. Para mudar valores, desative a regra e crie outra.
      </p>

      <Cartao titulo="Regras">
        {(regras ?? []).length === 0 ? (
          <EstadoVazio titulo="Nenhuma regra ainda.">Sem regra, as indicações são registradas, mas sem recompensa.</EstadoVazio>
        ) : (
          <ul className="divide-y divide-gray-100">
            {(regras ?? []).map((r) => (
              <li key={r.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                <div className="text-sm">
                  <p className="font-semibold">
                    {r.nome} {r.parceiros ? <span className="text-violet-700">(exceção: {r.parceiros.nome})</span> : null}
                  </p>
                  <p>
                    {r.publico === "parceiro" ? "Parceiros" : "Clientes"} ·{" "}
                    {r.tipo_recompensa === "percentual" ? `${r.valor}% sobre ${r.base_calculo === "sinal_pago" ? "o sinal" : "o valor fechado"}` : r.tipo_recompensa === "brinde" ? r.descricao_recompensa ?? "brinde" : `${formatarMoeda(r.valor)} (${r.tipo_recompensa})`}{" "}
                    · aprova {CONDICAO[r.condicao_pagamento]} · atribuição {r.validade_dias_atribuicao} dias
                    {r.limite_por_indicador ? ` · até ${r.limite_por_indicador} por indicador` : ""}
                  </p>
                  {r.beneficio_indicado_tipo ? (
                    <p className="text-gray-600">Indicado ganha: {r.beneficio_indicado_descricao ?? `${r.beneficio_indicado_tipo} ${r.beneficio_indicado_valor ?? ""}`}</p>
                  ) : null}
                  <p className="text-gray-500">
                    Vigência {formatarData(r.vigencia_inicio)} → {r.vigencia_fim ? formatarData(r.vigencia_fim) : "sem fim"}
                    {r.justificativa ? ` · ${r.justificativa}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {r.ativa ? <Selo className="bg-emerald-100 text-emerald-800">ativa</Selo> : <Selo>inativa</Selo>}
                  {r.ativa ? (
                    <form action={desativarRegra}>
                      <input type="hidden" name="regra_id" value={r.id} />
                      <input type="hidden" name="voltar" value="/painel/regras" />
                      <Botao variante="secundario" className="!min-h-9 !py-1 text-sm">Desativar</Botao>
                    </form>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Cartao>

      <Cartao titulo="Nova regra geral">
        <form action={criarRegra} className="flex flex-col gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo rotulo="Público">
              <Selecao name="publico" defaultValue="parceiro">
                <option value="parceiro">Parceiros (B2B)</option>
                <option value="cliente">Clientes (pós-festa)</option>
              </Selecao>
            </Campo>
            <Campo rotulo="Nome da regra"><Entrada name="nome" placeholder="Ex.: Comissão padrão 2026" /></Campo>
          </div>
          <CamposRegra />
          <Botao>Criar regra</Botao>
        </form>
      </Cartao>

      <Cartao titulo="Configurações do espaço">
        <form action={salvarConfiguracoes} className="grid gap-3 sm:grid-cols-2">
          <Campo rotulo="Nome do espaço"><Entrada name="nome" defaultValue={espaco.nome} /></Campo>
          <Campo rotulo="Logo (URL da imagem)"><Entrada name="logo_url" defaultValue={espaco.logo_url ?? ""} /></Campo>
          <Campo rotulo="Cor da marca"><Entrada name="cor_primaria" type="color" defaultValue={espaco.cor_primaria ?? "#7c3aed"} className="!h-12 !p-1" /></Campo>
          <Campo rotulo="WhatsApp do comercial (recebe aviso de nova indicação)">
            <Entrada name="whatsapp_comercial" defaultValue={formatarTelefone(espaco.whatsapp_comercial)} />
          </Campo>
          <Campo rotulo="Dias após a festa para pedir avaliação"><Entrada name="dias_pos_festa" type="number" min={0} max={60} defaultValue={cfg.dias_pos_festa ?? 2} /></Campo>
          <Campo rotulo="Máx. envios por dispositivo a cada 10 min"><Entrada name="rate_limit_por_ip" type="number" min={1} defaultValue={cfg.rate_limit_por_ip ?? 5} /></Campo>
          <Campo rotulo="Máx. indicações por parceiro por dia"><Entrada name="rate_limit_parceiro_dia" type="number" min={1} defaultValue={cfg.rate_limit_parceiro_dia ?? 20} /></Campo>
          <div className="sm:col-span-2"><Botao>Salvar configurações</Botao></div>
        </form>
      </Cartao>
    </div>
  );
}
