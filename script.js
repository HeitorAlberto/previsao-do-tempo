// A URL da API que você forneceu, armazenada em uma constante para fácil ajuste.
// Usamos o endpoint /v1/ensemble, que suporta todos os parâmetros listados.
const API_URL = "https://ensemble-api.open-meteo.com/v1/ensemble?latitude=-9.7811&longitude=-36.0936&daily=temperature_2m_mean,temperature_2m_min,temperature_2m_max,apparent_temperature_mean,apparent_temperature_min,apparent_temperature_max,wind_speed_10m_mean,wind_speed_10m_min,wind_speed_10m_max,wind_direction_10m_dominant,cloud_cover_max,cloud_cover_min,cloud_cover_mean,wind_direction_100m_dominant,wind_speed_100m_max,wind_speed_100m_min,wind_speed_100m_mean,wind_gusts_10m_max,wind_gusts_10m_min,wind_gusts_10m_mean,precipitation_sum,precipitation_hours,rain_sum,snowfall_sum,pressure_msl_mean,pressure_msl_min,pressure_msl_max,surface_pressure_mean,surface_pressure_min,surface_pressure_max,shortwave_radiation_sum,dew_point_2m_max,et0_fao_evapotranspiration,dew_point_2m_min,cape_max,dew_point_2m_mean,cape_min,cape_mean,relative_humidity_2m_max,relative_humidity_2m_min,relative_humidity_2m_mean&models=ecmwf_aifs025&timezone=auto&forecast_days=30";

// Elementos HTML onde os cards serão inseridos.
const previsaoContainer = document.getElementById('previsao-container');
const acumuladoContainer = document.getElementById('acumulado-container');


// --- Função Auxiliar: Gera Descrição baseada em Nuvens e Chuva ---
/**
 * Cria uma descrição do tempo usando a cobertura de nuvens e a precipitação.
 * @param {number} cloudCoverMean - Porcentagem média de cobertura de nuvens.
 * @param {number} precipitationSum - Precipitação total do dia em mm.
 * @returns {string} Descrição em português.
 */
function gerarDescricaoTempo(cloudCoverMean, precipitationSum) {
    if (precipitationSum > 5.0) {
        return "Chuva Forte Prevista";
    } else if (precipitationSum > 0.5) {
        return "Pancadas de Chuva";
    }

    if (cloudCoverMean < 20) {
        return "Céu Limpo e Ensolarado";
    } else if (cloudCoverMean < 60) {
        return "Parcialmente Nublado";
    } else {
        return "Geralmente Nublado";
    }
}


// --- Função Auxiliar: Cria o HTML de um Card Diário ---
/**
 * Cria a estrutura HTML para um card de previsão de um dia específico.
 * @param {object} daily - O objeto 'daily' com todas as listas de dados.
 * @param {number} index - O índice do dia na lista (0 é o primeiro dia).
 * @returns {string} O HTML do card como string.
 */
function criarCardDiario(daily, index) {
    const dataObj = new Date(daily.time[index]);
    
    // 1. Inclui o Dia da Semana na formatação da Data
    const dataFormatada = dataObj.toLocaleDateString('pt-BR', { 
        weekday: 'short', // Ex: Qui, Sex
        day: '2-digit', 
        month: '2-digit' 
    });
    
    // 2. Cria a Descrição do Tempo
    const precipitacao = daily.precipitation_sum[index];
    const descricaoTempo = gerarDescricaoTempo(nuvens, precipitacao);

    // Extrai os outros dados
    const tempMax = daily.temperature_2m_max[index].toFixed(1); // 1 casa decimal
    const tempMin = daily.temperature_2m_min[index].toFixed(1);
    const precipitacaoFormatada = precipitacao.toFixed(0); // 2 casas decimais

    return `
        <div class="card">
            <h3>${dataFormatada}</h3>
            <p><strong>Condição:</strong> ${descricaoTempo}</p>
            <p><strong>Máx:</strong> ${tempMax}°C</p>
            <p><strong>Mín:</strong> ${tempMin}°C</p>
            <p><strong>Chuva:</strong> ${precipitacaoFormatada} mm</p>
            <p><strong>Vento:</strong> ${daily.wind_speed_10m_mean[index].toFixed(1)} km/h</p>
        </div>
    `;
}

// --- Função Auxiliar: Cria o HTML do Card Acumulado ---
/**
 * Cria a estrutura HTML para o card de resumo dos 30 dias.
 * @param {number} totalPrecipitacao - A soma total da precipitação.
 * @param {number} totalDias - O número total de dias (30).
 * @returns {string} O HTML do card como string.
 */
function criarCardAcumulado(totalPrecipitacao, totalDias) {
    const totalFormatado = totalPrecipitacao.toFixed(2);
    
    return `
        <div class="card-acumulado">
            <h2>Acumulado Total (${totalDias} Dias)</h2>
            <p>${totalFormatado} mm</p>
            <p style="font-size: 1.2em;">Total de Chuva Prevista</p>
        </div>
    `;
}


// --- Função Principal: Busca e Processamento dos Dados ---
async function carregarPrevisao() {
    console.log("Iniciando a busca de dados da API...");

    try {
        // 1. Busca de Dados
        const response = await fetch(API_URL);
        
        // Verifica se a resposta foi bem-sucedida (status 200)
        if (!response.ok) {
            // Se o erro 400 persistir, será devido a algum conflito com o modelo 'ecmwf_aifs025' e a região.
            throw new Error(`Erro na API: Status ${response.status}. Tente simplificar mais variáveis na URL se o problema persistir.`);
        }
        
        const data = await response.json();
        console.log("Dados recebidos e processados.");

        // O objeto 'daily' contém todas as listas de dados.
        const daily = data.daily;
        const totalDias = daily.time.length;

        // Limita a exibição dos cards aos primeiros 15 dias
        const diasParaExibir = Math.min(15, totalDias);

        // --- 2. Criação dos Cards (15 Dias) ---
        for (let i = 0; i < diasParaExibir; i++) {
            // Chamamos a função auxiliar para criar o HTML do card
            const cardHTML = criarCardDiario(daily, i);
            previsaoContainer.innerHTML += cardHTML;
        }

        // --- 3. Cálculo e Criação do Card Acumulado (30 Dias) ---
        // A API fornece 30 dias, então somamos toda a lista 'precipitation_sum'
        const acumulado30Dias = daily.precipitation_sum.reduce((total, valor) => total + valor, 0);

        // Chamamos a função auxiliar para criar o HTML do card de acumulado
        const acumuladoCardHTML = criarCardAcumulado(acumulado30Dias, totalDias);
        acumuladoContainer.innerHTML = acumuladoCardHTML;

    } catch (error) {
        // Exibe uma mensagem de erro na tela se algo der errado
        console.error("Erro ao carregar a previsão:", error);
        previsaoContainer.innerHTML = `<p style="color: red; padding: 20px;">Não foi possível carregar os dados. Detalhe do erro: ${error.message}</p>`;
    }
}

// Chama a função principal para iniciar o carregamento dos dados quando o script for executado.
carregarPrevisao();