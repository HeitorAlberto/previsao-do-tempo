const forecastBase = 'https://api.open-meteo.com/v1/forecast';
const model = 'ecmwf_ifs';
const cityInput = document.getElementById('cityInput');
const searchForm = document.getElementById('searchForm');
const locationName = document.getElementById('locationName');
const cardsEl = document.getElementById('cards');
const todayDate = document.getElementById('todayDate');
const forecastSection = document.getElementById('forecastSection');

const today = new Date();
const weekday = new Intl.DateTimeFormat('pt-BR', { weekday: 'long' }).format(today);
const date = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' }).format(today);
todayDate.textContent = `${date} - ${weekday}`;

function formatDateLabel(iso) {
    const d = new Date(iso);
    const weekday = new Intl.DateTimeFormat('pt-BR', { weekday: 'long' }).format(d);
    const date = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' }).format(d);
    return { weekday, date };
}

function groupHourlyByDate(times, arrays) {
    const map = new Map();
    for (let i = 0; i < times.length; i++) {
        const day = times[i].slice(0, 10);
        if (!map.has(day)) map.set(day, []);
        const point = {};
        for (const key in arrays) point[key] = arrays[key][i];
        point.time = times[i];
        map.get(day).push(point);
    }
    return map;
}

function summarizeDay(points) {
    let tMin = Infinity, tMax = -Infinity, rhMin = Infinity, rhMax = -Infinity;
    let precipSum = 0, gustMax = 0;

    const clouds = { madrugada: [], manha: [], tarde: [], noite: [] };

    for (const p of points) {
        const hour = new Date(p.time).getHours();
        if (p.temperature_2m != null) {
            if (p.temperature_2m < tMin) tMin = p.temperature_2m;
            if (p.temperature_2m > tMax) tMax = p.temperature_2m;
        }
        if (p.relative_humidity_2m != null) {
            if (p.relative_humidity_2m < rhMin) rhMin = p.relative_humidity_2m;
            if (p.relative_humidity_2m > rhMax) rhMax = p.relative_humidity_2m;
        }
        if (p.precipitation != null) precipSum += p.precipitation;
        if (p.wind_gusts_10m != null && p.wind_gusts_10m > gustMax) gustMax = p.wind_gusts_10m;
        if (p.cloud_cover != null) {
            if (hour >= 0 && hour < 6) clouds.madrugada.push(p.cloud_cover);
            else if (hour >= 6 && hour < 12) clouds.manha.push(p.cloud_cover);
            else if (hour >= 12 && hour < 18) clouds.tarde.push(p.cloud_cover);
            else clouds.noite.push(p.cloud_cover);
        }
    }

    function predominantCategory(values) {
        const buckets = { clear: 0, few: 0, part: 0, mostly: 0, over: 0 };
        for (const v of values) {
            if (v <= 10) buckets.clear++;
            else if (v <= 40) buckets.few++;
            else if (v <= 60) buckets.part++;
            else if (v <= 80) buckets.mostly++;
            else buckets.over++;
        }
        const maxKey = Object.entries(buckets).sort((a, b) => b[1] - a[1])[0][0];
        return maxKey;
    }

    const cloudMode = {};
    for (const k in clouds) cloudMode[k] = predominantCategory(clouds[k]);

    return { tMin, tMax, rhMin, rhMax, precipSum, gustMax, clouds: cloudMode };
}

function calculateTotalPrecipitation(dayMap) {
    let total = 0;
    for (const [, points] of dayMap) {
        const s = summarizeDay(points);
        total += s.precipSum;
    }
    return total;
}

function renderSummaryCard(dayMap) {
    const existing = document.getElementById('summaryCard');
    if (existing) existing.remove();

    const totalPrecip = calculateTotalPrecipitation(dayMap);

    let rainyDays = 0;
    let maxTemp = -Infinity, maxTempDay = '';
    let minTemp = Infinity, minTempDay = '';
    let maxGust = -Infinity, maxGustDay = '';
    let maxPrecip = -Infinity, maxPrecipDay = '';

    for (const [day, points] of dayMap) {
        const s = summarizeDay(points);
        if (s.precipSum > 0) rainyDays++;

        if (s.tMax > maxTemp) {
            maxTemp = s.tMax;
            maxTempDay = day;
        }

        if (s.tMin < minTemp) {
            minTemp = s.tMin;
            minTempDay = day;
        }

        if (s.gustMax > maxGust) {
            maxGust = s.gustMax;
            maxGustDay = day;
        }

        if (s.precipSum > maxPrecip) {
            maxPrecip = s.precipSum;
            maxPrecipDay = day;
        }
    }

    const formatShort = iso => {
        const d = new Date(iso + 'T00:00:00');
        return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' }).format(d);
    };

    const maxPrecipText = (isFinite(maxPrecip) && maxPrecip > 0)
        ? `${maxPrecip.toFixed(1)} mm dia ${formatShort(maxPrecipDay)}`
        : '--';

    const card = document.createElement('div');
    card.id = 'summaryCard';
    card.className = 'day';
    card.innerHTML = `
            <h2 style="margin:8px 0px; text-align:center">Resumo para 15 dias</h2>
    
            <div class="row precip">
                <p style="color:black">Chuva</p>
                <p>${totalPrecip.toFixed(1)} mm</p>
            </div>
    
            <div class="row precip">
                <p style="color:black">Dias de chuva</p>
                <p>${rainyDays} de 15</p>
            </div>
    
            <div class="row temp">
                <p style="color:black">Temp. mínima (°C)</p>
                <p>${isFinite(minTemp) ? `${minTemp.toFixed(0)}° dia ${formatShort(minTempDay)}` : '-'}</p>
            </div>
    
            <div class="row temp">
                <p style="color:black">Temp. máxima (°C)</p>
                <p>${isFinite(maxTemp) ? `${maxTemp.toFixed(0)}° dia ${formatShort(maxTempDay)}` : '-'}</p>
            </div>
    
            <div class="row precip">
                <p style="color:black">Maior chuva</p>
                <p>${maxPrecipText}</p>
            </div>
    
            <div class="row wind">
                <p style="color:black">Rajadas máx.</p>
                <p>${isFinite(maxGust) ? `${maxGust.toFixed(0)} km/h dia ${formatShort(maxGustDay)}` : '-'}</p>
            </div>
        `;

    forecastSection.parentNode.insertBefore(card, forecastSection);
}




function renderDays(dayMap) {
    cardsEl.innerHTML = '';
    const entries = Array.from(dayMap.entries()).slice(0, 15);
    renderSummaryCard(dayMap);

    for (const [day, points] of entries) {
        const iso = day + 'T00:00:00';
        const labels = formatDateLabel(iso);
        const s = summarizeDay(points);

        const storm = points.some(p => [95, 96, 99].includes(p.weathercode));

        const card = document.createElement('div');
        card.className = 'day';
        card.innerHTML = `
                <div class="date">${labels.date} - ${labels.weekday}</div>
                <div class="row temp"><p>Temperatura (°C)</p><p>${isFinite(s.tMin) ? s.tMin.toFixed(0) : '-'}° a ${isFinite(s.tMax) ? s.tMax.toFixed(0) : '-'}°</p></div>
                <div class="row precip"><p>Chuva</p><p>${s.precipSum.toFixed(1)} mm</p></div>
                <div class="row humidity"><p>Umidade</p><p>${isFinite(s.rhMin) ? s.rhMin.toFixed(0) : '-'}% a ${isFinite(s.rhMax) ? s.rhMax.toFixed(0) : '-'}%</p></div>
                <div class="row wind"><p>Rajadas de vento</p><p>${s.gustMax.toFixed(0)} km/h</p></div>
                ${storm ? `<div class="row" style="color:red;"><p>Risco de tempestades</p></div>` : ''}
                <div style="text-align:center; margin-top:10px;">
                    <button class="detail-btn" style="background:#000;color:#fff;border:1px solid #333;padding:10px 14px;border-radius:8px;cursor:pointer;">Detalhes por período</button>
                </div>
            `;

        const detailBtn = card.querySelector('.detail-btn');

        detailBtn.addEventListener('click', () => {
            card.innerHTML = `<div class="date">${labels.date} - ${labels.weekday}</div>`;

            const container = document.createElement('div');
            container.className = 'row';
            container.style.flexDirection = 'column';
            container.style.maxHeight = '400px';
            container.style.overflowY = 'auto';
            container.style.border = '1px solid #eee';
            container.style.borderRadius = '8px';
            container.style.padding = '8px 10px';
            container.style.background = '#fafafa';
            container.style.marginBottom = '14px';

            const title = document.createElement('p');
            title.style.fontWeight = '700';
            title.style.marginBottom = '8px';
            title.style.textAlign = 'center';
            title.textContent = 'Condições horárias';
            container.appendChild(title);

            const now = new Date();
            let currentHourDiv = null;

            for (const p of points) {
                const h = new Date(p.time).getHours();
                const label = `${String(h).padStart(2, '0')}h00`;

                const cloudCat = predominantCategory([p.cloud_cover || 0]);
                const precip = p.precipitation || 0;
                const storm = [95, 96, 99].includes(p.weathercode);

                const divHour = document.createElement('div');
                divHour.className = 'hour-block';
                divHour.style.padding = '8px';
                divHour.style.paddingBottom = '12px';
                divHour.style.borderBottom = '1px solid #eee';

                if (h === now.getHours() && day === now.toISOString().slice(0, 10)) {
                    divHour.style.background = '#ffffcc';
                    currentHourDiv = divHour;
                }

                divHour.innerHTML = `
            <p style="font-weight:700; margin:0 0 4px 0;">${label}</p>
            <p style="margin:4px 0">${cloudDescription(cloudCat)}</p>
            <p style="margin:4px 0">${rainDescription(precip)} - ${precip.toFixed(1)} mm</p>
            ${storm ? `<p style="margin:4px 0; color:red;">Risco de tempestades</p>` : ''}
        `;
                container.appendChild(divHour);
            }

            card.appendChild(container);

            const backDiv = document.createElement('div');
            backDiv.style.textAlign = 'center';
            backDiv.style.marginTop = '10px';
            backDiv.innerHTML = `
        <button class="back-btn" style="background:#000;color:#fff;border:1px solid #333;padding:10px 14px;border-radius:8px;cursor:pointer;">Voltar</button>
    `;
            card.appendChild(backDiv);

            backDiv.querySelector('.back-btn').addEventListener('click', () => {
                renderDays(dayMap);
                card.scrollIntoView({ behavior: 'smooth', block: 'center' });
            });

            if (currentHourDiv) {
                setTimeout(() => {
                    currentHourDiv.scrollIntoView({
                        behavior: 'smooth',
                        block: 'center',
                        inline: 'nearest'
                    });
                }, 200);
            }
        });

        cardsEl.appendChild(card);
    }




    function predominantCategory(values) {
        const buckets = { clear: 0, few: 0, part: 0, mostly: 0, over: 0 };
        for (const v of values) {
            if (v <= 10) buckets.clear++;
            else if (v <= 40) buckets.few++;
            else if (v <= 60) buckets.part++;
            else if (v <= 80) buckets.mostly++;
            else buckets.over++;
        }
        return Object.entries(buckets).sort((a, b) => b[1] - a[1])[0][0];
    }



    function cloudDescription(cat) {
        const map = {
            clear: 'Céu limpo',
            few: 'Poucas nuvens',
            part: 'Parcialmente nublado',
            mostly: 'Maioria nublado',
            over: 'Nublado'
        };
        return map[cat] || '-';
    }



    function rainDescription(mm) {
        if (mm < 1) return 'Sem chuva';
        if (mm < 5) return 'Chuva leve';
        if (mm < 15) return 'Chuva moderada';
        return 'Chuva forte';
    }
}




async function fetchForecast(lat, lon, timezone = 'auto') {
    const url = new URL(forecastBase);
    url.searchParams.set('latitude', lat);
    url.searchParams.set('longitude', lon);
    url.searchParams.set('hourly', 'temperature_2m,relative_humidity_2m,precipitation,cloud_cover,wind_gusts_10m,weathercode');
    url.searchParams.set('models', model);
    url.searchParams.set('timezone', timezone);
    url.searchParams.set('forecast_days', '15');
    const res = await fetch(url.toString());
    if (!res.ok) throw new Error('Erro ao buscar previsão');
    return await res.json();
}



async function searchLocation(query) {
    const url = `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&q=${encodeURIComponent(query)}&limit=1`;
    const res = await fetch(url);
    const data = await res.json();
    if (!data[0]) throw new Error('Local não encontrado');
    const place = data[0];
    const addr = place.address || {};
    const city = addr.city || addr.town || addr.village || addr.municipality || '';
    const state = addr.state || '';
    const country = addr.country || '';
    locationName.textContent = `📌 ${city}${state ? ', ' + state : ''}${country ? ' - ' + country : ''}`;
    return { lat: parseFloat(place.lat), lon: parseFloat(place.lon) };
}



searchForm.addEventListener('submit', async e => {
    e.preventDefault();
    const q = cityInput.value.trim();
    if (!q) return;
    try {
        locationName.textContent = 'Buscando...';
        cardsEl.innerHTML = '';
        const { lat, lon } = await searchLocation(q);
        const forecast = await fetchForecast(lat, lon);
        const times = forecast.hourly.time;
        const arrays = {
            temperature_2m: forecast.hourly.temperature_2m || [],
            relative_humidity_2m: forecast.hourly.relative_humidity_2m || [],
            precipitation: forecast.hourly.precipitation || [],
            cloud_cover: forecast.hourly.cloud_cover || [],
            wind_gusts_10m: forecast.hourly.wind_gusts_10m || [],
            weathercode: forecast.hourly.weathercode || []
        };
        const dayMap = groupHourlyByDate(times, arrays);
        renderDays(dayMap);
    } catch {
        locationName.textContent = 'Erro ao carregar';
    }
});



document.getElementById('geoButton').addEventListener('click', () => {
    if (!navigator.geolocation) return alert('Geolocalização não suportada.');
    locationName.textContent = 'Obtendo localização...';
    navigator.geolocation.getCurrentPosition(async pos => {
        const { latitude, longitude } = pos.coords;
        const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&addressdetails=1`;
        const res = await fetch(url);
        const data = await res.json();
        const addr = data.address || {};
        const city = addr.city || addr.town || addr.village || '';
        const state = addr.state || '';
        const country = addr.country || '';
        locationName.textContent = `📌 ${city}${state ? ', ' + state : ''}${country ? ' - ' + country : ''}`;
        const forecast = await fetchForecast(latitude, longitude);
        const times = forecast.hourly.time;
        const arrays = {
            temperature_2m: forecast.hourly.temperature_2m || [],
            relative_humidity_2m: forecast.hourly.relative_humidity_2m || [],
            precipitation: forecast.hourly.precipitation || [],
            cloud_cover: forecast.hourly.cloud_cover || [],
            wind_gusts_10m: forecast.hourly.wind_gusts_10m || [],
            weathercode: forecast.hourly.weathercode || []
        };
        const dayMap = groupHourlyByDate(times, arrays);
        renderDays(dayMap);
    }, () => {
        locationName.textContent = 'Erro ao obter localização';
    });
});