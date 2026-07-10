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
function gerarHtmlDadosHorarios(dadosDia) {
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
    const idHoraAtual = ehHoraAtual ? 'id="hora-atual-card"' : '';
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
    
    // Usa o centralizador de strings do parser se o item for um objeto bruto
    item.textContent = typeof cidadeItem === "object" && cidadeItem !== null
      ? formatarLocalizacao(cidadeItem)
      : cidadeItem;

    item.onclick = () => callbackClique(cidadeItem);
    el.appendChild(item);
  });
}

/**
 * Renderiza os dados do dia selecionado usando a estrutura fixa do HTML
 */
export function renderizarCidadeUI(cidadeObj, indiceAtual, atualizarHistoricoCallback) {
  const card = document.querySelector(".card");
  if (card) {
    card.classList.remove("hidden");
    card.style.display = "grid";
  }

  const titulo = document.getElementById("cidade");
  titulo.textContent = `📍 ${cidadeObj.cidade}`;

  const d = cidadeObj.forecast[indiceAtual];
  const podeVoltar = indiceAtual > 0;
  const podeAvancar = indiceAtual < cidadeObj.forecast.length - 1;

  document.getElementById("dataExibida").textContent = `${obterDiaSemana(d.date)}, ${formatarData(d.date)}`;
  document.getElementById("temperatura").textContent = `${Math.round(d.temp_min_c)}° a ${Math.round(d.temp_max_c)}°`;
  document.getElementById("chuva").textContent = `${d.rain_sum_mm} mm`;
  document.getElementById("vento").textContent = `${Math.round(d.wind_max_kmh)} km/h`;

  document.getElementById("periodosBloco").innerHTML = `
    ${gerarHtmlPeriodo("00h - 06h", d.p1)}
    ${gerarHtmlPeriodo("06h - 12h", d.p2)}
    ${gerarHtmlPeriodo("12h - 18h", d.p3)}
    ${gerarHtmlPeriodo("18h - 00h", d.p4)}
  `;

  document.getElementById("horasBloco").innerHTML = gerarHtmlDadosHorarios(d);

  const btnVoltar = document.getElementById("btnVoltar");
  const btnAvancar = document.getElementById("btnAvancar");

  btnVoltar.disabled = !podeVoltar;
  btnVoltar.style.opacity = podeVoltar ? "1" : ".3";

  btnAvancar.disabled = !podeAvancar;
  btnAvancar.style.opacity = podeAvancar ? "1" : ".3";

  const elementoHoraAtual = document.getElementById("hora-atual-card");
  const containerHoras = document.getElementById("horasBloco");

  if (elementoHoraAtual && containerHoras) {
    setTimeout(() => {
      const deslocamentoEsquerda = elementoHoraAtual.offsetLeft - containerHoras.offsetLeft;
      containerHoras.scrollTo({
        left: deslocamentoEsquerda,
        behavior: "smooth"
      });
    }, 50);
  }

  if (typeof atualizarHistoricoCallback === "function") {
    atualizarHistoricoCallback(cidadeObj._cidadeBruta || { nome: cidadeObj.cidade });
    document.getElementById("cidadeInput").value = "";
    document.getElementById("suggestions").innerHTML = "";
  }
}