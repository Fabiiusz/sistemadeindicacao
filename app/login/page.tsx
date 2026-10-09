import { FormLogin } from "./FormLogin";
import { Aviso } from "@/components/ui";

export const metadata = { title: "Entrar — PortaCheia" };

export default async function Login({ searchParams }: { searchParams: Promise<{ voltar?: string; erro?: string }> }) {
  const { voltar = "/painel", erro } = await searchParams;
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">Entrar</h1>
        <p className="mt-1 text-gray-600">
          Sem senha: enviamos um link de acesso para o seu e-mail. Parceiros também podem receber o link pelo WhatsApp,
          pedindo ao espaço.
        </p>
      </div>
      {erro ? <Aviso tipo="erro">O link expirou ou já foi usado. Peça um novo abaixo.</Aviso> : null}
      <FormLogin voltar={voltar} />
    </main>
  );
}
