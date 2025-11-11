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
    return `📌 ${city}${state ? ', ' + state : ''}${country ? ' - ' + country : ''}`;
};

const prepareHourlyArrays = hourly => ({
    temperature_2m: hourly.temperature_2m || [],
    relative_humidity_2m: hourly.relative_humidity_2m || [],
    precipitation: hourly.precipitation || [],
    wind_gusts_10m: hourly.wind_gusts_10m || [],
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

const predominantCategory = values => {
    const buckets = { clear: 0, few: 0, part: 0, mostly: 0, over: 0 };
    values.forEach(v => {
        if (v <= 10) buckets.clear++;
        else if (v <= 40) buckets.few++;
        else if (v <= 60) buckets.part++;
        else if (v <= 80) buckets.mostly++;
        else buckets.over++;
    });
    return Object.entries(buckets).sort((a, b) => b[1] - a[1])[0][0];
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
        return acc;
    }, { tMin: Infinity, tMax: -Infinity, rhMin: Infinity, rhMax: -Infinity, precipSum: 0, gustMax: 0 });

    return summary;
};

// =====================
// Nebulosidade (heurística simples)
// =====================
// inferência única com modo manual/auto
function inferNebulosidade(daySummary, options = {}) {
    // options.mode: 'auto' (padrão), 'coastal', 'interior', 'simple'
    const mode = options.mode || 'auto';
    const { tMin, tMax, rhMin, rhMax, precipSum, gustMax } = daySummary;
    const amp = isFinite(tMax) && isFinite(tMin) ? (tMax - tMin) : 999;

    // 1) detector simples de litoral (se mode === 'auto' decide perfil)
    let profile = 'general'; // general trata como neutro/universal
    if (mode === 'coastal' || mode === 'interior' || mode === 'simple') profile = mode;
    else {
        // auto: regras leves para inferir influência marítima
        // Se houver rajadas fortes OU rhMax muito alto comparado ao rhMin, assumimos influência costeira
        const strongGust = typeof gustMax === 'number' && gustMax >= 35;
        const humidPenetration = (typeof rhMax === 'number' && typeof rhMin === 'number')
            ? (rhMax >= 90 && (rhMax - rhMin) >= 20) // muita variação noturna -> mar pode estar "empurrando" umidade
            : false;
        if (strongGust || humidPenetration) profile = 'coastal';
        else profile = 'interior';
    }

    // 2) pesos por perfil (simples e explicáveis)
    const WEIGHTS = {
        general: { amp: [6, 9, 2, 1], rhDay: [75, 60, 2, 1], precip: [3, 0.5, 2, 1], rhNightBonus: [95, 0.5], gustBonus: [35, 1] },
        coastal: { amp: [6, 8, 2, 1], rhDay: [75, 60, 2, 1], precip: [3, 0.5, 2, 1], rhNightBonus: [90, 1.5], gustBonus: [35, 1] },
        interior: { amp: [6, 10, 2, 1], rhDay: [75, 60, 2, 1], precip: [3, 1, 2, 1], rhNightBonus: [85, 0.5], gustBonus: [40, 0.2] }
    };
    const w = WEIGHTS[profile] || WEIGHTS.general;

    // 3) cálculo do score (transparente)
    let score = 0;

    // amplitude: w.amp = [lim1, lim2, ptsIf<=lim1, ptsIf<=lim2]
    if (amp <= w.amp[0]) score += w.amp[2];
    else if (amp <= w.amp[1]) score += w.amp[3];

    // umidade diurna (usar rhMin quando disponível)
    if (typeof rhMin === 'number') {
        if (rhMin >= w.rhDay[0]) score += w.rhDay[2];
        else if (rhMin >= w.rhDay[1]) score += w.rhDay[3];
    }

    // precipitação
    if (precipSum >= w.precip[0]) score += w.precip[2];
    else if (precipSum >= w.precip[1]) score += w.precip[3];

    // bônus de umidade noturna (indicador de persistência/coastal)
    if (typeof rhMax === 'number' && typeof w.rhNightBonus[0] === 'number' && rhMax >= w.rhNightBonus[0]) {
        score += w.rhNightBonus[1];
    }

    // bônus de rajadas (se forte sinaliza penetração marítima)
    if (typeof gustMax === 'number' && gustMax >= w.gustBonus[0]) score += w.gustBonus[1];

    // 4) classificação final (clara)
    let categoria = 'baixa';
    if (score >= 4) categoria = 'alta';
    else if (score >= 2) categoria = 'média';

    const frases = {
        baixa: 'Poucas nuvens',
        média: 'Nebulosidade variável',
        alta: 'Predominantemente nublado'
    };

    // retorno detalhado pra debugging/integracao
    return {
        profile,     // 'coastal' | 'interior' | 'general'
        score: Number(score.toFixed(2)),
        categoria,
        frase: frases[categoria]
    };
}





const rainDescription = mm => mm < 1 ? '' : mm < 5 ? 'Chuva fraca' : mm < 15 ? 'Chuva moderada' : 'Chuva forte';
const cloudDescription = cat => ({ clear: 'Céu limpo', few: 'Poucas nuvens', part: 'Parcialmente nublado', mostly: 'Maioria nublado', over: 'Nublado' }[cat] || '-');

// =====================
// Cache (IndexedDB)
// =====================
const DB_NAME = 'WeatherCacheDB';
const STORE_NAME = 'forecasts';
const DB_VERSION = 1;

function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = e => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME))
                db.createObjectStore(STORE_NAME, { keyPath: 'key' });
            if (!db.objectStoreNames.contains('meta'))
                db.createObjectStore('meta', { keyPath: 'id' });
        };
        request.onsuccess = e => resolve(e.target.result);
        request.onerror = () => reject(request.error);
    });
}

async function setCacheItem(key, data) {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(data);
    return tx.complete;
}

async function getCacheItem(key) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const req = tx.objectStore(STORE_NAME).get(key);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

async function maybeClearCache() {
    const now = new Date();
    const h = now.getHours();
    const db = await openDB();
    const txMeta = db.transaction('meta', 'readwrite');
    const metaStore = txMeta.objectStore('meta');

    const req = metaStore.get('lastClear');
    req.onsuccess = async () => {
        const last = req.result ? new Date(req.result.time) : null;
        const mustClear =
            (h === 0 || h === 12 || h === 18) &&
            (!last || last.getHours() !== h || last.toDateString() !== now.toDateString());

        if (mustClear) {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            store.clear();
            metaStore.put({ id: 'lastClear', time: now.toISOString() });
            console.log('🧹 Cache IndexedDB limpo automaticamente.');
        }
    };
}
maybeClearCache();

function coordKey(lat, lon) {
    return `${lat.toFixed(2)},${lon.toFixed(2)}`;
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

    entries.forEach(([day, points]) => {
        const labels = formatDateLabel(day + 'T00:00:00');
        const s = summarizeDay(points);
        const nebulosidade = inferNebulosidade(s);

        const chuvaTexto = rainDescription(s.precipSum);

        const card = document.createElement('div');
        card.className = 'day';
        card.innerHTML = `
            <div class="date">${labels.date} • ${labels.weekday}</div>
            <div class="row clouds"><p>${nebulosidade.frase}</p></div>
            <div class="row temp"><p>Temperatura (°C)</p><p>${isFinite(s.tMin) ? s.tMin.toFixed(0) : '-'}° a ${isFinite(s.tMax) ? s.tMax.toFixed(0) : '-'}°</p></div>
            <div class="row precip"><p>Chuva</p><p>${s.precipSum.toFixed(1)} mm</p></div>
            <div class="row humidity"><p>Umidade</p><p>${isFinite(s.rhMin) ? s.rhMin.toFixed(0) : '-'}% a ${isFinite(s.rhMax) ? s.rhMax.toFixed(0) : '-'}%</p></div>
            <div class="row wind"><p>Rajadas de vento</p><p>${s.gustMax.toFixed(0)} km/h</p></div>
        `;
        cardsEl.appendChild(card);
    });

    cityInput.value = '';
};


// =====================
// Fetch e Cache Integrado
// =====================
async function fetchForecast(lat, lon, timezone = 'auto') {
    const url = new URL(forecastBase);
    url.searchParams.set('latitude', lat);
    url.searchParams.set('longitude', lon);
    url.searchParams.set('hourly', 'temperature_2m,relative_humidity_2m,precipitation,wind_gusts_10m');
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
    const key = coordKey(lat, lon);
    const now = Date.now();

    const cached = await getCacheItem(key);
    if (cached && now - cached.timestamp < 6 * 60 * 60 * 1000) {
        console.log('🗂️ Usando cache IndexedDB para', key);
        locationName.textContent = cached.locationName;
        renderDays(cached.dayMap);
        return;
    }

    locationName.textContent = 'Carregando...';
    const forecast = await fetchForecast(lat, lon);
    const dayMap = groupHourlyByDate(forecast.hourly.time, prepareHourlyArrays(forecast.hourly));
    renderDays(dayMap);

    let locName = 'Local desconhecido';
    try {
        const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&addressdetails=1`;
        const res = await fetch(url);
        const data = await res.json();
        locName = getAddressText(data.address || {});
        locationName.textContent = locName;
    } catch {
        locationName.textContent = locName;
    }

    await setCacheItem(key, {
        key,
        timestamp: now,
        dayMap: Array.from(dayMap.entries()),
        locationName: locName
    });
}

// =====================
// Eventos
// =====================
searchForm.addEventListener('submit', async e => {
    e.preventDefault();
    const q = cityInput.value.trim();
    if (!q) return;
    try { const { lat, lon } = await searchLocation(q); await loadForecast(lat, lon); }
    catch { locationName.textContent = 'Erro ao carregar'; }
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
