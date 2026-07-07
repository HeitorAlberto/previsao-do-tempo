// Configurações e constantes centralizadas
const CODIGOS_TROVOADA = Object.freeze([95, 96, 99]);
const HORAS_POR_DIA = 24;
const DIAS_PREVISAO = 10;

/**
 * Cria uma string de localização limpa e padronizada por vírgulas sem duplicações.
 * Exemplo de saída garantida: "Maceió, Alagoas, BR" ou "Paris, Île-de-France, FR"
 */
export function formatarLocalizacao(cidadeObj) {
  if (!cidadeObj) return "";
  
  // Pega a região (admin1) e o país diretamente do objeto
  const regiao = cidadeObj.admin1 || cidadeObj.regiao || "";
  const pais = cidadeObj.country_code?.toUpperCase() || cidadeObj.pais || "";

  const partes = [cidadeObj.name || cidadeObj.nome, regiao, pais];
  
  // O Set remove itens duplicados se houver conflito (ex: Região idêntica à cidade)
  return [...new Set(partes)].filter(Boolean).join(", ");
}

/**
 * Calcula a soma de um array tratando valores nulos/undefined.
 */
const somarValores = (arr) => arr.reduce((acc, val) => acc + (val || 0), 0);

/**
 * Converte porcentagem de nebulosidade em texto descritivo.
 */
export function obterDescricaoNuvens(percentual) {
  if (percentual <= 20) return `Poucas nuvens`;
  if (percentual <= 50) return `Nuvens esparsas`;
  if (percentual <= 80) return `Muitas nuvens`;
  return `Nublado`;
}

/**
 * Processa os dados brutos da Open-Meteo para a estrutura utilizada na UI.
 */
export function processarDadosPrevisao(data, city) {
  const nomeChave = formatarLocalizacao(city);
  const { hourly } = data;

  const cidadeAtualObj = {
    cidade: nomeChave,
    _cidadeBruta: city, // Guarda o objeto original para o histórico
    forecast: []
  };

  for (let d = 0; d < DIAS_PREVISAO; d++) {
    const inicioDia = d * HORAS_POR_DIA;
    const fimDia = inicioDia + HORAS_POR_DIA;

    const tempsDia = hourly.temperature_2m.slice(inicioDia, fimDia);
    const chuvaDia = hourly.precipitation.slice(inicioDia, fimDia);
    const windDia = hourly.wind_gusts_10m.slice(inicioDia, fimDia);
    const cloudDia = hourly.cloud_cover.slice(inicioDia, fimDia);
    const probDia = hourly.precipitation_probability.slice(inicioDia, fimDia);
    const codeDia = hourly.weather_code.slice(inicioDia, fimDia);
    const tempoDia = hourly.time.slice(inicioDia, fimDia);

    const maxProb = Math.max(...probDia.filter(v => v != null), 0);
    const chuvaTotalGeral = somarValores(chuvaDia);

    const processarPeriodo = (inicio, fim) => {
      const cPeriodo = cloudDia.slice(inicio, fim);
      const rPeriodo = chuvaDia.slice(inicio, fim);
      const codePeriodo = codeDia.slice(inicio, fim);
      const probPeriodo = probDia.slice(inicio, fim);

      const medNuvens = somarValores(cPeriodo) / cPeriodo.length;
      const somChuva = somarValores(rPeriodo);
      const temTrovoada = codePeriodo.some(c => CODIGOS_TROVOADA.includes(c));
      const maxProbPeriodo = Math.max(...probPeriodo.filter(v => v != null), 0);

      return {
        nuvens_pct: Math.round(medNuvens),
        chuva: Number(somChuva.toFixed(1)),
        probabilidade: Math.round(maxProbPeriodo),
        trovoadas: temTrovoada
      };
    };

    cidadeAtualObj.forecast.push({
      date: tempoDia[0].split("T")[0],
      temp_min_c: Math.min(...tempsDia),
      temp_max_c: Math.max(...tempsDia),
      wind_max_kmh: Math.max(...windDia),
      rain_sum_mm: Number(chuvaTotalGeral.toFixed(1)),
      rain_prob_max: Math.round(maxProb),

      dadosHorarios: {
        horas: tempoDia.map(t => t.split("T")[1]),
        temperaturas: tempsDia,
        chuvas: chuvaDia,
        probabilidades: probDia,
        nebulosidade: cloudDia,
        rajadas: windDia,
        trovoadas: codeDia.map(c => CODIGOS_TROVOADA.includes(c))
      },

      p1: processarPeriodo(0, 6),
      p2: processarPeriodo(6, 12),
      p3: processarPeriodo(12, 18),
      p4: processarPeriodo(18, 24)
    });
  }

  return cidadeAtualObj;
}