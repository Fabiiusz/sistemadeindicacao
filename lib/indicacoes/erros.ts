/** Traduz os códigos de erro lançados pelas funções SQL para pt-BR. */
const MENSAGENS: Record<string, string> = {
  telefone_invalido: "Confira o WhatsApp: use DDD + número (ex.: 11 98765-4321).",
  nome_obrigatorio: "Informe o nome.",
  consentimento_obrigatorio: "É preciso marcar a autorização de contato para continuar.",
  contato_bloqueado: "Este contato pediu para não receber mensagens do espaço, então não podemos registrar a indicação.",
  muitas_tentativas: "Muitos envios em pouco tempo. Aguarde alguns minutos e tente de novo.",
  parceiro_inativo: "Este link de indicação não está ativo no momento.",
  codigo_invalido: "Link de indicação inválido ou expirado.",
  indicador_obrigatorio: "Informe quem indicou.",
  indicador_nao_encontrado: "Indicador não encontrado.",
  espaco_nao_encontrado: "Espaço não encontrado.",
  origem_invalida: "Origem da indicação inválida.",
  sem_permissao: "Você não tem permissão para esta ação.",
  indicacao_nao_encontrada: "Indicação não encontrada.",
  status_nao_permite_fechar: "Esta indicação não pode ser fechada no status atual.",
  valor_obrigatorio: "Informe o valor fechado (maior que zero).",
  festa_nao_encontrada: "Festa não encontrada.",
  status_invalido: "Status inválido.",
  motivo_obrigatorio: "Informe o motivo.",
  evento_exige_fechamento: "Só é possível marcar 'evento realizado' depois de fechar.",
  status_nao_permite_voltar: "Indicação fechada não pode voltar para etapas anteriores.",
  regra_em_uso: "Esta regra já foi usada em indicações. Para mudar valores, desative-a e crie uma nova.",
  recompensa_nao_aprovada: "Só é possível pagar recompensas aprovadas.",
  recompensa_nao_encontrada: "Recompensa não encontrada.",
  parceiro_nao_encontrado: "Parceiro não encontrado.",
  parceiro_ja_cadastrado: "Já existe um parceiro com este WhatsApp neste espaço.",
  termos_obrigatorios: "É preciso aceitar os termos do programa.",
  token_invalido: "Link inválido ou expirado.",
  pesquisa_ja_respondida: "Esta pesquisa já foi respondida. Obrigado!",
  nota_invalida: "Escolha uma nota de 0 a 10.",
  justificativa_obrigatoria: "Informe a justificativa (mínimo 5 caracteres).",
};

export function mensagemErro(erro: unknown): string {
  const texto =
    typeof erro === "string"
      ? erro
      : erro && typeof erro === "object" && "message" in erro
        ? String((erro as { message: unknown }).message)
        : "";
  if (MENSAGENS[texto]) return MENSAGENS[texto];
  for (const [codigo, msg] of Object.entries(MENSAGENS)) {
    if (texto.includes(codigo)) return msg;
  }
  return "Algo deu errado. Tente novamente em instantes.";
}
