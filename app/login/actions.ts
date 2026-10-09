"use server";
import { z } from "zod";
import { supabaseServidor } from "@/lib/supabase/server";
import { env } from "@/lib/env";

export type EstadoLogin = { ok: boolean; mensagem: string };

export async function enviarLinkMagico(_: EstadoLogin, form: FormData): Promise<EstadoLogin> {
  const email = z.string().trim().toLowerCase().email().safeParse(form.get("email"));
  if (!email.success) return { ok: false, mensagem: "Digite um e-mail válido." };
  const voltar = String(form.get("voltar") ?? "");
  const destino = voltar.startsWith("/") && !voltar.startsWith("//") ? voltar : "/painel";

  const supabase = await supabaseServidor();
  const { error } = await supabase.auth.signInWithOtp({
    email: email.data,
    options: { emailRedirectTo: `${env.appUrl()}/auth/callback?voltar=${encodeURIComponent(destino)}` },
  });
  if (error) return { ok: false, mensagem: "Não foi possível enviar o link agora. Tente novamente em instantes." };
  return { ok: true, mensagem: "Pronto! Abra seu e-mail e toque no link para entrar." };
}
