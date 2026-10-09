import "server-only";
import { redirect } from "next/navigation";
import { mensagemErro } from "@/lib/indicacoes/erros";

/** Redireciona de volta com mensagem de sucesso/erro (?ok= / ?erro=). */
export function voltarCom(caminho: string, resultado: { ok?: string; erro?: unknown }): never {
  const url = new URL(caminho, "http://x");
  if (resultado.erro !== undefined) url.searchParams.set("erro", mensagemErro(resultado.erro));
  else if (resultado.ok) url.searchParams.set("ok", resultado.ok);
  redirect(`${url.pathname}${url.search}`);
}
