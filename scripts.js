// =====================
// Configurações e elementos
// =====================
const forecastBase = 'https://api.open-meteo.com/v1/forecast';
const model = 'ecmwf_ifs';
const cityInput = document.getElementById('cityInput');
const searchForm = document.getElementById('searchForm');
const locationName = document.getElementById('locationName');
const cardsEl = document.getElementById('cards');
const todayDate = document.getElementById('todayDate');
const forecastSection = document.getElementById('forecastSection');

// =====================
// Utilitários
// =====================
const formatDateLabel = iso => {
    const d = new Date(iso);
    return {
        weekday: new Intl.DateTimeFormat('pt-BR', { weekday: 'long' }).format(d),
        date: new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' }).format(d)
    };
};

const getAddressText = address => {
    const city = address.city || address.town || address.village || address.municipality || '';
    const state = address.state || '';
    const country = address.country || '';
    return `🗺️ ${city}${state ? ', ' + state : ''}`;
};

const prepareHourlyArrays = hourly => ({
    temperature_2m: hourly.temperature_2m || [],
    relative_humidity_2m: hourly.relative_humidity_2m || [],
    precipitation: hourly.precipitation || [],
    wind_gusts_10m: hourly.wind_gusts_10m || [],
    cloud_cover: hourly.cloud_cover || [],
    weather_code: hourly.weather_code || []
});

const groupHourlyByDate = (times, arrays) => {
    const map = new Map();
    for (let i = 0; i < times.length; i++) {
        const d = new Date(times[i]);
        const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        if (!map.has(day)) map.set(day, []);
        const point = {};
        for (const key in arrays) point[key] = arrays[key][i];
        point.time = times[i];
        map.get(day).push(point);
    }
    return map;
};

const summarizeDay = points => {
    const summary = points.reduce((acc, p) => {
        const hour = new Date(p.time).getHours();
        acc.tMin = Math.min(acc.tMin, p.temperature_2m ?? acc.tMin);
        acc.tMax = Math.max(acc.tMax, p.temperature_2m ?? acc.tMax);
        acc.rhMin = Math.min(acc.rhMin, p.relative_humidity_2m ?? acc.rhMin);
        acc.rhMax = Math.max(acc.rhMax, p.relative_humidity_2m ?? acc.rhMax);
        acc.precipSum += p.precipitation ?? 0;
        acc.gustMax = Math.max(acc.gustMax, p.wind_gusts_10m ?? 0);

        const cloud = p.cloud_cover ?? 0;
        if (hour >= 6 && hour < 18) {
            acc.cloudDay.push(cloud);
        } else {
            acc.cloudNight.push(cloud);
        }
        return acc;
    }, { tMin: Infinity, tMax: -Infinity, rhMin: Infinity, rhMax: -Infinity, precipSum: 0, gustMax: 0, cloudDay: [], cloudNight: [] });

    return summary;
};

// =========================================================
// CLASSIFICAÇÃO OFICIAL WMO — CHUVA / PANCADAS / TROVOADAS
// =========================================================
function getRainType(code) {
    if ((code >= 51 && code <= 57) || code === 61 || code === 80) return "chuva fraca";
    if (code === 63 || code === 81) return "chuva moderada";
    if (code === 65 || code === 82) return "chuva forte";
    return null;
}

function getShowerType(code) {
    if (code === 80) return "pancadas fracas";
    if (code === 81) return "pancadas moderadas";
    if (code === 82) return "pancadas fortes";
    return null;
}

function isThunder(code) {
    return code >= 95 && code <= 99;
}

function classifyFrequency(count) {
    return count >= 3 ? "frequente" : "pontual";
}

// Monta chuva/pancadas por período, considerando limiar diário
function getRainDescription(codes, totalPrecip) {
    if (totalPrecip < 0.9) return null; // Limite mínimo de chuva no dia

    const events = [];
    for (const c of codes) {
        const shower = getShowerType(c);
        const rain = getRainType(c);
        if (shower) events.push(shower);
        else if (rain) events.push(rain);
    }

    if (events.length === 0) return null;

    const strong = events.find(e => e.includes("forte"));
    const moderate = events.find(e => e.includes("moderada"));
    const weak = events.find(e => e.includes("fraca"));

    let dominant = strong || moderate || weak;
    const freq = classifyFrequency(events.length);
    return `${dominant} ${freq}`;
}

function getThunderDescription(codes) {
    const count = codes.filter(isThunder).length;
    if (count === 0) return null;
    return `trovoadas ${classifyFrequency(count)}`;
}

// Céu
function getSkyDescription(avgCloud) {
    if (avgCloud < 20) return "Céu limpo";
    if (avgCloud < 50) return "Parcialmente nublado";
    if (avgCloud < 85) return "Predominantemente nublado";
    return "Céu encoberto";
}

// Função principal dos períodos
function getCloudDescriptions(points) {
    const periods = {
        madrugada: points.filter(p => new Date(p.time).getHours() < 6),
        manhã: points.filter(p => new Date(p.time).getHours() >= 6 && new Date(p.time).getHours() < 12),
        tarde: points.filter(p => new Date(p.time).getHours() >= 12 && new Date(p.time).getHours() < 18),
        noite: points.filter(p => new Date(p.time).getHours() >= 18)
    };

    const descriptions = {};

    for (const [period, arr] of Object.entries(periods)) {
        if (arr.length === 0) {
            descriptions[period] = "Dados insuficientes";
            continue;
        }

        // Média de cobertura de nuvens
        const avgCloud = arr.reduce((a, b) => a + b.cloud_cover, 0) / arr.length;
        const sky = avgCloud < 20 ? `Céu limpo`
            : avgCloud < 50 ? `Algumas nuvens`
                : avgCloud < 85 ? `Predominantemente nublado`
                    : `Céu encoberto`;

        // Soma total de chuva no período
        const totalPrecip = arr.reduce((sum, p) => sum + (p.precipitation ?? 0), 0);

        // Determina intensidade da chuva baseada no acumulado
        let rain = null;
        if (totalPrecip >= 0.5 && totalPrecip < 5) rain = `chuva fraca`;
        else if (totalPrecip >= 5 && totalPrecip < 15) rain = "chuva moderada";
        else if (totalPrecip >= 15) rain = "chuva forte";

        // Determina frequência (pontual/frequente) baseado em horas com chuva
        if (rain) {
            const hoursWithRain = arr.filter(p => p.precipitation >= 0.5).length;
            const freq = hoursWithRain >= 3 ? "frequente" : "pontual";
            rain += ` ${freq}`;
        }

        // Trovoadas baseadas no weather code
        const hasThunder = arr.some(p => p.weather_code >= 95 && p.weather_code <= 99);
        const thunder = hasThunder ? `trovoadas ${arr.filter(p => p.weather_code >= 95 && p.weather_code <= 99).length >= 3 ? "frequentes" : "pontuais"}` : null;

        // Monta a descrição final
        const parts = [sky];
        if (rain) parts.push(rain);
        if (thunder) parts.push(thunder);

        descriptions[period] = parts.join(" / ");
    }

    return descriptions;
}


// =====================
// Renderização
// =====================
const renderSummaryCard = dayMap => {
    const existing = document.getElementById('summaryCard');
    if (existing) existing.remove();

    let totalPrecip = 0;
    for (const [day, points] of dayMap) {
        const s = summarizeDay(points);
        totalPrecip += s.precipSum;
    }

    const card = document.createElement('div');
    card.id = 'summaryCard';
    card.className = 'day';
    card.innerHTML = `
        <div class="row precip"><p>Chuva total (15 dias)</p><p>${totalPrecip.toFixed(1)} mm</p></div>
        `;
    forecastSection.parentNode.insertBefore(card, forecastSection);
};

const renderDays = dayMapInput => {
    const dayMap = dayMapInput instanceof Map ? dayMapInput : new Map(dayMapInput);
    cardsEl.innerHTML = '';
    const entries = Array.from(dayMap.entries()).slice(0, 15);
    renderSummaryCard(dayMap);

    entries.forEach(([day, points], index) => {
        const labels = formatDateLabel(day + 'T00:00:00');
        const s = summarizeDay(points);
        const descriptions = getCloudDescriptions(points, s.precipSum);

        const card = document.createElement('div');
        card.className = 'day';
        card.innerHTML = `
                <div class="date">${labels.date} • ${labels.weekday}</div>

                <div class="row temp"><p>Temperatura (°C)</p><p>${isFinite(s.tMin) ? s.tMin.toFixed(0) : '-'}° a ${isFinite(s.tMax) ? s.tMax.toFixed(0) : '-'}°</p></div>
                <div class="row precip"><p>Chuva</p><p>${s.precipSum.toFixed(1)} mm</p></div>
                <div class="row humidity"><p>Umidade</p><p>${isFinite(s.rhMin) ? s.rhMin.toFixed(0) : '-'}% a ${isFinite(s.rhMax) ? s.rhMax.toFixed(0) : '-'}%</p></div>
                <div class="row wind"><p>Rajadas de vento</p><p>${s.gustMax.toFixed(0)} km/h</p></div>

                <div class="descricao-nuvens"><p><strong>Madrugada <br></strong> ${descriptions.madrugada}</p></div>
                <div class="descricao-nuvens"><p><strong>Manhã <br></strong> ${descriptions.manhã}</p></div>
                <div class="descricao-nuvens"><p><strong>Tarde <br></strong> ${descriptions.tarde}</p></div>
                <div class="descricao-nuvens"><p><strong>Noite <br></strong> ${descriptions.noite}</p></div>
                `;
        cardsEl.appendChild(card);
    });

    cityInput.value = '';
};

// =====================
// Fetch (sem cache)
// =====================
async function fetchForecast(lat, lon, timezone = 'auto') {
    const url = new URL(forecastBase);
    url.searchParams.set('latitude', lat);
    url.searchParams.set('longitude', lon);
    url.searchParams.set('hourly', 'temperature_2m,relative_humidity_2m,precipitation,wind_gusts_10m,cloud_cover,weather_code');
    url.searchParams.set('models', model);
    url.searchParams.set('timezone', timezone);
    url.searchParams.set('forecast_days', '15');

    const res = await fetch(url);
    if (!res.ok) throw new Error('Erro ao buscar previsão');
    return res.json();
}

async function searchLocation(query) {
    const url = `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&q=${encodeURIComponent(query)}&limit=1`;
    const res = await fetch(url);
    const data = await res.json();
    if (!data[0]) throw new Error('Local não encontrado');
    const place = data[0];
    locationName.textContent = getAddressText(place.address || {});
    return { lat: parseFloat(place.lat), lon: parseFloat(place.lon) };
}

async function loadForecast(lat, lon) {
    locationName.textContent = 'Carregando...';

    const forecast = await fetchForecast(lat, lon);
    const dayMap = groupHourlyByDate(forecast.hourly.time, prepareHourlyArrays(forecast.hourly));

    renderDays(dayMap);

    try {
        const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&addressdetails=1`;
        const res = await fetch(url);
        const data = await res.json();
        locationName.textContent = getAddressText(data.address || {});
    } catch {
        locationName.textContent = 'Local desconhecido';
    }
}

// =====================
// Eventos
// =====================
searchForm.addEventListener('submit', async e => {
    e.preventDefault();
    const q = cityInput.value.trim();
    if (!q) return;
    try {
        const { lat, lon } = await searchLocation(q);
        await loadForecast(lat, lon);
    } catch {
        locationName.textContent = 'Erro ao carregar';
    }
});

document.getElementById('geoButton').addEventListener('click', () => {
    if (!navigator.geolocation) return alert('Geolocalização não suportada.');
    locationName.textContent = 'Obtendo localização...';
    navigator.geolocation.getCurrentPosition(
        pos => loadForecast(pos.coords.latitude, pos.coords.longitude).catch(() => locationName.textContent = 'Erro ao carregar'),
        () => locationName.textContent = 'Erro ao obter localização'
    );
});

// =====================
// Data atual
// =====================
const today = new Date();
todayDate.textContent = `${new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' }).format(today)} - ${new Intl.DateTimeFormat('pt-BR', { weekday: 'long' }).format(today)}`;
