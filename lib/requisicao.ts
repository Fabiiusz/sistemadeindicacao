import "server-only";
import { createHash } from "crypto";
import { headers } from "next/headers";
import { env } from "@/lib/env";

/** IP real do visitante (atrás de proxy/Vercel) e hash com sal para rate limit. */
export async function dadosRequisicao() {
  const h = await headers();
  const ip = (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "").trim() || null;
  const userAgent = h.get("user-agent");
  const ipHash = ip ? createHash("sha256").update(`${env.ipHashSalt()}:${ip}`).digest("hex").slice(0, 32) : null;
  return { ip, ipHash, userAgent };
}
