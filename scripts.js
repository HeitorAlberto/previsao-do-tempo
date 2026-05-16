document.addEventListener("DOMContentLoaded", () => {

    const API = 'https://api.open-meteo.com/v1/forecast';
    const MODEL = 'ecmwf_ifs';

    const el = {
        city: document.getElementById('cityInput'),
        form: document.getElementById('searchForm'),
        name: document.getElementById('locationName'),
        cards: document.getElementById('cards'),
        date: document.getElementById('todayDate'),
        geo: document.getElementById('geoButton')
    };

    const fmtDate = d => {
        const dt = new Date(d + 'T00:00:00');
        return {
            date: dt.toLocaleDateString('pt-BR'),
            weekday: dt.toLocaleDateString('pt-BR', { weekday: 'long' })
        };
    };

    const addrText = a =>
        `${a.city || a.town || a.village || a.municipality || ''}`
        + (a.state ? `, ${a.state}` : '')
        + (a.country ? `, ${a.country}` : '');

    const fetchJSON = async url => (await fetch(url)).json();

    const forecast = (lat, lon) => {
        const url = new URL(API);
        url.searchParams.set('latitude', lat);
        url.searchParams.set('longitude', lon);
        url.searchParams.set('models', MODEL);
        url.searchParams.set('timezone', 'America/Fortaleza');
        url.searchParams.set('forecast_days', '15');
        url.searchParams.set(
            'hourly',
            'temperature_2m,precipitation,wind_gusts_10m,cloud_cover_low,cloud_cover_mid'
        );

        return fetchJSON(url);
    };

    const search = q =>
        fetchJSON(`https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&q=${encodeURIComponent(q)}&limit=1`)
            .then(d => {
                if (!d[0]) throw new Error();
                return {
                    lat: +d[0].lat,
                    lon: +d[0].lon,
                    name: addrText(d[0].address || {})
                };
            });

    const PERIODS = [
        { label: 'Madrugada', start: 0, end: 6 },
        { label: 'Manhã', start: 6, end: 12 },
        { label: 'Tarde', start: 12, end: 18 },
        { label: 'Noite', start: 18, end: 24 },
    ];

    /* =========================
       NÍVEL DE NUVENS (SIMPLIFICADO)
    ========================== */
    const getCloudLevel = (cloud) => {
        if (cloud <= 20) return 'a';
        if (cloud <= 50) return 'b';
        if (cloud <= 80) return 'c';
        return 'd';
    };

    const groupByDay = (times, data) => {
        const map = new Map();

        times.forEach((t, i) => {
            const key = t.slice(0, 10);
            const hour = parseInt(t.slice(11, 13), 10);

            if (!map.has(key)) {
                map.set(key, {
                    all: [],
                    byPeriod: [[], [], [], []]
                });
            }

            const entry = {
                t: data.temperature_2m[i],
                p: data.precipitation[i],
                w: data.wind_gusts_10m[i],
                cl: data.cloud_cover_low[i],
                cm: data.cloud_cover_mid[i]
            };

            const day = map.get(key);
            day.all.push(entry);

            const periodIndex = PERIODS.findIndex(p => hour >= p.start && hour < p.end);
            if (periodIndex !== -1) {
                day.byPeriod[periodIndex].push(entry);
            }
        });

        return map;
    };

    const summary = arr =>
        arr.reduce((a, v) => ({
            min: Math.min(a.min, v.t),
            max: Math.max(a.max, v.t),
            rain: a.rain + v.p,
            wind: Math.max(a.wind, v.w),
            cloudLow: a.cloudLow + v.cl,
            cloudMid: a.cloudMid + v.cm,
            count: a.count + 1
        }), {
            min: Infinity,
            max: -Infinity,
            rain: 0,
            wind: 0,
            cloudLow: 0,
            cloudMid: 0,
            count: 0
        });

    const periodBlocks = byPeriod =>
        PERIODS.map((p, i) => {
            const pts = byPeriod[i];
            if (!pts || pts.length === 0) return '';

            const s = summary(pts);

            const cloud = (s.cloudLow + s.cloudMid) / (2 * s.count);
            const level = getCloudLevel(cloud);

            return `
                <div class="period-card ${level}">

                    <div class="period-left">
                        <div class="period-title">${p.label}</div>
                    </div>

                    <div class="period-data">
                        <span class="period-icon"></span>
                        <div class="period-item rain">${s.rain.toFixed(1)} mm</div>
                        <div class="period-item wind">${s.wind.toFixed(0)} km/h</div>
                    </div>

                </div>
            `;
        }).join('');

    const render = map => {
        el.cards.innerHTML = '';

        [...map.entries()].slice(0, 15).forEach(([d, { all, byPeriod }]) => {

            const s = summary(all);
            const { date, weekday } = fmtDate(d);
            const isWeekend = ['sábado', 'domingo'].includes(weekday);

            const div = document.createElement('div');
            div.className = 'day';

            div.innerHTML = `
                <div class="day-row">

                    <div class="date-line ${isWeekend ? 'weekend' : ''}">
                        ${date} • ${weekday}
                    </div>

                    <div class="main-info">
                        <div class="badge badge-temp">🌡️ ${s.min.toFixed(0)}° a ${s.max.toFixed(0)}°</div>
                        <div class="badge badge-precip">☔ ${s.rain.toFixed(1)} mm</div>
                        <div class="badge badge-wind">🍃 ${s.wind.toFixed(0)} km/h</div>
                    </div>

                    <div class="expand-wrapper">
                        <button class="btn-expand" aria-expanded="false">
                            ▾ Detalhes por período
                        </button>

                        <div class="period-detail" hidden>
                            <div class="period-container">
                                ${periodBlocks(byPeriod)}
                            </div>
                        </div>
                    </div>

                </div>
            `;

            const btn = div.querySelector('.btn-expand');
            const detail = div.querySelector('.period-detail');

            btn.addEventListener('click', () => {
                const open = !detail.hidden;
                detail.hidden = open;
                btn.setAttribute('aria-expanded', String(!open));
                btn.textContent = open
                    ? '▾ Detalhes por período'
                    : '▴ Fechar detalhes';
            });

            el.cards.appendChild(div);
        });

        el.city.value = '';
    };

    async function load(lat, lon) {
        el.name.textContent = 'Carregando...';

        try {
            const f = await forecast(lat, lon);

            const map = groupByDay(
                f.hourly.time,
                {
                    temperature_2m: f.hourly.temperature_2m,
                    precipitation: f.hourly.precipitation,
                    wind_gusts_10m: f.hourly.wind_gusts_10m,
                    cloud_cover_low: f.hourly.cloud_cover_low,
                    cloud_cover_mid: f.hourly.cloud_cover_mid
                }
            );

            render(map);

            const rev = await fetchJSON(
                `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&addressdetails=1`
            );

            el.name.textContent = '🗺️ ' + addrText(rev.address || {});

        } catch {
            el.name.textContent = 'Erro ao carregar previsão';
        }
    }

    el.form.addEventListener('submit', async e => {
        e.preventDefault();
        if (!el.city.value.trim()) return;

        try {
            const r = await search(el.city.value.trim());
            load(r.lat, r.lon);
        } catch {
            el.name.textContent = 'Erro ao carregar';
        }
    });

    el.geo.addEventListener('click', () => {
        if (!navigator.geolocation)
            return alert('Geolocalização não suportada.');

        el.name.textContent = 'Obtendo localização...';

        navigator.geolocation.getCurrentPosition(
            p => load(p.coords.latitude, p.coords.longitude),
            () => el.name.textContent = 'Erro ao obter localização'
        );
    });

    const now = new Date();
    el.date.textContent =
        `${now.toLocaleDateString('pt-BR')} - ${now.toLocaleDateString('pt-BR', { weekday: 'long' })}`;
});