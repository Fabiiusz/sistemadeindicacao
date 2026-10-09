import { contextoEquipe, podeGerir } from "@/lib/auth";
import { hexParaRgb } from "@/components/Marca";
import { NavPainel } from "@/components/NavPainel";

export const metadata = { title: "Painel — PortaCheia" };

export default async function LayoutPainel({ children }: { children: React.ReactNode }) {
  const { supabase, espaco, papel, user } = await contextoEquipe();
  const { count } = await supabase
    .from("alertas")
    .select("*", { count: "exact", head: true })
    .eq("espaco_id", espaco.id)
    .is("resolvido_em", null)
    .contains("para_papeis", [papel]);

  return (
    <div style={{ ["--cor-marca" as string]: hexParaRgb(espaco.cor_primaria) }} className="min-h-screen pb-12">
      <header className="sticky top-0 z-10 bg-marca text-white shadow">
        <div className="flex items-center justify-between px-4 py-3">
          <div>
            <p className="font-semibold">{espaco.nome}</p>
            <p className="text-xs opacity-80">
              {user.email} · {papel}
            </p>
          </div>
          <form action="/auth/sair" method="post">
            <button className="rounded-lg bg-white/20 px-3 py-2 text-sm">Sair</button>
          </form>
        </div>
        <NavPainel gestao={podeGerir(papel)} alertas={count ?? 0} />
      </header>
      <div className="mx-auto max-w-6xl px-3 py-5 sm:px-6">{children}</div>
    </div>
  );
}
