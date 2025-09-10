let latitude = -9.7811;
let longitude = -36.0936;

function getCityName(addr) {
  return addr.city || addr.town || addr.village || addr.hamlet || addr.municipality || addr.county || addr.state || "";
}

function formatDate(dateStr) {
  const date = new Date(dateStr + "T00:00:00");
  const days = ["Domingo","Segunda","Terça","Quarta","Quinta","Sexta","Sábado"];
  const dayName = days[date.getDay()];
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

const weatherDescriptions = {
  0: "Céu limpo",1: "Principalmente limpo",2: "Parcialmente nublado",3: "Nublado",
  45: "Nevoeiro",48: "Nevoeiro congelado",51: "Chuvisco leve",53: "Chuvisco moderado",
  55: "Chuvisco intenso",56: "Chuvisco congelado leve",57: "Chuvisco congelado intenso",
  61: "Chuva fraca",63: "Chuva moderada",65: "Chuva forte",66: "Chuva congelada leve",
  67: "Chuva congelada intensa",71: "Neve fraca",73: "Neve moderada",75: "Neve forte",
  77: "Grãos de neve",80: "Chuva leve",81: "Chuva moderada",82: "Chuva forte",
  85: "Neve leve",86: "Neve forte",95: "Tempestade",96: "Tempestade com granizo leve",
  99: "Tempestade com granizo forte"
};

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
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&daily=${dailyParams}&hourly=${hourlyParams}&timezone=auto&forecast_days=10`;
  const res = await fetch(url);
  const data = await res.json();
  renderWeather(data);
}

function getPeriodData(hourly, start, end, dayDate) {
  const indices = hourly.time.map((t,i)=>({t,i}))
    .filter(({t})=>t.startsWith(dayDate))
    .map(({i})=>i)
    .filter(i=>{
      const hour=new Date(hourly.time[i]).getHours();
      return hour>=start && hour<=end;
    });
  if(indices.length===0) return {chuva:0,prob:0,nuvens:0};
  let chuva=0,prob=0,nuvens=0;
  indices.forEach(i=>{
    chuva+=hourly.precipitation[i];
    prob=Math.max(prob,hourly.precipitation_probability[i]);
    nuvens+=hourly.cloud_cover[i];
  });
  nuvens /= indices.length;
  return {chuva, prob: Math.round(prob), nuvens: Math.round(nuvens)};
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

function renderCurrentWeather(data) {
  const nowIndex = data.hourly.time.findIndex(t => new Date(t) > new Date());
  const index = nowIndex === -1 ? data.hourly.time.length - 1 : nowIndex;

  const temp = Math.round(data.hourly.temperature_2m[index]);
  const appTemp = Math.round(data.hourly.apparent_temperature[index]);
  const humidity = Math.round(data.hourly.relative_humidity_2m[index]);
  const chuva = data.hourly.precipitation[index].toFixed(1);
  const prob = data.hourly.precipitation_probability[index];
  const nuvens = data.hourly.cloud_cover[index];
  const vento = Math.round(data.hourly.wind_speed_10m[index]);
  const rajada = Math.round(data.hourly.wind_gusts_10m[index]);
  const wcode = data.hourly.weathercode[index];
  const descricao = weatherDescriptions[wcode] || "...";

  const card = document.createElement("div");
  card.className = "weather-card";
  card.innerHTML = `
    <h2>Agora <span>• ${descricao}</span></h2>
    <div class="weather-info">
      <div class="badge temp">🌡️ Temperatura: ${temp}°</div>
      <div class="badge feels">🌡️ Sensação: ${appTemp}°</div>
      <div class="badge humidity">💧 Umidade: ${humidity}%</div>
      <div class="badge clouds">☁️ Nuvens: ${nuvens}%</div>
      <div class="badge rain">☔ Chuva: ${chuva} mm</div>
      <div class="badge rain">☔ Chance: ${prob}%</div>
      <div class="badge wind">🍃 Vento: ${vento} km/h</div>
      <div class="badge wind">🍃 Rajada: ${rajada} km/h</div>
    </div>
  `;
  const container = document.getElementById("weather-container");
  container.appendChild(card);
}

function renderWeather(data) {
  const container=document.getElementById("weather-container");
  container.innerHTML="";

  renderCurrentWeather(data);

  data.daily.time.forEach((day,index)=>{
    const tempMin=Math.round(data.daily.temperature_2m_min[index]);
    const tempMax=Math.round(data.daily.temperature_2m_max[index]);
    const appMin=Math.round(data.daily.apparent_temperature_min[index]);
    const appMax=Math.round(data.daily.apparent_temperature_max[index]);
    const uvMax=Math.round(data.daily.uv_index_max[index]);
    const vento=Math.round(data.daily.wind_speed_10m_max[index]);
    const rajada=Math.round(data.daily.wind_gusts_10m_max[index]);
    const nascer=formatHour(data.daily.sunrise[index]);
    const por=formatHour(data.daily.sunset[index]);
    const wcode=data.daily.weathercode[index];
    const descricao=weatherDescriptions[wcode]||"...";

    const periods={
      "Madrugada":getPeriodData(data.hourly,0,5,day),
      "Manhã":getPeriodData(data.hourly,6,11,day),
      "Tarde":getPeriodData(data.hourly,12,17,day),
      "Noite":getPeriodData(data.hourly,18,23,day)
    };
    const humidity=getHumidity(data.hourly,day);
    const dailyIndices=data.hourly.time.map((t,i)=>({t,i})).filter(({t})=>t.startsWith(day)).map(({i})=>i);
    let chuvaDia=0; dailyIndices.forEach(i=>{chuvaDia+=data.hourly.precipitation[i];});

    const card=document.createElement("div");
    card.className="weather-card";
    card.innerHTML=`
      <h2>${formatDate(day)} <span> • ${descricao}</span></h2>
      <div class="weather-info">
        <div class="badge temp">🌡️ Temperatura: ${tempMin}° a ${tempMax}°</div>
        <div class="badge feels">🌡️ Sensação: ${appMin}° a ${appMax}°</div>
        <div class="badge humidity">💧 Umidade: ${humidity.min}% a ${humidity.max}%</div>
        <div class="badge uv">☀️ UV Máx: ${uvMax}</div>
      </div>
      <div class="periods">
        ${Object.entries(periods).map(([period,d])=>`
          <div class="period-box">
            <h3>${period}</h3>
            <p>Chuva: ${d.chuva.toFixed(1)} mm</p>
            <p>Chance: ${d.prob}%</p>
            <p>Nuvens: ${d.nuvens}%</p>
          </div>
        `).join('')}
      </div>
      <div class="extra-info">
        <div class="badge rain">☔ Chuva acumulada: ${chuvaDia.toFixed(1)} mm</div>
        <div class="badge wind">🍃 Ventos: ${vento} km/h</div>
        <div class="badge wind">🍃 Rajadas: ${rajada} km/h</div>
        <div class="badge uv">☀️ ${nascer} a ${por}</div>
      </div>
    `;
    container.appendChild(card);
  });
}

const currentLocationDiv=document.getElementById("current-location");

async function searchLocation(query) {
  const res=await fetch(`https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&q=${query}`);
  const data=await res.json();
  if(data && data.length>0){
    latitude=parseFloat(data[0].lat);
    longitude=parseFloat(data[0].lon);
    const addr=data[0].address;
    const city=getCityName(addr);
    const state=addr.state||"";
    const country=addr.country||"";
    currentLocationDiv.textContent=`📌 ${city}${city&&state?", ":""}${state}${(city||state)&&country?", ":""}${country}`;
    fetchWeather();
  } else { alert("Localização não encontrada!"); currentLocationDiv.textContent=""; }
}

const input=document.getElementById("location-input");
input.addEventListener("keydown",(e)=>{if(e.key==="Enter") searchLocation(input.value);});
document.getElementById("search-button").addEventListener("click",()=>{searchLocation(input.value);});

// Detecta se estamos no localhost e ignora reverse geocoding
if(location.hostname === "localhost" || location.hostname === "127.0.0.1") {
  currentLocationDiv.textContent = "📌 Localização padrão";
  fetchWeather();
} else if(navigator.geolocation){
  navigator.geolocation.getCurrentPosition(async pos=>{
    latitude=pos.coords.latitude;
    longitude=pos.coords.longitude;
    try {
      const res=await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&addressdetails=1`);
      const data=await res.json();
      if(data && data.address){
        const addr=data.address;
        const city=getCityName(addr);
        const state=addr.state||"";
        const country=addr.country||"";
        currentLocationDiv.textContent=`📌 ${city}${city&&state?", ":""}${state}${(city||state)&&country?", ":""}${country}`;
      }
    } catch {
      currentLocationDiv.textContent = "📌 Localização desconhecida";
    }
    fetchWeather();
  },()=>fetchWeather());
} else {
  fetchWeather();
}
