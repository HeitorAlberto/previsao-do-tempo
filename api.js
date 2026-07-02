import { ufFromCode } from './utils.js';

// Configurações e constantes centralizadas
const CODIGOS_TROVOADA = Object.freeze([95, 96, 99]);
const HORAS_POR_DIA = 24;
const DIAS_PREVISAO = 10;

/**
 * Busca a lista local de cidades no JSON.
 */
export async function buscarCidadesJSON() {
  const res = await fetch("./cidades.json");
  if (!res.ok) throw new Error("Erro ao carregar cidades.json");
  return res.json();
}

/**
 * Busca a previsão do tempo baseada nas coordenadas da cidade.
 */
export async function fetchPrevisao({ latitude, longitude }) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}` +
              `&hourly=precipitation,temperature_2m,wind_gusts_10m,cloud_cover,precipitation_probability,weather_code` +
              `&timezone=America%2FSao_Paulo&forecast_days=${DIAS_PREVISAO}`;

  const res = await fetch(url);
  if (!res.ok) throw new Error("Erro ao buscar previsão da API");
  return res.json();
}

/**
 * Converte porcentagem de nebulosidade em tag de imagem HTML.
 */
function descricaoNuvens(percentual, hora = 12) {
  const noite = hora >= 18 || hora < 6;
  const prefixo = noite ? "noite-" : "";

  if (percentual <= 20) return `<img src="icones/${prefixo}poucas-nuvens.png">`;
  if (percentual <= 50) return `<img src="icones/${prefixo}nuvens-esparsas.png">`;
  if (percentual <= 80) return `<img src="icones/${prefixo}muitas-nuvens.png">`;
  return `<img src="icones/${prefixo}nublado.png">`;
}

/**
 * Calcula a soma de um array tratando valores nulos/undefined.
 */
const somarValores = (arr) => arr.reduce((acc, val) => acc + (val || 0), 0);

/**
 * Processa os dados brutos da Open-Meteo para a estrutura utilizada na UI.
 */
export function processarDadosPrevisao(data, city) {
  const uf = ufFromCode(city);
  const nomeChave = uf ? `${city.nome} - ${uf}` : city.nome;
  const { hourly } = data;

  const cidadeAtualObj = {
    cidade: nomeChave,
    forecast: []
  };

  for (let d = 0; d < DIAS_PREVISAO; d++) {
    const inicioDia = d * HORAS_POR_DIA;
    const fimDia = inicioDia + HORAS_POR_DIA;

    // Fatiando os dados uma única vez por dia para melhorar a performance
    const tempsDia = hourly.temperature_2m.slice(inicioDia, fimDia);
    const chuvaDia = hourly.precipitation.slice(inicioDia, fimDia);
    const windDia = hourly.wind_gusts_10m.slice(inicioDia, fimDia);
    const cloudDia = hourly.cloud_cover.slice(inicioDia, fimDia);
    const probDia = hourly.precipitation_probability.slice(inicioDia, fimDia);
    const codeDia = hourly.weather_code.slice(inicioDia, fimDia);
    const tempoDia = hourly.time.slice(inicioDia, fimDia);

    const maxProb = Math.max(...probDia.filter(v => v != null), 0);
    const chuvaTotalGeral = somarValores(chuvaDia);

    // Função interna reaproveitável para mapear os 4 períodos do dia
    const processarPeriodo = (inicio, fim) => {
      const cPeriodo = cloudDia.slice(inicio, fim);
      const rPeriodo = chuvaDia.slice(inicio, fim);
      const codePeriodo = codeDia.slice(inicio, fim);

      const medNuvens = somarValores(cPeriodo) / cPeriodo.length;
      const somChuva = somarValores(rPeriodo);
      const temTrovoada = codePeriodo.some(c => CODIGOS_TROVOADA.includes(c));

      // Passa a hora média aproximada do período para definir ícone de dia/noite corretamente
      const horaMediaPeriodo = inicio + (fim - inicio) / 2;

      return {
        nuvens_pct: Math.round(medNuvens),
        nuvens_desc: descricaoNuvens(medNuvens, horaMediaPeriodo),
        chuva: Number(somChuva.toFixed(1)),
        trovoadas: temTrovoada ? "trovoadas" : ""
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
        trovoadas: codeDia.map(c => CODIGOS_TROVOADA.includes(c))
      },

      p1: processarPeriodo(0, 6),   // Madrugada
      p2: processarPeriodo(6, 12),  // Manhã
      p3: processarPeriodo(12, 18), // Tarde
      p4: processarPeriodo(18, 24)  // Noite
    });
  }

  return cidadeAtualObj;
}