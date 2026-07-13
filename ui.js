import { obterDiaSemana, formatarData } from './utils.js';
import { obterDescricaoNuvens, formatarLocalizacao } from './parser.js';

/**
 * Gera o HTML padrão para os blocos de períodos (Madrugada, Manhã, Tarde, Noite).
 */
function gerarHtmlPeriodo(titulo, periodoDados) {
  const temTrovoadaNoPeriodo = periodoDados.trovoadas === true;
  const nuvens_desc = obterDescricaoNuvens(periodoDados.nuvens_pct);
  
  const trovoadaHtml = temTrovoadaNoPeriodo 
    ? `<div class="trovoadas">⚡⚡⚡</div>` 
    : '';

  return `
    <div class="periodo">
      <div class="periodo-titulo">${titulo}</div>
      <div class="periodo-infos">
        <div class="nuvens-desc">${nuvens_desc}</div>
        <div class="chuva" style="font-weight: normal">
          ${periodoDados.chuva} mm (${periodoDados.probabilidade}%)
        </div>
        ${trovoadaHtml}
      </div>
    </div>
  `;
}

/**
 * Gera a estrutura HTML dos dados horários com rolagem horizontal.
 */
function gerarHtmlDadosHorarios(dadosDia, cardId) {
  const dh = dadosDia.dadosHorarios;
  if (!dh || !dh.horas) return '';

  const horaAtualBrasil = new Date().toLocaleTimeString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit"
  }).split(":")[0] + ":00";

  let linhasHtml = "";

  for (let h = 0; h < dh.horas.length; h++) {
    const ehHoraAtual = dh.horas[h] === horaAtualBrasil;
    const estiloHora = ehHoraAtual ? 'style="font-weight: bolder; color: white; background-color: black"' : 'style="font-weight: bolder;"';
    const idHoraAtual = ehHoraAtual ? `id="hora-atual-card-${cardId}"` : '';
    const rajadaVento = dh.rajadas?.[h] ? Math.round(dh.rajadas[h]) : 0;
    const temTrovoadaNaHora = dh.trovoadas?.[h] === true;
    
    const trovoadaHoraHtml = temTrovoadaNaHora 
      ? `<div class="trovoadas">⚡⚡⚡</div>` 
      : '';

    const mmChuva = Number(dh.chuvas[h]);
    let intensidade = "Sem chuva";

    if (mmChuva > 0) {
      if (mmChuva <= 3.0) {
        intensidade = "Chuva Fraca";
      } else if (mmChuva <= 10.0) {
        intensidade = "Chuva Moderada";
      } else {
        intensidade = "Chuva Forte";
      }
    }

    linhasHtml += `
      <div class="horas" ${idHoraAtual}>
        <div class="hora" ${estiloHora}>${dh.horas[h]}</div>
        <div class="nuvens-desc">${obterDescricaoNuvens(dh.nebulosidade[h])}</div>
        <div class="hora-info">
          <div class="temperatura">${Math.round(dh.temperaturas[h])}°C</div>
          <div style="color: #0085de">
            ${intensidade} <br> ${mmChuva.toFixed(1)} mm (${dh.probabilidades[h]}%)
          </div>
          <div style="color: #24a700;">${rajadaVento} km/h</div>
          ${trovoadaHoraHtml}
        </div>
      </div>
    `;
  }

  return linhasHtml;
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
  
  // ALTERAÇÃO AQUI: Usa o objeto bruto para formatar a localização completa com quebra de linha
  const dadosLocalizacao = cidadeObj._cidadeBruta || { nome: cidadeObj.cidade };
  titulo.innerHTML = `📍 ${formatarLocalizacao(dadosLocalizacao)}`;

  cidadeObj.forecast.forEach((d, index) => {
    const card = document.createElement("div");
    card.className = "card";
    card.dataset.index = index;

    const diaSemana = obterDiaSemana(d.date);
    const textoData = `${diaSemana}, ${formatarData(d.date)}`;
    const textoTemp = `${Math.round(d.temp_min_c)}° a ${Math.round(d.temp_max_c)}°`;
    const textoChuva = `${d.rain_sum_mm} mm`;
    const textoVento = `${Math.round(d.wind_max_kmh)} km/h`;

    const ehFimSemana = diaSemana.toLowerCase().includes("sáb") || diaSemana.toLowerCase().includes("dom");
    const classeFimSemana = ehFimSemana ? "fim-semana" : "";

    const mediaNuvens = (d.p1.nuvens_pct + d.p2.nuvens_pct + d.p3.nuvens_pct + d.p4.nuvens_pct) / 4;

    let classeClima = "";
    if (mediaNuvens < 30) {
        classeClima = "clima-limpo";
    } else if (mediaNuvens <= 70) {
        classeClima = "clima-misto";
    } else {
        classeClima = "clima-nublado";
    }

    card.innerHTML = `
      <div class="card-header-linha ${classeFimSemana} ${classeClima}">
        <div class="dia-data">${textoData}</div>

        <div class="textoTemp" >
         <div class="rotulo-dados">Temperatura</div>
         <div>${textoTemp}</div>
        </div>
        
        <div class="textoChuva">
          <div class="rotulo-dados">Chuva </div>
          <div>${textoChuva}</div>
        </div>
        
        <div class="textoVento">
          <div class="rotulo-dados">Rajadas vento</div>
          <div>${textoVento}</div>
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

        <div class="titulo-periodo-hora">Dados por hora</div>
        <div id="horasBloco-${index}" class="card-horas-container">
          ${gerarHtmlDadosHorarios(d, index)}
        </div>
        <div class="indicacao-rolagem">&larr; Rolagem lateral &rarr;</div>
      </div>
    `;

    card.addEventListener("click", (e) => {
      if (e.target.closest('.card-content')) return;

      const estaAtivo = card.classList.contains("active");
      
      document.querySelectorAll(".card").forEach(c => c.classList.remove("active"));

      if (!estaAtivo) {
        card.classList.add("active");

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
    });

    container.appendChild(card);
  });

  if (typeof atualizarHistoricoCallback === "function") {
    atualizarHistoricoCallback(cidadeObj._cidadeBruta || { nome: cidadeObj.cidade });
    document.getElementById("cidadeInput").value = "";
    document.getElementById("suggestions").innerHTML = "";
  }
}