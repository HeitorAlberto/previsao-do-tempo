const DEFAULT_COORDS = { lat: -9.6658, lon: -35.7353 }; // Maceió, AL

// Função para obter coordenadas pelo nome da cidade usando Nominatim
async function getCoordinates(city) {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(city)}`;

    try {
        const res = await fetch(url, {
            headers: {
                "User-Agent": "SeuApp/1.0 (seuemail@dominio.com)",
                "Accept-Language": "pt-BR"
            }
        });
        const data = await res.json();
        if (data && data.length > 0) {
            const coords = data[0];
            // Extrai apenas "Cidade, Estado" para exibição
            const shortName = coords.display_name.split(',').slice(0,2).join(',');
            return { lat: parseFloat(coords.lat), lon: parseFloat(coords.lon), name: shortName };
        } else {
            alert("Cidade não encontrada.");
            return null;
        }
    } catch (err) {
        console.error("Erro ao buscar coordenadas:", err);
        alert("Erro ao buscar a cidade. Usando padrão (Maceió).");
        return { lat: DEFAULT_COORDS.lat, lon: DEFAULT_COORDS.lon, name: "Maceió, AL, Brasil" };
    }
}

// Função principal para buscar o clima
async function fetchWeather(lat, lon, locationName = "Maceió, AL, Brasil") {
    const API_URL = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m,cloud_cover&daily=sunrise,sunset&models=ecmwf_aifs025_single&timezone=auto&forecast_days=15`;

    try {
        const res = await fetch(API_URL);
        const data = await res.json();

        document.getElementById("location-display").innerHTML = `📍 ${locationName}`;

        const hourly = data.hourly;
        const times = hourly.time;
        const temperatures = hourly.temperature_2m;
        const humidities = hourly.relative_humidity_2m;
        const precipitations = hourly.precipitation;
        const winds = hourly.wind_speed_10m;
        const cloudCover = hourly.cloud_cover;

        const sunriseDaily = data.daily.sunrise;
        const sunsetDaily = data.daily.sunset;
        const dailyDates = data.daily.time;

        const days = {};

        times.forEach((time, i) => {
            const date = time.split("T")[0];
            const hour = parseInt(time.split("T")[1].split(":")[0]);

            if (!days[date]) {
                days[date] = {
                    temp: [], humidity: [], precipitation: [], wind: [], cloud: [],
                    periods: {
                        madrugada: { cloud: [], rain: [] },
                        manha: { cloud: [], rain: [] },
                        tarde: { cloud: [], rain: [] },
                        noite: { cloud: [], rain: [] }
                    }
                };
            }

            days[date].temp.push(temperatures[i]);
            days[date].humidity.push(humidities[i]);
            days[date].precipitation.push(precipitations[i]);
            days[date].wind.push(winds[i]);
            days[date].cloud.push(cloudCover[i]);

            if (hour >= 0 && hour < 6) {
                days[date].periods.madrugada.cloud.push(cloudCover[i]);
                days[date].periods.madrugada.rain.push(precipitations[i]);
            } else if (hour >= 6 && hour < 12) {
                days[date].periods.manha.cloud.push(cloudCover[i]);
                days[date].periods.manha.rain.push(precipitations[i]);
            } else if (hour >= 12 && hour < 18) {
                days[date].periods.tarde.cloud.push(cloudCover[i]);
                days[date].periods.tarde.rain.push(precipitations[i]);
            } else {
                days[date].periods.noite.cloud.push(cloudCover[i]);
                days[date].periods.noite.rain.push(precipitations[i]);
            }
        });

        const container = document.getElementById("cards-container");
        container.innerHTML = "";

        Object.keys(days).forEach(date => {
            const dayData = days[date];

            const minTemp = Math.min(...dayData.temp).toFixed(0);
            const maxTemp = Math.max(...dayData.temp).toFixed(0);
            const minHumidity = Math.min(...dayData.humidity).toFixed(0);
            const maxHumidity = Math.max(...dayData.humidity).toFixed(0);
            const totalPrecipitation = dayData.precipitation.reduce((a,b) => a+b, 0).toFixed(1);
            const avgWind = (dayData.wind.reduce((a,b)=>a+b,0)/dayData.wind.length).toFixed(1);

            const periodCloudDescription = period => {
                const clouds = dayData.periods[period].cloud;
                if (clouds.length === 0) return "-";

                let sunny = 0, partly = 0, cloudy = 0;
                clouds.forEach(c => {
                    if (c < 25) sunny++;
                    else if (c <= 75) partly++;
                    else cloudy++;
                });

                const total = sunny + partly + cloudy;
                const pctSunny = sunny / total;
                const pctPartly = partly / total;
                const pctCloudy = cloudy / total;

                if (pctSunny > 0.5) return "Ensolarado";
                if (pctCloudy > 0.5) return "Nublado";
                if (pctPartly > 0.5) return "Muitas nuvens";
                if (pctSunny >= 0.3 && pctPartly >= 0.3) return "Sol com nuvens";
                if (pctPartly >= 0.3 && pctCloudy >= 0.3) return "Rápidas aberturas de sol";
                return "Variável";
            };

            const periodRain = period => {
                const rain = dayData.periods[period].rain;
                if (rain.length === 0) return "0mm";
                return rain.reduce((a,b)=>a+b,0).toFixed(1) + "mm";
            };

            let sunrise = "", sunset = "";
            const sunriseIndex = dailyDates.indexOf(date);
            if (sunriseIndex !== -1) {
                sunrise = sunriseDaily[sunriseIndex].split("T")[1].slice(0,5);
                sunset = sunsetDaily[sunriseIndex].split("T")[1].slice(0,5);
            }

            const card = document.createElement("div");
            card.className = "cards-dia-a-dia";
            card.innerHTML = `
                <div class="dia"><h2>${formatDate(date)}</h2></div>
                <div class="info"><div class="texto">Temperatura</div><div class="dados">${minTemp}° a ${maxTemp}°</div></div>
                <div class="info"><div class="texto">Umidade</div><div class="dados">${minHumidity}% a ${maxHumidity}%</div></div>
                <div class="info"><div class="texto">Chuva total</div><div class="dados">${totalPrecipitation}mm</div></div>
                <div class="info"><div class="texto">Vento</div><div class="dados">${avgWind} km/h</div></div>

                 <div class="info"><div class="texto">Sol</div><div class="dados">${sunrise} a ${sunset}</div></div>

                <div class="info"><div class="texto">Madrugada</div><div class="dados">${periodCloudDescription("madrugada")} (${periodRain("madrugada")})</div></div>
                <div class="info"><div class="texto">Manhã</div><div class="dados">${periodCloudDescription("manha")} (${periodRain("manha")})</div></div>
                <div class="info"><div class="texto">Tarde</div><div class="dados">${periodCloudDescription("tarde")} (${periodRain("tarde")})</div></div>
                <div class="info"><div class="texto">Noite</div><div class="dados">${periodCloudDescription("noite")} (${periodRain("noite")})</div></div>

            `;
            container.appendChild(card);
        });

    } catch (err) {
        console.error("Erro ao buscar previsão do tempo:", err);
    }
}

// Formata a data
function formatDate(dateStr) {
    const parts = dateStr.split('-');
    const date = new Date(parts[0], parts[1]-1, parts[2]);
    return date.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit" });
}

// Eventos
document.getElementById("search-btn").addEventListener("click", async () => {
    const city = document.getElementById("search-input").value.trim();
    if (!city) return;

    const coords = await getCoordinates(city);
    if (coords) {
        fetchWeather(coords.lat, coords.lon, coords.name);
    }
});

document.getElementById("loc-btn").addEventListener("click", () => {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(pos => {
            fetchWeather(pos.coords.latitude, pos.coords.longitude, "Sua localização");
        }, () => {
            alert("Não foi possível obter sua localização. Usando padrão (Maceió).");
            fetchWeather(DEFAULT_COORDS.lat, DEFAULT_COORDS.lon);
        });
    }
});

// Inicialização
fetchWeather(DEFAULT_COORDS.lat, DEFAULT_COORDS.lon);
