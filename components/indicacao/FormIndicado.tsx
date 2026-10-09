"use client";
import { useActionState } from "react";
import { enviarIndicacaoPublica, type EstadoIndicado } from "./actions";
import { AreaTexto, Aviso, Caixa, Campo, Entrada, Selecao } from "@/components/ui";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import { TIPOS_EVENTO } from "@/lib/indicacoes/status";

export function FormIndicado({
  codigo,
  tipoLink,
  textoConsentimento,
  compacto = false,
}: {
  codigo: string;
  tipoLink: "parceiro" | "cliente";
  textoConsentimento: string;
  compacto?: boolean;
}) {
  const [estado, acao] = useActionState<EstadoIndicado, FormData>(enviarIndicacaoPublica, { ok: false, mensagem: "" });
  if (estado.ok)
    return (
      <Aviso tipo="sucesso">
        <p className="text-base font-semibold">Obrigado! 🎉</p>
        <p className="mt-1">{estado.mensagem}</p>
      </Aviso>
    );
  const e = estado.erros ?? {};
  return (
    <form action={acao} className="flex flex-col gap-4">
      <input type="hidden" name="codigo" value={codigo} />
      <input type="hidden" name="tipo_link" value={tipoLink} />
      <input type="text" name="site" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />
      <Campo rotulo="Seu nome" erro={e.nome}>
        <Entrada name="nome" required autoComplete="name" />
      </Campo>
      <Campo rotulo="Seu WhatsApp" erro={e.telefone}>
        <Entrada name="telefone" type="tel" inputMode="tel" required autoComplete="tel" placeholder="(11) 98765-4321" />
      </Campo>
      {!compacto ? (
        <>
          <Campo rotulo="Tipo de evento">
            <Selecao name="tipo_evento" defaultValue="">
              <option value="">Selecione</option>
              {TIPOS_EVENTO.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </Selecao>
          </Campo>
          <div className="grid grid-cols-2 gap-3">
            <Campo rotulo="Data estimada" erro={e.data_evento}>
              <Entrada name="data_evento" type="date" />
            </Campo>
            <Campo rotulo="Nº de convidados" erro={e.convidados}>
              <Entrada name="convidados" type="number" inputMode="numeric" min={1} />
            </Campo>
          </div>
          <Campo rotulo="Mensagem (opcional)">
            <AreaTexto name="mensagem" maxLength={1000} />
          </Campo>
        </>
      ) : (
        <Campo rotulo="Tipo de evento (opcional)">
          <Selecao name="tipo_evento" defaultValue="">
            <option value="">Selecione</option>
            {TIPOS_EVENTO.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </Selecao>
        </Campo>
      )}
      <Caixa name="consentimento" required>
        {textoConsentimento}
      </Caixa>
      {e.consentimento ? <p className="text-sm text-red-600">{e.consentimento}</p> : null}
      {estado.mensagem ? <Aviso tipo="erro">{estado.mensagem}</Aviso> : null}
      <BotaoEnviar>Quero ser contatado</BotaoEnviar>
      <p className="text-center text-xs text-gray-500">
        Seus dados são usados só para o espaço falar com você sobre o seu evento. Não são compartilhados com quem indicou.
      </p>
    </form>
  );
}
