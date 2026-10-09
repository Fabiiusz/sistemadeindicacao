import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/** Renova a sessão do Supabase e protege /painel e /parceiro. */
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return response;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (lista) => {
        lista.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        lista.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const rota = request.nextUrl.pathname;
  const privada = rota.startsWith("/painel") || rota === "/parceiro" || rota.startsWith("/parceiro/");
  if (privada && !user) {
    const login = request.nextUrl.clone();
    login.pathname = "/login";
    login.searchParams.set("voltar", rota);
    return NextResponse.redirect(login);
  }
  return response;
}

export const config = {
  matcher: ["/painel/:path*", "/parceiro", "/parceiro/:path*", "/login", "/auth/:path*"],
};
