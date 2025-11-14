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

// ➡️ MODIFICADO: Adicionando 'cloud_cover'
const prepareHourlyArrays = hourly => ({
    temperature_2m: hourly.temperature_2m || [],
    relative_humidity_2m: hourly.relative_humidity_2m || [],
    precipitation: hourly.precipitation || [],
    wind_gusts_10m: hourly.wind_gusts_10m || [],
    cloud_cover: hourly.cloud_cover || []
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

// ➡️ FUNÇÃO DE CLASSIFICAÇÃO: Retorna o tipo de nuvem.
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

        // Captura de nuvens
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

// ➡️ FUNÇÃO PRINCIPAL DE DESCRIÇÃO COM LÓGICA DE EMPATE (Inalterada)
function getCloudDescriptions(dayPoints, nextDayPoints) {
    // 1. Coleta os dados de cobertura de nuvens:
    const dayClouds = dayPoints.filter(p => new Date(p.time).getHours() >= 6 && new Date(p.time).getHours() < 18).map(p => p.cloud_cover);
    const todayNightClouds = dayPoints.filter(p => new Date(p.time).getHours() >= 18).map(p => p.cloud_cover);
    const nextDayMorningClouds = (nextDayPoints || []).filter(p => new Date(p.time).getHours() < 6).map(p => p.cloud_cover);
    const nightClouds = [...todayNightClouds, ...nextDayMorningClouds];

    // Mapeamento de categorias para descrição final
    const DESC_MAP = {
        'Limpo': 'Céu limpo',
        'Poucas Nuvens': 'Poucas nuvens',
        'Parcialmente Nublado': 'Parcialmente nublado',
        'Nublado': 'Maioria nublado',
        'Encoberto': 'Céu encoberto'
    };
    const CATEGORY_ORDER = ['Limpo', 'Poucas Nuvens', 'Parcialmente Nublado', 'Nublado', 'Encoberto'];

    // 2. Lógica de Moda e Desempate
    const getModeDescription = cloudValues => {
        if (cloudValues.length === 0) return 'Dados indisponíveis';

        const contagem = {}; // Contagem em termos das chaves: 'Limpo', 'Nublado', etc.
        cloudValues.forEach(v => {
            const cat = cloudCategory(v);
            contagem[cat] = (contagem[cat] || 0) + 1;
        });

        let maxHoras = 0;
        for (const horas of Object.values(contagem)) {
            if (horas > maxHoras) maxHoras = horas;
        }

        // 3. Identificar todas as categorias que empataram
        const categoriasDominantes = CATEGORY_ORDER.filter(cat => contagem[cat] === maxHoras);

        // 4. Regras de Retorno
        if (categoriasDominantes.length === 1) {
            // Apenas um vencedor: retorna a descrição simples
            return DESC_MAP[categoriasDominantes[0]];
        } else if (categoriasDominantes.length > 1) {
            // Empate: Combina as duas categorias mais extremas em termos de nuvens
            const primeira = DESC_MAP[categoriasDominantes[0]]; // A menos nublada (por ordem de CATEGORY_ORDER)
            const ultima = DESC_MAP[categoriasDominantes[categoriasDominantes.length - 1]]; // A mais nublada

            // Desempate com Descrição Mista
            if (categoriasDominantes.length === 2 && maxHoras >= 4) {
                return `Variando entre ${primeira.toLowerCase()} e ${ultima.toLowerCase()}.`;
            } else {
                // Se houver empate triplo ou mais, retorna a mais otimista com ressalva
                return `${primeira} (Condição Mista)`;
            }
        }

        return 'Dados indisponíveis';
    };

    return {
        dia: getModeDescription(dayClouds),
        noite: getModeDescription(nightClouds)
    };
}


const rainDescription = mm => mm < 1 ? '' : mm < 5 ? 'Chuva fraca' : mm < 15 ? 'Chuva moderada' : 'Chuva forte';

// =====================
// Cache (IndexedDB)
// =====================
// ... (código de Cache inalterado)
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

// ➡️ FUNÇÃO renderDays CORRIGIDA
const renderDays = dayMapInput => {
    const dayMap = dayMapInput instanceof Map ? dayMapInput : new Map(dayMapInput);
    cardsEl.innerHTML = '';
    const entries = Array.from(dayMap.entries()).slice(0, 15);
    renderSummaryCard(dayMap);

    entries.forEach(([day, points], index) => {
        const labels = formatDateLabel(day + 'T00:00:00');
        const s = summarizeDay(points);

        // Pega os pontos do dia seguinte para o bloco "Noite"
        const nextDay = entries[index + 1] ? entries[index + 1][1] : null;
        const descriptions = getCloudDescriptions(points, nextDay);

        const card = document.createElement('div');
        card.className = 'day';
        card.innerHTML = `
                <div class="date">${labels.date} • ${labels.weekday}</div>
                <div class="descricao-nuvens">
                    <p>${descriptions.dia} durante o dia.</p>
                </div>

                <div class="descricao-nuvens">
                    <p>${descriptions.noite} à noite.</p>
                </div>
                
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
    // Corrigido o nome da variável para 'cloud_cover'
    url.searchParams.set('hourly', 'temperature_2m,relative_humidity_2m,precipitation,wind_gusts_10m,cloud_cover');
    url.searchParams.set('models', model);
    url.searchParams.set('timezone', timezone);
    url.searchParams.set('forecast_days', '15');
    const res = await fetch(url);
    if (!res.ok) throw new Error('Erro ao buscar previsão');
    return res.json();
}

async function searchLocation(query) {
    // ... (código de searchLocation inalterado)
    const url = `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&q=${encodeURIComponent(query)}&limit=1`;
    const res = await fetch(url);
    const data = await res.json();
    if (!data[0]) throw new Error('Local não encontrado');
    const place = data[0];
    locationName.textContent = getAddressText(place.address || {});
    return { lat: parseFloat(place.lat), lon: parseFloat(place.lon) };
}

async function loadForecast(lat, lon) {
    // ... (código de loadForecast inalterado)
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
// ... (código de Eventos inalterado)
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