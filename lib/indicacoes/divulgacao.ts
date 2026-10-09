/** Textos prontos de divulgação para parceiros e clientes. */
export function linkParceiro(appUrl: string, codigo: string) {
  return `${appUrl}/i/${codigo}`;
}

export function linkCliente(appUrl: string, codigo: string) {
  return `${appUrl}/v/${codigo}`;
}

export function textoWhatsAppParceiro(nomeEspaco: string, link: string, beneficio?: string | null) {
  return [
    `Oi! Para a sua festa, recomendo muito o ${nomeEspaco}. 🎉`,
    beneficio ? `Vindo pela minha indicação você ganha: ${beneficio}.` : null,
    `Deixe seu contato por aqui que a equipe fala com você: ${link}`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function textoInstagramParceiro(nomeEspaco: string, link: string, beneficio?: string | null) {
  return [
    `Procurando um lugar incrível para a sua festa? Eu indico o ${nomeEspaco}! ✨`,
    beneficio ? `Quem chega pela minha indicação ganha ${beneficio}.` : null,
    `Link na bio ou chama no direct que eu te passo: ${link}`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function textoWhatsAppCliente(nomeEspaco: string, link: string, beneficio?: string | null) {
  return [
    `Fiz minha festa no ${nomeEspaco} e amei! 🥳`,
    beneficio ? `Se você for fazer a sua, pela minha indicação você ganha ${beneficio}.` : null,
    `É só deixar seu contato aqui: ${link}`,
  ]
    .filter(Boolean)
    .join("\n");
}
