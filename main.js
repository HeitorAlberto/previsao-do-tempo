import { normalizarTexto } from './utils.js';
import { fetchPrevisao, processarDadosPrevisao, buscarCidadesAPI, formatarLocalizacao } from './api.js';
import { renderizarHistoricoUI, renderizarCidadeUI } from './ui.js';

// Estado global da aplicação
let historico = JSON.parse(localStorage.getItem("historico")) || [];
let carregando = false;
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
  renderizarHistoricoUI(historico, buscarPrevisaoOpenMeteo);
}

function atualizarHistorico(cidadeObjeto) {
  if (!cidadeObjeto || !cidadeObjeto.nome) return;

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

  if (typeof city === "string" || !city.latitude || !city.longitude) {
    const termoBusca = typeof city === "string" ? city : city.nome;
    titulo.textContent = "⏳ Buscando dados do histórico...";
    const resultados = await buscarCidadesAPI(termoBusca);
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
    
    renderizarCidadeUI(dadosPrevisaoGlobais, 0, atualizarHistorico);

  } catch (e) {
    console.error(e);
    titulo.textContent = "Erro na previsão.";
  } finally {
    carregando = false;
  }
}

/**
 * Processa o clique do botão de busca ou tecla Enter
 */
async function buscarCidade() {
  const termo = inputEl.value.trim();
  if (!termo) return;

  titulo.textContent = "⏳ Buscando...";
  try {
    const resultados = await buscarCidadesAPI(termo);
    
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
      const filtrados = await buscarCidadesAPI(valor);
      suggestions.innerHTML = "";

      filtrados.slice(0, 6).forEach(c => {
        const item = document.createElement("div");
        
        item.textContent = formatarLocalizacao(c);

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