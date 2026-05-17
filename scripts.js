document.addEventListener("DOMContentLoaded", () => {

    const API = 'https://api.open-meteo.com/v1/forecast';

    const el = {
        city: document.getElementById('cityInput'),
        form: document.getElementById('searchForm'),
        name: document.getElementById('locationName'),
        cards: document.getElementById('cards'),
        date: document.getElementById('todayDate'),
        geo: document.getElementById('geoButton')
    };

    const fetchJSON = async url =>
        (await fetch(url)).json();

    const fmtDate = (d) => {
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


    const render = (data) => {

        el.cards.innerHTML = '';

        data.daily.time.forEach((d, i) => {

            const { date, weekday } = fmtDate(d);

            const min = data.daily.temperature_2m_min[i];
            const max = data.daily.temperature_2m_max[i];

            const rain = data.daily.precipitation_sum[i];
            const prob = data.daily.precipitation_probability_max[i];

            const wind = data.daily.wind_gusts_10m_max[i];

            const code = data.daily.weather_code[i];

            const div = document.createElement('div');

            div.className = 'day';

            div.innerHTML = `
                <div class="day-row">

                    <div class="date-line">
                        ${weekday} • ${date}
                    </div>

                    <div class="row-data">

                        <div> 🌡️ ${min.toFixed(0)}° a ${max.toFixed(0)}° </div>
                    

                    
                        <div> 💧 ${rain.toFixed(1)} mm (${prob}%) </div>
                    

                    
                        <div> 🍃 ${wind.toFixed(0)} km/h </div>
                    </div>

                </div>
            `;

            el.cards.appendChild(div);
        });

        el.city.value = '';
    };

    async function load(lat, lon) {

        el.name.textContent = '⏳ Carregando...';

        try {

            const f = await forecast(lat, lon);

            render(f);

            const rev = await fetchJSON(
                `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&addressdetails=1`
            );

            el.name.textContent =
                '🗺️ ' + addrText(rev.address || {});

        } catch (e) {
            console.error(e);
            el.name.textContent = '❌ Erro ao carregar previsão';
        }
    }

    el.form.addEventListener('submit', async (e) => {
        e.preventDefault();

        if (!el.city.value.trim()) return;

        try {
            const r = await search(el.city.value.trim());
            load(r.lat, r.lon);
        } catch {
            el.name.textContent = '❌ Erro ao carregar';
        }
    });

    el.geo.addEventListener('click', () => {

        if (!navigator.geolocation)
            return alert('Geolocalização não suportada.');

        el.name.textContent = '📍 Obtendo localização...';

        navigator.geolocation.getCurrentPosition(
            p => load(p.coords.latitude, p.coords.longitude),
            () => el.name.textContent = '❌ Erro ao obter localização'
        );
    });

    const now = new Date();

    el.date.textContent =
        `${now.toLocaleDateString('pt-BR')} - ${now.toLocaleDateString('pt-BR', { weekday: 'short' })}`;
});