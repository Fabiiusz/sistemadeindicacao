import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

const base =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-5 py-3 text-base font-semibold transition disabled:opacity-60";
const variantes = {
  primario: "bg-marca text-white hover:brightness-110",
  secundario: "border border-gray-300 bg-white text-gray-900 hover:bg-gray-50",
  perigo: "bg-red-600 text-white hover:bg-red-700",
  sucesso: "bg-emerald-600 text-white hover:bg-emerald-700",
  whatsapp: "bg-[#25D366] text-white hover:brightness-105",
} as const;
type Variante = keyof typeof variantes;

export function Botao({ variante = "primario", className = "", ...props }: ComponentProps<"button"> & { variante?: Variante }) {
  return <button className={`${base} ${variantes[variante]} ${className}`} {...props} />;
}

export function BotaoLink({
  variante = "primario",
  className = "",
  ...props
}: ComponentProps<typeof Link> & { variante?: Variante }) {
  return <Link className={`${base} ${variantes[variante]} ${className}`} {...props} />;
}

export function LinkExterno({ variante = "primario", className = "", ...props }: ComponentProps<"a"> & { variante?: Variante }) {
  return <a target="_blank" rel="noopener noreferrer" className={`${base} ${variantes[variante]} ${className}`} {...props} />;
}

export function Cartao({ children, className = "", titulo }: { children: ReactNode; className?: string; titulo?: ReactNode }) {
  return (
    <section className={`rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5 ${className}`}>
      {titulo ? <h2 className="mb-3 text-lg font-semibold">{titulo}</h2> : null}
      {children}
    </section>
  );
}

export function Campo({
  rotulo,
  ajuda,
  erro,
  children,
}: {
  rotulo: string;
  ajuda?: ReactNode;
  erro?: string;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="font-medium text-gray-800">{rotulo}</span>
      {children}
      {ajuda ? <span className="text-sm text-gray-500">{ajuda}</span> : null}
      {erro ? <span className="text-sm text-red-600">{erro}</span> : null}
    </label>
  );
}

const estiloInput =
  "w-full rounded-xl border border-gray-300 bg-white px-4 py-3 outline-none focus:border-marca focus:ring-2 focus:ring-marca/30";

export function Entrada(props: ComponentProps<"input">) {
  return <input {...props} className={`${estiloInput} ${props.className ?? ""}`} />;
}

export function Selecao(props: ComponentProps<"select">) {
  return <select {...props} className={`${estiloInput} ${props.className ?? ""}`} />;
}

export function AreaTexto(props: ComponentProps<"textarea">) {
  return <textarea rows={3} {...props} className={`${estiloInput} ${props.className ?? ""}`} />;
}

export function Caixa({ children, ...props }: Omit<ComponentProps<"input">, "type"> & { children: ReactNode }) {
  return (
    <label className="flex items-start gap-3 rounded-xl border border-gray-200 bg-gray-50 p-3">
      <input type="checkbox" className="mt-1 h-5 w-5 shrink-0 accent-[rgb(var(--cor-marca))]" {...props} />
      <span className="text-sm text-gray-700">{children}</span>
    </label>
  );
}

export function Selo({ children, className = "bg-gray-100 text-gray-700" }: { children: ReactNode; className?: string }) {
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${className}`}>{children}</span>;
}

export function EstadoVazio({ titulo, children, acao }: { titulo: string; children?: ReactNode; acao?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-gray-200 bg-white p-8 text-center">
      <p className="text-lg font-semibold text-gray-800">{titulo}</p>
      {children ? <div className="max-w-sm text-gray-600">{children}</div> : null}
      {acao}
    </div>
  );
}

export function Aviso({ tipo = "info", children }: { tipo?: "info" | "erro" | "sucesso" | "alerta"; children: ReactNode }) {
  const cores = {
    info: "border-sky-200 bg-sky-50 text-sky-900",
    erro: "border-red-200 bg-red-50 text-red-900",
    sucesso: "border-emerald-200 bg-emerald-50 text-emerald-900",
    alerta: "border-amber-200 bg-amber-50 text-amber-900",
  };
  return <div className={`rounded-xl border p-3 text-sm ${cores[tipo]}`}>{children}</div>;
}

export function Metrica({ rotulo, valor, detalhe }: { rotulo: string; valor: ReactNode; detalhe?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4">
      <p className="text-sm text-gray-500">{rotulo}</p>
      <p className="mt-1 text-2xl font-bold">{valor}</p>
      {detalhe ? <p className="mt-1 text-xs text-gray-500">{detalhe}</p> : null}
    </div>
  );
}
