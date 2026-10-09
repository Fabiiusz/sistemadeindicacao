"use client";
import { useActionState } from "react";
import { pedirExclusao, type EstadoExclusao } from "./actions";
import { AreaTexto, Aviso, Campo, Entrada, Selecao } from "@/components/ui";
import { BotaoEnviar } from "@/components/BotaoEnviar";

export function FormExclusao({ espaco }: { espaco: string }) {
  const [estado, acao] = useActionState<EstadoExclusao, FormData>(pedirExclusao, { ok: false, mensagem: "" });
  if (estado.ok) return <Aviso tipo="sucesso">{estado.mensagem}</Aviso>;
  return (
    <form action={acao} className="flex flex-col gap-4">
      <input type="hidden" name="espaco" value={espaco} />
      <Campo rotulo="O que você quer?">
        <Selecao name="tipo" defaultValue="exclusao">
          <option value="exclusao">Não ser mais contatado e apagar meus dados</option>
          <option value="oposicao">Só não ser mais contatado</option>
          <option value="acesso">Saber quais dados vocês têm sobre mim</option>
        </Selecao>
      </Campo>
      <Campo rotulo="Nome"><Entrada name="nome" autoComplete="name" /></Campo>
      <Campo rotulo="WhatsApp usado no cadastro"><Entrada name="telefone" type="tel" inputMode="tel" placeholder="(11) 98765-4321" /></Campo>
      <Campo rotulo="E-mail (opcional)"><Entrada name="email" type="email" /></Campo>
      <Campo rotulo="Mensagem (opcional)"><AreaTexto name="mensagem" maxLength={2000} /></Campo>
      {estado.mensagem ? <Aviso tipo="erro">{estado.mensagem}</Aviso> : null}
      <BotaoEnviar>Enviar pedido</BotaoEnviar>
    </form>
  );
}
