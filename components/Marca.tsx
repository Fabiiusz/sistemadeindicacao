/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import type { ReactNode } from "react";

export type EspacoMarca = { nome: string; logo_url: string | null; cor_primaria: string | null };

/** Converte "#7c3aed" em "124 58 237" para a CSS var usada pelo Tailwind. */
export function hexParaRgb(hex: string | null | undefined): string {
  const m = (hex ?? "").trim().match(/^#?([0-9a-f]{6})$/i);
  if (!m) return "124 58 237";
  const n = parseInt(m[1], 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
}

/** Página pública leve, com a marca (logo e cor) do espaço. */
export function PaginaMarca({ espaco, children }: { espaco: EspacoMarca; children: ReactNode }) {
  return (
    <div style={{ ["--cor-marca" as string]: hexParaRgb(espaco.cor_primaria) }} className="min-h-screen">
      <header className="bg-marca px-4 py-5 text-white">
        <div className="mx-auto flex max-w-lg items-center gap-3">
          {espaco.logo_url ? (
            <img src={espaco.logo_url} alt={`Logo ${espaco.nome}`} className="h-12 w-12 rounded-full bg-white object-contain p-1" />
          ) : (
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/20 text-xl font-bold">
              {espaco.nome.charAt(0)}
            </div>
          )}
          <p className="text-lg font-semibold">{espaco.nome}</p>
        </div>
      </header>
      <main className="mx-auto flex max-w-lg flex-col gap-5 px-4 py-6">{children}</main>
      <footer className="mx-auto max-w-lg px-4 pb-8 text-center text-xs text-gray-500">
        <Link href="/privacidade" className="underline">Privacidade</Link> ·{" "}
        <Link href="/privacidade/exclusao" className="underline">Não quero mais ser contatado</Link>
      </footer>
    </div>
  );
}
