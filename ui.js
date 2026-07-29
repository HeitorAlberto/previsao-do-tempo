import { obterDiaSemana, formatarData } from './utils.js';
import { avaliarCondicaoTempo, formatarLocalizacao } from './parser.js';

/**
 * Garante que o estilo para ocultar a barra de rolagem exista no documento
 */
function garantirEstiloRolagemOculta() {
  if (!document.getElementById('estilo-rolagem-oculta')) {
    const style = document.createElement('style');
    style.id = 'estilo-rolagem-oculta';
    style.textContent = `
      .card-horas-container.rolagem-oculta::-webkit-scrollbar {
        display: none !important;
      }
      .card-horas-container.rolagem-oculta {
        -ms-overflow-style: none !important;
        scrollbar-width: none !important;
      }
    `;
    document.head.appendChild(style);
  }
}

/**
 * Retorna o caminho do ícone PNG da Meteoblue
 */
function obterCaminhoIconeMeteoblue(pictoCode, isNight = false, isDaily = false) {
  if (pictoCode === undefined || pictoCode === null) return '';
  
  const codeFormatted = String(pictoCode).padStart(2, '0');
  
  let fileName = '';
  if (isDaily) {
    fileName = `${codeFormatted}_iday.png`;
  } else if (isNight) {
    fileName = `${codeFormatted}_night.png`;
  } else {
    fileName = `${codeFormatted}_day.png`;
  }

  return `icones/${fileName}`;
}

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
 * Centraliza o scroll no bloco de hora atual dentro do container
 */
function centralizarHoraAtual(indexCard) {
  setTimeout(() => {
    const elementoHoraAtual = document.getElementById(`hora-atual-card-${indexCard}`);
    const containerHoras = document.getElementById(`horasBloco-${indexCard}`);

    if (!elementoHoraAtual || !containerHoras) return;

    const isMobile = window.innerWidth <= 480;

    if (isMobile) {
      const elementoTopo = elementoHoraAtual.offsetTop;
      const containerAltura = containerHoras.clientHeight;
      const elementoAltura = elementoHoraAtual.clientHeight;
      const targetScroll = elementoTopo - (containerAltura / 2) + (elementoAltura / 2);

      containerHoras.scrollTo({
        top: targetScroll,
        behavior: "smooth"
      });
    } else {
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
    const estiloHora = ehHoraAtual ? 'style="font-weight: bolder; color: orangered;"' : 'style="font-weight: bolder;"';
    const idHoraAtual = ehHoraAtual ? `id="hora-atual-card-${cardId}"` : '';
    
    const fatiaHoras = Math.min(3, dh.horas.length - h);

    let somaChuva = 0;
    let minNuvensNoBloco = 100;
    let temTrovoada = false;
    let maxRajada = 0;

    for (let i = 0; i < fatiaHoras; i++) {
      const valChuva = Number(dh.chuvas?.[h + i]) || 0;
      const valNuvens = Number(dh.nebulosidade?.[h + i]) || 0;
      
      somaChuva += valChuva; // Soma acumulada do bloco de 3 horas
      
      if (valNuvens < minNuvensNoBloco) minNuvensNoBloco = valNuvens;
      if (dh.trovoadas?.[h + i] === true) temTrovoada = true;

      const r = dh.rajadas?.[h + i] ? Math.round(dh.rajadas[h + i]) : 0;
      if (r > maxRajada) maxRajada = r;
    }

    // Avalia o bloco usando a chuva acumulada e a nebulosidade
    const condicao3h = avaliarCondicaoTempo(minNuvensNoBloco, somaChuva, temTrovoada);

    const horaTextoOriginal = String(dh.horas[h]);
    const matchHora = horaTextoOriginal.match(/\d+/);
    const horaNum = matchHora ? parseInt(matchHora[0], 10) : 0;
    
    // Alternância Noite / Dia (Noite: 18h às 05h)
    const isNight = horaNum < 6 || horaNum >= 18;

    const srcIcone = obterCaminhoIconeMeteoblue(condicao3h.codigo, isNight, false);
    const imgIconeHtml = srcIcone 
      ? `<img src="${srcIcone}" alt="${condicao3h.descricao}" class="icone-tempo-3h" />` 
      : '';

    const tempHora = dh.temperaturas?.[h] !== undefined ? Math.round(dh.temperaturas[h]) : 0;
    const corTemp = obterCorTemperatura(tempHora);
    const corVento = obterCorVento(maxRajada);
    const corChuva = obterCorChuva3h(somaChuva);

    const horaExibicao = ehHoraAtual ? "Agora" : `${horaNum}h`;

    linesHtml += `
      <div class="horas" ${idHoraAtual}>
        <div class="hora" ${estiloHora}>${horaExibicao}</div>
        <div class="hora-info">
          ${imgIconeHtml}
          <div class="nuvens-desc">${condicao3h.descricao}</div>
          <div style="color: ${corTemp}">${tempHora}°C</div>
          <div style="color: ${corChuva};">
            ${somaChuva.toFixed(1)} mm
          </div>
          <div style="color: ${corVento};">
            ${maxRajada} km/h
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

  garantirEstiloRolagemOculta();

  container.innerHTML = ""; 

  const titulo = document.getElementById("cidade");
  const dadosLocalizacao = cidadeObj._cidadeBruta || { nome: cidadeObj.cidade };
  titulo.innerHTML = `${formatarLocalizacao(dadosLocalizacao)}`;

  cidadeObj.forecast.forEach((d, index) => {
    const card = document.createElement("div");
    card.className = "card";
    card.dataset.index = index;

    if (index === 0) {
      card.classList.add("active");
    }

    const diaSemana = obterDiaSemana(d.date);
    const textoData = `(${index + 1}) ${diaSemana}, ${formatarData(d.date)}`;
    const textoTemp = `${Math.round(d.temp_min_c)}° a ${Math.round(d.temp_max_c)}°`;
    
    const acumuladoChuvaDia = Number(d.rain_sum_mm) || 0;
    const textoChuva = `${acumuladoChuvaDia} mm`;
    
    const ventoMaximoDia = Math.round(d.wind_max_kmh);
    const textoVento = `${ventoMaximoDia} km/h`;

    const ehFimSemana = diaSemana.toLowerCase().includes("sáb") || diaSemana.toLowerCase().includes("dom");
    const classeFimSemana = ehFimSemana ? "fim-semana" : "";

    // Ícone Diário (_iday.png)
    const pictoCodeDaily = d.pictoCode;
    const srcIconeDaily = pictoCodeDaily ? obterCaminhoIconeMeteoblue(pictoCodeDaily, false, true) : '';
    const imgIconeDailyHtml = srcIconeDaily 
      ? `<img src="${srcIconeDaily}" alt="Clima do dia" class="icone-tempo-diario" style="width: 48px; height: 48px; vertical-align: middle; margin-left: 8px;" />` 
      : '';

    card.innerHTML = `
      <div class="card-header-linha ${classeFimSemana}">
        <div class="dia-data">
          <strong>${textoData}</strong>
          ${imgIconeDailyHtml}
        </div>

        <div class="infos-dia">
          <div class="textoTemp">
            <div class="info-valor">🌡️ Temperatura <br> <strong>${textoTemp}</strong></div>
          </div>
        
          <div class="textoChuva">
            <div class="info-valor">💧 Chuva acumulada <br> <strong>${textoChuva}</strong></div>
          </div>
        
          <div class="textoVento">
            <div class="info-valor">🍃 Rajadas de vento <br> <strong>${textoVento}</strong></div>
          </div>
        </div>
      </div>
      
      <div class="card-content">
        <div class="titulo-periodo-hora">Previsão a cada 3 horas</div>
        <div id="horasBloco-${index}" class="card-horas-container rolagem-oculta">
          ${gerarHtmlDados3Horas(d, index)}
        </div>
      </div>
    `;

    const containerHoras = card.querySelector(".card-horas-container");
    if (containerHoras) {
      containerHoras.addEventListener("mouseenter", () => {
        containerHoras.classList.remove("rolagem-oculta");
      });

      containerHoras.addEventListener("mouseleave", () => {
        containerHoras.classList.add("rolagem-oculta");
      });
    }

    card.addEventListener("click", (e) => {
      if (e.target.closest('.card-content')) return;

      const estaAtivo = card.classList.contains("active");
      
      document.querySelectorAll(".card").forEach(c => c.classList.remove("active"));

      if (!estaAtivo) {
        card.classList.add("active");

        if (index === 0) {
          centralizarHoraAtual(index);
        }
      }
    });

    container.appendChild(card);
  });

  centralizarHoraAtual(0);

  if (typeof atualizarHistoricoCallback === "function") {
    atualizarHistoricoCallback(cidadeObj._cidadeBruta || { nome: cidadeObj.cidade });
    document.getElementById("cidadeInput").value = "";
    document.getElementById("suggestions").innerHTML = "";
  }
}