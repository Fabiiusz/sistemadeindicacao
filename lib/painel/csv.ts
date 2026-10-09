export type LinhaRecompensa = {
  id: string;
  beneficiario: "parceiro" | "cliente_indicador" | "indicado";
  tipo: string;
  descricao: string | null;
  valor: number | null;
  status: "prevista" | "aprovada" | "paga" | "cancelada";
  aprovada_em: string | null;
  paga_em: string | null;
  forma_pagamento: string | null;
  comprovante_url: string | null;
  indicacao_id: string;
  parceiros: { id: string; nome: string; chave_pix: string | null; documento: string | null; telefone: string } | null;
  indicadores_clientes: { id: string; nome: string; telefone: string | null } | null;
  indicacoes: { nome_indicado: string; valor_fechado: number | null } | null;
};

export function nomeBeneficiario(r: LinhaRecompensa) {
  if (r.beneficiario === "parceiro") return r.parceiros?.nome ?? "Parceiro";
  if (r.beneficiario === "cliente_indicador") return r.indicadores_clientes?.nome ?? "Cliente";
  return `${r.indicacoes?.nome_indicado ?? "Indicado"} (indicado)`;
}

/** CSV com ; e BOM (abre direto no Excel pt-BR). */
export function gerarCsv(linhas: LinhaRecompensa[]): string {
  const cab = ["beneficiario", "tipo_beneficiario", "documento", "chave_pix", "indicado", "descricao", "valor", "status", "aprovada_em", "paga_em", "forma", "comprovante"];
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const corpo = linhas.map((r) =>
    [
      nomeBeneficiario(r),
      r.beneficiario,
      r.parceiros?.documento ?? "",
      r.parceiros?.chave_pix ?? "",
      r.indicacoes?.nome_indicado ?? "",
      r.descricao ?? "",
      r.valor !== null ? Number(r.valor).toFixed(2).replace(".", ",") : "",
      r.status,
      r.aprovada_em ? r.aprovada_em.slice(0, 10) : "",
      r.paga_em ?? "",
      r.forma_pagamento ?? "",
      r.comprovante_url ?? "",
    ]
      .map(esc)
      .join(";"),
  );
  return "﻿" + [cab.join(";"), ...corpo].join("\r\n");
}
