import { notFound } from "next/navigation";
import { PaginaMarca } from "@/components/Marca";
import { Cartao } from "@/components/ui";
import { env } from "@/lib/env";
import { espacoPorSlug } from "@/lib/indicacoes/publico";
import { FormExclusao } from "./Form";

export const metadata = { title: "Seus dados e contatos" };

export default async function Exclusao({ searchParams }: { searchParams: Promise<{ espaco?: string }> }) {
  const { espaco: slug = env.espacoPadrao() } = await searchParams;
  const espaco = await espacoPorSlug(slug);
  if (!espaco) notFound();
  return (
    <PaginaMarca espaco={espaco}>
      <h1 className="text-2xl font-bold">Seus dados e contatos</h1>
      <p className="text-gray-600">
        Se você foi indicado e não quer mais receber mensagens, ou quer que apaguemos seus dados, é só pedir aqui.
        O bloqueio de mensagens vale na hora.
      </p>
      <Cartao>
        <FormExclusao espaco={espaco.slug} />
      </Cartao>
    </PaginaMarca>
  );
}
