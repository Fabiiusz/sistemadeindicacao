import { notFound } from "next/navigation";
import { TERMOS, termoPorVersao } from "@/lib/indicacoes/termos";
import { TextoTermo } from "@/components/Termo";

export const metadata = { title: "Política de privacidade" };

export default async function Privacidade({ searchParams }: { searchParams: Promise<{ versao?: string }> }) {
  const { versao } = await searchParams;
  const termo = termoPorVersao("privacidade", versao);
  if (!termo) notFound();
  return <TextoTermo termo={termo} versoes={TERMOS.privacidade} base="/privacidade" />;
}
