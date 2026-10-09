/** "Maria Clara Souza" -> "Maria S." (o parceiro nunca vê o nome completo). */
export function mascararNome(nome: string | null | undefined): string {
  if (!nome || !nome.trim()) return "";
  const partes = nome.trim().split(/\s+/);
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
  if (partes.length === 1) return cap(partes[0]);
  return `${cap(partes[0])} ${partes[partes.length - 1].charAt(0).toUpperCase()}.`;
}

export function primeiroNome(nome: string | null | undefined): string {
  return (nome ?? "").trim().split(/\s+/)[0] ?? "";
}
