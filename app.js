import { search, forecast } from './api.js';

import {
  fmtDate,
  periodData,
  addrText
} from './utils.js';

document.addEventListener('DOMContentLoaded', () => {

  const periods = [
    { name: '00h - 06h', start: 0, end: 5 },
    { name: '06h - 12h', start: 6, end: 11 },
    { name: '12h - 18h', start: 12, end: 17 },
    { name: '18h - 24h', start: 18, end: 23 }
  ];

  const el = {
    city: document.getElementById('cityInput'),
    form: document.getElementById('searchForm'),
    name: document.getElementById('locationName'),
    cards: document.getElementById('cards'),
    geo: document.getElementById('geoButton'),
    history: document.getElementById('history')
  };

  const iconMap = {
    clear_day: 'sol.webp',
    clear_night: 'lua.webp',
    clouds_day: 'sol-nuvens.webp',
    clouds_night: 'lua-nuvens.webp',
    overcast_day: 'nublado.webp',
    overcast_night: 'nublado.webp'
  };

  const isNight = (hour) => hour < 6 || hour >= 18;

  // -----------------------------
  // HISTORY
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
  // RENDER
  // -----------------------------

  const render = (data) => {

    el.cards.innerHTML = '';

    const daily = data.daily || {};

    data.daily.time.forEach((d, i) => {

      const { date, weekday, day } = fmtDate(d);

      const min = daily.temperature_2m_min?.[i] ?? 0;
      const max = daily.temperature_2m_max?.[i] ?? 0;

      const totalRain = daily.precipitation_sum?.[i] ?? 0;
      const totalSnow = daily.snowfall_sum?.[i] ?? 0;

      const prob = daily.precipitation_probability_max?.[i] ?? 0;
      const wind = daily.wind_gusts_10m_max?.[i] ?? 0;

      const weekend = day === 0 || day === 6;

      const rainLabelDay =
        totalRain > 70 ? '⚠️ Chuva extrema' :
          totalRain >= 20 ? '⚠️ Chuva forte' :
            totalRain >= 10 ? '☔ Chuva moderada' :
              totalRain >= 5 ? '☔ Chuva leve' :
                totalRain >= 0.5 ? '☔ Chuva leve e isolada' :
                  '🌂 Sem precipitação';

      const div = document.createElement('div');
      div.className = 'day';

      const details = document.createElement('div');
      details.className = 'div2';

      details.classList.remove('open');

      const btn = document.createElement('div');
      btn.className = 'details-btn';

      btn.innerHTML = `<img src="icons/arrow.svg" class="accordion-icon" />`;

      btn.addEventListener('click', () => {
        const isOpen = details.classList.toggle('open');
        btn.classList.toggle('active', isOpen);
      });

      // -----------------------------
      // PERÍODOS
      // -----------------------------

      periods.forEach((p) => {

        const info = periodData(data, i, p.start, p.end);

        const night = isNight(p.start);
        const iconKey = `${info.cloudType}_${night ? 'night' : 'day'}`;

        details.innerHTML += `
          <div class="period">

            <div class="period-title">${p.name}</div>

            <div class="period-cloud-icon">
              <img src="icons/${iconMap[iconKey]}" />
            </div>

            <div class="period-rain">
              💧 ${info.rain.toFixed(1)} mm (${info.rainProb}%)
            </div>

            <div class="period-wind">
              🍃 ${info.gust.toFixed(0)} km/h
            </div>

            ${info.snow > 0 ? `
              <div class="period-snow">
                ❄️ ${info.snow.toFixed(1)} cm
              </div>
            ` : ''}

            ${info.alerts.map(a => `
              <div class="period-alert">
                <span>${a.label}</span>
              </div>
            `).join('')}

          </div>
        `;
      });

      // -----------------------------
      // CARD DIÁRIO
      // -----------------------------

      const periodAlerts = periods.flatMap(p =>
        periodData(data, i, p.start, p.end).alerts
      );

      const topAlert =
        periodAlerts.sort((a, b) => b.priority - a.priority)[0];

      div.innerHTML = `
        <div class="day-row">

          <div class="date-line ${weekend ? 'weekend' : ''}">
            ${weekday}, ${date}
          </div>

          <div class="row-data">
            <span class="label-data">🌡️ Temperatura</span>
            <span class="data-values">${min.toFixed(0)}° a ${max.toFixed(0)}°</span>
          </div>

          <div class="row-data">
            <span class="label-data">${rainLabelDay}</span>
            <span class="data-values">${totalRain.toFixed(1)} mm (${prob}%)</span>
          </div>

          ${totalSnow > 0 ? `
            <div class="row-data">
              <span class="label-data">❄️ Neve</span>
              <span class="data-values"> ${totalSnow.toFixed(1)} cm</span>
            </div>
          ` : ''}

          <div class="row-data">
            <span class="label-data">🍃 Rajadas de vento máx</span>
            <span class="data-values">${wind.toFixed(0)} km/h</span>
          </div>

          ${topAlert ? `
            <div class="day-alert">
              <span>${topAlert.label}</span>
            </div>
          ` : ''}

        </div>
      `;

      div.appendChild(btn);
      div.appendChild(details);

      el.cards.appendChild(div);
    });

    el.city.value = '';
  };

  // -----------------------------
  // LOAD
  // -----------------------------

  const load = async (lat, lon, placeName = '') => {

    el.name.innerHTML = '📍 Carregando...';

    const f = await forecast(lat, lon);
    render(f);

    const rev = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`
    ).then(r => r.json());

    const name = addrText(rev.address) || placeName;

    el.name.innerHTML = `📍 ${name}`;

    saveHistory({ lat, lon, name });
  };

  // -----------------------------
  // EVENTS
  // -----------------------------

  el.form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const r = await search(el.city.value.trim());
    load(r.lat, r.lon, r.name);
  });

  el.geo.addEventListener('click', () => {
    navigator.geolocation.getCurrentPosition(p =>
      load(p.coords.latitude, p.coords.longitude)
    );
  });

  renderHistory();
});