/**
 * Converte data do padrão ISO (AAAA-MM-DD) para o padrão brasileiro (DD/MM/AAAA)
 */
export function formatarData(dataISO) {
  if (!dataISO) return "";
  const [ano, mes, dia] = dataISO.split("-");
  return `${dia}/${mes}/${ano}`;
}

/**
 * Retorna o dia da semana abreviado com base na data ISO (AAAA-MM-DD)
 */
export function obterDiaSemana(dataISO) {
  if (!dataISO) return "";
  const dias = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  const [ano, mes, dia] = dataISO.split("-");
  
  // O uso de T00:00:00 garante que o fuso horário local não desloque a data real
  const d = new Date(`${ano}-${mes}-${dia}T00:00:00`);
  return dias[d.getDay()];
}

/**
 * Remove acentos, caracteres especiais e normaliza o texto para buscas.
 */
export function normalizarTexto(texto) {
  return (texto || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split("-")[0]
    .trim();
}