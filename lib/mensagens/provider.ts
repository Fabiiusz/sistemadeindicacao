/**
 * Camada MessageProvider. No MVP o envio é "assistido": o item fica na
 * fila_envios e o comercial abre o link wa.me (ou mailto) e envia. Para a API
 * oficial do WhatsApp (Cloud API) basta implementar `enviar` e trocar o
 * provedor em `obterProvider` — a fila, o opt-out e a auditoria não mudam.
 */
export type ItemFila = {
  id: string;
  canal: "whatsapp" | "email";
  destino: string;
  destinatario_nome: string | null;
  mensagem: string;
  tipo: string;
};

export type ResultadoEnvio =
  | { modo: "manual"; url: string } // abrir o link e enviar à mão
  | { modo: "automatico"; idExterno: string }; // enviado pela API

export interface MessageProvider {
  readonly nome: string;
  preparar(item: ItemFila): Promise<ResultadoEnvio>;
}

export const WaMeProvider: MessageProvider = {
  nome: "wame",
  async preparar(item) {
    const numero = item.destino.replace(/\D/g, "");
    return { modo: "manual", url: `https://wa.me/${numero}?text=${encodeURIComponent(item.mensagem)}` };
  },
};

export const MailtoProvider: MessageProvider = {
  nome: "mailto",
  async preparar(item) {
    const assunto = encodeURIComponent("PortaCheia — programa de indicações");
    return { modo: "manual", url: `mailto:${item.destino}?subject=${assunto}&body=${encodeURIComponent(item.mensagem)}` };
  },
};

/** TODO(API oficial): implementar com WHATSAPP_CLOUD_TOKEN / PHONE_NUMBER_ID e templates aprovados. */
export const WhatsAppCloudProvider: MessageProvider = {
  nome: "whatsapp_cloud",
  async preparar() {
    throw new Error("WhatsApp Cloud API ainda não configurada (TODO).");
  },
};

export function obterProvider(canal: ItemFila["canal"]): MessageProvider {
  if (canal === "email") return MailtoProvider;
  return process.env.WHATSAPP_PROVIDER === "cloud" ? WhatsAppCloudProvider : WaMeProvider;
}
