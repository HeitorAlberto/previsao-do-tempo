import { search, forecast } from './api.js';
import { fmtDate, periodData, addrText } from './utils.js';


document.addEventListener("DOMContentLoaded", () => {

  const periods = [
    { name: 'até 6h', start: 0, end: 5 },
    { name: 'até 12h', start: 6, end: 11 },
    { name: 'até 18h', start: 12, end: 17 },
    { name: 'até 24h', start: 18, end: 23 }
  ];

  const el = {
    city: document.getElementById('cityInput'),
    form: document.getElementById('searchForm'),
    name: document.getElementById('locationName'),
    cards: document.getElementById('cards'),
    date: document.getElementById('todayDate'),
    geo: document.getElementById('geoButton'),
    history: document.getElementById('history')
  };

  // -----------------------------
  // HISTÓRICO
  // -----------------------------

  const saveHistory = (place) => {
    let history = JSON.parse(localStorage.getItem('weatherHistory') || '[]');

    history = history.filter(h => h.name !== place.name);
    history.unshift(place);
    history = history.slice(0, 3);

    localStorage.setItem('weatherHistory', JSON.stringify(history));
    renderHistory();
  };

  const renderHistory = () => {
    if (!el.history) return;

    const history = JSON.parse(localStorage.getItem('weatherHistory') || '[]');

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

  // -----------------------------
  // RENDER PRINCIPAL
  // -----------------------------

  const render = (data) => {

    el.cards.innerHTML = '';

    data.daily.time.forEach((d, i) => {

      const { date, weekday, day } = fmtDate(d);

      const min = data.daily.temperature_2m_min[i];
      const max = data.daily.temperature_2m_max[i];
      const rain = data.daily.precipitation_sum[i];
      const prob = data.daily.precipitation_probability_max[i];
      const wind = data.daily.wind_gusts_10m_max[i];

      const weekend = day === 0 || day === 6;

      const div = document.createElement('div');
      div.className = 'day';

      const details = document.createElement('div');
      details.className = 'div2';

      const dailyAlerts = [];

      periods.forEach(p => {

        const info = periodData(data, i, p.start, p.end);

        info.alerts.forEach(a => dailyAlerts.push(a));

        details.innerHTML += `
                    <div class="period">

                        <div class="period-title">${p.name}</div>

                        <div>${info.clouds}</div>

                        <div>Chuvas: ${info.accumulation.toFixed(1)} mm (${info.rain}%)</div>

                        <div>Rajadas de ${info.gust.toFixed(0)} km/h</div>

                        ${info.alerts.map(a => `
                            <div class="weather-alert">
                                <img src="${a.icon}">
                                ${a.label}
                            </div>
                        `).join('')}

                    </div>
                `;
      });

      let dailyAlert = null;

      if (dailyAlerts.length) {
        dailyAlert = dailyAlerts.sort((a, b) => b.priority - a.priority)[0];
      }

      div.innerHTML = `
                <div class="day-row">

                    <div class="date-line ${weekend ? 'weekend' : ''}">
                        ${weekday}, ${date}
                    </div>

                    <div class="row-data">

                        <span class="label-data">Temperatura</span>
                        <span class="data-values">${min.toFixed(0)}° a ${max.toFixed(0)}°</span>

                    </div>

                    <div class="row-data">
                        <span class="label-data">Chuva acumulada</span>
                        <span class="data-values">${rain.toFixed(1)} mm (${prob}%)</span>

                    </div>

                    <div class="row-data">
                        <span class="label-data">Rajadas de vento máx</span>
                        <span class="data-values">${wind.toFixed(0)} km/h</span>
                    </div>

                        ${dailyAlert ? `
                            <div class="daily-alert">
                                <img src="${dailyAlert.icon}">
                                ${dailyAlert.label}
                            </div>
                        ` : ''}

                    </div>

                </div>
            `;

      const btn = document.createElement('div');
      btn.className = 'details-btn';
      btn.innerHTML = `<img src="icons/arrow.svg" class="accordion-icon">`;

      btn.addEventListener('click', () => {
        details.classList.toggle('open');
        btn.classList.toggle('active');
      });

      div.appendChild(btn);
      div.appendChild(details);

      el.cards.appendChild(div);
    });

    el.city.value = '';
  };

  // -----------------------------
  // LOAD PRINCIPAL
  // -----------------------------

  async function load(lat, lon, placeName = '') {

    el.name.innerHTML = `
        <span class="location">
            <span>📍 Carregando localização...</span>
        </span>
    `;

    try {

      const f = await forecast(lat, lon);

      render(f);

      // força reverse geocoding
      const rev = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&addressdetails=1`
      ).then(r => r.json());

      let finalName = addrText(rev.address);

      // fallback
      if (!finalName) {
        finalName = placeName || 'Local desconhecido';
      }

      el.name.innerHTML = `
            <span class="location">
                <span>📍 ${finalName}</span>
            </span>
        `;

      saveHistory({
        lat,
        lon,
        name: finalName
      });

    } catch (e) {

      console.error(e);

      el.name.innerHTML = `
            <span class="location">
                <span>📍 Erro ao carregar...</span>
            </span>
        `;
    }
  }

  // -----------------------------
  // EVENTS
  // -----------------------------

  el.form.addEventListener('submit', async (e) => {
    e.preventDefault();

    if (!el.city.value.trim()) return;

    const r = await search(el.city.value.trim());
    load(r.lat, r.lon, r.name);
  });

  el.geo.addEventListener('click', () => {

    if (!navigator.geolocation)
      return alert('Geolocalização não suportada.');

    el.name.innerHTML = `
            <span class="location">
                <span>📍 Obtendo localização...</span>
            </span>
        `;

    navigator.geolocation.getCurrentPosition(
      p => load(p.coords.latitude, p.coords.longitude),
      () => {
        el.name.innerHTML = `
                    <span class="location">
                        <span>📍 Erro ao obter localização</span>
                    </span>
                `;
      }
    );
  });

  // -----------------------------
  // INIT
  // -----------------------------

  const now = new Date();

  el.date.textContent =
    `${now.toLocaleDateString('pt-BR')} - ${now.toLocaleDateString('pt-BR', { weekday: 'short' })}`;

  renderHistory();
});