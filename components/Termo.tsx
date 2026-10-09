import Link from "next/link";
import type { Termo } from "@/lib/indicacoes/termos";
import { formatarData } from "@/lib/indicacoes/status";

export function TextoTermo({ termo, versoes, base }: { termo: Termo; versoes: Termo[]; base: string }) {
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-8">
      <h1 className="text-2xl font-bold">{termo.titulo}</h1>
      <p className="text-sm text-gray-500">
        Versão {termo.versao} · vigente desde {formatarData(termo.vigenteDesde)}
      </p>
      {termo.secoes.map((s) => (
        <section key={s.titulo}>
          <h2 className="font-semibold">{s.titulo}</h2>
          <p className="mt-1 text-gray-700">{s.texto}</p>
        </section>
      ))}
      {versoes.length > 1 ? (
        <p className="text-sm text-gray-500">
          Versões anteriores:{" "}
          {versoes.slice(1).map((v) => (
            <Link key={v.versao} href={`${base}?versao=${v.versao}`} className="mr-2 underline">
              {v.versao}
            </Link>
          ))}
        </p>
      ) : null}
    </main>
  );
}
