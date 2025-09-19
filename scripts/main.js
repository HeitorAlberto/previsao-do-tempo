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

// --- Função para hora local do card "Agora" ---
function formatHourLocal(date = new Date()) {
  const h = String(date.getHours()).padStart(2, "0");
  const m = String(date.getMinutes()).padStart(2, "0");
  return `${h}h${m}`;
}

// --- Função para pegar só a hora (HHh) das previsões ---
function getHourOnly(str) {
  const d = new Date(str);
  return d.getHours() + "h";
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
  if (nuvens < 75) return "Nublado";
  return "Muitas nuvens";
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
      <div class="badge time">⌚ ${formatHourLocal()}</div>
      <div class="badge temp">🌡️ Temperatura: ${temp}°</div>
      <div class="badge feels">🌡️ Sensação: ${appTemp}°</div>
      <div class="badge humidity">💧 Umidade: ${humidity}%</div>
      <div class="badge clouds">${formatClouds(nuvens)} <span title="${nuvens}%">${nuvens}%</span></div>
      <div class="badge rain">☔ ${chuva} mm <span id="span-prob">${prob}%</span></div>
      <div class="badge wind">🍃 Ventos: ${vento} km/h</div>
      <div class="badge wind">🍃 Rajadas: ${rajada} km/h</div>
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
    const uvMax = Math.round(data.daily.uv_index_max[index]);
    const vento = Math.round(data.daily.wind_speed_10m_max[index]);
    const rajada = Math.round(data.daily.wind_gusts_10m_max[index]);
    const nascer = getHourOnly(data.daily.sunrise[index]);
    const por = getHourOnly(data.daily.sunset[index]);
    const probDia = Math.round(data.daily.precipitation_probability_max[index]);

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
        <div class="badge temp">🌡️ Temperatura: ${tempMin}° até ${tempMax}°</div>
        <div class="badge rain">☔ Chuva total: ${chuvaDia.toFixed(1)} mm <span id="span-prob">${probDia}%</span></div>
        <div class="badge uv">☀️ UV Máx: ${uvMax}</div>
      </div>

      <div class="hourly-carousel"></div>

      <div class="extra-info extra-info-daily">
        <div class="badge humidity">💧 Umidade: ${humidity.min}% a ${humidity.max}%</div>
        <div class="badge wind">🍃 Ventos: ${vento} km/h</div>
        <div class="badge wind">🍃 Rajadas: ${rajada} km/h</div>
        <div class="badge uv">☀️ ${nascer} até ${por}</div>
      </div>
    `;

    const hourlyDiv = card.querySelector(".hourly-carousel");

    const now = new Date();
    const currentHourIndex = dailyIndices.findIndex(i => {
      const hour = new Date(data.hourly.time[i]).getHours();
      return hour === now.getHours();
    });

    dailyIndices.forEach((i, idx) => {
      let hour = getHourOnly(data.hourly.time[i]);
      if (idx === currentHourIndex) hour += " (Agora)";

      const temp = Math.round(data.hourly.temperature_2m[i]);
      const prob = data.hourly.precipitation_probability[i];
      const nuvens = data.hourly.cloud_cover[i];

      const hourBox = document.createElement("div");
      hourBox.className = "hour-box";
      hourBox.innerHTML = `
        <div class="hour-time">${hour}</div>
        <div class="hour-icon">${formatClouds(nuvens)}</div>
        <div class="hour-temp">${temp}°C</div>
        <div class="hour-rain">☔ ${prob}%</div>
      `;
      hourlyDiv.appendChild(hourBox);
    });

    container.appendChild(card);

    if (currentHourIndex >= 0) {
      const boxWidth = hourlyDiv.querySelector(".hour-box")?.offsetWidth || 50;
      hourlyDiv.scrollLeft = boxWidth * currentHourIndex;
    }
  });

  enableDragScroll();
}

// --- Drag-scroll ---
function enableDragScroll() {
  document.querySelectorAll(".hourly-carousel").forEach(carousel => {
    let isDown = false;
    let startX;
    let scrollLeft;

    carousel.addEventListener("mousedown", e => {
      isDown = true;
      startX = e.pageX - carousel.offsetLeft;
      scrollLeft = carousel.scrollLeft;
      carousel.style.cursor = "grabbing";
    });

    carousel.addEventListener("mouseleave", () => {
      isDown = false;
      carousel.style.cursor = "grab";
    });

    carousel.addEventListener("mouseup", () => {
      isDown = false;
      carousel.style.cursor = "grab";
    });

    carousel.addEventListener("mousemove", e => {
      if (!isDown) return;
      e.preventDefault();
      const x = e.pageX - carousel.offsetLeft;
      const walk = (x - startX) * 1.2;
      carousel.scrollLeft = scrollLeft - walk;
    });

    carousel.style.cursor = "grab";
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
