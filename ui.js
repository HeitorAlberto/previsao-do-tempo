import { obterDiaSemana, formatarData } from './utils.js';
import { obterDescricaoNuvens, formatarLocalizacao } from './parser.js';

/**
 * Funções auxiliares para definição de cores de acordo com os valores
 */
function obterCorChuva(mm) {
  if (mm <= 0) return '#000'; // Cinza sem chuva
  if (mm <= 3.0) return '#0288D1'; // Azul (fraca)
  if (mm <= 10.0) return '#F9A825'; // Amarelo/Âmbar (moderada)
  return '#D32F2F'; // Vermelho (forte)
}

function obterCorVento(kmh) {
  if (kmh < 40) return '#000'; // Normal (Sem alerta)
  if (kmh < 60) return '#F9A825'; // Amarelo (Perigo Potencial - INMET)
  if (kmh < 100) return '#F57C00'; // Laranja (Perigo - INMET)
  return '#D32F2F'; // Vermelho (Grande Perigo - INMET)
}

function obterCorTemperatura(temp) {
  if (temp < 15) return '#0288D1';
  if (temp <= 28) return '#000';
  if (temp <= 32) return '#f55600';
  return '#9d1200'; 
}

/**
 * Gera o HTML padrão para os blocos de períodos (Madrugada, Manhã, Tarde, Noite).
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
  const corChuva = obterCorChuva(mmChuvaPeriodo);

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
 * Gera a estrutura HTML dos dados horários com rolagem horizontal (Apenas para o dia atual).
 */
function gerarHtmlDadosHorarios(dadosDia, cardId) {
  if (cardId !== 0) return '';

  const dh = dadosDia.dadosHorarios;
  if (!dh || !dh.horas) return '';

  const horaAtualBrasil = new Date().toLocaleTimeString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    hour12: false
  }) + ":00";

  let linesHtml = "";

  for (let h = 0; h < dh.horas.length; h++) {
    const horaTextoOriginal = dh.horas[h];
    const ehHoraAtual = horaTextoOriginal === horaAtualBrasil;
    
    const estiloHora = ehHoraAtual ? 'style="font-weight: bolder; color: white; background-color: black"' : 'style="font-weight: bolder;"';
    const idHoraAtual = ehHoraAtual ? `id="hora-atual-card-${cardId}"` : '';
    
    // Tratamento e cálculo de cores para o bloco horário
    const tempHora = Math.round(dh.temperaturas[h]);
    const corTemp = obterCorTemperatura(tempHora);

    const rajadaVento = dh.rajadas?.[h] ? Math.round(dh.rajadas[h]) : 0;
    
    const corVento = obterCorVento(rajadaVento);

    const mmChuva = Number(dh.chuvas[h]) || 0;

    const corChuva = obterCorChuva(mmChuva);

    const temTrovoadaNaHora = dh.trovoadas?.[h] === true;
    const trovoadaHoraHtml = temTrovoadaNaHora 
      ? `<div class="trovoadas">⚡⚡⚡</div>` 
      : '';

    const horaExibicao = ehHoraAtual ? "Agora" : `${horaTextoOriginal.split(':')[0]}h`;

    linesHtml += `
      <div class="horas" ${idHoraAtual}>
        <div class="hora" ${estiloHora}>${horaExibicao}</div>
        <div class="nuvens-desc">${obterDescricaoNuvens(dh.nebulosidade[h])}</div>
        <div class="hora-info">
          <div style="color: ${corTemp};">${tempHora}°C</div>
          <div style="color: ${corChuva};">
            ${mmChuva.toFixed(1)} mm (${dh.probabilidades[h]}%)
          </div>
          <div style="color: ${corVento};">
            Rajadas: ${rajadaVento} km/h
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
    const alertaChuvaMax = acumuladoChuvaDia >= 30 ? ' ⚠️' : '';
    const textoChuva = `${acumuladoChuvaDia} mm${alertaChuvaMax}`;
    
    const ventoMaximoDia = Math.round(d.wind_max_kmh);
    const alertaVentoMaximo = ventoMaximoDia >= 40 ? ' ⚠️' : '';
    const textoVento = `${ventoMaximoDia} km/h${alertaVentoMaximo}`;

    const ehFimSemana = diaSemana.toLowerCase().includes("sáb") || diaSemana.toLowerCase().includes("dom");
    const classeFimSemana = ehFimSemana ? "fim-semana" : "";

    const blocoHorasHtml = index === 0 ? `
      <div class="titulo-periodo-hora">Dados por hora</div>
      <div id="horasBloco-${index}" class="card-horas-container">
        ${gerarHtmlDadosHorarios(d, index)}
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
        <div class="titulo-periodo-hora">Dados por período</div>
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