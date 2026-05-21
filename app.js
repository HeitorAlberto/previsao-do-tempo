// app.js

import { search, forecast } from './api.js';

import {

  fmtDate,
  periodData,
  addrText,
  buildDailyWeatherText

} from './utils.js';


document.addEventListener(
  'DOMContentLoaded',
  () => {

    const periods = [

      {
        name: '0h - 6h',
        start: 0,
        end: 5
      },

      {
        name: '6h - 12h',
        start: 6,
        end: 11
      },

      {
        name: '12h - 18h',
        start: 12,
        end: 17
      },

      {
        name: '18h - 24h',
        start: 18,
        end: 23
      }
    ];

    const el = {

      city:
        document.getElementById(
          'cityInput'
        ),

      form:
        document.getElementById(
          'searchForm'
        ),

      name:
        document.getElementById(
          'locationName'
        ),

      cards:
        document.getElementById(
          'cards'
        ),

      date:
        document.getElementById(
          'todayDate'
        ),

      geo:
        document.getElementById(
          'geoButton'
        ),

      history:
        document.getElementById(
          'history'
        )
    };

    // -----------------------------
    // SKYTEXT
    // -----------------------------

    const skyRules = {

      'clear-clear':
        '☀️ Predomínio de sol',

      'clear-few-clouds':
        '🌤️ Sol com poucas nuvens',

      'clear-partly-cloudy':
        '⛅ Sol entre nuvens',

      'clear-cloudy':
        '⛅ Nebulosidade se intensifica',

      'clear-overcast':
        '⛅ Encoberto',


      'few-clouds-clear':
        '🌤️ Poucas nuvens e aberturas de sol',

      'few-clouds-few-clouds':
        '🌤️ Poucas nuvens',

      'few-clouds-partly-cloudy':
        '⛅ Sol entre nuvens',

      'few-clouds-cloudy':
        '⛅ Mais nuvens à tarde',

      'few-clouds-overcast':
        '⛅ Encoberto à tarde',


      'partly-cloudy-clear':
        '🌤️ Sol em maior parte',

      'partly-cloudy-few-clouds':
        '🌤️ Sol entre nuvens',

      'partly-cloudy-partly-cloudy':
        '⛅ Sol entre nuvens',

      'partly-cloudy-cloudy':
        '☁️ Predomínio de nebulosidade',

      'partly-cloudy-overcast':
        '☁️ Céu ficando encoberto',


      'cloudy-clear':
        '🌤️ Nebulosidade diminui à tarde',

      'cloudy-few-clouds':
        '🌥️ Mais aberturas à tarde',

      'cloudy-partly-cloudy':
        '🌥️ Variação de nebulosidade',

      'cloudy-cloudy':
        '☁️ Predomínio de nebulosidade',

      'cloudy-overcast':
        '☁️ Céu bastante nublado',


      'overcast-clear':
        '🌤️ Aberturas de sol ao longo do dia',

      'overcast-few-clouds':
        '🌥️ Nebulosidade diminuindo',

      'overcast-partly-cloudy':
        '🌥️ Nublado pela manhã',

      'overcast-cloudy':
        '🌥️ Nublado',

      'overcast-overcast':
        '☁️ Céu encoberto'
    };

    function buildSkyText({

      morningSky,
      afternoonSky

    }) {

      const key =
        `${morningSky}-${afternoonSky}`;

      return (
        skyRules[key] ||
        '🌥️ Variação de nebulosidade'
      );
    }

    // -----------------------------
    // HISTÓRICO
    // -----------------------------

    const saveHistory = (place) => {

      let history =
        JSON.parse(
          localStorage.getItem(
            'weatherHistory'
          ) || '[]'
        );

      history =
        history.filter(
          h => h.name !== place.name
        );

      history.unshift(place);

      history = history.slice(0, 3);

      localStorage.setItem(
        'weatherHistory',
        JSON.stringify(history)
      );

      renderHistory();
    };

    const renderHistory = () => {

      if (!el.history)
        return;

      const history =
        JSON.parse(
          localStorage.getItem(
            'weatherHistory'
          ) || '[]'
        );

      el.history.innerHTML = '';

      history.forEach(item => {

        const btn =
          document.createElement(
            'button'
          );

        btn.className =
          'history-btn';

        btn.textContent =
          item.name;

        btn.addEventListener(
          'click',
          () => {

            load(
              item.lat,
              item.lon,
              item.name
            );
          }
        );

        el.history.appendChild(btn);
      });
    };

    // -----------------------------
    // RENDER
    // -----------------------------

    const render = (data) => {

      el.cards.innerHTML = '';

      data.daily.time.forEach(
        (d, i) => {

          const {
            date,
            weekday,
            day

          } = fmtDate(d);

          const min =
            data.daily
              .temperature_2m_min[i];

          const max =
            data.daily
              .temperature_2m_max[i];

          const rain =
            data.daily
              .rain_sum[i];

          const showers =
            data.daily
              .showers_sum[i];

          const totalRain =
            rain + showers;

          const snow =
            data.daily
              .snowfall_sum[i];

          const prob =
            data.daily
              .precipitation_probability_max[i];

          const wind =
            data.daily
              .wind_gusts_10m_max[i];

          const weekend =
            day === 0 ||
            day === 6;

          const div =
            document.createElement(
              'div'
            );

          div.className = 'day';

          const details =
            document.createElement(
              'div'
            );

          details.className =
            'div2';

          const dailyAlerts = [];

          let morningSky = null;
          let afternoonSky = null;

          periods.forEach(
            (p, idx) => {

              const info =
                periodData(
                  data,
                  i,
                  p.start,
                  p.end
                );

              info.alerts.forEach(a =>
                dailyAlerts.push(a)
              );

              if (idx === 1) {

                morningSky =
                  info.cloudType;
              }

              if (idx === 2) {

                afternoonSky =
                  info.cloudType;
              }

              details.innerHTML += `
                <div class="period">

                  <div class="period-title">
                    ${p.name}
                  </div>

                  <div>
                    ${info.clouds}
                  </div>

                  <div>
                    Chuva:
                    ${(
                  info.rain +
                  info.showers
                ).toFixed(1)} mm
                    (${info.rainProb}%)
                  </div>

                  <div>
                    Rajadas de
                    ${info.gust.toFixed(0)} km/h
                  </div>

                  <div>
                      ${info.alerts.map(a => {

                        // NEVE

                        if (
                          a.type === 'snow' &&
                          info.snow > 0
                        ) {

                          return `
                            ${a.periodLabel}
                            (${info.snow.toFixed(0)} cm)
                          </div>
                          `;
                        }

                        return `
                          ${a.periodLabel}
                        </div>
                        `;

                      }).join('')}
                    </div>
              `;
            }
          );

          // ALERTA PRINCIPAL

          let dailyAlert = null;

          if (dailyAlerts.length) {

            dailyAlert =
              dailyAlerts
                .sort(
                  (a, b) =>
                    b.priority -
                    a.priority
                )[0];
          }

          // NEVE

          if (

            dailyAlert &&

            dailyAlert.type === 'snow' &&

            snow > 0

          ) {

            dailyAlert = {

              ...dailyAlert,

              label:
                `🌨️ Neve (${snow.toFixed(0)} cm)`
            };
          }

          // SKYTEXT

          const skyTextDay =
            buildSkyText({

              morningSky,
              afternoonSky
            });

          // WEATHER TEXT

          let weatherText =
            buildDailyWeatherText({

              weatherCode:
                data.daily
                  .weather_code[i],

              rain: totalRain,

              probability: prob,

              alerts: dailyAlerts
            });


          div.innerHTML = `
            <div class="day-row">

              <div class="date-line ${weekend ? 'weekend' : ''}">
                ${weekday}, ${date}
              </div>

              <div class="row-data">

                <span class="label-data">
                  Temperatura
                </span>

                <span class="data-values">
                  ${min.toFixed(0)}°
                  a
                  ${max.toFixed(0)}°
                </span>

              </div>

              <div class="row-data">

                <span class="label-data">
                  Chuva acumulada
                </span>

                <span class="data-values">
                  ${totalRain.toFixed(1)} mm
                  (${prob}%)
                </span>

              </div>

              <div class="row-data">

                <span class="label-data">
                  Rajadas de vento máx
                </span>

                <span class="data-values">
                  ${wind.toFixed(0)} km/h
                </span>

              </div>

              ${dailyAlert ? `
                <div class="row-full">
                  ${dailyAlert.label}
                </div>
              ` : ''}

              <div class="row-full">

                <div class="sky-block">
                  ${skyTextDay}
                </div>

              </div>

              ${weatherText ? `
                <div class="row-full">
                  ${weatherText}
                </div>
              ` : ''}

            </div>
          `;

          const btn =
            document.createElement(
              'div'
            );

          btn.className =
            'details-btn';

          btn.innerHTML = `
            <img
              src="icons/arrow.svg"
              class="accordion-icon"
            >
          `;

          btn.addEventListener(
            'click',
            () => {

              details.classList.toggle(
                'open'
              );

              btn.classList.toggle(
                'active'
              );
            }
          );

          div.appendChild(btn);

          div.appendChild(details);

          el.cards.appendChild(div);
        }
      );

      el.city.value = '';
    };

    // -----------------------------
    // LOAD
    // -----------------------------

    async function load(
      lat,
      lon,
      placeName = ''
    ) {

      el.name.innerHTML = `
        <span class="location">
          <span>
            📍 Carregando localização...
          </span>
        </span>
      `;

      try {

        const f =
          await forecast(
            lat,
            lon
          );

        render(f);

        const rev = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&addressdetails=1`
        ).then(r => r.json());

        let finalName =
          addrText(
            rev.address
          );

        if (!finalName) {

          finalName =
            placeName ||
            'Local desconhecido';
        }

        el.name.innerHTML = `
          <span class="location">
            <span>
              📍 ${finalName}
            </span>
          </span>
        `;

        saveHistory({

          lat,
          lon,

          name:
            finalName
        });

      } catch (e) {

        console.error(e);

        el.name.innerHTML = `
          <span class="location">
            <span>
              📍 Erro ao carregar...
            </span>
          </span>
        `;
      }
    }

    // -----------------------------
    // EVENTS
    // -----------------------------

    el.form.addEventListener(
      'submit',
      async (e) => {

        e.preventDefault();

        if (
          !el.city.value.trim()
        ) return;

        const r =
          await search(
            el.city.value.trim()
          );

        load(
          r.lat,
          r.lon,
          r.name
        );
      }
    );

    el.geo.addEventListener(
      'click',
      () => {

        if (
          !navigator.geolocation
        ) {

          return alert(
            'Geolocalização não suportada.'
          );
        }

        el.name.innerHTML = `
          <span class="location">
            <span>
              📍 Obtendo localização...
            </span>
          </span>
        `;

        navigator.geolocation
          .getCurrentPosition(

            p => {

              load(
                p.coords.latitude,
                p.coords.longitude
              );
            },

            () => {

              el.name.innerHTML = `
                <span class="location">
                  <span>
                    📍 Erro ao obter localização
                  </span>
                </span>
              `;
            }
          );
      }
    );

    // INIT

    const now = new Date();

    el.date.textContent =
      `${now.toLocaleDateString('pt-BR')} - ${now.toLocaleDateString(
        'pt-BR',
        {
          weekday: 'short'
        }
      )}`;

    renderHistory();
  }
);