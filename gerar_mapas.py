from ecmwf.opendata import Client
from datetime import datetime, timedelta
import xarray as xr
import matplotlib.pyplot as plt
import cartopy.crs as ccrs
from cartopy.feature import NaturalEarthFeature
from matplotlib.colors import ListedColormap, BoundaryNorm
import numpy as np
import pandas as pd
import os, warnings
from pathlib import Path

warnings.filterwarnings("ignore", category=FutureWarning)

# ==============================
# 1. Configurações iniciais
# ==============================
dias_semana_pt = {
    "Monday": "segunda-feira", "Tuesday": "terça-feira", "Wednesday": "quarta-feira",
    "Thursday": "quinta-feira", "Friday": "sexta-feira", "Saturday": "sábado", "Sunday": "domingo",
}

# Dicionário de Cidades do Nordeste e Coordenadas (Latitude, Longitude) em Graus Decimais
# Usando apenas as capitais para manter o mapa limpo, mas você pode adicionar mais:
CIDADES_NORDESTE = {
    "Salvador (BA)": (-12.9714, -38.5108),
    "Fortaleza (CE)": (-3.7319, -38.5267),
    "Recife (PE)": (-8.0539, -34.8811),
    "São Luís (MA)": (-2.5367, -44.3056),
    "Natal (RN)": (-5.7950, -35.2014),
    "João Pessoa (PB)": (-7.1197, -34.8450),
    "Maceió (AL)": (-9.6658, -35.7351),
    "Aracaju (SE)": (-10.9092, -37.0631),
    "Teresina (PI)": (-5.0927, -42.8037),
}

nivels = [0, 0.5, 2, 5, 10, 15, 20, 30, 40, 50, 75, 100, 150, 200, 300, 400, 500]
cores = ["#FFFFFF","#cbcbcb","#797979","#4ffd72","#006000","#040CA5","#5E8CFF","#FFFF00",
          "#FFA500","#FF0000","#C00000","#800000","#330033","#660066","#c02ec0","#FFBFF5"]

color_map = ListedColormap(cores)
norma = BoundaryNorm(nivels, color_map.N)
tick_locs = [(nivels[i]+nivels[i+1])/2 for i in range(len(nivels)-1)]
tick_labels = [f"{nivels[i]}–{nivels[i+1]}" for i in range(len(nivels)-1)]
tick_labels[-1] = f">{nivels[-2]}"
extent = [-85, -30, -35, 10]

# Pasta local (dentro do repositório)
out_dir = "mapas"
os.makedirs(out_dir, exist_ok=True)

# ==============================
# 2. Baixar ECMWF e processar
# ==============================
def gerar_mapas():
    client = Client(source="azure")
    
    # Hora de Brasília = UTC-3
    now_br = datetime.utcnow() - timedelta(hours=3)
    date_run = now_br.date()
    run_date_str = date_run.strftime("%Y%m%d")
    run_hour = 0  # Sempre rodada 00Z

    # Nome do arquivo inclui a data da rodada
    target_file = os.path.join(out_dir, f"dados_ecmwf_{run_date_str}.grib2")

    steps_all = list(range(0,145,3)) + list(range(150,361,6))
    request_params = {
        "date": run_date_str,
        "time": run_hour,
        "step": steps_all,
        "param": "tp",
        "type": "fc",
        "levtype": "sfc",
        "stream": "oper",
        "target": target_file
    }

    print(f"\n📡 Verificando ECMWF HRES {run_date_str} 00Z...")

    # Só baixa se o arquivo do dia ainda não existir
    if not os.path.exists(target_file):
        print("⬇️  Arquivo não encontrado. Iniciando download...")
        client.retrieve(**request_params)
        print(f"✅ Download concluído: {target_file}")
    else:
        print(f"⚠️  O arquivo '{target_file}' já existe — usando versão local.")

    print("\n📂 Abrindo arquivo GRIB2...")
    ds = xr.open_dataset(target_file, engine="cfgrib", filter_by_keys={"typeOfLevel": "surface"})
    # ECMWF 'tp' está em metros, multiplicamos por 1000 para milímetros
    tp_mm = ds["tp"] * 1000.0
    run_time = pd.to_datetime(tp_mm["time"].item()).to_pydatetime()
    utc_offset = -3
    n_days = 15
    daily = []
    step_times = run_time + pd.to_timedelta(tp_mm.step.values, unit='h')

    for day in range(n_days):
        start_br = datetime(run_time.year, run_time.month, run_time.day) + timedelta(days=day)
        end_br   = start_br + timedelta(hours=24)
        start_br_utc = start_br - timedelta(hours=utc_offset)
        end_br_utc   = end_br - timedelta(hours=utc_offset)
        
        # Encontra o índice (step) mais próximo da hora de início e fim no fuso UTC.
        step_start = np.argmin(np.abs(step_times - start_br_utc))
        step_end   = np.argmin(np.abs(step_times - end_br_utc))

        # Calcula o acumulado de 24h:
        # Se for o primeiro dia (day == 0), é o valor total até o step_end (do 0 ao 24h).
        # Senão, é a diferença entre os dois steps (acumulado no dia).
        data_24h = tp_mm.isel(step=step_end) if day == 0 else tp_mm.isel(step=step_end) - tp_mm.isel(step=step_start)
        daily.append({"data": data_24h, "start": start_br, "end": end_br})

    # ==============================
    # 3. Mapas diários (SEM ALTERAÇÃO)
    # ==============================
    print("\n🗺️ Gerando mapas diários...")
    for idx, item in enumerate(daily):
        daynum = idx + 1
        rain = item["data"]
        start = item["start"]

        fig = plt.figure(figsize=(10,8))
        ax = plt.axes(projection=ccrs.PlateCarree())
        ax.set_extent(extent, crs=ccrs.PlateCarree())
        ax.coastlines(resolution="10m", linewidth=0.8)
        ax.add_feature(NaturalEarthFeature("cultural", "admin_0_countries","50m", edgecolor="black", facecolor="none", linewidth=0.8))
        ax.add_feature(NaturalEarthFeature("cultural", "admin_1_states_provinces_lines","50m", edgecolor="black", facecolor="none", linewidth=0.8))
        ax.gridlines(draw_labels=False, linestyle="--", alpha=0.4)
        
        cf = rain.plot.contourf(ax=ax, transform=ccrs.PlateCarree(),
                                 cmap=color_map, norm=norma, levels=nivels, extend="max", add_colorbar=False)
        
        dia_semana = dias_semana_pt[start.strftime("%A")]
        ax.set_title(f"({daynum:02d}) {start:%d-%m-%y} ({dia_semana})\nRodada ECMWF: {run_time:%d-%m-%Y %H:%MZ}",
                      fontsize=11, weight="bold")
        cbar = plt.colorbar(cf, ax=ax, orientation="vertical", fraction=0.04, pad=0.02)
        cbar.set_ticks(tick_locs)
        cbar.set_ticklabels(tick_labels)
        cbar.set_label("Precipitação (mm/24h)")

        fname = os.path.join(out_dir, f"{daynum:02d}.png")
        plt.savefig(fname, dpi=300, bbox_inches="tight")
        plt.close(fig)
        print(f"✅ Salvo: {fname}")

    # ==============================
    # 4. Mapa acumulado com CIDADES (ADICIONADO)
    # ==============================
    accum_15d = sum([item["data"] for item in daily])
    start_acc = daily[0]['start']
    end_acc = daily[-1]['end']

    fig = plt.figure(figsize=(10,8))
    ax = plt.axes(projection=ccrs.PlateCarree())
    ax.set_extent(extent, crs=ccrs.PlateCarree())
    ax.coastlines(resolution="10m", linewidth=0.8)
    ax.add_feature(NaturalEarthFeature("cultural", "admin_0_countries","50m", edgecolor="black", facecolor="none", linewidth=0.8))
    ax.add_feature(NaturalEarthFeature("cultural", "admin_1_states_provinces_lines","50m", edgecolor="black", facecolor="none", linewidth=0.8))
    ax.gridlines(draw_labels=False, linestyle="--", alpha=0.4)
    
    # Plotagem do acumulado de precipitação
    cf = accum_15d.plot.contourf(ax=ax, transform=ccrs.PlateCarree(),
                                  cmap=color_map, norm=norma, levels=nivels, extend="max", add_colorbar=False)
    
    # ----------------------------------------------------
    # Plotagem das Cidades e Valores de Acumulado
    # ----------------------------------------------------
    print("\n📍 Plotando cidades no mapa acumulado...")
    for city, (lat, lon) in CIDADES_NORDESTE.items():
        # Interpolação para obter o valor de precipitação na coordenada da cidade
        try:
            # Seleciona o valor mais próximo (nearest)
            precip_value = accum_15d.sel(latitude=lat, longitude=lon, method="nearest").item()
            precip_rounded = round(precip_value, 1) # Arredonda para 1 casa decimal
        except Exception:
            precip_rounded = "N/D"

        # Adiciona o marcador da cidade (ponto preto)
        ax.plot(lon, lat, 'ko', markersize=5, transform=ccrs.PlateCarree(), label=city)
        
        # Adiciona o texto (nome da cidade e valor de precipitação)
        # Ajuste de posição: ligeiramente à direita do ponto
        text_label = f"{city}\n({precip_rounded} mm)"
        
        ax.text(lon + 0.5, lat + 0.1, text_label,
                transform=ccrs.PlateCarree(),
                fontsize=7,
                color='black',
                weight='bold',
                ha='left',
                va='center')
        
        print(f"   > {city}: {precip_rounded} mm")


    # Título do mapa
    ax.set_title(f"Precipitação acumulada - 15 dias\nPeríodo: {start_acc:%d-%m} até {end_acc:%d-%m}\nRodada ECMWF: {run_time:%d-%m-%Y %HZ}",
                  fontsize=12, weight="bold")
    
    # Configuração da barra de cores
    cbar = plt.colorbar(cf, ax=ax, orientation="vertical", fraction=0.04, pad=0.02)
    cbar.set_ticks(tick_locs)
    cbar.set_ticklabels(tick_labels)
    cbar.set_label("Precipitação (mm/15 dias)")
    
    # Salvar mapa
    fname_acc = os.path.join(out_dir, "acumulado-15-dias.png")
    plt.savefig(fname_acc, dpi=600, bbox_inches="tight")
    plt.close(fig)
    print(f"✅ Salvo: {fname_acc}")


if __name__ == "__main__":
    gerar_mapas()