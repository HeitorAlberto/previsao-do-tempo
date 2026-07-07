import { normalizarTexto } from './utils.js';
import { fetchPrevisao, processarDadosPrevisao } from './api.js';
import { renderizarHistoricoUI, renderizarCidadeUI } from './ui.js';

// Função integrada de Geocoding para o Autocomplete Global
async function obterCidadesDaAPI(termo) {
  if (!termo) return [];
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(termo)}&count=6&language=pt`;
  
  try {
    const resposta = await fetch(url);
    const dados = await resposta.json();
    if (!dados.results) return [];
    
    return dados.results.map(cidade => ({
      id: cidade.id,
      nome: cidade.name,
      pais: cidade.country_code ? cidade.country_code.toUpperCase() : "",
      regiao: cidade.admin1 || "",
      latitude: cidade.latitude,
      longitude: cidade.longitude
    }));
  } catch (erro) {
    console.error("Erro na busca de cidades:", erro);
    return [];
  }
}

// Estado global da aplicação
let historico = JSON.parse(localStorage.getItem("historico")) || [];
let carregando = false;

// Controle de paginação dos dias
let diaAtualIndex = 0; 
let dadosPrevisaoGlobais = null; 

const inputEl = document.getElementById("cidadeInput");
const suggestions = document.getElementById("suggestions");
const titulo = document.getElementById("cidade");

/**
 * Inicializa a aplicação configurando o estado inicial e o histórico
 */
async function iniciar() {
  try {
    titulo.textContent = "Busque uma cidade do mundo";
    renderizarHistorico();
  } catch (e) {
    console.error(e);
    titulo.textContent = "Erro ao carregar aplicação.";
  }
}

function salvarHistorico() {
  localStorage.setItem("historico", JSON.stringify(historico));
}

function renderizarHistorico() {
  /**
   * Função simulada ajustada: 
   * Formata de maneira limpa o texto complementar do histórico (ex: "SP - BR" ou "Texas - US").
   * Remove termos como "State of" que a API Open-Meteo retorna para o Brasil.
   */
  const ufFromCodeSimulado = (cidade) => {
    if (!cidade) return "";
    
    let regiaoLimpa = cidade.regiao || "";
    // Limpa o prefixo "State of " caso a API retorne em inglês para estados brasileiros
    if (regiaoLimpa.toLowerCase().startsWith("state of ")) {
      regiaoLimpa = regiaoLimpa.substring(9);
    }

    if (regiaoLimpa && cidade.pais) {
      return `${regiaoLimpa}, ${cidade.pais}`;
    }
    return cidade.pais || regiaoLimpa;
  };

  // Envia a lista e o formatador visual para o ui.js
  renderizarHistoricoUI(historico, historico, ufFromCodeSimulado, buscarPrevisaoOpenMeteo);
}

function atualizarHistorico(cidadeObjeto) {
  if (!cidadeObjeto || !cidadeObjeto.nome) return;

  // Filtra duplicados de forma estrita protegendo contra objetos quebrados
  historico = historico.filter(c => {
    if (!c) return false;
    if (typeof c === 'string') return c !== cidadeObjeto.nome;
    return (c.id && cidadeObjeto.id) ? c.id !== cidadeObjeto.id : c.nome !== cidadeObjeto.nome;
  });

  historico.unshift(cidadeObjeto);
  historico = historico.slice(0, 3);

  salvarHistorico();
  renderizarHistorico();
}

/**
 * Dispara a busca da previsão do tempo na API Open-Meteo
 */
async function buscarPrevisaoOpenMeteo(city) {
  if (!city) return;

  // Se o histórico antigo contiver strings ou dados sem coordenadas, recupera via API dinamicamente
  if (typeof city === "string" || !city.latitude || !city.longitude) {
    const termoBusca = typeof city === "string" ? city : city.nome;
    titulo.textContent = "⏳ Buscando dados do histórico...";
    const resultados = await obterCidadesDaAPI(termoBusca);
    if (resultados && resultados.length > 0) {
      city = resultados[0];
    } else {
      titulo.textContent = "Erro ao recuperar cidade.";
      return;
    }
  }

  if (carregando) return;
  carregando = true;
  titulo.textContent = "⏳ Carregando...";

  try {
    const data = await fetchPrevisao(city);
    dadosPrevisaoGlobais = processarDadosPrevisao(data, city);
    
    diaAtualIndex = 0; 

    renderizarCidadeUI(dadosPrevisaoGlobais, diaAtualIndex, atualizarHistorico);
    configurarBotoesNavegacao();

  } catch (e) {
    console.error(e);
    titulo.textContent = "Erro na previsão.";
  } finally {
    carregando = false;
  }
}

/**
 * Configura os cliques dos botões de avançar e voltar do HTML
 */
function configurarBotoesNavegacao() {
  const btnVoltar = document.getElementById("btnVoltar");
  const btnAvancar = document.getElementById("btnAvancar");

  btnVoltar.onclick = () => {
    if (diaAtualIndex > 0) {
      diaAtualIndex--;
      renderizarCidadeUI(dadosPrevisaoGlobais, diaAtualIndex);
    }
  };

  btnAvancar.onclick = () => {
    if (dadosPrevisaoGlobais && dadosPrevisaoGlobais.forecast && diaAtualIndex < dadosPrevisaoGlobais.forecast.length - 1) { 
      diaAtualIndex++;
      renderizarCidadeUI(dadosPrevisaoGlobais, diaAtualIndex);
    }
  };
}

/**
 * Processa o clique do botão de busca ou tecla Enter
 */
async function buscarCidade() {
  const termo = inputEl.value.trim();
  if (!termo) return;

  titulo.textContent = "⏳ Buscando...";
  try {
    const resultados = await obterCidadesDaAPI(termo);
    
    if (!resultados || resultados.length === 0) {
      titulo.textContent = "Cidade não encontrada";
      return;
    }

    buscarPrevisaoOpenMeteo(resultados[0]);
  } catch (error) {
    console.error(error);
    titulo.textContent = "Erro ao buscar cidade.";
  }
}

/* ==========================================================================
   Ouvintes de Eventos (Event Listeners)
   ========================================================================== */

let timeoutId;
inputEl.addEventListener("input", () => {
  clearTimeout(timeoutId);
  const valor = inputEl.value.trim();
  suggestions.innerHTML = "";
  if (!valor || valor.length < 3) return; 

  timeoutId = setTimeout(async () => {
    try {
      const filtrados = await obterCidadesDaAPI(valor);
      suggestions.innerHTML = "";

      filtrados.slice(0, 6).forEach(c => {
        const item = document.createElement("div");
        
        let regiaoFiltro = c.regiao;
        if (regiaoFiltro.toLowerCase().startsWith("state of ")) {
          regiaoFiltro = regiaoFiltro.substring(9);
        }

        const localizacao = regiaoFiltro ? `${c.nome}, ${regiaoFiltro}, ${c.pais}` : `${c.nome}, ${c.pais}`;
        item.textContent = localizacao;

        item.onclick = () => {
          inputEl.value = c.nome;
          suggestions.innerHTML = "";
          buscarPrevisaoOpenMeteo(c);
        };
        suggestions.appendChild(item);
      });
    } catch (e) {
      console.error(e);
    }
  }, 300);
});

document.addEventListener("click", (e) => {
  if (e.target !== inputEl) suggestions.innerHTML = "";
});

document.getElementById("btnBuscar").addEventListener("click", buscarCidade);
inputEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter") buscarCidade();
});

iniciar();