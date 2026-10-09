import { Aviso } from "./ui";

export function Flash({ ok, erro }: { ok?: string; erro?: string }) {
  if (erro) return <Aviso tipo="erro">{erro}</Aviso>;
  if (ok) return <Aviso tipo="sucesso">{ok}</Aviso>;
  return null;
}
