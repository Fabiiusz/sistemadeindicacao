"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const ITENS = [
  { href: "/painel/indicacoes", rotulo: "Indicações" },
  { href: "/painel/parceiros", rotulo: "Parceiros" },
  { href: "/painel/recompensas", rotulo: "Recompensas", gestao: true },
  { href: "/painel/fila", rotulo: "Fila de envios" },
  { href: "/painel/alertas", rotulo: "Alertas" },
  { href: "/painel/leads", rotulo: "Leads" },
  { href: "/painel/festas", rotulo: "Festas" },
  { href: "/painel/regras", rotulo: "Regras", gestao: true },
  { href: "/painel/lgpd", rotulo: "LGPD", gestao: true },
];

export function NavPainel({ gestao, alertas }: { gestao: boolean; alertas: number }) {
  const rota = usePathname();
  return (
    <nav className="flex gap-1 overflow-x-auto px-2 pb-2 sm:px-4">
      {ITENS.filter((i) => gestao || !i.gestao).map((i) => {
        const ativo = rota.startsWith(i.href);
        return (
          <Link
            key={i.href}
            href={i.href}
            className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium ${
              ativo ? "bg-white text-marca" : "text-white/90 hover:bg-white/10"
            }`}
          >
            {i.rotulo}
            {i.href === "/painel/alertas" && alertas > 0 ? (
              <span className="ml-1 rounded-full bg-red-500 px-1.5 text-xs text-white">{alertas}</span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
