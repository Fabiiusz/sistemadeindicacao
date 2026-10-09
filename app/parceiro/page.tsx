/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { contextoParceiro } from "@/lib/auth";
import { env } from "@/lib/env";
import { hexParaRgb } from "@/components/Marca";
import { Copiar } from "@/components/Copiar";
import { Aviso, BotaoLink, Cartao, EstadoVazio, LinkExterno, Metrica, Selo } from "@/components/ui";
import { linkParceiro, textoInstagramParceiro, textoWhatsAppParceiro } from "@/lib/indicacoes/divulgacao";
import { CONDICAO_TEXTO, descreverBeneficioIndicado, descreverRecompensa, regraPublica } from "@/lib/indicacoes/publico";
import { COR_STATUS, formatarData, formatarMoeda, statusSimples, type StatusIndicacao } from "@/lib/indicacoes/status";
import { linkWhatsApp } from "@/lib/indicacoes/telefone";
import { FormMeusDados } from "./FormMeusDados";

export const metadata = { title: "Meu painel de parceiro" };

type MinhaIndicacao = {
  id: string;
  nome_indicado: string;
  tipo_evento_interesse: string | null;
  status: StatusIndicacao;
  motivo_status: string | null;
  criado_em: string;
  recompensa_prevista: number | null;
  recompensa_aprovada: number | null;
  recompensa_paga: number | null;
  recompensa_descricao: string | null;
};

const soma = (lista: MinhaIndicacao[], campo: keyof MinhaIndicacao) =>
  lista.reduce((t, i) => t + Number(i[campo] ?? 0), 0);

export default async function PainelParceiro() {
  const { supabase, parceiro, espaco, user } = await contextoParceiro();

  if (!parceiro || !espaco) {
    return (
      <main className="mx-auto max-w-md p-6">
        <EstadoVazio
          titulo="Não encontramos seu cadastro de parceiro"
          acao={<BotaoLink href="/parceiros/cadastro">Quero ser parceiro</BotaoLink>}
        >
          Entramos com o e-mail <strong>{user.email}</strong>. Se você já é parceiro, peça ao espaço para conferir o e-mail
          do seu cadastro.
        </EstadoVazio>
      </main>
    );
  }

  const estilo = { ["--cor-marca" as string]: hexParaRgb(espaco.cor_primaria) };
  const cabecalho = (
    <header className="bg-marca px-4 py-5 text-white">
      <div className="mx-auto flex max-w-2xl items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {espaco.logo_url ? <img src={espaco.logo_url} alt="" className="h-10 w-10 rounded-full bg-white p-1" /> : null}
          <div>
            <p className="text-sm opacity-90">{espaco.nome} · Parceiros</p>
            <p className="text-lg font-semibold">Olá, {parceiro.nome.split(" ")[0]}!</p>
          </div>
        </div>
        <form action="/auth/sair" method="post">
          <button className="rounded-lg bg-white/20 px-3 py-2 text-sm">Sair</button>
        </form>
      </div>
    </header>
  );

  if (parceiro.status !== "ativo") {
    const textos = {
      pendente: "Seu cadastro está em análise. Assim que for aprovado, você recebe seu link pessoal pelo WhatsApp.",
      pausado: "Sua participação está pausada no momento. Fale com o espaço para saber mais.",
      bloqueado: "Sua participação no programa foi encerrada. Fale com o espaço se tiver dúvidas.",
    } as const;
    return (
      <div style={estilo}>
        {cabecalho}
        <main className="mx-auto max-w-2xl p-4">
          <Aviso tipo={parceiro.status === "pendente" ? "info" : "alerta"}>
            {textos[parceiro.status]}
            {parceiro.motivo_status ? <span className="mt-1 block">Motivo: {parceiro.motivo_status}</span> : null}
          </Aviso>
        </main>
      </div>
    );
  }

  const { data } = await supabase.rpc("minhas_indicacoes");
  const indicacoes = (data ?? []) as MinhaIndicacao[];
  const regra = await regraPublica(espaco.id, "parceiro", parceiro.id);
  const link = linkParceiro(env.appUrl(), parceiro.codigo_indicacao);
  const beneficio = descreverBeneficioIndicado(regra);
  const textoWpp = textoWhatsAppParceiro(espaco.nome, link, beneficio);

  return (
    <div style={estilo} className="pb-10">
      {cabecalho}
      <main className="mx-auto flex max-w-2xl flex-col gap-5 px-4 py-5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <BotaoLink href="/parceiro/indicar">+ Indicar um cliente</BotaoLink>
          <LinkExterno href={linkWhatsApp(null, textoWpp)} variante="whatsapp">
            Compartilhar no WhatsApp
          </LinkExterno>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <Metrica rotulo="Previstas" valor={formatarMoeda(soma(indicacoes, "recompensa_prevista"))} />
          <Metrica rotulo="Aprovadas" valor={formatarMoeda(soma(indicacoes, "recompensa_aprovada"))} />
          <Metrica rotulo="Pagas" valor={formatarMoeda(soma(indicacoes, "recompensa_paga"))} />
        </div>

        {regra ? (
          <Aviso>
            Você ganha <strong>{descreverRecompensa(regra)}</strong>, {CONDICAO_TEXTO[regra.condicao_pagamento]}. Cada
            indicação vale por {regra.validade_dias_atribuicao} dias. O pagamento é feito pelo espaço via Pix.
          </Aviso>
        ) : null}

        <Cartao titulo="Minhas indicações">
          {indicacoes.length === 0 ? (
            <EstadoVazio titulo="Você ainda não tem indicações.">
              Compartilhe seu link pelo WhatsApp ou mostre seu QR Code. Quando alguém se cadastrar, aparece aqui.
            </EstadoVazio>
          ) : (
            <ul className="divide-y divide-gray-100">
              {indicacoes.map((i) => (
                <li key={i.id} className="flex items-start justify-between gap-3 py-3">
                  <div>
                    <p className="font-semibold">{i.nome_indicado}</p>
                    <p className="text-sm text-gray-500">
                      {i.tipo_evento_interesse ?? "Evento"} · indicado em {formatarData(i.criado_em)}
                    </p>
                    {i.motivo_status ? <p className="mt-1 text-xs text-gray-500">{i.motivo_status}</p> : null}
                  </div>
                  <div className="flex flex-col items-end gap-1 text-right">
                    <Selo className={COR_STATUS[i.status]}>{statusSimples(i.status)}</Selo>
                    {i.recompensa_paga ? (
                      <span className="text-sm text-emerald-700">Pago {formatarMoeda(i.recompensa_paga)}</span>
                    ) : i.recompensa_aprovada ? (
                      <span className="text-sm text-emerald-700">Aprovado {formatarMoeda(i.recompensa_aprovada)}</span>
                    ) : i.recompensa_prevista ? (
                      <span className="text-sm text-gray-500">Previsto {formatarMoeda(i.recompensa_prevista)}</span>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Cartao>

        <Cartao titulo="Material de divulgação">
          <div className="flex flex-col gap-5">
            <div>
              <p className="mb-2 font-medium">Seu link pessoal</p>
              <Copiar texto={link} rotulo="Copiar link" />
            </div>
            <div className="flex flex-col items-center gap-3">
              <img src={`/api/qr/${parceiro.codigo_indicacao}`} alt="QR Code do seu link" className="h-48 w-48" />
              <div className="grid w-full grid-cols-2 gap-2">
                <a className="rounded-xl border border-gray-300 bg-white px-3 py-3 text-center font-semibold" href={`/api/qr/${parceiro.codigo_indicacao}?formato=png`}>
                  Baixar PNG
                </a>
                <a className="rounded-xl border border-gray-300 bg-white px-3 py-3 text-center font-semibold" href={`/api/qr/${parceiro.codigo_indicacao}?formato=pdf`}>
                  Baixar cartão PDF
                </a>
              </div>
            </div>
            <div>
              <p className="mb-2 font-medium">Texto pronto para WhatsApp</p>
              <Copiar texto={textoWpp} />
            </div>
            <div>
              <p className="mb-2 font-medium">Texto pronto para Instagram</p>
              <Copiar texto={textoInstagramParceiro(espaco.nome, link, beneficio)} />
            </div>
          </div>
        </Cartao>

        <Cartao titulo="Meus dados">
          <FormMeusDados email={parceiro.email} pix={parceiro.chave_pix} />
          <p className="mt-3 text-xs text-gray-500">
            <Link href="/termos/parceiros" className="underline">Termos do programa</Link> ·{" "}
            <Link href="/privacidade" className="underline">Privacidade</Link>
          </p>
        </Cartao>
      </main>
    </div>
  );
}
