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
            <p>🌫️ Cobertura de nuvens: ${Number(cloud_cover).toFixed(0)}%</p>
            <p>🌡️ Temperatura: ${Number(temperature_2m).toFixed(0)}°C</p>
            <p>🌡️ Sensação térmica: ${Number(apparent_temperature).toFixed(0)}°C</p>
            <p>💧 Umidade relativa do ar: ${Number(relative_humidity_2m).toFixed(0)}%</p>
            <p>🍃 Vento: ${Number(wind_speed_10m).toFixed(0)} km/h</p>
            <p>🍃 Rajadas de vento: ${Number(wind_gusts_10m).toFixed(0)} km/h</p>
        </div>
    `;

    // Exibe dados dia a dia
    const base_diaria = document.querySelector("#opmmm-column");
    
    if (!base_diaria) return;
    
    base_diaria.innerHTML = "";

    for (let i = 0; i < dados_openMeteo.daily.time.length; i++) {
        
        const codigoMaisFrequente = dados_openMeteo.daily.weather_code[i]; 
        const descricao = weatherCodeMap[codigoMaisFrequente] || "❓ Desconhecido";

        // Cria a data em UTC
        const dataParts = dados_openMeteo.daily.time[i].split("-"); // ["YYYY","MM","DD"]
        const data = new Date(Date.UTC(
            parseInt(dataParts[0]),
            parseInt(dataParts[1]) - 1,
            parseInt(dataParts[2])
        ));

        // Formata dia e mês
        const dia = String(data.getUTCDate()).padStart(2, "0");
        const mes = String(data.getUTCMonth() + 1).padStart(2, "0");

        // Define se é "Hoje" ou o nome do dia
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

        card.innerHTML = `
            <h3>${dataFormatada}</h3>
            <p>ℹ️ ${descricao}</p>
            <p>🌡️ Temperatura: ${Number(dados_openMeteo.daily.temperature_2m_min[i]).toFixed(0)}° a ${Number(dados_openMeteo.daily.temperature_2m_max[i]).toFixed(0)}°</p>
            <p>🌡️ Sensação Térmica: ${Number(dados_openMeteo.daily.apparent_temperature_min[i]).toFixed(0)}° a ${Number(dados_openMeteo.daily.apparent_temperature_max[i]).toFixed(0)}°</p>
            <p>🍃 Vento Máximo: ${Number(dados_openMeteo.daily.wind_speed_10m_max[i]).toFixed(0)} km/h</p>
            <p>🍃 Rajada de Vento Máxima: ${Number(dados_openMeteo.daily.wind_gusts_10m_max[i]).toFixed(0)} km/h</p>
            <p>☔ Chuva acumulada: ${Number(dados_openMeteo.daily.precipitation_sum[i]).toFixed(0)} mm</p>
            <p>☔ Possibilidade de chuva: ${Number(dados_openMeteo.daily.precipitation_probability_max[i]).toFixed(0)}%</p>
        `;

        base_diaria.appendChild(card);
    }
}
