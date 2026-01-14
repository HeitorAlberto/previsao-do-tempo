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
    const historyContainer = document.getElementById("historyContainer");

    // =====================
    // Modal Detalhes
    // =====================
    const detailsOverlay = document.createElement("div");
    detailsOverlay.className = "details-overlay";
    document.body.appendChild(detailsOverlay);

    // =====================
    // Histórico
    // =====================
    let searchHistory = [];

    function loadHistory() {
        const saved = localStorage.getItem("search_history");
        if (!saved) return [];
        try { return JSON.parse(saved); } catch { return []; }
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
        if (searchHistory.length > 3) searchHistory.pop();

        renderHistory();
        saveHistory();
    }

    function renderHistory() {
        historyContainer.innerHTML = "Histórico de buscas: ";
        historyContainer.style.fontWeight = "bolder";

        searchHistory.forEach(item => {
            const div = document.createElement("div");
            div.className = "history-item";
            div.style.fontWeight = "400";
            div.textContent = item.name;
            div.onclick = () => loadForecast(item.lat, item.lon);
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

        return { date: `${day}/${month}/${year}`, weekday };
    }

    const getAddressText = address => {
        const city = address.city || address.town || address.village || address.municipality || '';
        const state = address.state || '';
        const country = address.country || '';
        return `${city}${state ? ', ' + state : ''}${country ? ', ' + country : ''}`;
    };

    // =====================
    // Prepara arrays
    // =====================
    const prepareHourlyArrays = hourly => ({
        temperature_2m: hourly.temperature_2m || [],
        relative_humidity_2m: hourly.relative_humidity_2m || [],
        precipitation: hourly.precipitation || [],
        wind_gusts_10m: hourly.wind_gusts_10m || [],
        apparent_temperature: hourly.apparent_temperature || [],
        cloud_cover: hourly.cloud_cover || [],
        weathercode: hourly.weathercode || [],
        time: hourly.time || []
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
    // Sumarização diária
    // =====================
    const summarizeDay = points => {
        return points.reduce((acc, p) => {
            acc.tMin = Math.min(acc.tMin, p.temperature_2m);
            acc.tMax = Math.max(acc.tMax, p.temperature_2m);
            acc.rhMin = Math.min(acc.rhMin, p.relative_humidity_2m);
            acc.rhMax = Math.max(acc.rhMax, p.relative_humidity_2m);
            acc.precipSum += p.precipitation;
            acc.gustMax = Math.max(acc.gustMax, p.wind_gusts_10m);
            return acc;
        }, {
            tMin: Infinity,
            tMax: -Infinity,
            rhMin: Infinity,
            rhMax: -Infinity,
            precipSum: 0,
            gustMax: 0
        });
    };

    // =====================
    // Turnos
    // =====================
    function splitByShift(points) {
        const shifts = { Madrugada: [], Manhã: [], Tarde: [], Noite: [] };

        points.forEach(p => {
            const h = new Date(p.time).getHours();
            if (h < 6) shifts.Madrugada.push(p);
            else if (h < 12) shifts.Manhã.push(p);
            else if (h < 18) shifts.Tarde.push(p);
            else shifts.Noite.push(p);
        });

        return shifts;
    }

    function summarizeShift(points) {
        if (!points.length) return null;

        const cloudAvg = points.reduce((s, p) => s + p.cloud_cover, 0) / points.length;
        const rainSum = points.reduce((s, p) => s + p.precipitation, 0);
        const thunder = points.some(p => p.weathercode >= 95);

        let cloudText = "";
        if (cloudAvg <= 20) cloudText = "Céu aberto";
        else if (cloudAvg <= 40) cloudText = "Nebulosidade baixa";
        else if (cloudAvg <= 70) cloudText = "Nebulosidade moderada";
        else if (cloudAvg <= 90) cloudText = "Nebulosidade intensa";
        else cloudText = "Céu fechado";

        return {
            clouds: cloudText,
            rain: rainSum.toFixed(1),
            thunder
        };
    }

    // =====================
    // Modal Detalhes (COM HORA ATUAL DESTACADA)
    // =====================
    function openDetails(points) {
        document.body.style.overflow = "hidden";
        detailsOverlay.innerHTML = "";
        detailsOverlay.style.display = "flex";

        const modal = document.createElement("div");
        modal.className = "details-modal";

        const labels = formatDateLabel(points[0].time);
        modal.innerHTML = `
        <h3 style="margin-bottom:12px; text-align:center">
            ${labels.date} • ${labels.weekday}
        </h3>
        <div class="hourly-grid"></div>
    `;

        const grid = modal.querySelector(".hourly-grid");

        const now = new Date();
        const currentHour = now.getHours();
        const todayStr = now.toISOString().split("T")[0];

        points.forEach((p, index) => {
            const dateObj = new Date(p.time);
            const hour = dateObj.getHours().toString().padStart(2, "0");
            const pointDateStr = p.time.split("T")[0];

            const isCurrentHour =
                pointDateStr === todayStr &&
                dateObj.getHours() === currentHour;

            let cloudText = "";
            if (p.cloud_cover <= 20) cloudText = "Céu aberto";
            else if (p.cloud_cover <= 40) cloudText = "Poucas nuvens";
            else if (p.cloud_cover <= 70) cloudText = "Parcialmente nublado";
            else if (p.cloud_cover <= 90) cloudText = "Muito nublado";
            else cloudText = "Céu encoberto";

            const block = document.createElement("div");
            block.className =
                "hour-block" +
                (isCurrentHour ? " current-hour" : "") +
                ((index + 1) % 6 === 0 ? " hour-group-gap" : "");

            block.innerHTML = `
            <strong>${hour}:00</strong>
            <span>${cloudText}</span> -
            <span>${p.precipitation.toFixed(1)} mm</span>
        `;

            grid.appendChild(block);
        });

        const closeBtn = document.createElement("button");
        closeBtn.className = "btn-detalhes";
        closeBtn.textContent = "Fechar";
        closeBtn.onclick = () => {
            detailsOverlay.style.display = "none";
            document.body.style.overflow = "";
        };

        modal.appendChild(closeBtn);
        detailsOverlay.appendChild(modal);
    }


    // =====================
    // Renderização
    // =====================
    const renderDays = dayMapInput => {
        const dayMap = dayMapInput instanceof Map ? dayMapInput : new Map(dayMapInput);
        cardsEl.innerHTML = '';

        const entries = Array.from(dayMap.entries()).slice(0, 15);

        entries.forEach(([day, points]) => {
            const labels = formatDateLabel(day + 'T00:00:00');
            const s = summarizeDay(points);

            const card = document.createElement('div');
            card.className = 'day';

            card.innerHTML = `
                <div class="date">${labels.date} • ${labels.weekday}</div>
                <div class="row temp"><p>Temperatura</p><p>${s.tMin.toFixed(0)}° a ${s.tMax.toFixed(0)}°</p></div>
                <div class="row precip"><p>Chuva acumulada</p><p>${s.precipSum.toFixed(1)} mm</p></div>
                <div class="row humidity"><p>Umidade</p><p>${s.rhMin.toFixed(0)}% a ${s.rhMax.toFixed(0)}%</p></div>
                <div class="row wind"><p>Rajadas de vento</p><p>${s.gustMax.toFixed(0)} km/h</p></div>
            `;

            const btn = document.createElement("button");
            btn.className = "btn-detalhes";
            btn.textContent = "Detalhes";
            btn.onclick = () => openDetails(points);

            card.appendChild(btn);
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
        url.searchParams.set(
            'hourly',
            'temperature_2m,relative_humidity_2m,precipitation,wind_gusts_10m,cloud_cover,apparent_temperature,weathercode'
        );
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

    async function loadForecast(lat, lon) {
        locationName.textContent = "Carregando...";

        try {
            let forecast = getWeatherCache(lat, lon);
            if (!forecast) {
                forecast = await fetchForecast(lat, lon);
                saveWeatherCache(lat, lon, forecast);
            }

            const dayMap = groupHourlyByDate(
                forecast.hourly.time,
                prepareHourlyArrays(forecast.hourly)
            );

            renderDays(dayMap);

            const rev = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&addressdetails=1`);
            const revData = await rev.json();
            const resolvedName = getAddressText(revData.address || {});

            locationName.textContent = "🗺️ " + resolvedName;
            addToHistory(resolvedName, lat, lon);

        } catch {
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
        } catch {
            locationName.textContent = 'Erro ao carregar';
        }
    });

    document.getElementById('geoButton').addEventListener('click', () => {
        if (!navigator.geolocation) return alert('Geolocalização não suportada.');
        locationName.textContent = 'Obtendo localização...';

        navigator.geolocation.getCurrentPosition(
            pos => loadForecast(pos.coords.latitude, pos.coords.longitude),
            () => locationName.textContent = 'Erro ao obter localização'
        );
    });

    // =====================
    // Init
    // =====================
    const today = new Date();
    todayDate.textContent = `${new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' }).format(today)} - ${new Intl.DateTimeFormat('pt-BR', { weekday: 'long' }).format(today)}`;

    searchHistory = loadHistory();
    renderHistory();

});
