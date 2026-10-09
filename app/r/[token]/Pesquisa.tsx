"use client";
import Link from "next/link";
import { useActionState, useState } from "react";
import { responderPesquisa, type EstadoPesquisa } from "./actions";
import { AreaTexto, Aviso, Cartao, LinkExterno } from "@/components/ui";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import { Copiar } from "@/components/Copiar";

type Props = {
  token: string;
  primeiroNome: string;
  nomeEspaco: string;
  appUrl: string;
  beneficioAmigo: string | null;
  recompensaIndicador: string | null;
  limite: number | null;
  inicial: EstadoPesquisa;
};

export function Pesquisa(props: Props) {
  const [estado, acao] = useActionState<EstadoPesquisa, FormData>(responderPesquisa, props.inicial);
  const [nota, setNota] = useState<number | null>(null);

  if (estado.etapa === "promotor") return <ConviteIndicar {...props} codigo={estado.codigo ?? null} />;
  if (estado.etapa === "neutro")
    return (
      <Aviso tipo="sucesso">
        Obrigado pela avaliação, {props.primeiroNome}! Vamos usar sua opinião para melhorar cada vez mais.
      </Aviso>
    );
  if (estado.etapa === "detrator")
    return (
      <Aviso tipo="info">
        Obrigado pela sinceridade, {props.primeiroNome}. Sentimos muito que a experiência não foi como esperado. A gerência
        do {props.nomeEspaco} vai entrar em contato com você para entender o que aconteceu.
      </Aviso>
    );

  return (
    <form action={acao} className="flex flex-col gap-5">
      <input type="hidden" name="token" value={props.token} />
      <input type="hidden" name="nota" value={nota ?? ""} />
      <fieldset>
        <legend className="mb-3 font-medium">
          De 0 a 10, quanto você recomendaria o {props.nomeEspaco} para um amigo?
        </legend>
        <div className="grid grid-cols-6 gap-2 sm:grid-cols-11">
          {Array.from({ length: 11 }, (_, n) => (
            <button
              type="button"
              key={n}
              onClick={() => setNota(n)}
              aria-pressed={nota === n}
              className={`h-12 rounded-xl border text-lg font-bold ${
                nota === n ? "border-marca bg-marca text-white" : "border-gray-300 bg-white"
              }`}
            >
              {n}
            </button>
          ))}
        </div>
        <div className="mt-1 flex justify-between text-xs text-gray-500">
          <span>Nada provável</span>
          <span>Muito provável</span>
        </div>
      </fieldset>
      <label className="flex flex-col gap-1">
        <span className="font-medium">Quer contar mais? (opcional)</span>
        <AreaTexto name="comentario" maxLength={2000} />
      </label>
      {estado.mensagem ? <Aviso tipo="erro">{estado.mensagem}</Aviso> : null}
      <BotaoEnviar disabled={nota === null}>Enviar avaliação</BotaoEnviar>
    </form>
  );
}

function ConviteIndicar({
  codigo,
  primeiroNome,
  nomeEspaco,
  appUrl,
  beneficioAmigo,
  recompensaIndicador,
  limite,
}: Props & { codigo: string | null }) {
  if (!codigo) return <Aviso tipo="sucesso">Obrigado pela avaliação! 💜</Aviso>;
  const link = `${appUrl}/v/${codigo}`;
  const texto = [
    `Fiz minha festa no ${nomeEspaco} e amei! 🥳`,
    beneficioAmigo ? `Se for fazer a sua, pela minha indicação você ganha ${beneficioAmigo}.` : null,
    `Deixa seu contato aqui: ${link}`,
  ]
    .filter(Boolean)
    .join("\n");
  return (
    <div className="flex flex-col gap-4">
      <Aviso tipo="sucesso">Que bom que você amou, {primeiroNome}! 💜</Aviso>
      <Cartao titulo="Indique um amigo">
        <div className="flex flex-col gap-3">
          {beneficioAmigo ? (
            <p>
              Seu amigo ganha <strong>{beneficioAmigo}</strong>
              {recompensaIndicador ? (
                <>
                  {" "}e você ganha <strong>{recompensaIndicador}</strong> quando ele fechar a festa
                </>
              ) : null}
              .
            </p>
          ) : recompensaIndicador ? (
            <p>
              Você ganha <strong>{recompensaIndicador}</strong> quando seu amigo fechar a festa.
            </p>
          ) : (
            <p>Compartilhe seu link com quem vai fazer festa.</p>
          )}
          <LinkExterno href={`https://wa.me/?text=${encodeURIComponent(texto)}`} variante="whatsapp">
            Compartilhar no WhatsApp
          </LinkExterno>
          <Copiar texto={link} rotulo="Copiar link" />
          <p className="text-xs text-gray-500">
            {limite ? `Até ${limite} indicações recompensadas por cliente. ` : ""}Vale a primeira indicação de cada
            telefone; não vale para quem já é cliente.{" "}
            <Link href="/termos/clientes" className="underline">Regulamento</Link>
          </p>
        </div>
      </Cartao>
    </div>
  );
}
