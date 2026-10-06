//Faz requisições HTTP para a API do Open-Meteo (geocodificação e previsão do tempo) e gerencia o cache no localStorage.

// Não mexe em elementos visuais.

export async function fetchLocations(query) {
    const response = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=5&language=pt&format=json`);
    const data = await response.json();
    return data.results || [];
}

export async function fetchWeatherData(lat, lon) {
    const now = new Date();
    const cycleHour = [0, 6, 12, 18].reverse().find(h => now.getUTCHours() >= h) || 0;
    const cacheKey = `ecmwf_cache_${lat}_${lon}_${now.getUTCFullYear()}-${now.getUTCMonth()}-${now.getUTCDate()}_${cycleHour}`;

    Object.keys(localStorage).forEach(key => {
        if (key.startsWith(`ecmwf_cache_${lat}_${lon}_`) && key !== cacheKey) localStorage.removeItem(key);
    });

    const cachedData = localStorage.getItem(cacheKey);
    if (cachedData) return JSON.parse(cachedData);

    // 🚀 Adicionado 'sunrise,sunset' nos parâmetros diários para o cálculo correto de dia/noite
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,wind_gusts_10m_max,sunrise,sunset&hourly=temperature_2m,precipitation,wind_gusts_10m,cloudcover,weathercode&models=ecmwf_ifs&timezone=auto&forecast_days=10`;
    
    const response = await fetch(url);
    const data = await response.json();
    
    localStorage.setItem(cacheKey, JSON.stringify(data));
    return data;
}