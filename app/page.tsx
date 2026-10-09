import Link from "next/link";

export default function Inicio() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 p-6">
      <h1 className="text-3xl font-bold">PortaCheia</h1>
      <p className="text-gray-600">Indicação como processo, não como sorte.</p>
      <div className="flex flex-col gap-3">
        <Link href="/painel" className="rounded-xl bg-marca px-5 py-4 text-center text-lg font-semibold text-white">
          Entrar no painel do espaço
        </Link>
        <Link href="/parceiro" className="rounded-xl border border-gray-300 bg-white px-5 py-4 text-center text-lg font-semibold">
          Sou parceiro indicador
        </Link>
        <Link href="/parceiros/cadastro" className="text-center text-marca underline">
          Quero ser parceiro
        </Link>
      </div>
    </main>
  );
}
