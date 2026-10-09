export const STATUS_INDICACAO = [
  "recebida",
  "contatada",
  "visita_agendada",
  "orcamento_enviado",
  "fechada",
  "evento_realizado",
  "perdida",
  "invalida",
  "duplicada",
] as const;
export type StatusIndicacao = (typeof STATUS_INDICACAO)[number];

/** Rótulos para a equipe. */
export const ROTULO_STATUS: Record<StatusIndicacao, string> = {
  recebida: "Recebida",
  contatada: "Contatada",
  visita_agendada: "Visita agendada",
  orcamento_enviado: "Orçamento enviado",
  fechada: "Fechada",
  evento_realizado: "Evento realizado",
  perdida: "Perdida",
  invalida: "Inválida",
  duplicada: "Duplicada",
};

/** Linguagem simples para o parceiro / indicador. */
export function statusSimples(status: StatusIndicacao): string {
  switch (status) {
    case "recebida":
    case "contatada":
    case "orcamento_enviado":
      return "Em análise";
    case "visita_agendada":
      return "Visita agendada";
    case "fechada":
      return "Fechou!";
    case "evento_realizado":
      return "Evento realizado";
    case "perdida":
      return "Não fechou";
    case "invalida":
    case "duplicada":
      return "Não contabilizada";
  }
}

export const COR_STATUS: Record<StatusIndicacao, string> = {
  recebida: "bg-sky-100 text-sky-800",
  contatada: "bg-indigo-100 text-indigo-800",
  visita_agendada: "bg-violet-100 text-violet-800",
  orcamento_enviado: "bg-amber-100 text-amber-800",
  fechada: "bg-emerald-100 text-emerald-800",
  evento_realizado: "bg-emerald-200 text-emerald-900",
  perdida: "bg-gray-200 text-gray-700",
  invalida: "bg-red-100 text-red-800",
  duplicada: "bg-orange-100 text-orange-800",
};

export const STATUS_RECOMPENSA = ["prevista", "aprovada", "paga", "cancelada"] as const;
export type StatusRecompensa = (typeof STATUS_RECOMPENSA)[number];
export const ROTULO_RECOMPENSA: Record<StatusRecompensa, string> = {
  prevista: "Prevista",
  aprovada: "Aprovada",
  paga: "Paga",
  cancelada: "Cancelada",
};

/** Etapas do pipeline de leads <-> status da indicação (espelha o SQL). */
export const ETAPA_PARA_STATUS: Record<string, StatusIndicacao> = {
  novo: "recebida",
  contatado: "contatada",
  visita_agendada: "visita_agendada",
  orcamento_enviado: "orcamento_enviado",
  ganho: "fechada",
  perdido: "perdida",
};

export const TIPOS_PARCEIRO = [
  ["cerimonialista", "Cerimonialista"],
  ["assessor", "Assessor(a) de casamento"],
  ["fotografo", "Fotógrafo(a)"],
  ["decorador", "Decorador(a)"],
  ["buffet", "Buffet"],
  ["dj", "DJ"],
  ["escola", "Escola"],
  ["formatura", "Comissão de formatura"],
  ["outro", "Outro"],
] as const;

export const TIPOS_EVENTO = [
  "Aniversário infantil",
  "Aniversário adulto",
  "15 anos",
  "Casamento",
  "Formatura",
  "Corporativo",
  "Chá de bebê / revelação",
  "Outro",
] as const;

export function formatarMoeda(valor: number | string | null | undefined): string {
  if (valor === null || valor === undefined || valor === "") return "—";
  return Number(valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function formatarData(data: string | Date | null | undefined): string {
  if (!data) return "—";
  const d = typeof data === "string" && /^\d{4}-\d{2}-\d{2}$/.test(data) ? new Date(`${data}T12:00:00`) : new Date(data);
  return d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}
