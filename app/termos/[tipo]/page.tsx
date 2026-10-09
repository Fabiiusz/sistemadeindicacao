import { notFound } from "next/navigation";
import { TERMOS, termoPorVersao } from "@/lib/indicacoes/termos";
import { TextoTermo } from "@/components/Termo";

export default async function PaginaTermos({
  params,
  searchParams,
}: {
  params: Promise<{ tipo: string }>;
  searchParams: Promise<{ versao?: string }>;
}) {
  const { tipo } = await params;
  const { versao } = await searchParams;
  if (tipo !== "parceiros" && tipo !== "clientes") notFound();
  const termo = termoPorVersao(tipo, versao);
  if (!termo) notFound();
  return <TextoTermo termo={termo} versoes={TERMOS[tipo]} base={`/termos/${tipo}`} />;
}
