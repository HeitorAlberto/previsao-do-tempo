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
            weekday: dt.toLocaleDateString(
                'pt-BR',
                { weekday: 'long' }
            )
        };
    };

    const addrText = a =>
        `${a.city || a.town || a.village || a.municipality || ''}`
        + (a.state ? `, ${a.state}` : '')
        + (a.country ? `, ${a.country}` : '');

    const fetchJSON = async url =>
        (await fetch(url)).json();

    const forecast = (lat, lon) => {

        const url = new URL(API);

        url.searchParams.set('latitude', lat);
        url.searchParams.set('longitude', lon);
        url.searchParams.set('models', MODEL);
        url.searchParams.set('timezone', 'America/Fortaleza');
        url.searchParams.set('forecast_days', '15');

        url.searchParams.set(
            'hourly',
            [
                'temperature_2m',
                'precipitation',
                'wind_gusts_10m',
                'cloud_cover_low',
                'cloud_cover_mid',
                'is_day'
            ].join(',')
        );

        return fetchJSON(url);
    };

    const search = q =>
        fetchJSON(
            `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&q=${encodeURIComponent(q)}&limit=1`
        )
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

    const getCloudCoverage = (cloudCover, isDay = true) => {

        if (isDay) {

            if (cloudCover <= 15) {
                return {
                    level: 'clear',
                    label: '<img src="icons/sol.png">'
                };
            }

            if (cloudCover <= 35) {
                return {
                    level: 'few',
                    label: '<img src="icons/poucas-nuvens-dia.png">'
                };
            }

            if (cloudCover <= 60) {
                return {
                    level: 'many',
                    label: '<img src="icons/algumas-nuvens-dia.png">'
                };
            }

            if (cloudCover <= 85) {
                return {
                    level: 'more-clouds',
                    label: '<img src="icons/muitas-nuvens-dia.png">'
                };
            }

            return {
                level: 'overcast',
                label: '<img src="icons/nublado.png">'
            };

        } else {

            if (cloudCover <= 15) {
                return {
                    level: 'clear',
                    label: '<img src="icons/lua.png">'
                };
            }

            if (cloudCover <= 35) {
                return {
                    level: 'few',
                    label: '<img src="icons/poucas-nuvens-noite.png">'
                };
            }

            if (cloudCover <= 60) {
                return {
                    level: 'many',
                    label: '<img src="icons/algumas-nuvens-noite.png">'
                };
            }

            if (cloudCover <= 85) {
                return {
                    level: 'more-clouds',
                    label: '<img src="icons/muitas-nuvens-noite.png">'
                };
            }

            return {
                level: 'overcast',
                label: '<img src="icons/nublado.png">'
            };
        }
    };

    const groupByDay = (times, data) => {

        const map = new Map();

        // SUAVIZAÇÃO DE NUVENS EM 3H
        const cloud3h = new Map();

        times.forEach((t, i) => {

            const date = t.slice(0, 10);

            const hour =
                parseInt(t.slice(11, 13), 10);

            const cloudBlock =
                Math.floor(hour / 3);

            const cloudKey =
                `${date}-cloud-${cloudBlock}`;

            const low =
                data.cloud_cover_low[i];

            const mid =
                data.cloud_cover_mid[i];

            // COMPOSIÇÃO PROBABILÍSTICA
            const cloudCover =
                100 * (
                    1 -
                    (
                        (1 - low / 100) *
                        (1 - mid / 100)
                    )
                );

            if (!cloud3h.has(cloudKey)) {

                cloud3h.set(cloudKey, {
                    values: [],
                    isDayValues: []
                });
            }

            cloud3h.get(cloudKey)
                .values.push(cloudCover);

            cloud3h.get(cloudKey)
                .isDayValues.push(data.is_day[i]);
        });

        // MÉDIAS 3H
        const cloudAverages = new Map();

        cloud3h.forEach((v, k) => {

            const avg =
                v.values.reduce((a, b) => a + b, 0)
                / v.values.length;

            const isDay =
                v.isDayValues.reduce((a, b) => a + b, 0)
                >= (v.isDayValues.length / 2);

            cloudAverages.set(k, {
                cloudCover: avg,
                isDay
            });
        });

        // DADOS REAIS
        times.forEach((t, i) => {

            const date = t.slice(0, 10);

            const hour =
                parseInt(t.slice(11, 13), 10);

            if (!map.has(date)) {

                map.set(date, {
                    all: [],
                    byPeriod: [[], [], [], []]
                });
            }

            const periodIndex =
                PERIODS.findIndex(
                    p => hour >= p.start && hour < p.end
                );

            const cloudBlock =
                Math.floor(hour / 3);

            const cloudKey =
                `${date}-cloud-${cloudBlock}`;

            const cloudData =
                cloudAverages.get(cloudKey);

            const entry = {

                // TEMPERATURA ORIGINAL
                t: data.temperature_2m[i],

                // CHUVA HORÁRIA
                p: data.precipitation[i],

                // RAJADA HORÁRIA
                w: data.wind_gusts_10m[i],

                // NUVEM SUAVIZADA
                cc: cloudData.cloudCover,

                isDay: cloudData.isDay
            };

            const day = map.get(date);

            day.all.push(entry);

            if (periodIndex !== -1) {
                day.byPeriod[periodIndex].push(entry);
            }
        });

        return map;
    };

    const summary = arr => {

        if (arr.length === 0) {

            return {
                min: 0,
                max: 0,
                rain: 0,
                wind: 0,
                cloudCover: 0,
                count: 0,
                isDay: true
            };
        }

        const result = arr.reduce((a, v) => ({

            // TEMPERATURA
            min: Math.min(a.min, v.t),
            max: Math.max(a.max, v.t),

            // CHUVA TOTAL
            rain: a.rain + v.p,

            // RAJADA MÁXIMA
            wind: Math.max(a.wind, v.w),

            cloudCovers: [
                ...a.cloudCovers,
                v.cc
            ],

            dayValues: [
                ...a.dayValues,
                v.isDay ? 1 : 0
            ],

            count: a.count + 1

        }), {

            min: Infinity,
            max: -Infinity,

            rain: 0,
            wind: 0,

            cloudCovers: [],
            dayValues: [],

            count: 0
        });

        const cloudCover =
            result.cloudCovers.reduce((a, b) => a + b, 0)
            / result.cloudCovers.length;

        const isDay =
            result.dayValues.reduce((a, b) => a + b, 0)
            >= (result.dayValues.length / 2);

        return {

            min:
                result.min === Infinity
                    ? 0
                    : result.min,

            max:
                result.max === -Infinity
                    ? 0
                    : result.max,

            rain: result.rain,

            // MÁXIMA REAL
            wind: result.wind,

            cloudCover,

            count: result.count,

            isDay
        };
    };

    const periodBlocks = byPeriod =>

        PERIODS.map((p, i) => {

            const pts = byPeriod[i];

            if (!pts || pts.length === 0)
                return '';

            const s = summary(pts);

            const cloudInfo =
                getCloudCoverage(
                    s.cloudCover,
                    s.isDay
                );

            return `
                <div class="period-card ${cloudInfo.level}">

                    <div class="period-title-wrapper">
                        <div class="period-title">
                            ${p.label}
                        </div>
                    </div>

                    <div class="period-left">
                        <div class="period-cloud-level">
                            ${cloudInfo.label}
                        </div>
                    </div>

                    <div class="period-data">

                        <div class="period-item rain">
                            💧 ${s.rain.toFixed(1)} mm
                        </div>

                        <div class="period-item wind">
                            🍃 ${s.wind.toFixed(0)} km/h
                        </div>

                    </div>

                </div>
            `;

        }).join('');

    const render = map => {

        el.cards.innerHTML = '';

        [...map.entries()]
            .slice(0, 15)
            .forEach(([d, { all, byPeriod }]) => {

                const s = summary(all);

                const { date, weekday } =
                    fmtDate(d);

                const isWeekend =
                    ['sábado', 'domingo']
                        .includes(weekday);

                const cloudInfo =
                    getCloudCoverage(
                        s.cloudCover,
                        s.isDay
                    );

                const div =
                    document.createElement('div');

                div.className = 'day';

                div.innerHTML = `
                    <div class="day-row">

                        <div class="date-line ${isWeekend ? 'weekend' : ''}">
                            ${date} • ${weekday}
                        </div>

                        <div class="main-info">

                            <div class="badge badge-temp">
                                🌡️ ${s.min.toFixed(0)}° a ${s.max.toFixed(0)}°
                            </div>

                            <div class="badge badge-precip">
                                💧 ${s.rain.toFixed(1)} mm
                            </div>

                            <div class="badge badge-wind">
                                🍃 ${s.wind.toFixed(0)} km/h
                            </div>

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

                const btn =
                    div.querySelector('.btn-expand');

                const detail =
                    div.querySelector('.period-detail');

                btn.addEventListener('click', () => {

                    const open =
                        !detail.hidden;

                    detail.hidden = open;

                    btn.setAttribute(
                        'aria-expanded',
                        String(!open)
                    );

                    btn.textContent = open
                        ? '▾ Detalhes por período'
                        : '▴ Fechar detalhes';
                });

                el.cards.appendChild(div);
            });

        el.city.value = '';
    };

    async function load(lat, lon) {

        el.name.textContent =
            '⏳ Carregando...';

        try {

            const f =
                await forecast(lat, lon);

            const map =
                groupByDay(
                    f.hourly.time,
                    {
                        temperature_2m:
                            f.hourly.temperature_2m,

                        precipitation:
                            f.hourly.precipitation,

                        wind_gusts_10m:
                            f.hourly.wind_gusts_10m,

                        cloud_cover_low:
                            f.hourly.cloud_cover_low,

                        cloud_cover_mid:
                            f.hourly.cloud_cover_mid,

                        is_day:
                            f.hourly.is_day
                    }
                );

            render(map);

            const rev =
                await fetchJSON(
                    `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&addressdetails=1`
                );

            el.name.textContent =
                '🗺️ ' + addrText(rev.address || {});

        } catch (error) {

            console.error(error);

            el.name.textContent =
                '❌ Erro ao carregar previsão';
        }
    }

    el.form.addEventListener('submit', async e => {

        e.preventDefault();

        if (!el.city.value.trim())
            return;

        try {

            const r =
                await search(
                    el.city.value.trim()
                );

            load(r.lat, r.lon);

        } catch {

            el.name.textContent =
                '❌ Erro ao carregar';
        }
    });

    el.geo.addEventListener('click', () => {

        if (!navigator.geolocation)
            return alert(
                'Geolocalização não suportada.'
            );

        el.name.textContent =
            '📍 Obtendo localização...';

        navigator.geolocation.getCurrentPosition(

            p => load(
                p.coords.latitude,
                p.coords.longitude
            ),

            () =>
                el.name.textContent =
                '❌ Erro ao obter localização'
        );
    });

    const now = new Date();

    el.date.textContent =
        `${now.toLocaleDateString('pt-BR')} - ${now.toLocaleDateString(
            'pt-BR',
            { weekday: 'long' }
        )}`;
});