import Link from "next/link";
import { PaginaMarca } from "@/components/Marca";
import { Cartao, EstadoVazio } from "@/components/ui";
import { FormIndicado } from "@/components/indicacao/FormIndicado";
import { clienteIndicadorPorCodigo, descreverBeneficioIndicado, regraPublica } from "@/lib/indicacoes/publico";
import { textoConsentimentoIndicado } from "@/lib/indicacoes/termos";
import { primeiroNome } from "@/lib/indicacoes/nomes";

export const metadata = { title: "Um amigo indicou você!", robots: { index: false } };

export default async function PaginaAmigoIndicado({ params }: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await params;
  const dados = await clienteIndicadorPorCodigo(codigo);
  if (!dados) {
    return (
      <main className="mx-auto max-w-md p-6">
        <EstadoVazio titulo="Link indisponível">Este link de indicação não existe mais. Fale diretamente com o espaço.</EstadoVazio>
      </main>
    );
  }
  const { cliente, espaco } = dados;
  const regra = await regraPublica(espaco.id, "cliente");
  const beneficio = descreverBeneficioIndicado(regra);
  const amigo = primeiroNome(cliente.nome);

  return (
    <PaginaMarca espaco={espaco}>
      <div>
        <h1 className="text-2xl font-bold">{amigo} fez a festa aqui e indicou você! 🎈</h1>
        <p className="mt-2 text-gray-600">Deixe seu contato e a equipe do {espaco.nome} fala com você.</p>
      </div>
      {beneficio ? (
        <div className="rounded-2xl border-2 border-marca bg-marca/10 p-5 text-center">
          <p className="text-sm text-gray-600">Presente para você</p>
          <p className="text-2xl font-bold text-marca">{beneficio}</p>
          <p className="mt-1 text-xs text-gray-500">
            Válido ao fechar sua festa. <Link href="/termos/clientes" className="underline">Regulamento</Link>
          </p>
        </div>
      ) : null}
      <Cartao>
        <FormIndicado
          codigo={cliente.codigo}
          tipoLink="cliente"
          compacto
          textoConsentimento={textoConsentimentoIndicado(cliente.nome, espaco.nome)}
        />
      </Cartao>
    </PaginaMarca>
  );
}
