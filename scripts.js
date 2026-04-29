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
        cloud_cover_low: hourly.cloud_cover_low || [],
        cloud_cover_mid: hourly.cloud_cover_mid || [],
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
                cloud_cover_low: arrays.cloud_cover_low[i],
                cloud_cover_mid: arrays.cloud_cover_mid[i]
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
    // LÓGICA DE NUVENS (Baixas e Médias)
    // =====================
    // =====================
    // LÓGICA DE NUVENS (Ajustada para maior variabilidade)
    // =====================
    function getCloudDescription(points) {
        // 1. Filtramos para pegar apenas o período onde há luz solar (ex: das 06h às 18h)
        // Se o array tiver menos que 24 pontos (ex: final do forecast), usamos o que tiver.
        const daytimePoints = points.filter((p, index) => {
            // Como o dia começa em 00:00, os índices 6 a 18 representam o dia.
            return index >= 6 && index <= 18;
        });

        const targetPoints = daytimePoints.length > 0 ? daytimePoints : points;

        const avg = targetPoints.reduce((acc, p) => {
            // Nuvens baixas são muito mais impactantes visualmente
            const combined = (p.cloud_cover_low * 0.8) + (p.cloud_cover_mid * 0.2);
            return acc + combined;
        }, 0) / targetPoints.length;

        // 2. Buckets ajustados para maior variação nas pontas
        if (avg < 10) return "• Céu limpo.";
        if (avg < 30) return "• Poucas nuvens.";
        if (avg < 65) return "• Céu entre nuvens.";
        if (avg < 85) return "• Nublado em maior parte.";
        return "• Céu encoberto.";
    }

    // =====================
    // LÓGICA DE CHUVA
    // =====================
    function getImpactWeather(points) {
        let precipSum = 0;
        let precipHours = 0;
        let precipMax = 0;

        for (let i = 0; i < points.length; i++) {
            const v = points[i].precipitation;
            precipSum += v;
            if (v > 0.1) precipHours++;
            if (v > precipMax) precipMax = v;
        }

        if (precipSum < 0.5) return "• Sem chuva relevante.";

        let intensity;
        if (precipMax <= 2) intensity = "• Chuva fraca";
        else if (precipMax <= 4) intensity = "• Chuva moderada";
        else intensity = "• Chuva forte";

        let frequency;
        if (precipHours >= 8) frequency = "frequente.";
        else if (precipHours >= 3) frequency = "moderada.";
        else frequency = "isolada.";

        if (precipHours >= 8 && precipMax <= 2) return "• Chuva fraca frequente.";
        if (precipHours >= 8 && precipMax > 4) return "• Chuva forte frequente.";
        if (precipHours >= 3 && precipMax > 4) return "• Algumas pancadas de chuva forte.";
        if (precipHours >= 3 && precipMax <= 2) return "• Chuva fraca isolada.";

        return `${intensity} ${frequency}`;
    }

    // =====================
    // Renderização
    // =====================
    const renderDays = dayMap => {
        cardsEl.innerHTML = '';

        Array.from(dayMap.entries()).slice(0, 15).forEach(([day, points]) => {
            const labels = formatDateLabel(day + 'T00:00:00');
            const s = summarizeDay(points);
            const rainDescription = getImpactWeather(points);
            const cloudDescription = getCloudDescription(points);

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
                        ☔ ${s.precipSum.toFixed(1)} mm
                    </div>

                    <div class="badge badge-wind">
                        🍃 ${s.gustMax.toFixed(0)} km/h
                    </div>

                    <div class="weather-text">
                        <div>${rainDescription}</div>
                        <div>${cloudDescription}</div>
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
            'temperature_2m,relative_humidity_2m,precipitation,wind_gusts_10m,cloud_cover_low,cloud_cover_mid'
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

        } catch (e) {
            console.error(e);
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