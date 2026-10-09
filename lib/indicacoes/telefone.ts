/**
 * Normaliza telefone para E.164. Sem DDI, assume Brasil (+55).
 * Espelha public.normalizar_telefone() do banco (que é a fonte da verdade).
 */
export function normalizarTelefone(entrada: string | null | undefined): string | null {
  if (!entrada) return null;
  let digitos = entrada.replace(/\D/g, "");
  if (/^\s*\+/.test(entrada)) {
    if (digitos.length >= 8 && digitos.length <= 15 && !digitos.startsWith("0")) return `+${digitos}`;
    return null;
  }
  digitos = digitos.replace(/^0+/, "");
  if (digitos.length === 10 || digitos.length === 11) return `+55${digitos}`;
  if ((digitos.length === 12 || digitos.length === 13) && digitos.startsWith("55")) return `+${digitos}`;
  return null;
}

/** "+5511987654321" -> "(11) 98765-4321" (apenas para exibição à equipe). */
export function formatarTelefone(e164: string | null | undefined): string {
  if (!e164) return "";
  const m = e164.match(/^\+55(\d{2})(\d{4,5})(\d{4})$/);
  if (!m) return e164;
  return `(${m[1]}) ${m[2]}-${m[3]}`;
}

/** Oculta o telefone para terceiros: "(11) 9****-**21". */
export function mascararTelefone(e164: string | null | undefined): string {
  if (!e164) return "";
  const d = e164.replace(/\D/g, "");
  return `(${d.slice(2, 4)}) ${d.slice(4, 5)}****-**${d.slice(-2)}`;
}

/** Link wa.me para abrir conversa com mensagem pronta. */
export function linkWhatsApp(e164: string | null, mensagem: string): string {
  const texto = encodeURIComponent(mensagem);
  if (!e164) return `https://wa.me/?text=${texto}`;
  return `https://wa.me/${e164.replace(/\D/g, "")}?text=${texto}`;
}
