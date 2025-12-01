document.addEventListener("DOMContentLoaded", () => {

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
    const historyContainer = document.getElementById("historyContainer");

    // =====================
    // Histórico (máx 5 items)
    // Persistente
    // =====================
    let searchHistory = [];

    function loadHistory() {
        const saved = localStorage.getItem("search_history");
        if (!saved) return [];
        try {
            return JSON.parse(saved);
        } catch {
            return [];
        }
    }

    function saveHistory() {
        localStorage.setItem("search_history", JSON.stringify(searchHistory));
    }

    function addToHistory(name, lat, lon) {
        const existingIndex = searchHistory.findIndex(
            item => item.name.toLowerCase() === name.toLowerCase()
        );
        if (existingIndex !== -1) searchHistory.splice(existingIndex, 1);

        searchHistory.unshift({ name, lat, lon });

        if (searchHistory.length > 5) searchHistory.pop();

        renderHistory();
        saveHistory();
    }

    function renderHistory() {
        historyContainer.innerHTML = "";
        historyContainer.innerHTML = "Histórico de buscas: ";
        historyContainer.style.fontWeight = "bolder";

        searchHistory.forEach(item => {
            const div = document.createElement("div");
            div.className = "history-item";
            div.style.fontWeight = "400";
            div.textContent = item.name;
            div.onclick = () => loadForecast(item.lat, item.lon, item.name);
            historyContainer.appendChild(div);
        });
    }

    // =====================
    // Cache
    // =====================
    const CACHE_TTL_MINUTES = 60;

    function getWeatherCache(lat, lon) {
        const key = `weather_${lat}_${lon}`;
        const cached = localStorage.getItem(key);
        if (!cached) return null;

        const { data, timestamp } = JSON.parse(cached);
        const age = (Date.now() - timestamp) / (1000 * 60);
        if (age > CACHE_TTL_MINUTES) return null;

        return data;
    }

    function saveWeatherCache(lat, lon, data) {
        const key = `weather_${lat}_${lon}`;
        localStorage.setItem(key, JSON.stringify({
            data,
            timestamp: Date.now()
        }));
    }

    // =====================
    // Utilitários
    // =====================
    function formatDateLabel(dateStr) {
        const d = new Date(dateStr);
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const year = d.getFullYear();
        const weekday = d.toLocaleDateString('pt-BR', { weekday: 'long' });

        return {
            date: `${day}/${month}/${year}`,
            weekday
        };
    }

    const getAddressText = address => {
        const city = address.city || address.town || address.village || address.municipality || '';
        const state = address.state || '';
        const country = address.country || '';
        return `${city}${state ? ', ' + state : ''}${country ? ', ' + country : ''}`;
    };

    // =====================
    // Prepara arrays horários (agora com low/mid/high)
    // =====================
    const prepareHourlyArrays = hourly => ({
        temperature_2m: hourly.temperature_2m || [],
        relative_humidity_2m: hourly.relative_humidity_2m || [],
        precipitation: hourly.precipitation || [],
        wind_gusts_10m: hourly.wind_gusts_10m || [],
        cloud_cover: hourly.cloud_cover || [],
        cloud_cover_low: hourly.cloud_cover_low || [],
        cloud_cover_mid: hourly.cloud_cover_mid || [],
        cloud_cover_high: hourly.cloud_cover_high || [],
        weather_code: hourly.weather_code || [],
        apparent_temperature: hourly.apparent_temperature || []
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

    // =====================
    // Helper: converte percentuais LOW+MID em categorias textuais
    // (usaremos a soma LOW+MID; HIGH é ignorado na descrição)
    // =====================
    function cloudCategoryFromLowMid(low, mid) {
        const combined = Math.min(100, (low ?? 0) + (mid ?? 0));
        if (combined <= 10) return "Céu limpo";
        if (combined <= 30) return "Poucas nuvens";
        if (combined <= 60) return "Parcialmente nublado";
        if (combined <= 90) return "Muito nublado";
        return "Encoberto";
    }

    // =====================
    // Summarize por dia (preenche cloudDay/cloudNight com categorias)
    // =====================
    const summarizeDay = points => {
        return points.reduce((acc, p) => {
            const hour = new Date(p.time).getHours();

            acc.tMin = Math.min(acc.tMin, p.temperature_2m ?? acc.tMin);
            acc.tMax = Math.max(acc.tMax, p.temperature_2m ?? acc.tMax);

            acc.sensMin = Math.min(acc.sensMin, p.apparent_temperature ?? acc.sensMin);
            acc.sensMax = Math.max(acc.sensMax, p.apparent_temperature ?? acc.sensMax);

            acc.rhMin = Math.min(acc.rhMin, p.relative_humidity_2m ?? acc.rhMin);
            acc.rhMax = Math.max(acc.rhMax, p.relative_humidity_2m ?? acc.rhMax);

            acc.precipSum += p.precipitation ?? 0;
            acc.gustMax = Math.max(acc.gustMax, p.wind_gusts_10m ?? 0);

            acc.weatherCodes.push(p.weather_code);

            // ⭐ ADIÇÃO REVISADA — usar cloud_cover_low + cloud_cover_mid e calcular categoria (moda)
            const low = (p.cloud_cover_low !== undefined) ? p.cloud_cover_low : null;
            const mid = (p.cloud_cover_mid !== undefined) ? p.cloud_cover_mid : null;

            // Se ambos undefined, tentamos fallback em cloud_cover (total), mas preferimos low/mid.
            let category;
            if (low === null && mid === null) {
                // fallback: tenta usar cloud_cover total (divide proporcionalmente: assume tudo em mid)
                const total = p.cloud_cover ?? 0;
                // fallback strategy: use total as mid (conservative)
                category = cloudCategoryFromLowMid(0, total);
            } else {
                category = cloudCategoryFromLowMid(low ?? 0, mid ?? 0);
            }

            if (hour >= 6 && hour < 18) {
                acc.cloudDay.push(category);
            } else {
                acc.cloudNight.push(category);
            }
            // ⭐ FIM ADIÇÃO

            return acc;

        }, {
            tMin: Infinity,
            tMax: -Infinity,
            sensMin: Infinity,
            sensMax: -Infinity,
            rhMin: Infinity,
            rhMax: -Infinity,
            precipSum: 0,
            gustMax: 0,
            cloudDay: [],
            cloudNight: [],
            weatherCodes: []
        });
    };

    
    function chooseDescription(list, threshold = 0.6) {
        if (!list || list.length === 0) return "-";

        const priority = {
            "Encoberto": 5,
            "Muito nublado": 4,
            "Parcialmente nublado": 3,
            "Poucas nuvens": 2,
            "Céu limpo": 1
        };

        // Conta ocorrências
        const counts = {};
        list.forEach(d => {
            counts[d] = (counts[d] || 0) + 1;
        });

        // Ordena por frequência desc
        const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
        const total = list.length;
        const [topCat, topCount] = sorted[0];

        // Se a top categoria atinge a meta -> devolve ela
        if ((topCount / total) >= threshold) {
            return topCat;
        }

        // Senão, pega todas as categorias que têm a maior frequência (podem ser múltiplas)
        const topCountValue = topCount;
        const tied = sorted.filter(([k, v]) => v === topCountValue).map(([k]) => k);

        if (tied.length === 1) {
            // A moda existe, mas não atingiu threshold; podemos:
            //  - retornar a moda (aqui optamos por retornar a moda mesmo sem atingir threshold)
            //  - ou retornar uma frase indicando variação (ver comentário abaixo)
            return tied[0];
        }


        return `Nebulosidade variável `;
    }




    // =====================
    // Renderização
    // =====================
    const renderSummaryCard = dayMap => {
        const existing = document.getElementById('summaryCard');
        if (existing) existing.remove();

        let totalPrecip = 0;
        let rainyDays = 0;
        let maxDailyPrecip = 0;

        for (const [, points] of dayMap) {
            const s = summarizeDay(points);

            totalPrecip += s.precipSum;

            if (s.precipSum.toFixed(0) >= 1) rainyDays++;
            if (s.precipSum > maxDailyPrecip) maxDailyPrecip = s.precipSum;
        }

        const card = document.createElement('div');
        card.id = 'summaryCard';
        card.className = 'day';

        card.innerHTML = `
        <div class="date">Resumo para 15 dias</div>

        <div class="row precip">
            <p>Chuva acumulada</p>
            <p>${totalPrecip.toFixed(0)} mm</p>
        </div>

        <div class="row precip">
            <p>Dias de chuva</p>
            <p>${rainyDays} de 15</p>
        </div>

        <div class="row precip">
            <p>Maior acumulado em 24h</p>
            <p>${maxDailyPrecip.toFixed(0)} mm</p>
        </div>
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

            const card = document.createElement('div');
            card.className = 'day';

            // usamos a função que retorna main + variante (Formato B)
            const dayDesc = chooseDescription(s.cloudDay);
            const nightDesc = chooseDescription(s.cloudNight);

            card.innerHTML = `
            <div class="date">${labels.date} • ${labels.weekday}</div>
            <div class="row temp"><p>Temperatura (°C)</p><p>${isFinite(s.tMin) ? s.tMin.toFixed(0) : '-'}° a ${isFinite(s.tMax) ? s.tMax.toFixed(0) : '-'}°</p></div>
            <div class="row precip"><p>Chuva acumulada</p><p>${s.precipSum.toFixed(0)} mm</p></div>
            <div class="row humidity"><p>Umidade</p><p>${isFinite(s.rhMin) ? s.rhMin.toFixed(0) : '-'}% a ${isFinite(s.rhMax) ? s.rhMax.toFixed(0) : '-'}%</p></div>
            <div class="row wind"><p>Rajadas de vento</p><p>${s.gustMax.toFixed(0)} km/h</p></div>

            <div class="row clouds"><strong><p>Dia</p></strong><p>${dayDesc}</p></div>
            <div class="row clouds"><strong><p>Noite</p></strong><p>${nightDesc}</p></div>
            `;

            cardsEl.appendChild(card);
        });

        cityInput.value = '';
    };

    // =====================
    // Fetch API
    // =====================
    async function fetchForecast(lat, lon, timezone = 'auto') {
        const url = new URL(forecastBase);
        url.searchParams.set('latitude', lat);
        url.searchParams.set('longitude', lon);
        // ⭐ ADIÇÃO: pedir cloud_cover_low, cloud_cover_mid, cloud_cover_high
        url.searchParams.set('hourly', 'temperature_2m,relative_humidity_2m,precipitation,wind_gusts_10m,cloud_cover,cloud_cover_low,cloud_cover_mid,cloud_cover_high,weather_code,apparent_temperature');
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
        const name = getAddressText(place.address || {});
        return { name, lat: parseFloat(place.lat), lon: parseFloat(place.lon) };
    }

    // =====================
    // Load Forecast
    // =====================
    async function loadForecast(lat, lon) {
        locationName.textContent = "Carregando...";

        try {
            let forecast = getWeatherCache(lat, lon);
            if (!forecast) {
                forecast = await fetchForecast(lat, lon);
                saveWeatherCache(lat, lon, forecast);
            }

            const dayMap = groupHourlyByDate(forecast.hourly.time, prepareHourlyArrays(forecast.hourly));
            renderDays(dayMap);

            const rev = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&addressdetails=1`);
            const revData = await rev.json();
            const resolvedName = getAddressText(revData.address || {});
            locationName.textContent = "🗺️ " + resolvedName;

            addToHistory(resolvedName, lat, lon);

        } catch (e) {
            locationName.textContent = "Erro ao carregar previsão";
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
            const result = await searchLocation(q);
            await loadForecast(result.lat, result.lon);
        } catch (e) {
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

    // =====================
    // Carrega histórico persistente
    // =====================
    searchHistory = loadHistory();
    renderHistory();

});
