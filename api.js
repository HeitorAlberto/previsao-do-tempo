import { ufFromCode } from './utils.js';

// Configurações e constantes centralizadas
const CODIGOS_TROVOADA = Object.freeze([95, 96, 99]);
const HORAS_POR_DIA = 24;
const DIAS_PREVISAO = 10;

/**
 * Busca cidades no mundo todo usando a Geocoding API da Open-Meteo.
 */
export async function buscarCidadesAPI(termo) {
  if (!termo) return [];

  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(termo)}&count=6&language=pt`;

  try {
    const resposta = await fetch(url);
    const dados = await resposta.json();

    if (!dados.results) return [];

    return dados.results.map(cidade => ({
      id: cidade.id,
      nome: cidade.name,
      pais: cidade.country_code ? cidade.country_code.toUpperCase() : "",
      regiao: cidade.admin1 || "",
      latitude: cidade.latitude,
      longitude: cidade.longitude
    }));
  } catch (erro) {
    console.error("Erro ao buscar cidades na Geocoding API:", erro);
    return [];
  }
}

/**
 * Busca a previsão do tempo baseada nas coordenadas da cidade.
 */
export async function fetchPrevisao({ latitude, longitude }) {
  if (!latitude || !longitude) {
    throw new Error("Coordenadas de latitude ou longitude inválidas ou ausentes.");
  }

  const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}` +
              `&hourly=precipitation,temperature_2m,wind_gusts_10m,cloud_cover,precipitation_probability,weather_code` +
              `&timezone=auto&forecast_days=${DIAS_PREVISAO}`;

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
  let nomeChave = city.nome;
  
  if (uf) {
    nomeChave = `${city.nome} - ${uf}`;
  } else if (city.pais) {
    nomeChave = city.regiao ? `${city.nome}, ${city.regiao} - ${city.pais}` : `${city.nome} - ${city.pais}`;
  }

  const { hourly } = data;

  const cidadeAtualObj = {
    cidade: nomeChave,
    _cidadeBruta: city, // CRÍTICO: Guarda o objeto original com latitude e longitude para o histórico
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
      const horaMediaPeriodo = inicio + (fim - inicio) / 2;

      return {
        nuvens_pct: Math.round(medNuvens),
        nuvens_desc: descricaoNuvens(medNuvens, horaMediaPeriodo),
        chuva: Number(somChuva.toFixed(1)),
        probabilidade: Math.round(maxProbPeriodo),
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