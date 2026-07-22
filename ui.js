import { obterDiaSemana, formatarData } from './utils.js';
import { obterDescricaoNuvens, formatarLocalizacao } from './parser.js';

/**
 * =========================================================================
 * MATRIZ DE DECISÃO DE COMBINAÇÃO (3h + 3h -> 6h)
 * =========================================================================
 * Altere os textos das chaves e valores abaixo para personalizar o resultado.
 * A ordem de leitura é: "BLOCO_3H_1 + BLOCO_3H_2"
 */
const MATRIZ_COMBINACAO_NUVENS = {
  // 1. Casos de manutenção ("A" + "A" = "A")
  "Poucas nuvens + Poucas nuvens": "Poucas nuvens",
  "Nuvens esparsas + Nuvens esparsas": "Nuvens esparsas",
  "Muitas nuvens + Muitas nuvens": "Muitas nuvens",
  "Nublado + Nublado": "Nublado",

  // 2. Combinações com "Poucas nuvens"
  "Poucas nuvens + Nuvens esparsas": "Nuvens esparsas",
  "Nuvens esparsas + Poucas nuvens": "Nuvens esparsas",
  "Poucas nuvens + Muitas nuvens": "Nebulosidade aumenta",
  "Muitas nuvens + Poucas nuvens": "Nebulosidade diminui",
  "Poucas nuvens + Nublado": "Nebulosidade aumenta",
  "Nublado + Poucas nuvens": "Nebulosidade diminui",

  // 3. Combinações com "Nuvens esparsas"
  "Nuvens esparsas + Muitas nuvens": "Muitas nuvens",
  "Muitas nuvens + Nuvens esparsas": "Nebulosidade diminui",
  "Nuvens esparsas + Nublado": "Nebulosidade aumenta",
  "Nublado + Nuvens esparsas": "Nebulosidade diminui",

  // 4. Combinações com "Muitas nuvens"
  "Muitas nuvens + Nublado": "Muitas nuvens",
  "Nublado + Muitas nuvens": "Muitas nuvens"
};

/**
 * Hierarquia de severidade para desempates genéricos (caso a combinação não esteja na matriz)
 */
const HIERARQUIA_SEVERIDADE = [
  "Poucas nuvens",
  "Nuvens esparsas",
  "Muitas nuvens",
  "Nublado"
];

/**
 * Combina duas descrições de 3h e retorna a descrição final para o bloco de 6h.
 */
function combinarDescricoes3h(desc1, desc2) {
  // Regra base: Se forem idênticos, retorna qualquer um deles ("3h" + "3h" = "3h")
  if (desc1 === desc2) return desc1;

  // Busca na matriz de decisão configurada
  const chaveCombinacao = `${desc1} + ${desc2}`;
  if (MATRIZ_COMBINACAO_NUVENS[chaveCombinacao]) {
    return MATRIZ_COMBINACAO_NUVENS[chaveCombinacao];
  }

  // Fallback de segurança: Pega o de maior severidade na hierarquia caso a regra não exista na matriz
  const peso1 = HIERARQUIA_SEVERIDADE.indexOf(desc1);
  const peso2 = HIERARQUIA_SEVERIDADE.indexOf(desc2);

  return peso1 >= peso2 ? desc1 : desc2;
}

/**
 * Auxiliares de formatação visual de cores
 */
function obterCorChuvaPeriodo(mm) {
  if (mm <= 0) return '#000';
  if (mm <= 15.0) return '#0288D1';
  if (mm <= 35.0) return '#F9A825';
  return '#D32F2F';
}

function obterCorChuva3h(mm) {
  if (mm <= 0) return '#000';
  if (mm <= 5.0) return '#0288D1';
  if (mm <= 15.0) return '#F9A825';
  return '#D32F2F';
}

function obterCorVento(kmh) {
  if (kmh < 40) return '#000';
  if (kmh < 60) return '#F9A825';
  if (kmh < 100) return '#F57C00';
  return '#D32F2F';
}

function obterCorTemperatura(temp) {
  if (temp < 15) return '#0288D1';
  if (temp <= 28) return '#000';
  if (temp <= 32) return '#f55600';
  return '#9d1200';
}

function arredondarParaDezena(valor) {
  return Math.round((Number(valor) || 0) / 10) * 10;
}

/**
 * Calcula a moda de um conjunto de valores numéricos de nebulosidade
 */
function calcularModaNuvens(valores) {
  if (!valores || valores.length === 0) return 0;

  const valoresFechados = valores.map((v) => arredondarParaDezena(v));
  const frequencias = {};
  let maxFrequencia = 0;

  for (const v of valoresFechados) {
    frequencias[v] = (frequencias[v] || 0) + 1;
    if (frequencias[v] > maxFrequencia) {
      maxFrequencia = frequencias[v];
    }
  }

  const empatados = Object.keys(frequencias)
    .filter((v) => frequencias[v] === maxFrequencia)
    .map(Number);

  return Math.max(...empatados);
}

/**
 * Gera o HTML dos blocos de 6h a partir do resultado dos 2 sub-blocos de 3h
 */
function gerarHtmlPeriodo(titulo, periodoDados, valoresNuvens6h = []) {
  const temTrovoadaNoPeriodo = periodoDados?.trovoadas === true;
  
  let descFinalNuvens = "";

  // Se tivermos as 6h disponíveis, dividimos em 2 sub-blocos de 3h
  if (valoresNuvens6h.length >= 6) {
    const bloco3h_1 = valoresNuvens6h.slice(0, 3); // Primeiras 3h
    const bloco3h_2 = valoresNuvens6h.slice(3, 6); // Últimas 3h

    // 1. Calcula a moda e pega a descrição da 1ª metade
    const pct1 = calcularModaNuvens(bloco3h_1);
    const desc3h_1 = obterDescricaoNuvens(pct1);

    // 2. Calcula a moda e pega a descrição da 2ª metade
    const pct2 = calcularModaNuvens(bloco3h_2);
    const desc3h_2 = obterDescricaoNuvens(pct2);

    // 3. Aplica a Matriz de Decisão (3h + 3h -> 6h)
    descFinalNuvens = combinarDescricoes3h(desc3h_1, desc3h_2);
  } else {
    // Fallback para caso os dados brutos de 6h não venham completos
    const pct = Array.isArray(periodoDados?.nebulosidade) 
      ? calcularModaNuvens(periodoDados.nebulosidade)
      : arredondarParaDezena(periodoDados?.nuvens_pct || 0);
      
    descFinalNuvens = obterDescricaoNuvens(pct);
  }
  
  const trovoadaHtml = temTrovoadaNoPeriodo 
    ? `⚡` 
    : '';

  const valorRajada = periodoDados?.wind_max_kmh 
    || periodoDados?.rajada 
    || periodoDados?.wind_gust 
    || periodoDados?.rajadas 
    || 0;

  const rajadaPeriodo = Math.round(Number(valorRajada));
  const corVento = obterCorVento(rajadaPeriodo);

  const mmChuvaPeriodo = Number(periodoDados?.chuva) || 0;
  const corChuva = obterCorChuvaPeriodo(mmChuvaPeriodo);

  return `
    <div class="periodo">
      <div class="periodo-titulo">${titulo}</div>
      <div class="periodo-infos">
        <div class="nuvens-desc">${descFinalNuvens}${trovoadaHtml}</div>
        <div class="chuva" style="color: ${corChuva}">
          ${mmChuvaPeriodo} mm
        </div>
        <div class="vento-periodo" style="color: ${corVento}">
          Rajadas: ${rajadaPeriodo} km/h
        </div>
      </div>
    </div>
  `;
}

/**
 * Gera a estrutura HTML dos dados em intervalos de 3 horas
 */
function gerarHtmlDados3Horas(dadosDia, cardId) {
  if (cardId > 1) return '';

  const dh = dadosDia.dadosHorarios;
  if (!dh || !dh.horas) return '';

  const horaAtualBrasil = new Date().toLocaleTimeString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    hour12: false
  }) + ":00";

  let linesHtml = "";

  for (let h = 0; h < dh.horas.length; h += 3) {
    const horaTextoOriginal = dh.horas[h];
    const ehHoraAtual = cardId === 0 && horaTextoOriginal === horaAtualBrasil;
    
    const estiloHora = ehHoraAtual ? 'style="font-weight: bolder; color: black;"' : 'style="font-weight: bolder;"';
    const idHoraAtual = ehHoraAtual ? `id="hora-atual-card-${cardId}"` : '';
    
    const fatiaHoras = Math.min(3, dh.horas.length - h);
    
    const valoresNuvensBloco = [];
    for (let i = 0; i < fatiaHoras; i++) {
      valoresNuvensBloco.push(dh.nebulosidade?.[h + i] || 0);
    }
    const modaNuvens3h = calcularModaNuvens(valoresNuvensBloco);
    const descNuvens3h = obterDescricaoNuvens(modaNuvens3h);

    const tempHora = dh.temperaturas?.[h] !== undefined 
      ? Math.round(dh.temperaturas[h]) 
      : 0;
    const corTemp = obterCorTemperatura(tempHora);

    let maxRajada = 0;
    for (let i = 0; i < fatiaHoras; i++) {
      const r = dh.rajadas?.[h + i] ? Math.round(dh.rajadas[h + i]) : 0;
      if (r > maxRajada) maxRajada = r;
    }
    const corVento = obterCorVento(maxRajada);

    let somaChuva = 0;
    let maxProb = 0;
    for (let i = 0; i < fatiaHoras; i++) {
      somaChuva += Number(dh.chuvas?.[h + i]) || 0;
      const prob = dh.probabilidades?.[h + i] || 0;
      if (prob > maxProb) maxProb = prob;
    }
    const corChuva = obterCorChuva3h(somaChuva);

    let temTrovoada = false;
    for (let i = 0; i < fatiaHoras; i++) {
      if (dh.trovoadas?.[h + i] === true) {
        temTrovoada = true;
        break;
      }
    }
    const trovoadaHoraHtml = temTrovoada ? `⚡` : '';

    const horaExibicao = ehHoraAtual ? "Agora" : `${horaTextoOriginal.split(':')[0]}h`;

    linesHtml += `
      <div class="horas" ${idHoraAtual}>
        <div class="hora" ${estiloHora}>${horaExibicao}</div>
        <div class="nuvens-desc">${descNuvens3h}${trovoadaHoraHtml}</div>
        <div class="hora-info">
          <div style="color: ${corTemp}; font-weight: bold;">${tempHora}°C</div>
          <div style="color: ${corChuva};">
            ${somaChuva.toFixed(1)} mm (${maxProb}%)
          </div>
          <div style="color: ${corVento};">
            Rajadas: ${maxRajada} km/h
          </div>
        </div>
      </div>
    `;
  }

  return linesHtml;
}

export function renderizarHistoricoUI(historico, callbackClique) {
  const el = document.getElementById("historico");
  if (!el) return;

  el.innerHTML = "";

  historico.slice(0, 3).forEach((cidadeItem) => {
    const item = document.createElement("div");
    item.className = "historico-item";
    
    item.innerHTML = typeof cidadeItem === "object" && cidadeItem !== null
      ? formatarLocalizacao(cidadeItem)
      : cidadeItem;

    item.onclick = () => callbackClique(cidadeItem);
    el.appendChild(item);
  });
}

export function renderizarCidadeUI(cidadeObj, indiceInutilizado, atualizarHistoricoCallback) {
  const container = document.getElementById("container");
  if (!container) return;

  container.innerHTML = ""; 

  const titulo = document.getElementById("cidade");
  const dadosLocalizacao = cidadeObj._cidadeBruta || { nome: cidadeObj.cidade };
  titulo.innerHTML = `${formatarLocalizacao(dadosLocalizacao)}`;

  cidadeObj.forecast.forEach((d, index) => {
    const card = document.createElement("div");
    card.className = "card";
    card.dataset.index = index;

    const diaSemana = obterDiaSemana(d.date);
    const textoData = `${diaSemana}, ${formatarData(d.date)}`;
    const textoTemp = `${Math.round(d.temp_min_c)}° a ${Math.round(d.temp_max_c)}°`;
    
    const acumuladoChuvaDia = Number(d.rain_sum_mm) || 0;
    const textoChuva = `${acumuladoChuvaDia} mm`;
    
    const ventoMaximoDia = Math.round(d.wind_max_kmh);
    const textoVento = `${ventoMaximoDia} km/h`;

    const ehFimSemana = diaSemana.toLowerCase().includes("sáb") || diaSemana.toLowerCase().includes("dom");
    const classeFimSemana = ehFimSemana ? "fim-semana" : "";

    // Pega as 6 horas brutas de cada período de 6h (slice do array de 24h)
    const nuvensP1 = d.dadosHorarios?.nebulosidade?.slice(0, 6) || [];
    const nuvensP2 = d.dadosHorarios?.nebulosidade?.slice(6, 12) || [];
    const nuvensP3 = d.dadosHorarios?.nebulosidade?.slice(12, 18) || [];
    const nuvensP4 = d.dadosHorarios?.nebulosidade?.slice(18, 24) || [];

    const blocoHorasHtml = (index === 0 || index === 1) ? `
      <div class="titulo-periodo-hora">Previsão a cada 3 horas</div>
      <div id="horasBloco-${index}" class="card-horas-container">
        ${gerarHtmlDados3Horas(d, index)}
      </div>
      <div class="indicacao-rolagem">&larr; Rolagem lateral &rarr;</div>
    ` : '';

    card.innerHTML = `
      <div class="card-header-linha ${classeFimSemana}">
        <div class="dia-data">
          <strong>${textoData}</strong>
        </div>

        <div class="infos-dia">
          <div class="textoTemp">
            <div class="info-valor">🌡️ ${textoTemp}</div>
          </div>
        
          <div class="textoChuva">
            <div class="info-valor">💧 ${textoChuva}</div>
          </div>
        
          <div class="textoVento">
            <div class="info-valor">🍃${textoVento}</div>
          </div>
        </div>
      </div>
      
      <div class="card-content">
        <div class="titulo-periodo-hora">Dados por período (6h)</div>
        <div class="periodos-bloco">
          ${gerarHtmlPeriodo("00h a 06h", d.p1, nuvensP1)}
          ${gerarHtmlPeriodo("06h a 12h", d.p2, nuvensP2)}
          ${gerarHtmlPeriodo("12h a 18h", d.p3, nuvensP3)}
          ${gerarHtmlPeriodo("18h a 00h", d.p4, nuvensP4)}
        </div>
        ${blocoHorasHtml}
      </div>
    `;

    card.addEventListener("click", (e) => {
      if (e.target.closest('.card-content')) return;

      const estaAtivo = card.classList.contains("active");
      
      document.querySelectorAll(".card").forEach(c => c.classList.remove("active"));

      if (!estaAtivo) {
        card.classList.add("active");

        if (index === 0) {
          const elementoHoraAtual = document.getElementById(`hora-atual-card-${index}`);
          const containerHoras = document.getElementById(`horasBloco-${index}`);

          if (elementoHoraAtual && containerHoras) {
            setTimeout(() => {
              const deslocamentoEsquerda = elementoHoraAtual.offsetLeft - containerHoras.offsetLeft;
              containerHoras.scrollTo({
                left: deslocamentoEsquerda,
                behavior: "smooth"
              });
            }, 50);
          }
        }
      }
    });

    container.appendChild(card);
  });

  if (typeof atualizarHistoricoCallback === "function") {
    atualizarHistoricoCallback(cidadeObj._cidadeBruta || { nome: cidadeObj.cidade });
    document.getElementById("cidadeInput").value = "";
    document.getElementById("suggestions").innerHTML = "";
  }
}