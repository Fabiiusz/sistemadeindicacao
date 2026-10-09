import { notFound } from "next/navigation";
import { FormCadastro } from "./FormCadastro";
import { PaginaMarca } from "@/components/Marca";
import { Cartao } from "@/components/ui";
import { env } from "@/lib/env";
import { CONDICAO_TEXTO, descreverRecompensa, espacoPorSlug, regraPublica } from "@/lib/indicacoes/publico";
import { termoAtual } from "@/lib/indicacoes/termos";

export const metadata = { title: "Seja parceiro indicador" };

export default async function CadastroParceiro({ searchParams }: { searchParams: Promise<{ espaco?: string }> }) {
  const { espaco: slug = env.espacoPadrao() } = await searchParams;
  const espaco = await espacoPorSlug(slug);
  if (!espaco) notFound();
  const regra = await regraPublica(espaco.id, "parceiro");
  const recompensa = descreverRecompensa(regra);

  return (
    <PaginaMarca espaco={espaco}>
      <div>
        <h1 className="text-2xl font-bold">Indique clientes e ganhe comissão</h1>
        <p className="mt-2 text-gray-600">
          Programa para cerimonialistas, assessores, fotógrafos, decoradores, buffets, DJs, escolas e comissões de formatura.
        </p>
      </div>
      {recompensa ? (
        <Cartao>
          <p className="text-gray-700">
            Você ganha <strong>{recompensa}</strong>, {CONDICAO_TEXTO[regra!.condicao_pagamento]}. A indicação vale por{" "}
            {regra!.validade_dias_atribuicao} dias.
          </p>
        </Cartao>
      ) : null}
      <Cartao titulo="Seus dados">
        <FormCadastro espaco={espaco.slug} versaoTermos={termoAtual("parceiros").versao} />
      </Cartao>
    </PaginaMarca>
  );
}
