import { NextResponse, type NextRequest } from "next/server";
import { supabaseServidor } from "@/lib/supabase/server";

/** Retorno do link mágico (PKCE ou token_hash). */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const voltar = url.searchParams.get("voltar") ?? "/painel";
  const destino = voltar.startsWith("/") && !voltar.startsWith("//") ? voltar : "/painel";
  const supabase = await supabaseServidor();

  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const tipo = (url.searchParams.get("type") ?? "magiclink") as "magiclink" | "email";

  const { error } = code
    ? await supabase.auth.exchangeCodeForSession(code)
    : tokenHash
      ? await supabase.auth.verifyOtp({ token_hash: tokenHash, type: tipo })
      : { error: new Error("sem código") };

  if (error) return NextResponse.redirect(new URL(`/login?erro=link&voltar=${encodeURIComponent(destino)}`, url.origin));
  return NextResponse.redirect(new URL(destino, url.origin));
}
