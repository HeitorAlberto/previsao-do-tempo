import { weatherCodeMap } from "./weather_code_map.js";

export function exibir_dados_openMeteo(dados_openMeteo) {
    
    const base = document.querySelector("#opmmm-column-now"); 
    
    if (!base) return;

    base.innerHTML = "";

    if (!dados_openMeteo || !dados_openMeteo.current) {
        base.textContent = "Nenhum dado disponível";
        return;
    }

    // Exibe dados atuais
    const { temperature_2m, wind_speed_10m, wind_gusts_10m, weather_code, apparent_temperature, cloud_cover, relative_humidity_2m } = dados_openMeteo.current;
    
    const descricaoAtual = weatherCodeMap[weather_code] || "❓ Desconhecido";

    base.innerHTML = `
        <div>
            <p>ℹ️ ${descricaoAtual}</p>
            <p>☁️ Cobertura de nuvens: ${Number(cloud_cover).toFixed(0)}%</p>
            <p>🌡️ Temperatura: ${Number(temperature_2m).toFixed(0)}°C</p>
            <p>🌡️ Sensação térmica: ${Number(apparent_temperature).toFixed(0)}°C</p>
            <p>💧 Umidade do ar: ${Number(relative_humidity_2m).toFixed(0)}%</p>
            <p>🍃 Vento: ${Number(wind_speed_10m).toFixed(0)} km/h</p>
            <p>🍃 Rajadas de vento: ${Number(wind_gusts_10m).toFixed(0)} km/h</p>
        </div>
    `;

    // Exibe dados dia a dia
    const base_diaria = document.querySelector("#opmmm-column");
    
    if (!base_diaria) return;
    
    base_diaria.innerHTML = "";

    // Função auxiliar: soma (chuva) ou média (nuvens)
    function calcularPeriodo(arrayHoras, diaIndex, tipo = "soma") {
        
        const periodos = { madrugada: 0, manha: 0, tarde: 0, noite: 0 };
        
        const contagem = { madrugada: 0, manha: 0, tarde: 0, noite: 0 };
        
        const startHour = diaIndex * 24;
        
        for (let h = 0; h < 24; h++) {
            const valor = Number(arrayHoras[startHour + h]) || 0;
            let periodo;
            if (h >= 0 && h <= 5) periodo = "madrugada";
            else if (h >= 6 && h <= 11) periodo = "manha";
            else if (h >= 12 && h <= 17) periodo = "tarde";
            else periodo = "noite";

            if (tipo === "soma") {
                periodos[periodo] += valor;
            } else {
                periodos[periodo] += valor;
                contagem[periodo]++;
            }
        }

        if (tipo === "media") {
            for (let p in periodos) {
                periodos[p] = contagem[p] ? periodos[p] / contagem[p] : 0;
            }
        }

        return periodos;
    }

    // Função para probabilidade de chuva por período (máximo)
    function calcularProbabilidadePeriodo(arrayHoras, diaIndex) {
        
        const periodos = { madrugada: 0, manha: 0, tarde: 0, noite: 0 };
        
        const startHour = diaIndex * 24;
        
        for (let h = 0; h < 24; h++) {
            const valor = Number(arrayHoras[startHour + h]) || 0;
            if (h >= 0 && h <= 5) periodos.madrugada = Math.max(periodos.madrugada, valor);
            else if (h >= 6 && h <= 11) periodos.manha = Math.max(periodos.manha, valor);
            else if (h >= 12 && h <= 17) periodos.tarde = Math.max(periodos.tarde, valor);
            else periodos.noite = Math.max(periodos.noite, valor);
        }
        
        return periodos;
    }

    for (let i = 0; i < dados_openMeteo.daily.time.length; i++) {
        
        const codigoMaisFrequente = dados_openMeteo.daily.weather_code[i]; 
        
        const descricao = weatherCodeMap[codigoMaisFrequente] || "❓ Desconhecido";

        const dataParts = dados_openMeteo.daily.time[i].split("-");
        
        const data = new Date(Date.UTC(
            parseInt(dataParts[0]),
            parseInt(dataParts[1]) - 1,
            parseInt(dataParts[2])
        ));

        const dia = String(data.getUTCDate()).padStart(2, "0");
        
        const mes = String(data.getUTCMonth() + 1).padStart(2, "0");

        let nomeDia;
        
        if (i === 0) {
            nomeDia = "Hoje";
        } else {
            const diaSemana = data.toLocaleDateString("pt-BR", { weekday: "long", timeZone: "UTC" });
            nomeDia = diaSemana.charAt(0).toUpperCase() + diaSemana.slice(1);
        }

        const dataFormatada = `${nomeDia}, ${dia}/${mes}`;

        const card = document.createElement("div");
        card.classList.add("card-diario");

        // Calcula chuva e nuvens por período
        const chuvaPeriodo = calcularPeriodo(dados_openMeteo.hourly.precipitation, i, "soma");
        const nuvensPeriodo = calcularPeriodo(dados_openMeteo.hourly.cloud_cover, i, "media");
        const probChuvaPeriodo = calcularProbabilidadePeriodo(dados_openMeteo.hourly.precipitation_probability, i);

        card.innerHTML = `
            <h3>${dataFormatada}</h3>
            <p id="condicao-diaria" style="border: 1px solid black">ℹ️ ${descricao}</p>

            <p style="background-color:#ffe0b3;"><b>🌡️ Temperatura:</b>
                ${Number(dados_openMeteo.daily.temperature_2m_min[i]).toFixed(0)}° a ${Number(dados_openMeteo.daily.temperature_2m_max[i]).toFixed(0)}°
            </p>

            <p style="background-color:#ffe0b3;"><b>🌡️ Sensação térmica: </b>
                ${Number(dados_openMeteo.daily.apparent_temperature_min[i]).toFixed(0)}° a ${Number(dados_openMeteo.daily.apparent_temperature_max[i]).toFixed(0)}°
            </p>

            <p style="background-color:#e0f0ff;"><b>☔ Chuva em 24h:</b>
                ${Number(dados_openMeteo.daily.precipitation_sum[i]).toFixed(0)} mm
            </p>

            <p style="background-color:#e0f0ff;"><b>☔ Chuva em 6h:</b>
                [${chuvaPeriodo.madrugada.toFixed(0)} mm]
                [${chuvaPeriodo.manha.toFixed(0)} mm]
                [${chuvaPeriodo.tarde.toFixed(0)} mm]
                [${chuvaPeriodo.noite.toFixed(0)} mm] 
            </p>

            <p style="background-color:#e0f0ff;"><b>☔ Probabilidade em 6h:</b> 
                [${probChuvaPeriodo.madrugada.toFixed(0)}%]
                [${probChuvaPeriodo.manha.toFixed(0)}%]
                [${probChuvaPeriodo.tarde.toFixed(0)}%]
                [${probChuvaPeriodo.noite.toFixed(0)}%]
            </p>

            <p style="background-color:#e0f0ff;"><b>☁️ Qtd. Nuvens em 6h:</b> 
                [${nuvensPeriodo.madrugada.toFixed(0)}%]
                [${nuvensPeriodo.manha.toFixed(0)}%]
                [${nuvensPeriodo.tarde.toFixed(0)}%]
                [${nuvensPeriodo.noite.toFixed(0)}%] 
            </p>

            <p style="background-color:#e0f0ff;"><b>💧 Umidade do ar:</b> 
                
                ${Number(dados_openMeteo.daily.relative_humidity_2m_min[i]).toFixed(0)}% a ${Number(dados_openMeteo.daily.relative_humidity_2m_max[i]).toFixed(0)}%
            </p>

            <p style="background-color:#ffe0b3;"><b>☀️ Índice UV máximo: </b>
                ${Number(dados_openMeteo.daily.uv_index_max[i]).toFixed(0)}
            </p>

            <p style="background-color:#d4edda;"><b>🍃 Vento máximo: </b>
                ${Number(dados_openMeteo.daily.wind_speed_10m_max[i]).toFixed(0)} km/h
            </p>

            <p style="background-color:#d4edda;"><b>🍃 Rajadas máximas: </b>
                ${Number(dados_openMeteo.daily.wind_gusts_10m_max[i]).toFixed(0)} km/h
            </p>
        `;



        base_diaria.appendChild(card);
    }
}
