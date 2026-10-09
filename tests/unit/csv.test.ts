import { describe, expect, it } from "vitest";
import { gerarCsv, type LinhaRecompensa } from "@/lib/painel/csv";

describe("CSV do financeiro", () => {
  it("usa ; com BOM, vírgula decimal e escapa aspas", () => {
    const linha: LinhaRecompensa = {
      id: "1",
      beneficiario: "parceiro",
      tipo: "percentual",
      descricao: 'Comissão "especial"; 5%',
      valor: 1234.5,
      status: "aprovada",
      aprovada_em: "2026-10-01T10:00:00Z",
      paga_em: null,
      forma_pagamento: null,
      comprovante_url: null,
      indicacao_id: "i",
      parceiros: { id: "p", nome: "Carla", chave_pix: "carla@pix", documento: "52998224725", telefone: "+5511" },
      indicadores_clientes: null,
      indicacoes: { nome_indicado: "Ana Lima", valor_fechado: 24690 },
    };
    const csv = gerarCsv([linha]);
    expect(csv.startsWith("﻿beneficiario;")).toBe(true);
    const [, dados] = csv.split("\r\n");
    expect(dados).toBe('Carla;parceiro;52998224725;carla@pix;Ana Lima;"Comissão ""especial""; 5%";1234,50;aprovada;2026-10-01;;;');
  });
});
