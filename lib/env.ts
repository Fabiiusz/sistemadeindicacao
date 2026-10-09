function obrigatoria(nome: string, valor: string | undefined): string {
  if (!valor) throw new Error(`Variável de ambiente ausente: ${nome} (veja .env.example)`);
  return valor;
}

export const env = {
  supabaseUrl: () => obrigatoria("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL),
  supabaseAnonKey: () => obrigatoria("NEXT_PUBLIC_SUPABASE_ANON_KEY", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  serviceRoleKey: () => obrigatoria("SUPABASE_SERVICE_ROLE_KEY", process.env.SUPABASE_SERVICE_ROLE_KEY),
  appUrl: () => (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, ""),
  espacoPadrao: () => process.env.NEXT_PUBLIC_ESPACO_PADRAO ?? "porta-cheia-demo",
  cronSecret: () => process.env.CRON_SECRET ?? "",
  ipHashSalt: () => process.env.IP_HASH_SALT ?? "portacheia",
};
