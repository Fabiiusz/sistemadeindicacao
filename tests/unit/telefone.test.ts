import { describe, expect, it } from "vitest";
import { normalizarTelefone, formatarTelefone, mascararTelefone, linkWhatsApp } from "@/lib/indicacoes/telefone";
import { mascararNome } from "@/lib/indicacoes/nomes";
import { validarDocumento } from "@/lib/indicacoes/documento";
import { mensagemErro } from "@/lib/indicacoes/erros";
import { statusSimples } from "@/lib/indicacoes/status";

describe("normalizarTelefone", () => {
  it.each([
    ["(11) 98765-4321", "+5511987654321"],
    ["11 3456-7890", "+551134567890"],
    ["011987654321", "+5511987654321"],
    ["5511987654321", "+5511987654321"],
    ["+55 11 98765-4321", "+5511987654321"],
    ["+1 415 555 2671", "+14155552671"],
  ])("%s -> %s", (entrada, esperado) => {
    expect(normalizarTelefone(entrada)).toBe(esperado);
  });

  it.each(["", "123", "abc", "+0123456789", null])("rejeita %s", (entrada) => {
    expect(normalizarTelefone(entrada)).toBeNull();
  });

  it("formata e mascara", () => {
    expect(formatarTelefone("+5511987654321")).toBe("(11) 98765-4321");
    expect(mascararTelefone("+5511987654321")).toBe("(11) 9****-**21");
    expect(linkWhatsApp("+5511987654321", "oi tudo")).toBe("https://wa.me/5511987654321?text=oi%20tudo");
  });
});

describe("mascararNome", () => {
  it("mostra primeiro nome e inicial do sobrenome", () => {
    expect(mascararNome("maria clara SOUZA")).toBe("Maria S.");
    expect(mascararNome("João")).toBe("João");
    expect(mascararNome("patrícia ÁVILA")).toBe("Patrícia Á.");
    expect(mascararNome("  ")).toBe("");
  });
});

describe("validarDocumento", () => {
  it("valida CPF e CNPJ", () => {
    expect(validarDocumento("529.982.247-25")).toBe(true);
    expect(validarDocumento("111.111.111-11")).toBe(false);
    expect(validarDocumento("11.222.333/0001-81")).toBe(true);
    expect(validarDocumento("11.222.333/0001-82")).toBe(false);
  });
});

describe("mensagens", () => {
  it("traduz códigos do banco", () => {
    expect(mensagemErro({ message: "contato_bloqueado" })).toMatch(/não receber/);
    expect(mensagemErro(new Error("qualquer"))).toMatch(/Algo deu errado/);
  });
  it("status simples para o parceiro", () => {
    expect(statusSimples("orcamento_enviado")).toBe("Em análise");
    expect(statusSimples("duplicada")).toBe("Não contabilizada");
  });
});
