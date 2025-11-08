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

// Overlay para detalhes
const overlay = document.createElement('div');
overlay.id = 'detailsOverlay';
overlay.className = 'overlay';
document.body.appendChild(overlay);

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
    cloud_cover: hourly.cloud_cover || [],
    wind_gusts_10m: hourly.wind_gusts_10m || [],
    weathercode: hourly.weathercode || []
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

const groupByPeriod = points => ({
    madrugada: points.filter(p => new Date(p.time).getHours() < 6),
    manha: points.filter(p => { const h = new Date(p.time).getHours(); return h >= 6 && h < 12; }),
    tarde: points.filter(p => { const h = new Date(p.time).getHours(); return h >= 12 && h < 18; }),
    noite: points.filter(p => new Date(p.time).getHours() >= 18)
});

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
    const clouds = { madrugada: [], manha: [], tarde: [], noite: [] };
    const summary = points.reduce((acc, p) => {
        const hour = new Date(p.time).getHours();
        acc.tMin = Math.min(acc.tMin, p.temperature_2m ?? acc.tMin);
        acc.tMax = Math.max(acc.tMax, p.temperature_2m ?? acc.tMax);
        acc.rhMin = Math.min(acc.rhMin, p.relative_humidity_2m ?? acc.rhMin);
        acc.rhMax = Math.max(acc.rhMax, p.relative_humidity_2m ?? acc.rhMax);
        acc.precipSum += p.precipitation ?? 0;
        acc.gustMax = Math.max(acc.gustMax, p.wind_gusts_10m ?? 0);
        if (p.cloud_cover != null) {
            if (hour < 6) clouds.madrugada.push(p.cloud_cover);
            else if (hour < 12) clouds.manha.push(p.cloud_cover);
            else if (hour < 18) clouds.tarde.push(p.cloud_cover);
            else clouds.noite.push(p.cloud_cover);
        }
        return acc;
    }, { tMin: Infinity, tMax: -Infinity, rhMin: Infinity, rhMax: -Infinity, precipSum: 0, gustMax: 0 });
    summary.clouds = Object.fromEntries(Object.entries(clouds).map(([k, v]) => [k, predominantCategory(v)]));
    return summary;
};

const rainDescription = mm => mm < 1 ? 'Sem chuva' : mm < 5 ? 'Chuva leve' : mm < 15 ? 'Chuva moderada' : 'Chuva forte';
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

    const now = new Date();
    entries.forEach(([day, points]) => {
        const labels = formatDateLabel(day + 'T00:00:00');
        const s = summarizeDay(points);
        const storm = points.some(p => [95, 96, 99].includes(p.weathercode));

        const card = document.createElement('div');
        card.className = 'day';
        card.innerHTML = `
            <div class="date">${labels.date} • ${labels.weekday}</div>
            <div class="row temp"><p>Temperatura (°C)</p><p>${isFinite(s.tMin) ? s.tMin.toFixed(0) : '-'}° a ${isFinite(s.tMax) ? s.tMax.toFixed(0) : '-'}°</p></div>
            <div class="row precip"><p>Chuva</p><p>${s.precipSum.toFixed(1)} mm</p></div>
            <div class="row humidity"><p>Umidade</p><p>${isFinite(s.rhMin) ? s.rhMin.toFixed(0) : '-'}% a ${isFinite(s.rhMax) ? s.rhMax.toFixed(0) : '-'}%</p></div>
            <div class="row wind"><p>Rajadas de vento</p><p>${s.gustMax.toFixed(0)} km/h</p></div>
            ${storm ? `<div class="row" style="color:red;"><p>Risco de tempestades</p></div>` : ''}
            <div style="text-align:center;margin-top:10px;">
                <button class="detail-btn" style="background:#000;color:#fff;border-radius:8px;padding:10px 14px;cursor:pointer;">Detalhes por hora</button>
            </div>
        `;
        card.querySelector('.detail-btn').addEventListener('click', () => showOverlay(day, points, labels, now));
        cardsEl.appendChild(card);
    });

    cityInput.value = '';
};

const showOverlay = (day, points, labels, now) => {
    overlay.innerHTML = '';
    overlay.classList.add('active');
    if (window.innerWidth > 768) document.body.style.overflow = 'hidden';

    const header = document.createElement('div');
    header.className = 'overlay-header';
    const h2 = document.createElement('h2');
    h2.textContent = `${labels.date} • ${labels.weekday}`;
    const locationNameOverlay = locationName.innerText;
    const backBtn = document.createElement('button');
    backBtn.textContent = 'Voltar';
    backBtn.addEventListener('click', () => {
        overlay.classList.remove('active');
        if (window.innerWidth > 768) document.body.style.overflow = '';
    });
    header.append(locationNameOverlay, h2, backBtn);
    overlay.appendChild(header);

    // 🔹 Dicionário com descrições dos weather codes (Open-Meteo)
    const weatherDescriptions = {
        0: 'Céu limpo',
        1: 'Principalmente limpo',
        2: 'Parcialmente nublado',
        3: 'Nublado',
        45: 'Nevoeiro',
        48: 'Nevoeiro com gelo',
        51: 'Garoa leve',
        53: 'Garoa moderada',
        55: 'Garoa densa',
        56: 'Garoa congelante leve',
        57: 'Garoa congelante densa',
        61: 'Chuva leve',
        63: 'Chuva moderada',
        65: 'Chuva forte',
        66: 'Chuva congelante leve',
        67: 'Chuva congelante forte',
        71: 'Neve leve',
        73: 'Neve moderada',
        75: 'Neve intensa',
        77: 'Grãos de neve',
        80: 'Pancadas de chuva leves',
        81: 'Pancadas de chuva moderadas',
        82: 'Pancadas de chuva fortes',
        85: 'Pancadas de neve leves',
        86: 'Pancadas de neve fortes',
        95: 'Tempestades',
        96: 'Tempestade com granizo leve',
        99: 'Tempestade com granizo forte'
    };

    const periodos = groupByPeriod(points);
    const grid = document.createElement('div');
    grid.className = 'grid-periods';
    let scrollToDiv = null;

    // 🔸 Mantém os mesmos blocos: madrugada, manhã, tarde, noite
    Object.entries(periodos).forEach(([key, arr]) => {
        const block = document.createElement('div');
        block.className = 'period-block';
        if (arr.length === 0) block.innerHTML += '<p style="text-align:center">Sem dados</p>';
        arr.forEach(p => {
            const h = new Date(p.time).getHours();
            const desc = weatherDescriptions[p.weathercode] || 'Desconhecido';
            const hourDiv = document.createElement('div');
            hourDiv.className = 'hour-item';
            if (day === now.toISOString().slice(0, 10) && h === now.getHours()) {
                hourDiv.style.backgroundColor = '#fffbd7ff';
                hourDiv.style.borderRadius = '8px';
                scrollToDiv = hourDiv;
            }
            hourDiv.innerHTML = `
                <p><strong>${String(h).padStart(2, '0')}h</strong></p>
                <p>${desc}</p>
            `;
            block.appendChild(hourDiv);
        });
        grid.appendChild(block);
    });
    overlay.appendChild(grid);
    if (scrollToDiv) setTimeout(() => scrollToDiv.scrollIntoView({ behavior: 'smooth', block: 'center' }), 200);
};



// =====================
// Fetch e Cache Integrado
// =====================
async function fetchForecast(lat, lon, timezone = 'auto') {
    const url = new URL(forecastBase);
    url.searchParams.set('latitude', lat);
    url.searchParams.set('longitude', lon);
    url.searchParams.set('hourly', 'temperature_2m,relative_humidity_2m,precipitation,cloud_cover,wind_gusts_10m,weathercode');
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
