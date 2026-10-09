import { PaginaMarca } from "@/components/Marca";
import { Cartao, EstadoVazio } from "@/components/ui";
import { FormIndicado } from "@/components/indicacao/FormIndicado";
import { descreverBeneficioIndicado, parceiroPorCodigo, regraPublica } from "@/lib/indicacoes/publico";
import { nomeExibicaoParceiro, textoConsentimentoIndicado } from "@/lib/indicacoes/termos";
import { primeiroNome } from "@/lib/indicacoes/nomes";

export const metadata = { title: "Você foi indicado!", robots: { index: false } };

export default async function PaginaIndicacaoParceiro({ params }: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await params;
  const dados = await parceiroPorCodigo(codigo);
  if (!dados || dados.parceiro.status !== "ativo") {
    return (
      <main className="mx-auto max-w-md p-6">
        <EstadoVazio titulo="Link indisponível">Este link de indicação não está ativo. Fale diretamente com o espaço.</EstadoVazio>
      </main>
    );
  }
  const { parceiro, espaco } = dados;
  const regra = await regraPublica(espaco.id, "parceiro", parceiro.id);
  const beneficio = descreverBeneficioIndicado(regra);
  const nomeIndicador = nomeExibicaoParceiro(parceiro);

  return (
    <PaginaMarca espaco={espaco}>
      <div>
        <h1 className="text-2xl font-bold">{primeiroNome(parceiro.nome)} indicou você! 🎈</h1>
        <p className="mt-2 text-gray-600">Deixe seu contato e a equipe do {espaco.nome} fala com você para planejar seu evento.</p>
      </div>
      {beneficio ? (
        <div className="rounded-2xl bg-marca/10 p-4 text-center">
          <p className="text-sm text-gray-600">Por vir indicado, você ganha</p>
          <p className="text-xl font-bold text-marca">{beneficio}</p>
        </div>
      ) : null}
      <Cartao>
        <FormIndicado
          codigo={parceiro.codigo_indicacao}
          tipoLink="parceiro"
          textoConsentimento={textoConsentimentoIndicado(nomeIndicador, espaco.nome)}
        />
      </Cartao>
    </PaginaMarca>
  );
}
