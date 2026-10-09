"use client";
import { useActionState } from "react";
import { enviarLinkMagico, type EstadoLogin } from "./actions";
import { Aviso, Campo, Entrada } from "@/components/ui";
import { BotaoEnviar } from "@/components/BotaoEnviar";

export function FormLogin({ voltar }: { voltar: string }) {
  const [estado, acao] = useActionState<EstadoLogin, FormData>(enviarLinkMagico, { ok: false, mensagem: "" });
  if (estado.ok) return <Aviso tipo="sucesso">{estado.mensagem}</Aviso>;
  return (
    <form action={acao} className="flex flex-col gap-4">
      <input type="hidden" name="voltar" value={voltar} />
      <Campo rotulo="Seu e-mail">
        <Entrada name="email" type="email" inputMode="email" autoComplete="email" required placeholder="voce@exemplo.com" />
      </Campo>
      {estado.mensagem ? <Aviso tipo="erro">{estado.mensagem}</Aviso> : null}
      <BotaoEnviar>Receber link de acesso</BotaoEnviar>
    </form>
  );
}
