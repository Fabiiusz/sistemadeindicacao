import { NextResponse, type NextRequest } from "next/server";
import { supabaseServico } from "@/lib/supabase/server";
import { env } from "@/lib/env";

/**
 * Cron diário (vercel.json): gera o lote pós-festa de todos os espaços.
 * Protegido por Authorization: Bearer CRON_SECRET.
 */
export async function GET(request: NextRequest) {
  const segredo = env.cronSecret();
  if (!segredo || request.headers.get("authorization") !== `Bearer ${segredo}`) {
    return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  }
  const servico = supabaseServico();
  const { data: espacos, error } = await servico.from("espacos").select("id, slug");
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });

  const resultado: Record<string, number | string> = {};
  for (const e of espacos ?? []) {
    const { data, error: erro } = await servico.rpc("gerar_lote_pos_festa", { p_espaco_id: e.id, p_base_url: env.appUrl() });
    resultado[e.slug] = erro ? `erro: ${erro.message}` : Number(data ?? 0);
  }
  return NextResponse.json({ ok: true, resultado });
}
