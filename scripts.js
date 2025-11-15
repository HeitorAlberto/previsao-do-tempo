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

const cloudCategory = v => {
    if (v <= 10) return 'Limpo';
    if (v <= 30) return 'Poucas Nuvens';
    if (v <= 60) return 'Parcialmente Nublado';
    if (v <= 90) return 'Nublado';
    return 'Encoberto';
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
// NOVA FUNÇÃO: nuvens + chuva + trovoadas
// =========================================================
function getCloudDescriptions(dayPoints) {

    const CATEGORY_ORDER = ['Limpo', 'Poucas Nuvens', 'Parcialmente Nublado', 'Nublado', 'Encoberto'];
    const DESC_MAP = {
        'Limpo': 'céu limpo',
        'Poucas Nuvens': 'poucas nuvens',
        'Parcialmente Nublado': 'parcialmente nublado',
        'Nublado': 'céu nublado',
        'Encoberto': 'céu encoberto'
    };

    const isThunder = w => w === 95 || w === 96 || w === 99;

    const rainLevel = mm =>
        mm < 1 ? null :
            mm < 5 ? 'chuva fraca' :
                mm < 15 ? 'chuva moderada' :
                    'chuva forte';

    const period = { dawn: [], morning: [], afternoon: [], night: [] };

    const pushPeriod = (list, p) => {
        list.push({
            cloud: p.cloud_cover ?? 0,
            rain: p.precipitation ?? 0,
            w: p.weather_code
        });
    };

    // Coleta por período (somente o próprio dia)
    dayPoints.forEach(p => {
        const h = new Date(p.time).getHours();

        if (h < 6) pushPeriod(period.dawn, p);              // MADRUGADA do próprio dia
        else if (h < 12) pushPeriod(period.morning, p);     // Manhã
        else if (h < 18) pushPeriod(period.afternoon, p);   // Tarde
        else pushPeriod(period.night, p);                   // Noite
    });

    const getPeriodCat = arr => {
        if (!arr || arr.length === 0) return null;
        const count = {};
        arr.forEach(o => {
            const v = o.cloud;
            const c =
                v <= 10 ? 'Limpo' :
                    v <= 30 ? 'Poucas Nuvens' :
                        v <= 60 ? 'Parcialmente Nublado' :
                            v <= 90 ? 'Nublado' :
                                'Encoberto';
            count[c] = (count[c] || 0) + 1;
        });
        return Object.entries(count)
            .sort(([aKey, a], [bKey, b]) => {
                if (a !== b) return b - a;
                return CATEGORY_ORDER.indexOf(bKey) - CATEGORY_ORDER.indexOf(aKey);
            })[0][0];
    };

    const getRain = arr => {
        const total = arr.reduce((sum, o) => sum + o.rain, 0);
        return rainLevel(total);
    };

    const getThunder = arr => arr.some(o => isThunder(o.w));

    const buildDescription = (cat, arr) => {
        const chuva = getRain(arr);
        const trovoada = getThunder(arr);

        if (trovoada && chuva) return `${chuva} com trovoadas`;
        if (trovoada) return `trovoadas isoladas`;
        if (chuva) return `${DESC_MAP[cat]} / ${chuva}`;
        return DESC_MAP[cat] || 'Dados indisponíveis';
    };

    return {
        madrugada: buildDescription(getPeriodCat(period.dawn), period.dawn),
        manha: buildDescription(getPeriodCat(period.morning), period.morning),
        tarde: buildDescription(getPeriodCat(period.afternoon), period.afternoon),
        noite: buildDescription(getPeriodCat(period.night), period.night),
    };
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
        const nextDay = entries[index + 1] ? entries[index + 1][1] : null;
        const descriptions = getCloudDescriptions(points, nextDay);

        const card = document.createElement('div');
        card.className = 'day';
        card.innerHTML = `
                <div class="date">${labels.date} • ${labels.weekday}</div>

                <div class="row temp"><p>Temperatura (°C)</p><p>${isFinite(s.tMin) ? s.tMin.toFixed(0) : '-'}° a ${isFinite(s.tMax) ? s.tMax.toFixed(0) : '-'}°</p></div>
                <div class="row precip"><p>Chuva</p><p>${s.precipSum.toFixed(1)} mm</p></div>
                <div class="row humidity"><p>Umidade</p><p>${isFinite(s.rhMin) ? s.rhMin.toFixed(0) : '-'}% a ${isFinite(s.rhMax) ? s.rhMax.toFixed(0) : '-'}%</p></div>
                <div class="row wind"><p>Rajadas de vento</p><p>${s.gustMax.toFixed(0)} km/h</p></div>

                <div class="descricao-nuvens"><p><strong>Madrugada:</strong> ${descriptions.madrugada}</p></div>
                <div class="descricao-nuvens"><p><strong>Manhã:</strong> ${descriptions.manha}</p></div>
                <div class="descricao-nuvens"><p><strong>Tarde:</strong> ${descriptions.tarde}</p></div>
                <div class="descricao-nuvens"><p><strong>Noite:</strong> ${descriptions.noite}</p></div>
                

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
