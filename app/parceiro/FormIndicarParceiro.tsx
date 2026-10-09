"use client";
import { useActionState } from "react";
import { indicarPeloPainel, type EstadoForm } from "./actions";
import { AreaTexto, Aviso, Caixa, Campo, Entrada, Selecao } from "@/components/ui";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import { TIPOS_EVENTO } from "@/lib/indicacoes/status";

export function FormIndicarParceiro() {
  const [estado, acao] = useActionState<EstadoForm, FormData>(indicarPeloPainel, { ok: false, mensagem: "" });
  const e = estado.erros ?? {};
  return (
    <form action={acao} className="flex flex-col gap-4" key={estado.ok ? Date.now() : "form"}>
      {estado.ok ? <Aviso tipo="sucesso">{estado.mensagem}</Aviso> : null}
      <Campo rotulo="Nome do cliente" erro={e.nome}>
        <Entrada name="nome" required />
      </Campo>
      <Campo rotulo="WhatsApp do cliente" erro={e.telefone}>
        <Entrada name="telefone" type="tel" inputMode="tel" required placeholder="(11) 98765-4321" />
      </Campo>
      <Campo rotulo="Tipo de evento">
        <Selecao name="tipo_evento" defaultValue="">
          <option value="">Não sei</option>
          {TIPOS_EVENTO.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </Selecao>
      </Campo>
      <div className="grid grid-cols-2 gap-3">
        <Campo rotulo="Data estimada">
          <Entrada name="data_evento" type="date" />
        </Campo>
        <Campo rotulo="Convidados" erro={e.convidados}>
          <Entrada name="convidados" type="number" inputMode="numeric" min={1} />
        </Campo>
      </div>
      <Campo rotulo="Observações (opcional)">
        <AreaTexto name="observacoes" maxLength={1000} />
      </Campo>
      <Aviso tipo="alerta">
        Indique apenas quem já autorizou ser contatado. O espaço vai chamar o cliente pelo WhatsApp e dizer que foi uma
        indicação sua.
      </Aviso>
      <Caixa name="declaracao" required>
        Confirmo que o cliente autorizou que o espaço entre em contato com ele.
      </Caixa>
      {e.declaracao ? <p className="text-sm text-red-600">{e.declaracao}</p> : null}
      {!estado.ok && estado.mensagem ? <Aviso tipo="erro">{estado.mensagem}</Aviso> : null}
      <BotaoEnviar>Registrar indicação</BotaoEnviar>
    </form>
  );
}
