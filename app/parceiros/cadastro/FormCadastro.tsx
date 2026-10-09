"use client";
import Link from "next/link";
import { useActionState } from "react";
import { cadastrarParceiro, type EstadoCadastro } from "./actions";
import { Aviso, Caixa, Campo, Entrada, Selecao } from "@/components/ui";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import { TIPOS_PARCEIRO } from "@/lib/indicacoes/status";

export function FormCadastro({ espaco, versaoTermos }: { espaco: string; versaoTermos: string }) {
  const [estado, acao] = useActionState<EstadoCadastro, FormData>(cadastrarParceiro, { ok: false, mensagem: "" });
  if (estado.ok) return <Aviso tipo="sucesso">{estado.mensagem}</Aviso>;
  const e = estado.erros ?? {};
  return (
    <form action={acao} className="flex flex-col gap-4">
      <input type="hidden" name="espaco" value={espaco} />
      <Campo rotulo="Seu nome" erro={e.nome}>
        <Entrada name="nome" required autoComplete="name" />
      </Campo>
      <Campo rotulo="Empresa / nome profissional (opcional)">
        <Entrada name="empresa" autoComplete="organization" />
      </Campo>
      <Campo rotulo="Você é" erro={e.tipo}>
        <Selecao name="tipo" defaultValue="cerimonialista">
          {TIPOS_PARCEIRO.map(([v, r]) => (
            <option key={v} value={v}>
              {r}
            </option>
          ))}
        </Selecao>
      </Campo>
      <Campo rotulo="WhatsApp" erro={e.telefone} ajuda="É por aqui que você recebe seu link e os avisos.">
        <Entrada name="telefone" type="tel" inputMode="tel" required placeholder="(11) 98765-4321" autoComplete="tel" />
      </Campo>
      <Campo rotulo="E-mail" erro={e.email} ajuda="Usado para entrar no seu painel (link de acesso, sem senha).">
        <Entrada name="email" type="email" inputMode="email" autoComplete="email" />
      </Campo>
      <Campo rotulo="CPF ou CNPJ (opcional)" erro={e.documento} ajuda="Necessário para receber comissões.">
        <Entrada name="documento" inputMode="numeric" />
      </Campo>
      <Campo rotulo="Chave Pix (opcional)">
        <Entrada name="chave_pix" />
      </Campo>
      <Caixa name="aceite" required>
        Li e aceito os{" "}
        <Link href={`/termos/parceiros?versao=${versaoTermos}`} target="_blank" className="font-semibold text-marca underline">
          termos do programa de parceiros
        </Link>{" "}
        e a <Link href="/privacidade" target="_blank" className="font-semibold text-marca underline">política de privacidade</Link>.
      </Caixa>
      {e.aceite ? <p className="text-sm text-red-600">{e.aceite}</p> : null}
      {estado.mensagem ? <Aviso tipo="erro">{estado.mensagem}</Aviso> : null}
      <BotaoEnviar>Quero ser parceiro</BotaoEnviar>
    </form>
  );
}
