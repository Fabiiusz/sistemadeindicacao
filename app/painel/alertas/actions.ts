"use server";
import { revalidatePath } from "next/cache";
import { contextoEquipe } from "@/lib/auth";

export async function resolverAlerta(form: FormData) {
  const { supabase, user } = await contextoEquipe();
  await supabase
    .from("alertas")
    .update({ resolvido_em: new Date().toISOString(), resolvido_por: user.id })
    .eq("id", String(form.get("id")));
  revalidatePath("/painel", "layout");
}
