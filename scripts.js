document.addEventListener("DOMContentLoaded", () => {

    const API = 'https://api.open-meteo.com/v1/forecast';

    const el = {
        city: document.getElementById('cityInput'),
        form: document.getElementById('searchForm'),
        name: document.getElementById('locationName'),
        cards: document.getElementById('cards'),
        date: document.getElementById('todayDate'),
        geo: document.getElementById('geoButton'),
        history: document.getElementById('history')
    };

    const periods = [
        { name: 'Madrugada', start: 0, end: 5 },
        { name: 'Manhã', start: 6, end: 11 },
        { name: 'Tarde', start: 12, end: 17 },
        { name: 'Noite', start: 18, end: 23 }
    ];

    const fetchJSON = async url =>
        (await fetch(url)).json();

    const fmtDate = (d) => {

        const dt = new Date(d + 'T00:00:00');

        return {
            date: dt.toLocaleDateString('pt-BR'),
            weekday: dt.toLocaleDateString('pt-BR', { weekday: 'long' }),
            day: dt.getDay()
        };
    };

    const addrText = a =>
        `${a.city || a.town || a.village || a.municipality || ''}`
        + (a.state ? `, ${a.state}` : '')
        + (a.country ? `, ${a.country}` : '');

    const cloudText = v => {

        if (v <= 10) {
            return `
            <span class="cloud-status">
                <img src="icons/clear.svg" class="cloud-icon">
                Limpo
            </span>
        `;
        }

        if (v <= 35) {
            return `
            <span class="cloud-status">
                <img src="icons/few-clouds.svg" class="cloud-icon">
                Poucas nuvens
            </span>
        `;
        }

        if (v <= 60) {
            return `
            <span class="cloud-status">
                <img src="icons/partly-cloudy.svg" class="cloud-icon">
                Algumas nuvens
            </span>
        `;
        }

        if (v <= 85) {
            return `
            <span class="cloud-status">
                <img src="icons/cloudy.svg" class="cloud-icon">
                Nublado
            </span>
        `;
        }

        return `
        <span class="cloud-status">
            <img src="icons/overcast.svg" class="cloud-icon">
            Encoberto
        </span>
    `;
    };

    const forecast = (lat, lon) => {

        const url = new URL(API);

        url.searchParams.set('latitude', lat);
        url.searchParams.set('longitude', lon);

        url.searchParams.set('timezone', 'America/Fortaleza');

        url.searchParams.set('daily', [
            'weather_code',
            'temperature_2m_max',
            'temperature_2m_min',
            'precipitation_sum',
            'precipitation_probability_max',
            'wind_gusts_10m_max'
        ].join(','));

        url.searchParams.set('hourly', [
            'cloud_cover',
            'precipitation_probability',
            'wind_gusts_10m',
            'precipitation'
        ].join(','));

        return fetchJSON(url);
    };

    const search = q =>
        fetchJSON(
            `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&q=${encodeURIComponent(q)}&limit=1`
        ).then(d => {

            if (!d[0]) throw new Error();

            return {
                lat: +d[0].lat,
                lon: +d[0].lon,
                name: addrText(d[0].address || {})
            };
        });

    const periodData = (data, dayIndex, startHour, endHour) => {

        const base = dayIndex * 24;

        const clouds = [];
        const rainProb = [];
        const gusts = [];
        const rainAmount = [];

        for (let h = startHour; h <= endHour; h++) {

            const idx = base + h;

            clouds.push(
                data.hourly.cloud_cover[idx]
            );

            rainProb.push(
                data.hourly.precipitation_probability[idx]
            );

            gusts.push(
                data.hourly.wind_gusts_10m[idx]
            );

            rainAmount.push(
                data.hourly.precipitation[idx]
            );
        }

        const avgCloud =
            clouds.reduce((a, b) => a + b, 0) / clouds.length;

        const totalRain =
            rainAmount.reduce((a, b) => a + b, 0);

        return {
            clouds: cloudText(avgCloud),
            rain: Math.max(...rainProb),
            gust: Math.max(...gusts),
            accumulation: totalRain
        };
    };

    const saveHistory = (place) => {

        let history =
            JSON.parse(localStorage.getItem('weatherHistory') || '[]');

        history = history.filter(h => h.name !== place.name);

        history.unshift(place);

        history = history.slice(0, 3);

        localStorage.setItem(
            'weatherHistory',
            JSON.stringify(history)
        );

        renderHistory();
    };

    const renderHistory = () => {

        if (!el.history) return;

        const history =
            JSON.parse(localStorage.getItem('weatherHistory') || '[]');

        el.history.innerHTML = '';

        history.forEach(item => {

            const btn = document.createElement('button');

            btn.className = 'history-btn';

            btn.textContent = item.name;

            btn.addEventListener('click', () => {
                load(item.lat, item.lon, item.name);
            });

            el.history.appendChild(btn);
        });
    };

    const render = (data) => {

        el.cards.innerHTML = '';

        data.daily.time.forEach((d, i) => {

            const { date, weekday, day } = fmtDate(d);

            const min = data.daily.temperature_2m_min[i];
            const max = data.daily.temperature_2m_max[i];

            const rain = data.daily.precipitation_sum[i];
            const prob = data.daily.precipitation_probability_max[i];

            const wind = data.daily.wind_gusts_10m_max[i];

            const weekend =
                day === 0 || day === 6;

            const div = document.createElement('div');

            div.className = 'day';

            div.innerHTML = `
                <div class="day-row">

                    <div class="date-line ${weekend ? 'weekend' : ''}">
                        ${weekday} • ${date}
                    </div>

                    <div class="row-data">

                        <div>
                            🌡️ ${min.toFixed(0)}° a ${max.toFixed(0)}°
                        </div>

                        <div>
                            💧 ${rain.toFixed(1)} mm (${prob}%)
                        </div>

                        <div>
                            🍃 ${wind.toFixed(0)} km/h
                        </div>

                    </div>

                </div>
            `;

            const details = document.createElement('div');

            details.className = 'div2';

            periods.forEach(p => {

                const info =
                    periodData(data, i, p.start, p.end);

                details.innerHTML += `
                    <div class="period">

                        <div class="period-title">
                            ${p.name}
                        </div>

                        <div>
                            ${info.clouds}
                        </div>

                        <div>
                            💧 ${info.accumulation.toFixed(1)} mm (${info.rain}%)
                        </div>

                        <div>
                            🍃 ${info.gust.toFixed(0)} km/h
                        </div>

                    </div>
                `;
            });

            const btn = document.createElement('div');

            btn.className = 'details-btn';

            btn.innerHTML = '▾';

            btn.addEventListener('click', () => {

                details.classList.toggle('open');

                btn.innerHTML =
                    details.classList.contains('open')
                        ? '▴'
                        : '▾';
            });

            div.appendChild(btn);

            div.appendChild(details);

            el.cards.appendChild(div);
        });

        el.city.value = '';
    };

    async function load(lat, lon, placeName = '') {

        el.name.textContent = '⏳ Carregando...';

        try {

            const f = await forecast(lat, lon);

            render(f);

            let finalName = placeName;

            if (!finalName) {

                const rev = await fetchJSON(
                    `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&addressdetails=1`
                );

                finalName =
                    addrText(rev.address || {});
            }

            el.name.textContent =
                '🗺️ ' + finalName;

            saveHistory({
                lat,
                lon,
                name: finalName
            });

        } catch (e) {

            console.error(e);

            el.name.textContent =
                '❌ Erro ao carregar previsão';
        }
    }

    el.form.addEventListener('submit', async (e) => {

        e.preventDefault();

        if (!el.city.value.trim()) return;

        try {

            const r =
                await search(el.city.value.trim());

            load(r.lat, r.lon, r.name);

        } catch {

            el.name.textContent =
                '❌ Erro ao carregar';
        }
    });

    el.geo.addEventListener('click', () => {

        if (!navigator.geolocation)
            return alert('Geolocalização não suportada.');

        el.name.textContent =
            '📍 Obtendo localização...';

        navigator.geolocation.getCurrentPosition(

            p => {
                load(
                    p.coords.latitude,
                    p.coords.longitude
                );
            },

            () => {
                el.name.textContent =
                    '❌ Erro ao obter localização';
            }
        );
    });

    const now = new Date();

    el.date.textContent =
        `${now.toLocaleDateString('pt-BR')} - ${now.toLocaleDateString('pt-BR', { weekday: 'short' })}`;

    renderHistory();
});