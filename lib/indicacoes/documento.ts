/** Valida CPF (11 dígitos) ou CNPJ (14 dígitos) pelos dígitos verificadores. */
export function validarDocumento(entrada: string | null | undefined): boolean {
  const d = (entrada ?? "").replace(/\D/g, "");
  if (d.length === 11) return validarCpf(d);
  if (d.length === 14) return validarCnpj(d);
  return false;
}

export function somenteDigitos(entrada: string | null | undefined): string {
  return (entrada ?? "").replace(/\D/g, "");
}

function validarCpf(cpf: string): boolean {
  if (/^(\d)\1{10}$/.test(cpf)) return false;
  const calc = (len: number) => {
    let soma = 0;
    for (let i = 0; i < len; i++) soma += Number(cpf[i]) * (len + 1 - i);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  return calc(9) === Number(cpf[9]) && calc(10) === Number(cpf[10]);
}

function validarCnpj(cnpj: string): boolean {
  if (/^(\d)\1{13}$/.test(cnpj)) return false;
  const calc = (len: number) => {
    const pesos = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const soma = pesos.reduce((acc, p, i) => acc + Number(cnpj[i]) * p, 0);
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  return calc(12) === Number(cnpj[12]) && calc(13) === Number(cnpj[13]);
}
