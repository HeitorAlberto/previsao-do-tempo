const CODIGOS_TROVOADA = Object.freeze([95, 96, 99]);
const HORAS_POR_DIA = 24;
const DIAS_PREVISAO = 10;

/**
 * Avalia as condições climáticas mapeando os códigos exatos dos pictogramas Meteoblue.
 */
export function avaliarCondicaoTempo(nuvensPct, chuvaMm = 0, temTrovoada = false) {
  let codigo = 1;
  let descricao = "";

  // 1. TROVOADA
  if (temTrovoada) {
    if (chuvaMm <= 3.0) {
      descricao = "Chuva rápida e trovoadas";
      codigo = 28;
    } else {
      descricao = "Chuva e trovoadas";
      codigo = 27;
    }
  } 
  // 2. CHUVA (Códigos exatos da Meteoblue para 1/3 horas)
  else if (chuvaMm > 0) {
    if (nuvensPct < 80) {
      // Usa o código 31 para aguaceiros/chuva passageira com sol/lua
      descricao = "Chuva passageira";
      codigo = 31;
    } else {
      if (chuvaMm > 10.0) {
        descricao = "Nublado com chuvas fortes";
        codigo = 25;
      } else if (chuvaMm > 3.0) {
        descricao = "Nublado com chuva";
        codigo = 23;
      } else {
        descricao = "Nublado com chuva rápida";
        codigo = 33;
      }
    }
  } 
  // 3. SEM CHUVA (Apenas 01, 04, 07, 19 e 22)
  else {
    if (nuvensPct <= 20) {
      descricao = "Sem nuvens";
      codigo = 1;
    } else if (nuvensPct <= 50) {
      descricao = "Poucas nuvens";
      codigo = 4;
    } else if (nuvensPct <= 70) {
      descricao = "Nuvens esparsas";
      codigo = 7;
    } else if (nuvensPct <= 85) {
      descricao = "Muitas nuvens";
      codigo = 19;
    } else {
      descricao = "Nublado";
      codigo = 22;
    }
  }

  return { codigo, descricao };
}

export function formatarLocalizacao(cidadeObj) {
  if (!cidadeObj) return "";
  
  const cidade = cidadeObj.name || cidadeObj.nome || "";
  const regiao = cidadeObj.admin1 || cidadeObj.regiao || "";
  const pais = cidadeObj.country_code?.toUpperCase() || cidadeObj.pais || "";

  const detalhes = [...new Set([regiao, pais])].filter(Boolean).join(", ");
  
  if (!cidade) return detalhes;
  return detalhes ? `<strong>${cidade}</strong> <br>${detalhes}` : cidade;
}

const somarValores = (arr) => arr.reduce((acc, val) => acc + (val || 0), 0);

export function obterDescricaoNuvens(percentual) {
  return avaliarCondicaoTempo(percentual, 0, false).descricao;
}

export function processarDadosPrevisao(data, city) {
  const nomeChave = formatarLocalizacao(city);
  const { hourly } = data;

  const cidadeAtualObj = {
    cidade: nomeChave,
    _cidadeBruta: city,
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

    const pictoCodesHorarios = [];
    const descricoesHorarias = [];

    for (let h = 0; h < HORAS_POR_DIA; h++) {
      const c = cloudDia[h] || 0;
      const r = chuvaDia[h] || 0;
      const t = CODIGOS_TROVOADA.includes(codeDia[h]);

      const cond = avaliarCondicaoTempo(c, r, t);
      pictoCodesHorarios.push(cond.codigo);
      descricoesHorarias.push(cond.descricao);
    }

    const minNuvensDia = Math.min(...cloudDia);
    const temTrovoadaDia = codeDia.some(c => CODIGOS_TROVOADA.includes(c));
    const condicaoDiaria = avaliarCondicaoTempo(minNuvensDia, chuvaTotalGeral, temTrovoadaDia);

    const processarPeriodo = (inicio, fim) => {
      const cPeriodo = cloudDia.slice(inicio, fim);
      const rPeriodo = chuvaDia.slice(inicio, fim);
      const codePeriodo = codeDia.slice(inicio, fim);
      const probPeriodo = probDia.slice(inicio, fim);

      return {
        nuvens_pct: Math.round(somarValores(cPeriodo) / cPeriodo.length),
        chuva: Number(somarValores(rPeriodo).toFixed(1)),
        probabilidade: Math.round(Math.max(...probPeriodo.filter(v => v != null), 0)),
        trovoadas: codePeriodo.some(c => CODIGOS_TROVOADA.includes(c))
      };
    };

    cidadeAtualObj.forecast.push({
      date: tempoDia[0].split("T")[0],
      temp_min_c: Math.min(...tempsDia),
      temp_max_c: Math.max(...tempsDia),
      wind_max_kmh: Math.max(...windDia),
      rain_sum_mm: Number(chuvaTotalGeral.toFixed(1)),
      rain_prob_max: Math.round(maxProb),
      pictoCode: condicaoDiaria.codigo,

      dadosHorarios: {
        horas: tempoDia.map(t => t.split("T")[1]),
        temperaturas: tempsDia,
        chuvas: chuvaDia,
        probabilidades: probDia,
        nebulosidade: cloudDia,
        rajadas: windDia,
        trovoadas: codeDia.map(c => CODIGOS_TROVOADA.includes(c)),
        pictogramas: pictoCodesHorarios,
        descricoes: descricoesHorarias
      },

      p1: processarPeriodo(0, 6),
      p2: processarPeriodo(6, 12),
      p3: processarPeriodo(12, 18),
      p4: processarPeriodo(18, 24)
    });
  }

  return cidadeAtualObj;
}