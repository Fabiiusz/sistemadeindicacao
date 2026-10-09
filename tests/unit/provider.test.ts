import { describe, expect, it } from "vitest";
import { obterProvider } from "@/lib/mensagens/provider";

describe("MessageProvider", () => {
  it("wa.me monta link com número e texto", async () => {
    const r = await obterProvider("whatsapp").preparar({
      id: "1", canal: "whatsapp", destino: "+5511987654321", destinatario_nome: null, mensagem: "Olá & tchau", tipo: "x",
    });
    expect(r).toEqual({ modo: "manual", url: "https://wa.me/5511987654321?text=Ol%C3%A1%20%26%20tchau" });
  });
  it("e-mail usa mailto", async () => {
    const r = await obterProvider("email").preparar({
      id: "1", canal: "email", destino: "a@b.com", destinatario_nome: null, mensagem: "oi", tipo: "x",
    });
    expect(r.modo).toBe("manual");
    expect(r.modo === "manual" && r.url.startsWith("mailto:a@b.com")).toBe(true);
  });
});
