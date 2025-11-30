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
    // Agora persistente (localStorage)
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

        // Remove o mais antigo (fim da lista), mantendo sempre 5 itens
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
    // Cache no navegador
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

    const prepareHourlyArrays = hourly => ({
        temperature_2m: hourly.temperature_2m || [],
        relative_humidity_2m: hourly.relative_humidity_2m || [],
        precipitation: hourly.precipitation || [],
        wind_gusts_10m: hourly.wind_gusts_10m || [],
        cloud_cover: hourly.cloud_cover || [],
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

            if (s.precipSum.toFixed(0) >= 1) rainyDays++;  // Dia com chuva
            if (s.precipSum > maxDailyPrecip) maxDailyPrecip = s.precipSum;
        }

        const card = document.createElement('div');
        card.id = 'summaryCard';
        card.className = 'day';

        card.innerHTML = `
        <div class="date">Resumo para 15 dias</div>

        <div class="row precip">
            <p>Chuva acumulada</p>
            <p><strong>${totalPrecip.toFixed(0)} mm</strong></p>
        </div>

        <div class="row precip">
            <p>Dias de chuva</p>
            <p><strong>${rainyDays} de 15</strong></p>
        </div>

        <div class="row precip">
            <p>Maior acumulado em 24h</p>
            <p><strong>${maxDailyPrecip.toFixed(0)} mm</strong></p>
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
            card.innerHTML = `
            <div class="date">${labels.date} • ${labels.weekday}</div>
            <div class="row temp"><p>Temperatura (°C)</p><p><strong>${isFinite(s.tMin) ? s.tMin.toFixed(0) : '-'}° a ${isFinite(s.tMax) ? s.tMax.toFixed(0) : '-'}°</strong></p></div>
            <div class="row temp"><p>Sensação térmica (°C)</p><p><strong>${isFinite(s.sensMin) ? s.sensMin.toFixed(0) : '-'}° a ${isFinite(s.sensMax) ? s.sensMax.toFixed(0) : '-'}°</strong></p></div>
            <div class="row precip"><p>Chuva acumulada</p><p><strong>${s.precipSum.toFixed(0)} mm</strong></p></div>
            <div class="row humidity"><p>Umidade</p><p><strong>${isFinite(s.rhMin) ? s.rhMin.toFixed(0) : '-'}% a ${isFinite(s.rhMax) ? s.rhMax.toFixed(0) : '-'}%</strong></p></div>
            <div class="row wind"><p>Rajadas de vento</p><p><strong>${s.gustMax.toFixed(0)} km/h</strong></p></div>`;
            
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
        url.searchParams.set('hourly', 'temperature_2m,relative_humidity_2m,precipitation,wind_gusts_10m,cloud_cover,weather_code,apparent_temperature');
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
            locationName.textContent = "📍 " + resolvedName;

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
    // Carrega histórico persistente ao iniciar
    // =====================
    searchHistory = loadHistory();
    renderHistory();

});
