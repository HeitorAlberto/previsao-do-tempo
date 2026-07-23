import { obterDiaSemana, formatarData } from './utils.js';
import { obterDescricaoNuvens, formatarLocalizacao } from './parser.js';

/**
 * Auxiliares de formatação visual de cores
 */
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
 * Lógica para calcular a Visão Geral do Dia (Descrição dominante + Alertas)
 */
function obterVisaoGeralDia(dadosDia) {
  const dh = dadosDia.dadosHorarios;
  if (!dh || !dh.horas || dh.horas.length === 0) return { texto: '', alertasHtml: '' };

  // 1. Extração da descrição de nuvens em cada bloco de 3h
  const descricoes3h = [];
  const periodos = []; // Para saber o período do dia (manhã, tarde, noite)

  for (let h = 0; h < dh.horas.length; h += 3) {
    const fatia = Math.min(3, dh.horas.length - h);
    const valoresNuvens = [];
    for (let i = 0; i < fatia; i++) {
      valoresNuvens.push(dh.nebulosidade?.[h + i] || 0);
    }
    const moda = calcularModaNuvens(valoresNuvens);
    const desc = obterDescricaoNuvens(moda);
    descricoes3h.push(desc);

    // Mapeamento simples de período baseado no índice/hora
    const horaNum = parseInt(String(dh.horas[h]).match(/\d+/)?.[0] || h, 10);
    if (horaNum >= 6 && horaNum < 12) periodos.push({ periodo: 'pela manhã', desc });
    else if (horaNum >= 12 && horaNum < 18) periodos.push({ periodo: 'à tarde', desc });
    else periodos.push({ periodo: 'à noite', desc });
  }

  // 2. Cálculo da moda das descrições textuais
  const freqMap = {};
  let maxFreq = 0;

  descricoes3h.forEach(desc => {
    freqMap[desc] = (freqMap[desc] || 0) + 1;
    if (freqMap[desc] > maxFreq) maxFreq = freqMap[desc];
  });

  const empatados = Object.keys(freqMap).filter(desc => freqMap[desc] === maxFreq);

  let textoVisaoGeral = "";

  // Caso 1: Vencedor único sem empates
  if (empatados.length === 1) {
    textoVisaoGeral = empatados[0];
  } 
  // Caso 2: Empates e combinações customizáveis
  else {
    // Exemplo de regra customizada: Verifica se a condição mais severa ocorre em um período específico
    const tarde = periodos.find(p => p.periodo === 'à tarde');
    const noite = periodos.find(p => p.periodo === 'à noite');
    const manha = periodos.find(p => p.periodo === 'pela manhã');

    if (tarde && empatados.includes(tarde.desc)) {
      textoVisaoGeral = `${tarde.desc} ${tarde.periodo}`;
    } else if (noite && empatados.includes(noite.desc)) {
      textoVisaoGeral = `${noite.desc} ${noite.periodo}`;
    } else if (manha && empatados.includes(manha.desc)) {
      textoVisaoGeral = `${manha.desc} ${manha.periodo}`;
    } else {
      // Fallback padrão se não houver um padrão temporal claro
      textoVisaoGeral = empatados.join(' / ');
    }
  }

  // 3. Verificação de Alertas Globais do Dia (Trovoadas, Ventos, Chuvas)
  const temTrovoada = dh.trovoadas?.some(t => t === true);
  const maxChuvaDia = Number(dadosDia.rain_sum_mm) || 0;
  const maxVentoDia = Number(dadosDia.wind_max_kmh) || 0;

  let alertasHtml = '';

  if (temTrovoada) {
    alertasHtml += ` <span title="Possibilidade de Trovoadas">⚡</span>`;
  }
  
  return {
    texto: textoVisaoGeral,
    alertasHtml
  };
}

/**
 * Identifica o índice do bloco (0, 3, 6, 9...) correspondente à hora atual
 */
function obterIndiceBlocoAtual(horas) {
  if (!horas || horas.length === 0) return 0;

  const horaSpStr = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "numeric",
    hour12: false
  }).format(new Date());
  
  const horaAtualNum = parseInt(horaSpStr, 10);

  const horasNumericas = horas.map(hStr => {
    if (typeof hStr === 'number') return hStr;
    const match = String(hStr).match(/\d+/);
    return match ? parseInt(match[0], 10) : 0;
  });

  let menorDiferenca = Infinity;
  let indiceEncontrado = 0;

  for (let i = 0; i < horasNumericas.length; i += 3) {
    const hBloco = horasNumericas[i];
    if (horaAtualNum >= hBloco && horaAtualNum < hBloco + 3) {
      return i;
    }
    
    const diff = Math.abs(horaAtualNum - hBloco);
    if (diff < menorDiferenca) {
      menorDiferenca = diff;
      indiceEncontrado = i;
    }
  }

  return indiceEncontrado;
}

/**
 * Gera a estrutura HTML dos dados em intervalos de 3 horas
 */
function gerarHtmlDados3Horas(dadosDia, cardId) {
  const dh = dadosDia.dadosHorarios;
  if (!dh || !dh.horas) return '';

  const indiceBlocoAtual = cardId === 0 ? obterIndiceBlocoAtual(dh.horas) : -1;

  let linesHtml = "";

  for (let h = 0; h < dh.horas.length; h += 3) {
    const ehHoraAtual = cardId === 0 && h === indiceBlocoAtual;
    
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

    const horaTextoOriginal = String(dh.horas[h]);
    const horaExibicao = ehHoraAtual ? "Agora" : `${horaTextoOriginal.split(':')[0]}h`;

    linesHtml += `
      <div class="horas" ${idHoraAtual}>
        <div class="hora" ${estiloHora}>${horaExibicao}</div>
        <div class="hora-info">
          <div class="nuvens-desc">${descNuvens3h}${trovoadaHoraHtml}</div>
          <div style="color: ${corTemp}">${tempHora}°C</div>
          <div style="color: ${corChuva};">
            ${somaChuva.toFixed(1)} mm
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

    // Obtenção da Visão Geral do Dia
    const visaoGeral = obterVisaoGeralDia(d);

    card.innerHTML = `
      <div class="card-header-linha ${classeFimSemana}">
        <div class="dia-data">
          <strong>${textoData}</strong>
        </div>

        <div class="infos-dia">
          <div class="visao-geral-dia">
            ${visaoGeral.texto}${visaoGeral.alertasHtml}
          </div>

          <div class="textoTemp">
            <div class="info-valor">🌡️ Temperatura <br> ${textoTemp}</div>
          </div>
        
          <div class="textoChuva">
            <div class="info-valor">💧 Chuva acumulada <br> ${textoChuva}</div>
          </div>
        
          <div class="textoVento">
            <div class="info-valor">🍃 Rajadas de vento <br> ${textoVento}</div>
          </div>
        </div>
      </div>
      
      <div class="card-content">
        <div class="titulo-periodo-hora">Previsão a cada 3 horas</div>
        <div id="horasBloco-${index}" class="card-horas-container">
          ${gerarHtmlDados3Horas(d, index)}
        </div>
        <div class="indicacao-rolagem"> <<< Rolagem lateral >>> </div>
      </div>
    `;

    card.addEventListener("click", (e) => {
      if (e.target.closest('.card-content')) return;

      const estaAtivo = card.classList.contains("active");
      
      document.querySelectorAll(".card").forEach(c => c.classList.remove("active"));

      if (!estaAtivo) {
        card.classList.add("active");

        if (index === 0) {
          setTimeout(() => {
            const elementoHoraAtual = document.getElementById(`hora-atual-card-${index}`);
            const containerHoras = document.getElementById(`horasBloco-${index}`);

            if (elementoHoraAtual && containerHoras) {
              const rectElemento = elementoHoraAtual.getBoundingClientRect();
              const rectContainer = containerHoras.getBoundingClientRect();

              const scrollTarget = containerHoras.scrollLeft + (rectElemento.left - rectContainer.left);

              containerHoras.scrollTo({
                left: scrollTarget - 15,
                behavior: "smooth"
              });
            }
          }, 300);
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