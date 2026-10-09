"use client";
import { useActionState } from "react";
import { atualizarMeusDados, type EstadoForm } from "./actions";
import { Aviso, Campo, Entrada } from "@/components/ui";
import { BotaoEnviar } from "@/components/BotaoEnviar";

export function FormMeusDados({ email, pix }: { email: string | null; pix: string | null }) {
  const [estado, acao] = useActionState<EstadoForm, FormData>(atualizarMeusDados, { ok: false, mensagem: "" });
  return (
    <form action={acao} className="flex flex-col gap-3">
      <Campo rotulo="E-mail de acesso">
        <Entrada name="email" type="email" defaultValue={email ?? ""} />
      </Campo>
      <Campo rotulo="Chave Pix para receber comissões">
        <Entrada name="chave_pix" defaultValue={pix ?? ""} />
      </Campo>
      {estado.mensagem ? <Aviso tipo={estado.ok ? "sucesso" : "erro"}>{estado.mensagem}</Aviso> : null}
      <BotaoEnviar variante="secundario">Salvar</BotaoEnviar>
    </form>
  );
}
