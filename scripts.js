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
        historyContainer.innerHTML = "Histórico de buscas:";
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
    // Utilitários
    // =====================
    function formatDateLabel(dateStr) {
        const d = new Date(dateStr);
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const year = d.getFullYear();
        const weekday = d.toLocaleDateString('pt-BR', { weekday: 'short' });

        return { date: `${day}/${month}/${year}`, weekday };
    }

    const getAddressText = address => {
        const city = address.city || address.town || address.village || address.municipality || '';
        const state = address.state || '';
        const country = address.country || '';
        return `${city}${state ? ', ' + state : ''}${country ? ', ' + country : ''}`;
    };

    // =====================
    // Processamento horário
    // =====================
    const prepareHourlyArrays = hourly => ({
        temperature_2m: hourly.temperature_2m || [],
        relative_humidity_2m: hourly.relative_humidity_2m || [],
        precipitation: hourly.precipitation || [],
        wind_gusts_10m: hourly.wind_gusts_10m || [],
        weather_code: hourly.weather_code || [],
        time: hourly.time || []
    });

    const groupHourlyByDate = (times, arrays) => {
        const map = new Map();
        for (let i = 0; i < times.length; i++) {
            const d = new Date(times[i]);
            const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

            if (!map.has(day)) map.set(day, []);

            map.get(day).push({
                temperature_2m: arrays.temperature_2m[i],
                relative_humidity_2m: arrays.relative_humidity_2m[i],
                precipitation: arrays.precipitation[i],
                wind_gusts_10m: arrays.wind_gusts_10m[i],
                weather_code: arrays.weather_code[i]
            });
        }
        return map;
    };

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
    // Weather (impacto + frequência)
    // =====================
    const weatherPriority = {
        0: 1, 1: 1, 2: 1, 3: 2,
        45: 3, 48: 3,
        51: 4, 53: 4, 55: 5,
        61: 5, 63: 6, 65: 7,
        71: 5,
        80: 6, 81: 7, 82: 8,
        95: 9, 96: 10, 99: 10
    };

    const weatherCodeText = {
        0: "Céu limpo",
        1: "Principalmente limpo",
        2: "Parcialmente nublado",
        3: "Nublado",
        45: "Neblina",
        48: "Neblina com gelo",
        51: "Garoa leve",
        53: "Garoa",
        55: "Garoa intensa",
        61: "Chuva leve",
        63: "Chuva",
        65: "Chuva forte",
        71: "Neve leve",
        80: "Pancadas de chuva",
        81: "Pancadas moderadas",
        82: "Pancadas fortes",
        95: "Tempestade",
        96: "Tempestade com granizo",
        99: "Tempestade severa"
    };

    function getImpactWeather(points) {
        let worstCode = null;
        let worstPriority = -1;

        points.forEach(p => {

            const code = p.weather_code;
            const priority = weatherPriority[code] || 0;

            if (priority > worstPriority) {
                worstPriority = priority;
                worstCode = code;
            }
            
        });

        return weatherCodeText[worstCode] || "Condição indefinida";

    }

    // =====================
    // Renderização
    // =====================
    const renderDays = dayMap => {
        cardsEl.innerHTML = '';

        Array.from(dayMap.entries()).slice(0, 15).forEach(([day, points]) => {
            const labels = formatDateLabel(day + 'T00:00:00');
            const s = summarizeDay(points);

            const description = getImpactWeather(points);

            const card = document.createElement('div');
            card.className = 'day';

            const isWeekend = ['sáb.', 'dom.'].includes(labels.weekday.toLowerCase());

            card.innerHTML = `
                <div class="day-line">
                    <div class="date-line" style="${isWeekend ? 'color: darkgoldenrod;' : ''}">
                        ${labels.date} - ${labels.weekday}
                    </div>

                    <div class="badge badge-temp">
                    🌡️ ${s.tMin.toFixed(0)}° a ${s.tMax.toFixed(0)}°
                    </div>

                    <div class="badge badge-precip">
                    ☔ ${s.precipSum.toFixed(0)} mm
                    </div>

                    <div class="badge badge-wind">
                    🍃 ${s.gustMax.toFixed(0)} km/h
                    </div>

                    <div class="weather-text">
                        ${description}
                    </div>
                </div>
            `;

            cardsEl.appendChild(card);
        });

        cityInput.value = '';
    };

    // =====================
    // API
    // =====================
    async function fetchForecast(lat, lon, timezone = 'auto') {
        const url = new URL(forecastBase);
        url.searchParams.set('latitude', lat);
        url.searchParams.set('longitude', lon);
        url.searchParams.set(
            'hourly',
            'temperature_2m,relative_humidity_2m,precipitation,wind_gusts_10m,weather_code'
        );
        url.searchParams.set('models', model);
        url.searchParams.set('timezone', timezone);
        url.searchParams.set('forecast_days', '15');

        const res = await fetch(url);
        if (!res.ok) throw new Error();

        return res.json();
    }

    async function searchLocation(query) {
        const url = `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&q=${encodeURIComponent(query)}&limit=1`;
        const res = await fetch(url);
        const data = await res.json();

        if (!data[0]) throw new Error();

        const place = data[0];
        return {
            name: getAddressText(place.address || {}),
            lat: parseFloat(place.lat),
            lon: parseFloat(place.lon)
        };
    }

    async function loadForecast(lat, lon) {
        locationName.textContent = "Carregando...";

        try {
            const forecast = await fetchForecast(lat, lon);

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
    todayDate.textContent =
        `${new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' }).format(today)} - 
         ${new Intl.DateTimeFormat('pt-BR', { weekday: 'long' }).format(today)}`;

    searchHistory = loadHistory();
    renderHistory();

});