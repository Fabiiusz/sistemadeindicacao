/**
 * Termos versionados (código como fonte da verdade). Ao alterar um texto,
 * NÃO edite a versão publicada: adicione uma nova no topo da lista. O aceite
 * registra a versão (parceiros.versao_termos) e as versões antigas continuam
 * acessíveis em /termos/[tipo]?versao=...
 * RASCUNHO: validar com advogado (ver docs/indicacoes.md).
 */
export type Termo = { versao: string; vigenteDesde: string; titulo: string; secoes: { titulo: string; texto: string }[] };

export const TERMOS: Record<"parceiros" | "clientes" | "privacidade", Termo[]> = {
  parceiros: [
    {
      versao: "parceiros-v1",
      vigenteDesde: "2026-10-09",
      titulo: "Termos do Programa de Parceiros Indicadores",
      secoes: [
        { titulo: "1. O programa", texto: "Profissionais e empresas do setor de eventos (cerimonialistas, assessores, fotógrafos, decoradores, buffets, DJs, escolas e comissões de formatura) podem indicar clientes ao espaço e receber comissão quando a indicação gerar um contrato, conforme a regra vigente na data da indicação." },
        { titulo: "2. Cadastro e aprovação", texto: "O cadastro é gratuito e passa por aprovação do espaço. O espaço pode pausar ou encerrar a participação a qualquer momento, com aviso e motivo registrado, sem prejuízo das comissões já aprovadas." },
        { titulo: "3. Como a indicação vale", texto: "Vale a primeira indicação válida do mesmo telefone dentro do prazo de atribuição informado no seu painel (ex.: 90 dias). Não vale indicação de quem já era cliente ou já estava em negociação com o espaço, nem indicação de si mesmo, de sócios ou do próprio documento." },
        { titulo: "4. Consentimento do indicado", texto: "Você só deve indicar pessoas que autorizaram ser contatadas pelo espaço. Pelo seu link, o próprio cliente preenche e autoriza. Pelo painel, você declara que obteve essa autorização. Indicações sem autorização serão invalidadas." },
        { titulo: "5. Comissão", texto: "O valor, a base de cálculo e a condição de pagamento (por exemplo, após o sinal pago ou após o evento realizado) aparecem no painel. A comissão fica 'prevista' até a condição ser atendida, passa a 'aprovada' e é paga manualmente pelo espaço via Pix ou transferência, em até 30 dias após a aprovação. Mudanças na regra não alteram indicações já feitas." },
        { titulo: "6. Tributos e documentos", texto: "Cada parceiro é responsável pelos tributos sobre o que receber. O espaço pode solicitar nota fiscal (pessoa jurídica) ou recibo/RPA (pessoa física) antes do pagamento, conforme a legislação aplicável." },
        { titulo: "7. Privacidade", texto: "Você verá apenas o primeiro nome e a inicial do sobrenome dos indicados, nunca o telefone. Os dados dos indicados não são compartilhados com outros parceiros. Seus dados (nome, contato, documento e Pix) são usados só para operar o programa e pagar comissões." },
        { titulo: "8. Fraude", texto: "Indicações falsas, duplicadas de propósito, envios em massa ou qualquer tentativa de burlar as regras levam ao cancelamento das comissões envolvidas e ao bloqueio do parceiro." },
      ],
    },
  ],
  clientes: [
    {
      versao: "clientes-v1",
      vigenteDesde: "2026-10-09",
      titulo: "Regulamento: Indique um Amigo",
      secoes: [
        { titulo: "Quem participa", texto: "Clientes que já realizaram festa no espaço e receberam o link de indicação." },
        { titulo: "Como funciona", texto: "Compartilhe seu link. Seu amigo preenche o contato e ganha o benefício indicado na página. Quando ele fechar a festa, você ganha o seu benefício (crédito, desconto ou brinde), conforme as condições do programa." },
        { titulo: "Regras", texto: "Vale a primeira indicação do mesmo telefone dentro do prazo do programa. Não vale para quem já era cliente ou já estava conversando com o espaço, nem para si mesmo. Há um limite de indicações recompensadas por cliente, informado na página. Benefícios não são convertidos em dinheiro, salvo quando indicado." },
        { titulo: "Privacidade", texto: "O amigo indicado informa os próprios dados e autoriza o contato. Ele pode pedir a qualquer momento para não ser mais contatado." },
      ],
    },
  ],
  privacidade: [
    {
      versao: "privacidade-v1",
      vigenteDesde: "2026-10-09",
      titulo: "Política de Privacidade do Programa de Indicações",
      secoes: [
        { titulo: "Quais dados tratamos", texto: "Dos indicados: nome, WhatsApp, e-mail (opcional), tipo e data estimada do evento, número de convidados e mensagem. Dos indicadores: nome, contato, documento e chave Pix (parceiros). Também registramos data, IP e texto do consentimento." },
        { titulo: "Para quê", texto: "Entrar em contato sobre o evento solicitado, controlar a atribuição da indicação, pagar comissões e benefícios, prevenir fraudes e cumprir obrigações legais." },
        { titulo: "Base legal", texto: "Consentimento do indicado (formulário com autorização expressa) ou consentimento declarado pelo indicador; execução de contrato com parceiros; legítimo interesse para prevenção a fraudes; cumprimento de obrigação legal para registros fiscais." },
        { titulo: "Compartilhamento", texto: "Os dados dos indicados não são compartilhados com parceiros ou terceiros. O parceiro vê apenas o primeiro nome, a inicial do sobrenome e o andamento da indicação." },
        { titulo: "Retenção", texto: "Mantemos os dados enquanto houver negociação ou relação com o espaço e pelo prazo necessário a obrigações legais. Indicações sem andamento podem ser anonimizadas." },
        { titulo: "Seus direitos", texto: "Você pode pedir acesso, correção, exclusão ou deixar de receber contatos a qualquer momento pela página 'Não quero mais ser contatado'. Atendemos o pedido de bloqueio imediatamente e os demais em até 15 dias." },
      ],
    },
  ],
};

export function termoAtual(tipo: keyof typeof TERMOS): Termo {
  return TERMOS[tipo][0];
}

export function termoPorVersao(tipo: keyof typeof TERMOS, versao?: string | null): Termo | undefined {
  return versao ? TERMOS[tipo].find((t) => t.versao === versao) : termoAtual(tipo);
}

export function textoConsentimentoIndicado(nomeIndicador: string, nomeEspaco: string): string {
  return `Fui indicado por ${nomeIndicador} e autorizo o espaço ${nomeEspaco} a entrar em contato comigo.`;
}

export function nomeExibicaoParceiro(p: { nome: string; empresa: string | null }): string {
  return p.empresa ? `${p.nome} (${p.empresa})` : p.nome;
}
