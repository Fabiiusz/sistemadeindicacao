import { NextResponse, type NextRequest } from "next/server";
import { contextoEquipe } from "@/lib/auth";
import { buscarRecompensas } from "@/lib/painel/recompensas";
import { gerarCsv } from "@/lib/painel/csv";

export async function GET(request: NextRequest) {
  const { supabase, espaco } = await contextoEquipe(["dono", "gerente"]);
  const sp = request.nextUrl.searchParams;
  const status = sp.get("status") === "paga" ? "paga" : "aprovada";
  const linhas = await buscarRecompensas(supabase, espaco.id, {
    status,
    de: sp.get("de") ?? undefined,
    ate: sp.get("ate") ?? undefined,
  });
  return new NextResponse(gerarCsv(linhas), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="recompensas-${status}-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
