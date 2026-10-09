import { Campo, Entrada, Selecao } from "@/components/ui";

/** Campos comuns de uma regra de recompensa (regra geral ou exceção). */
export function CamposRegra({ comBeneficioIndicado = true }: { comBeneficioIndicado?: boolean }) {
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo rotulo="Tipo de recompensa">
          <Selecao name="tipo_recompensa" defaultValue="percentual">
            <option value="percentual">Percentual (%)</option>
            <option value="valor_fixo">Valor fixo (R$)</option>
            <option value="credito">Crédito (R$)</option>
            <option value="brinde">Brinde</option>
          </Selecao>
        </Campo>
        <Campo rotulo="Valor" ajuda="% ou R$, conforme o tipo. Vazio para brinde.">
          <Entrada name="valor" inputMode="decimal" placeholder="5" />
        </Campo>
        <Campo rotulo="Descrição (ex.: brinde)">
          <Entrada name="descricao_recompensa" placeholder="Kit de doces" />
        </Campo>
        <Campo rotulo="Base de cálculo (percentual)">
          <Selecao name="base_calculo" defaultValue="valor_fechado">
            <option value="valor_fechado">Valor fechado</option>
            <option value="sinal_pago">Valor do sinal</option>
          </Selecao>
        </Campo>
        <Campo rotulo="Quando aprovar">
          <Selecao name="condicao_pagamento" defaultValue="evento_realizado">
            <option value="evento_realizado">Após o evento realizado</option>
            <option value="sinal_pago">Após o sinal pago</option>
            <option value="fechamento">No fechamento</option>
          </Selecao>
        </Campo>
        <Campo rotulo="Validade da atribuição (dias)">
          <Entrada name="validade_dias_atribuicao" type="number" min={1} max={730} defaultValue={90} />
        </Campo>
        <Campo rotulo="Vigente a partir de">
          <Entrada name="vigencia_inicio" type="date" />
        </Campo>
        <Campo rotulo="Limite de indicações recompensadas por indicador" ajuda="Vazio = sem limite">
          <Entrada name="limite_por_indicador" type="number" min={1} />
        </Campo>
      </div>
      {comBeneficioIndicado ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <Campo rotulo="Benefício para o indicado">
            <Selecao name="beneficio_indicado_tipo" defaultValue="">
              <option value="">Nenhum</option>
              <option value="desconto_percentual">Desconto (%)</option>
              <option value="desconto_valor">Desconto (R$)</option>
              <option value="brinde">Brinde</option>
            </Selecao>
          </Campo>
          <Campo rotulo="Valor do benefício">
            <Entrada name="beneficio_indicado_valor" inputMode="decimal" />
          </Campo>
          <Campo rotulo="Descrição do benefício">
            <Entrada name="beneficio_indicado_descricao" placeholder="Mesa de doces de cortesia" />
          </Campo>
        </div>
      ) : null}
    </>
  );
}
