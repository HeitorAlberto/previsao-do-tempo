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
    const { temperature_2m, wind_speed_10m, wind_gusts_10m, weather_code } = dados_openMeteo.current;
    
    const descricaoAtual = weatherCodeMap[weather_code] || "❓ Desconhecido";

    base.innerHTML = `
        <div>
            <p>${descricaoAtual}</p>
            <p>🌡️ Temperatura agora: ${temperature_2m}°C</p>
            <p>💨 Vento: ${wind_speed_10m} km/h</p>
            <p>💨 Rajadas de vento: ${wind_gusts_10m} km/h</p>
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
            <p>${descricao}</p>
            <p>🌡️ Temperatura Mínima: ${dados_openMeteo.daily.temperature_2m_min[i]} °C</p>
            <p>🌡️ Temperatura Máxima: ${dados_openMeteo.daily.temperature_2m_max[i]} °C</p>
            <p>💨 Vento Máximo: ${dados_openMeteo.daily.wind_speed_10m_max[i]} km/h</p>
            <p>🍃 Rajada de Vento Máxima: ${dados_openMeteo.daily.wind_gusts_10m_max[i]} km/h</p>
            <p>🌧️ Chuva acumulada: ${dados_openMeteo.daily.precipitation_sum[i]} mm</p>
        `;

        base_diaria.appendChild(card);
    }
}
