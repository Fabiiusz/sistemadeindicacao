import Link from "next/link";
import { redirect } from "next/navigation";
import { contextoParceiro } from "@/lib/auth";
import { Cartao } from "@/components/ui";
import { FormIndicarParceiro } from "../FormIndicarParceiro";

export const metadata = { title: "Indicar cliente" };

export default async function IndicarCliente() {
  const { parceiro } = await contextoParceiro();
  if (!parceiro || parceiro.status !== "ativo") redirect("/parceiro");
  return (
    <main className="mx-auto flex max-w-lg flex-col gap-4 px-4 py-6">
      <Link href="/parceiro" className="text-marca">← Voltar</Link>
      <h1 className="text-2xl font-bold">Indicar um cliente</h1>
      <Cartao>
        <FormIndicarParceiro />
      </Cartao>
    </main>
  );
}
