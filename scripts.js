document.addEventListener("DOMContentLoaded", () => {

    const forecastBase = 'https://api.open-meteo.com/v1/forecast';
    const model = 'ecmwf_ifs';
    const cityInput = document.getElementById('cityInput');
    const searchForm = document.getElementById('searchForm');
    const locationName = document.getElementById('locationName');
    const cardsEl = document.getElementById('cards');
    const todayDate = document.getElementById('todayDate');
    const historyContainer = document.getElementById("historyContainer");

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
            div.textContent = item.name;
            div.onclick = () => loadForecast(item.lat, item.lon);
            historyContainer.appendChild(div);
        });
    }

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
            acc.precipSum += p.precipitation;
            acc.gustMax = Math.max(acc.gustMax, p.wind_gusts_10m);
            return acc;
        }, {
            tMin: Infinity,
            tMax: -Infinity,
            precipSum: 0,
            gustMax: 0
        });
    };

    // --- FUNÇÃO DE SUPORTE ---
    const get3hBlocks = (points) => {
        const step = 3;
        const blocks = [];
        for (let i = 0; i < points.length; i += step) {
            const slice = points.slice(i, i + step);
            if (slice.length === 0) continue;
            const avg = slice.reduce((acc, p) =>
                acc + ((p.cloud_cover_low * 0.8) + (p.cloud_cover_mid * 0.2)), 0
            ) / slice.length;
            blocks.push(avg);
        }
        return blocks;
    };

    // --- DESCRIÇÃO DE NUVENS ---
    function getCloudDescription(points) {
        const blocks = get3hBlocks(points);
        const maxCloud = Math.max(...blocks);
        const minCloud = Math.min(...blocks);
        const delta = maxCloud - minCloud;

        // Estabilidade (Céu que não muda muito)
        if (delta < 45) {
            if (maxCloud < 50) return "<span class='emoji'>🌤️</span> Poucas nuvens.";
            if (maxCloud < 80) return "<span class='emoji'>🌥️</span> Muitas nuvens.";
            return "<span class='emoji'>☁️</span> Nublado.";
        }

        // Transições (O "drama" do dia)
        const mid = Math.floor(blocks.length / 2);
        const avg1 = blocks.slice(0, mid).reduce((a, b) => a + b, 0) / mid;
        const avg2 = blocks.slice(mid).reduce((a, b) => a + b, 0) / (blocks.length - mid);

        // O dia abrindo
        if (avg1 - avg2 > 35) {
            return avg2 < 30 ? "<span class='emoji'>🌥️</span> Aberturas à tarde." : "<span class='emoji'>🌥️</span> Céu abre ao longo do dia.";
        }

        // O dia fechando
        if (avg2 - avg1 > 35) {
            return avg1 < 30 ? "<span class='emoji'>🌥️</span> Nuvens aumentam ao longo do dia." : "<span class='emoji'>🌥️</span> Céu fecha ao longo do dia.";
        }

        return "<span class='emoji'>🌥️</span> Nebulosidade variável.";
    }

    // --- DESCRIÇÃO DE CHUVA ---
    function getVolumeDescription(totalVolume) {
        if (totalVolume === 0) return '💧 Sem previsão de chuva.';
        if (totalVolume <= 0.9) return '💧 Sem chuva relevante.';
        if (totalVolume < 5) return '💧 Chuva leve e isolada.';
        if (totalVolume < 10) return '💧 Chuva leve.';
        if (totalVolume < 25) return '⚠️ Chuva moderada.';
        if (totalVolume < 80) return '⚠️ Chuva forte.';
        return '⚠️ Chuva muito forte.';
    }
    

    const renderDays = dayMap => {
        cardsEl.innerHTML = '';

        Array.from(dayMap.entries()).slice(0, 15).forEach(([day, points]) => {
            const labels = formatDateLabel(day + 'T00:00:00');
            const s = summarizeDay(points);
            const volumeLabel = getVolumeDescription(s.precipSum);
            const cloudLabel = getCloudDescription(points);


            const card = document.createElement('div');
            card.className = 'day';

            const isWeekend = ['sábado', 'domingo'].includes(labels.weekday.toLowerCase());

            card.innerHTML = `
                <div class="day-row">
                    <div class="date-line ${isWeekend ? 'weekend' : ''}">
                        ${labels.date} - ${labels.weekday}
                    </div>

                    <div class="main-info">
                        <div class="badge badge-temp">
                            🌡️ ${s.tMin.toFixed(0)}° a ${s.tMax.toFixed(0)}°
                        </div>

                        <div class="badge badge-precip">
                            ☔ ${s.precipSum.toFixed(1)} mm
                        </div>

                        <div class="badge badge-wind">
                            🍃 ${s.gustMax.toFixed(0)} km/h
                        </div>
                    </div>

                    <div class="weather-text">
                        ${volumeLabel ? `<span>${volumeLabel}</span>` : ''}
                        
                        
                        ${cloudLabel
                                        ? `<span>${(volumeLabel || (intensityLabel && intensityLabel !== "Tempo firme")) ? ' ' : ''}${cloudLabel}</span>`
                                        : ''}
                    </div>
                </div>
            `;

            cardsEl.appendChild(card);
        });

        cityInput.value = '';
    };

    async function fetchForecast(lat, lon, timezone = 'auto') {
        const url = new URL(forecastBase);
        url.searchParams.set('latitude', lat);
        url.searchParams.set('longitude', lon);
        url.searchParams.set(
            'hourly',
            'temperature_2m,precipitation,wind_gusts_10m,cloud_cover_low,cloud_cover_mid'
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

    const today = new Date();
    todayDate.textContent =
        `${new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' }).format(today)} - 
         ${new Intl.DateTimeFormat('pt-BR', { weekday: 'long' }).format(today)}`;

    searchHistory = loadHistory();
    renderHistory();

});
