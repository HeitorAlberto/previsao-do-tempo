import { obterDiaSemana, formatarData } from './utils.js';

/**
 * Converte nebulosidade e estado de trovoada em tag de imagem HTML.
 * Gerencia versões diurnas e noturnas dos ícones.
 */
function descricaoNuvens(percentual, hora, temTrovoada = false) {
  const horaNumero = Number(hora.toString().split(":")[0]);
  const noite = horaNumero >= 18 || horaNumero < 6;
  const sufixo = noite ? 'noite-' : '';

  // 1. SE HOUVER TROVOADA: Agrupa em 3 níveis práticos
  if (temTrovoada) {
    if (percentual <= 50) return `<img src='icones/${sufixo}nuvens-esparsas-trovoadas.png'>`;
    if (percentual <= 80) return `<img src='icones/${sufixo}muitas-nuvens-trovoadas.png'>`;
    return `<img src='icones/${sufixo}trovoadas.png'>`;
  }

  // 2. LÓGICA PADRÃO (Sem trovoada)
  if (percentual <= 20) return `<img src='icones/${sufixo}poucas-nuvens.png'>`;
  if (percentual <= 50) return `<img src='icones/${sufixo}nuvens-esparsas.png'>`;
  if (percentual <= 80) return `<img src='icones/${sufixo}muitas-nuvens.png'>`;
  return `<img src='icones/${sufixo}nublado.png'>`;
}

/**
 * Gera o HTML padrão para os blocos de períodos (Madrugada, Manhã, Tarde, Noite).
 * Agora renderiza a nuvem com raio de forma dinâmica se houver trovoada no período.
 */
/**
 * Gera o HTML padrão para os blocos de períodos (Madrugada, Manhã, Tarde, Noite).
 * Agora renderiza a nuvem com raio de forma dinâmica se houver trovoada no período.
 */
function gerarHtmlPeriodo(titulo, periodoDados) {
  const temTrovoadaNoPeriodo = periodoDados.trovoadas === "trovoadas";
  
  // Define uma hora aproximada para o período para ajustar ícones de dia ou noite
  let horaAproximada = "12:00";
  if (titulo.includes("00h - 06h")) horaAproximada = "03:00";
  if (titulo.includes("06h - 12h")) horaAproximada = "09:00";
  if (titulo.includes("12h - 18h")) horaAproximada = "15:00";
  if (titulo.includes("18h - 00h")) horaAproximada = "21:00";

  const iconeDinamico = descricaoNuvens(periodoDados.nuvens_pct, horaAproximada, temTrovoadaNoPeriodo);

  return `
    <div class="periodo">
      <div class="periodo-titulo">${titulo}</div>
      <div class="periodo-infos">
        <div>${iconeDinamico}</div>
        <div style="color: #0085de; font-weight: bolder;">
          ${periodoDados.chuva} mm (${periodoDados.probabilidade}%)
        </div>
      </div>
    </div>
  `;
}

/**
 * Gera a estrutura HTML dos dados horários com rolagem horizontal.
 * Exibe a intensidade qualitativa da chuva e ícones de trovoada hora a hora.
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
    const estiloHora = ehHoraAtual ? 'style="font-weight: bolder; background-color: #dfdfdf;"' : 'style="font-weight: bolder;"';
    const idHoraAtual = ehHoraAtual ? 'id="hora-atual-card"' : '';
    const rajadaVento = dh.rajadas?.[h] ? Math.round(dh.rajadas[h]) : 0;
    const temTrovoadaNaHora = dh.trovoadas?.[h] || false;

    // Lógica calibrada de escala de intensidade de chuva para uso urbano
    const mmChuva = Number(dh.chuvas[h]);
    let intensidade = "";

    if (mmChuva > 0) {
      if (mmChuva <= 1.0) {
        intensidade = " - Fraca";
      } else if (mmChuva <= 10.0) {
        intensidade = " - Moderada";
      } else {
        intensidade = " - Forte";
      }
    }

    linhasHtml += `
      <div class="horas" ${idHoraAtual}>
        <div class="hora" ${estiloHora}>${dh.horas[h]}</div>
        <div>${descricaoNuvens(dh.nebulosidade[h], dh.horas[h], temTrovoadaNaHora)}</div>
        <div class="hora-info">
          <div>${Math.round(dh.temperaturas[h])}°C</div>
          <div style="color: #0085de">
            ${mmChuva.toFixed(1)} mm ${intensidade} - ${dh.probabilidades[h]}%
          </div>
          <div style="color: #24a700; font-size: 12px;">💨 ${rajadaVento} km/h</div>
        </div>
      </div>
    `;
  }

  return linhasHtml;
}

/**
 * Renderiza la lista de cidades buscadas recentemente (Histórico)
 */
export function renderizarHistoricoUI(historico, dadosCidadesLista, ufFromCode, callbackClique) {
  const el = document.getElementById("historico");
  if (!el) return;

  el.innerHTML = "";

  historico.slice(0, 3).forEach((nomeCidade) => {
    const item = document.createElement("div");
    item.className = "historico-item";
    item.textContent = nomeCidade;

    item.onclick = () => {
      const city = dadosCidadesLista.find((c) => {
        const uf = ufFromCode(c);
        const nome = uf ? `${c.nome} - ${uf}` : c.nome;
        return nome === nomeCidade;
      });

      if (city) callbackClique(city);
    };

    el.appendChild(item);
  });
}

/**
 * Renderiza os dados do dia selecionado usando a estrutura fixa do HTML
 */
export function renderizarCidadeUI(cidadeObj, indiceAtual, atualizarHistoricoCallback) {
  // Força a remoção do estado oculto e reativa o Grid do card
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

  // 1. Atualiza elementos textuais simples
  document.getElementById("dataExibida").textContent = `${obterDiaSemana(d.date)}, ${formatarData(d.date)}`;
  document.getElementById("temperatura").textContent = `${Math.round(d.temp_min_c)}° a ${Math.round(d.temp_max_c)}°`;
  document.getElementById("chuva").textContent = `${d.rain_sum_mm} mm`;
  document.getElementById("vento").textContent = `${Math.round(d.wind_max_kmh)} km/h`;

  // 2. Atualiza os blocos internos complexos dos períodos do dia
  document.getElementById("periodosBloco").innerHTML = `
    ${gerarHtmlPeriodo("00h - 06h", d.p1)}
    ${gerarHtmlPeriodo("06h - 12h", d.p2)}
    ${gerarHtmlPeriodo("12h - 18h", d.p3)}
    ${gerarHtmlPeriodo("18h - 00h", d.p4)}
  `;

  // 3. Atualiza os blocos internos das horas
  document.getElementById("horasBloco").innerHTML = gerarHtmlDadosHorarios(d);

  // 4. Atualiza os botões de navegação e suas opacidades
  const btnVoltar = document.getElementById("btnVoltar");
  const btnAvancar = document.getElementById("btnAvancar");

  btnVoltar.disabled = !podeVoltar;
  btnVoltar.style.opacity = podeVoltar ? "1" : ".3";

  btnAvancar.disabled = !podeAvancar;
  btnAvancar.style.opacity = podeAvancar ? "1" : ".3";

  // 5. Executa o scroll suave se a hora atual estiver renderizada no carrossel
  const elementoHoraAtual = document.getElementById("hora-atual-card");
  const containerHoras = document.getElementById("horasBloco");

  if (elementoHoraAtual && containerHoras) {
    setTimeout(() => {
      // Calcula a posição exata do card em relação ao container horizontal
      const deslocamentoEsquerda = elementoHoraAtual.offsetLeft - containerHoras.offsetLeft;
      
      // Move exclusivamente o container horizontal, sem afetar o body ou a tela vertical
      containerHoras.scrollTo({
        left: deslocamentoEsquerda,
        behavior: "smooth"
      });
    }, 50);
  }

  // Se a função foi ativada por uma busca inicial, limpa o input e atualiza o histórico
  if (typeof atualizarHistoricoCallback === "function") {
    atualizarHistoricoCallback(cidadeObj.cidade);
    document.getElementById("cidadeInput").value = "";
    document.getElementById("suggestions").innerHTML = "";
  }
}