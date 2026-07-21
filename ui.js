import { obterDiaSemana, formatarData } from './utils.js';
import { obterDescricaoNuvens, formatarLocalizacao } from './parser.js';

/**
 * Funções auxiliares para definição de cores de acordo com os valores
 */

// Regra para janelas de 6 horas (Acumulado / Saturação)
function obterCorChuvaPeriodo(mm) {
  if (mm <= 0) return '#000';
  if (mm <= 15.0) return '#0288D1';  // Azul (fraca em 6h)
  if (mm <= 35.0) return '#F9A825';  // Amarelo (moderada)
  return '#D32F2F';                  // Vermelho (forte em 6h)
}

// Regra para janelas de 3 horas (Intensidade / Acumulado Curto)
function obterCorChuva3h(mm) {
  if (mm <= 0) return '#000';
  if (mm <= 5.0) return '#0288D1';   // Azul (fraca em 3h)
  if (mm <= 15.0) return '#F9A825';  // Amarelo (moderada em 3h)
  return '#D32F2F';                  // Vermelho (forte em 3h)
}

function obterCorVento(kmh) {
  if (kmh < 40) return '#000';       // Normal
  if (kmh < 60) return '#F9A825';    // Amarelo (Perigo Potencial - INMET)
  if (kmh < 100) return '#F57C00';   // Laranja (Perigo - INMET)
  return '#D32F2F';                  // Vermelho (Grande Perigo - INMET)
}

function obterCorTemperatura(temp) {
  if (temp < 15) return '#0288D1';   // Frio (Azul)
  if (temp <= 28) return '#000';      // Agradável (Preto)
  if (temp <= 32) return '#f55600';   // Quente (Laranja)
  return '#9d1200';                  // Muito Quente (Vermelho)
}

/**
 * Gera o HTML padrão para os blocos de períodos (Madrugada, Manhã, Tarde, Noite - 6 em 6h).
 */
function gerarHtmlPeriodo(titulo, periodoDados) {
  const temTrovoadaNoPeriodo = periodoDados.trovoadas === true;
  const nuvens_desc = obterDescricaoNuvens(periodoDados.nuvens_pct);
  
  const trovoadaHtml = temTrovoadaNoPeriodo 
    ? `<div class="trovoadas">⚡⚡⚡</div>` 
    : '';

  const valorRajada = periodoDados.wind_max_kmh 
    || periodoDados.rajada 
    || periodoDados.wind_gust 
    || periodoDados.rajadas 
    || 0;

  const rajadaPeriodo = Math.round(Number(valorRajada));
  const corVento = obterCorVento(rajadaPeriodo);

  const mmChuvaPeriodo = Number(periodoDados.chuva) || 0;
  const corChuva = obterCorChuvaPeriodo(mmChuvaPeriodo);

  return `
    <div class="periodo">
      <div class="periodo-titulo">${titulo}</div>
      <div class="periodo-infos">
        <div class="nuvens-desc">${nuvens_desc}</div>
        <div class="chuva" style="color: ${corChuva}">
          ${mmChuvaPeriodo} mm
        </div>
        <div class="vento-periodo" style="color: ${corVento}">
          Rajadas: ${rajadaPeriodo} km/h
        </div>
        ${trovoadaHtml}
      </div>
    </div>
  `;
}

/**
 * Gera a estrutura HTML dos dados em intervalos de 3 horas (Apenas para os dias 0 e 1).
 */
function gerarHtmlDados3Horas(dadosDia, cardId) {
  // Apenas renderiza se for o 1º dia (index 0) ou 2º dia (index 1)
  if (cardId > 1) return '';

  const dh = dadosDia.dadosHorarios;
  if (!dh || !dh.horas) return '';

  const horaAtualBrasil = new Date().toLocaleTimeString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    hour12: false
  }) + ":00";

  let linesHtml = "";

  // Percorre os dados saltando de 3 em 3 horas
  for (let h = 0; h < dh.horas.length; h += 3) {
    const horaTextoOriginal = dh.horas[h];
    const ehHoraAtual = cardId === 0 && horaTextoOriginal === horaAtualBrasil;
    
    const estiloHora = ehHoraAtual ? 'style="font-weight: bolder; color: black;"' : 'style="font-weight: bolder;"';
    const idHoraAtual = ehHoraAtual ? `id="hora-atual-card-${cardId}"` : '';
    
    // Processa valores para a janela de 3 horas (h até h+2)
    const fatiaHoras = Math.min(3, dh.horas.length - h);
    
    // 1. Média de Nebulosidade no bloco de 3h
    let somaNuvens = 0;
    for (let i = 0; i < fatiaHoras; i++) {
      somaNuvens += dh.nebulosidade?.[h + i] || 0;
    }
    const mediaNuvens = Math.round(somaNuvens / fatiaHoras);
    const descNuvens3h = obterDescricaoNuvens(mediaNuvens);

    // 2. Temperatura Pontual na hora inicial do bloco (ex: 15h -> 34°C)
    const tempHora = dh.temperaturas?.[h] !== undefined 
      ? Math.round(dh.temperaturas[h]) 
      : 0;
    const corTemp = obterCorTemperatura(tempHora);

    // 3. Maior rajada de vento (Pico) no bloco de 3h
    let maxRajada = 0;
    for (let i = 0; i < fatiaHoras; i++) {
      const r = dh.rajadas?.[h + i] ? Math.round(dh.rajadas[h + i]) : 0;
      if (r > maxRajada) maxRajada = r;
    }
    const corVento = obterCorVento(maxRajada);

    // 4. Soma do acumulado de chuva e maior probabilidade nas 3 horas
    let somaChuva = 0;
    let maxProb = 0;
    for (let i = 0; i < fatiaHoras; i++) {
      somaChuva += Number(dh.chuvas?.[h + i]) || 0;
      const prob = dh.probabilidades?.[h + i] || 0;
      if (prob > maxProb) maxProb = prob;
    }
    const corChuva = obterCorChuva3h(somaChuva);

    // 5. Trovoada presente em qualquer uma das 3 horas
    let temTrovoada = false;
    for (let i = 0; i < fatiaHoras; i++) {
      if (dh.trovoadas?.[h + i] === true) {
        temTrovoada = true;
        break;
      }
    }
    const trovoadaHoraHtml = temTrovoada ? `<div class="trovoadas">⚡⚡⚡</div>` : '';

    const horaExibicao = ehHoraAtual ? "Agora" : `${horaTextoOriginal.split(':')[0]}h`;

    linesHtml += `
      <div class="horas" ${idHoraAtual}>
        <div class="hora" ${estiloHora}>${horaExibicao}</div>
        <div class="nuvens-desc">${descNuvens3h}</div>
        <div class="hora-info">
          <div style="color: ${corTemp}; font-weight: bold;">${tempHora}°C</div>
          <div style="color: ${corChuva};">
            ${somaChuva.toFixed(1)} mm (${maxProb}%)
          </div>
          <div style="color: ${corVento};">
            Rajadas: ${maxRajada} km/h
          </div>
          ${trovoadaHoraHtml}
        </div>
      </div>
    `;
  }

  return linesHtml;
}

/**
 * Renderiza a lista de cidades buscadas recentemente (Histórico)
 */
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

/**
 * Renderiza todos os dias lado a lado em linha de forma expansível
 */
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

    // Exibe o bloco detalhado de 3h apenas no 1º (index 0) e 2º dia (index 1)
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
           <div class="rotulo-dados">Temperatura (°C)</div>
           <div class="info-valor">${textoTemp}</div>
         </div>
        
         <div class="textoChuva">
           <div class="rotulo-dados">Chuva acumulada </div>
           <div class="info-valor">${textoChuva}</div>
         </div>
        
         <div class="textoVento">
           <div class="rotulo-dados">Rajadas de vento</div>
           <div class="info-valor">${textoVento}</div>
         </div>
       </div>
      </div>
      
      <div class="card-content">
        <div class="titulo-periodo-hora">Dados por período (6h)</div>
        <div class="periodos-bloco">
          ${gerarHtmlPeriodo("00h", d.p1)}
          ${gerarHtmlPeriodo("06h", d.p2)}
          ${gerarHtmlPeriodo("12h", d.p3)}
          ${gerarHtmlPeriodo("18h", d.p4)}
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