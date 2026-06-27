import { ufFromCode } from './utils.js';

export async function buscarCidadesJSON() {
  const resCidades = await fetch("./cidades.json");

  if (!resCidades.ok) {
    throw new Error("Erro cidades.json");
  }

  return await resCidades.json();
}

export async function fetchPrevisao(city) {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${city.latitude}` +
    `&longitude=${city.longitude}` +
    `&hourly=precipitation,temperature_2m,wind_gusts_10m,cloud_cover,precipitation_probability,weather_code` +
    `&timezone=America%2FSao_Paulo&forecast_days=10`;

  const res = await fetch(url);

  if (!res.ok) {
    throw new Error("Erro ao buscar previsão da API");
  }

  return await res.json();
}

// Converte porcentagem de nebulosidade em texto
function descricaoNuvens(percentual) {
  if (percentual <= 20) return "<img src='icones/poucas-nuvens.png'>";
  if (percentual <= 50) return "<img src='icones/nuvens-esparsas.png'>";
  if (percentual <= 80) return "<img src='icones/muitas-nuvens.png'>";

  return "<img src='icones/nublado.png'>";
}

export function processarDadosPrevisao(data, city) {
  const uf = ufFromCode(city);

  const nomeChave = uf
    ? `${city.nome} - ${uf}`
    : city.nome;

  const hourly = data.hourly;

  const cidadeAtualObj = {
    cidade: nomeChave,
    forecast: []
  };

  const codigosTrovonada = [95, 96, 99];

  for (let d = 0; d < 10; d++) {
    const i = d * 24;

    const tempsDia = hourly.temperature_2m.slice(i, i + 24);
    const chuvaDia = hourly.precipitation.slice(i, i + 24);
    const windDia = hourly.wind_gusts_10m.slice(i, i + 24);
    const cloudDia = hourly.cloud_cover.slice(i, i + 24);
    const probDia = hourly.precipitation_probability.slice(i, i + 24);
    const codeDia = hourly.weather_code.slice(i, i + 24);

    const maxProb = Math.max(
      ...probDia.filter(v => v != null),
      0
    );

    const chuvaTotalGeral =
      chuvaDia.reduce((a, b) => a + (b || 0), 0);

    const processarPeriodo = (inicio, fim) => {
      const cPeriodo = cloudDia.slice(inicio, fim);
      const rPeriodo = chuvaDia.slice(inicio, fim);
      const codePeriodo = codeDia.slice(inicio, fim);

      const medNuvens =
        cPeriodo.reduce((a, b) => a + (b || 0), 0) /
        cPeriodo.length;

      const somChuva =
        rPeriodo.reduce((a, b) => a + (b || 0), 0);

      const temTrovoada =
        codePeriodo.some(c =>
          codigosTrovonada.includes(c)
        );

      return {
        nuvens_pct: Math.round(medNuvens),
        nuvens_desc: descricaoNuvens(medNuvens),

        chuva: Number(somChuva.toFixed(1)),

        trovoadas: temTrovoada
          ? "trovoadas"
          : ""
      };
    };

    cidadeAtualObj.forecast.push({
      date: hourly.time[i].split("T")[0],

      temp_min_c: Math.min(...tempsDia),
      temp_max_c: Math.max(...tempsDia),

      wind_max_kmh: Math.max(...windDia),

      rain_sum_mm: Number(
        chuvaTotalGeral.toFixed(1)
      ),

      rain_prob_max: Math.round(maxProb),

      dadosHorarios: {
        horas: hourly.time
          .slice(i, i + 24)
          .map(t => t.split("T")[1]),

        temperaturas: tempsDia,

        chuvas: chuvaDia,

        probabilidades: probDia,

        nebulosidade: cloudDia,

        trovoadas: codeDia.map(c =>
          codigosTrovonada.includes(c)
        )
      },

      p1: processarPeriodo(0, 6),
      p2: processarPeriodo(6, 12),
      p3: processarPeriodo(12, 18),
      p4: processarPeriodo(18, 24)
    });
  }

  return cidadeAtualObj;
}