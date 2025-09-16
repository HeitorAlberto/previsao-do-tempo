let latitude = -9.6658;
let longitude = -35.7353;
let lastFetchedData = null;

function getCityName(addr) {
  return addr.city || addr.town || addr.village || addr.hamlet || addr.municipality || addr.county || addr.state || "";
}

function formatDate(dateStr) {
  const date = new Date(dateStr + "T00:00:00");
  const today = new Date();
  const isToday = date.toDateString() === today.toDateString();
  const days = ["Domingo","Segunda","Terça","Quarta","Quinta","Sexta","Sábado"];
  let dayName = isToday ? "Hoje" : days[date.getDay()];
  const dayNum = String(date.getDate()).padStart(2,'0');
  const monthNum = String(date.getMonth()+1).padStart(2,'0');
  return `${dayName}, ${dayNum}/${monthNum}`;
}

function formatHour(str) {
  const d = new Date(str);
  const h = String(d.getHours()).padStart(2,'0');
  const m = String(d.getMinutes()).padStart(2,'0');
  return `${h}h${m}`;
}

const currentParams = [
  "cloud_cover","temperature_2m","relative_humidity_2m","apparent_temperature","is_day",
  "snowfall","showers","rain","precipitation","weather_code","pressure_msl","surface_pressure",
  "wind_gusts_10m","wind_direction_10m","wind_speed_10m"
].join(",");

const dailyParams = [
  "temperature_2m_max","temperature_2m_min","apparent_temperature_max","apparent_temperature_min",
  "uv_index_max","rain_sum","precipitation_probability_max","wind_speed_10m_max","wind_gusts_10m_max",
  "sunrise","sunset","weathercode"
].join(",");

const hourlyParams = [
  "temperature_2m","apparent_temperature","relative_humidity_2m",
  "precipitation","precipitation_probability","cloud_cover",
  "wind_speed_10m","wind_gusts_10m","weathercode"
].join(",");

async function fetchWeather() {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&daily=${dailyParams}&hourly=${hourlyParams}&current=${currentParams}&timezone=auto&forecast_days=16`;
  const res = await fetch(url);
  const data = await res.json();
  lastFetchedData = data;
  renderWeather(data);
}

function getPeriodData(hourly, start, end, dayDate) {
  let chuva = 0, prob = 0, nuvens = 0, count = 0;
  hourly.time.forEach((t, i) => {
    const date = new Date(t);
    const hour = date.getHours();
    if (t.startsWith(dayDate) && hour >= start && hour <= end) {
      chuva += hourly.precipitation[i];
      prob = Math.max(prob, hourly.precipitation_probability[i]);
      nuvens += hourly.cloud_cover[i];
      count++;
    }
  });
  if (count === 0) return { chuva: 0, prob: 0, nuvens: 0 };
  return { chuva, prob: Math.round(prob), nuvens: Math.round(nuvens / count) };
}

function getHumidity(hourly, dayDate) {
  const indices = hourly.time.map((t,i)=>({t,i})).filter(({t})=>t.startsWith(dayDate)).map(({i})=>i);
  if(indices.length===0) return {min:0,max:0};
  let minH=100,maxH=0;
  indices.forEach(i=>{
    const h=hourly.relative_humidity_2m[i];
    if(h<minH) minH=h;
    if(h>maxH) maxH=h;
  });
  return {min: Math.round(minH), max: Math.round(maxH)};
}

function formatClouds(nuvens) {
  if (nuvens < 20) return "Céu limpo";
  if (nuvens < 55) return "Algumas nuvens";
  if (nuvens < 75) return "Muitas nuvens";
  return "Nublado";
}

// --- Render atual ---
function renderCurrentWeather(data) {
  const current = data.current;
  const now = new Date();
  let index = 0, minDiff = Infinity;
  data.hourly.time.forEach((t, i) => {
    const diff = Math.abs(new Date(t) - now);
    if (diff < minDiff) { minDiff = diff; index = i; }
  });
  const temp = Math.round(current.temperature_2m);
  const appTemp = Math.round(current.apparent_temperature);
  const humidity = Math.round(current.relative_humidity_2m);
  const chuva = current.precipitation.toFixed(1);
  const prob = data.hourly.precipitation_probability[index];
  const nuvens = current.cloud_cover;
  const vento = Math.round(current.wind_speed_10m);
  const rajada = Math.round(current.wind_gusts_10m);

  const card = document.createElement("div");
  card.className = "weather-card";
  card.innerHTML = `
    <h2>Agora</h2>
    <div class="weather-info" id="weather-info-now">
      <div class="badge temp">🌡️ Temperatura: ${temp}°</div>
      <div class="badge feels">🌡️ Sensação: ${appTemp}°</div>
      <div class="badge humidity">💧 Umidade: ${humidity}%</div>
      <div class="badge clouds">☁️ <span title="${nuvens}%">${formatClouds(nuvens)}</span></div>
      <div class="badge rain">☔ ${chuva} mm <span id = "span-prob">${prob}%</span></div>
      <div class="badge wind">🍃 Vento: ${vento} km/h</div>
      <div class="badge wind">🍃 Rajada: ${rajada} km/h</div>
    </div>
  `;
  document.getElementById("weather-container").appendChild(card);
}

// --- Render diário ---
function renderWeather(data) {
  const container = document.getElementById("weather-container");
  container.innerHTML = "";
  renderCurrentWeather(data);

  data.daily.time.forEach((day, index) => {
    const tempMin = Math.round(data.daily.temperature_2m_min[index]);
    const tempMax = Math.round(data.daily.temperature_2m_max[index]);
    const appMin = Math.round(data.daily.apparent_temperature_min[index]);
    const appMax = Math.round(data.daily.apparent_temperature_max[index]);
    const uvMax = Math.round(data.daily.uv_index_max[index]);
    const vento = Math.round(data.daily.wind_speed_10m_max[index]);
    const rajada = Math.round(data.daily.wind_gusts_10m_max[index]);
    const nascer = formatHour(data.daily.sunrise[index]);
    const por = formatHour(data.daily.sunset[index]);
    const probDia = Math.round(data.daily.precipitation_probability_max[index]);

    const periods = {
      "Madrugada": getPeriodData(data.hourly, 0, 5, day),
      "Manhã": getPeriodData(data.hourly, 6, 11, day),
      "Tarde": getPeriodData(data.hourly, 12, 17, day),
      "Noite": getPeriodData(data.hourly, 18, 23, day)
    };

    const humidity = getHumidity(data.hourly, day);
    const dailyIndices = data.hourly.time.map((t, i) => ({ t, i }))
      .filter(({ t }) => t.startsWith(day)).map(({ i }) => i);
    let chuvaDia = 0;
    dailyIndices.forEach(i => { chuvaDia += data.hourly.precipitation[i]; });

    const card = document.createElement("div");
    card.className = "weather-card";

    card.innerHTML = `
      <h2>${formatDate(day)}</h2>
      <div class="weather-info weather-info-daily">
        <div class="badge temp">🌡️ Temperatura: ${tempMin}° a ${tempMax}°</div>
        <div class="badge rain">☔ Chuva total: ${chuvaDia.toFixed(1)} mm <span id = "span-prob">${probDia}%</span></div>
        <div class="badge uv">☀️ UV Máx: ${uvMax}</div>
      </div>

      <div class="periods"></div>

      <div class="extra-info extra-info-daily">
        <div class="badge humidity">💧 Umidade: ${humidity.min}% a ${humidity.max}%</div>
        <div class="badge wind">🍃 Ventos: ${vento} km/h</div>
        <div class="badge wind">🍃 Rajadas: ${rajada} km/h</div>
        <div class="badge uv">☀️ ${nascer} até ${por}</div>
      </div>
    `;

    const periodsDiv = card.querySelector(".periods");

    function enableGridPeriods() {
      periodsDiv.innerHTML = Object.entries(periods).map(([label, d]) => `
        <div class="period-box">
          <h3>${label}</h3>
          <p>${d.chuva.toFixed(1)} mm</p>
          <p><span title="${d.nuvens}%">${formatClouds(d.nuvens)}</span></p>
        </div>
      `).join('');

      periodsDiv.style.display = "grid";
      periodsDiv.style.gap = "10px";
      if(window.innerWidth < 480){
        periodsDiv.style.gridTemplateColumns = "repeat(2, 1fr)"; // 2x2 mobile
      } else {
        periodsDiv.style.gridTemplateColumns = "repeat(4, 1fr)"; // 4 colunas desktop
      }
    }

    enableGridPeriods();
    window.addEventListener("resize", enableGridPeriods);
    container.appendChild(card);
  });
}

// --- Localização ---
const currentLocationDiv = document.getElementById("current-location");

async function searchLocation(query) {
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&q=${query}`);
    const data = await res.json();
    if(data && data.length>0){
      latitude = parseFloat(data[0].lat);
      longitude = parseFloat(data[0].lon);
      const addr = data[0].address;
      const city = getCityName(addr);
      const state = addr.state||"";
      const country = addr.country||"";
      currentLocationDiv.textContent = `📌 ${city}${city&&state?", ":""}${state}${(city||state)&&country?", ":""}${country}`;
      fetchWeather();
    } else { 
      alert("Localização não encontrada!"); 
      currentLocationDiv.textContent=""; 
    }
  } catch(e) {
    alert("Erro ao buscar localização.");
  }
}

const input = document.getElementById("location-input");
input.addEventListener("keydown",(e)=>{if(e.key==="Enter") searchLocation(input.value);});
document.getElementById("search-button").addEventListener("click",()=>{searchLocation(input.value);});

// --- Geolocalização ---
if(location.hostname === "localhost" || location.hostname === "127.0.0.1") {
  currentLocationDiv.textContent = "📌 Maceió, Alagoas, Brasil";
  fetchWeather();
} else if(navigator.geolocation){
  navigator.geolocation.getCurrentPosition(async pos=>{
    latitude = pos.coords.latitude;
    longitude = pos.coords.longitude;
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&addressdetails=1`);
      const data = await res.json();
      if(data && data.address){
        const addr = data.address;
        const city = getCityName(addr);
        const state = addr.state||"";
        const country = addr.country||"";
        currentLocationDiv.textContent = `📌 ${city}${city&&state?", ":""}${state}${(city||state)&&country?", ":""}${country}`;
      }
    } catch {
      currentLocationDiv.textContent = "📌 Localização desconhecida";
    }
    fetchWeather();
  },()=>fetchWeather());
} else {
  fetchWeather();
}
