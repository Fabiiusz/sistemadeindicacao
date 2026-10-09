import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient as createJsClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { env } from "@/lib/env";

/** Cliente com a sessão do usuário (respeita RLS). */
export async function supabaseServidor() {
  const cookieStore = await cookies();
  return createServerClient(env.supabaseUrl(), env.supabaseAnonKey(), {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (lista) => {
        try {
          lista.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Chamado de Server Component: o middleware renova a sessão.
        }
      },
    },
  });
}

/**
 * Cliente service role. SÓ para fluxos públicos (formulários sem login),
 * que chamam funções SQL que validam tudo no banco. Nunca no cliente.
 */
export function supabaseServico() {
  return createJsClient(env.supabaseUrl(), env.serviceRoleKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
