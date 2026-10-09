"use client";
import { useState } from "react";

/** Bloco de texto com botão "Copiar". */
export function Copiar({ texto, rotulo = "Copiar" }: { texto: string; rotulo?: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <div className="flex flex-col gap-2">
      <pre className="whitespace-pre-wrap break-words rounded-xl bg-gray-100 p-3 font-sans text-sm text-gray-800">{texto}</pre>
      <button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(texto);
            setCopiado(true);
            setTimeout(() => setCopiado(false), 2000);
          } catch {
            setCopiado(false);
          }
        }}
        className="min-h-11 rounded-xl border border-gray-300 bg-white px-4 py-2 font-semibold"
      >
        {copiado ? "Copiado! ✓" : rotulo}
      </button>
    </div>
  );
}
