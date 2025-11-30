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
import matplotlib.colors as mcolors 

warnings.filterwarnings("ignore", category=FutureWarning)

# ==============================
# 1. Configurações iniciais
# ==============================
dias_semana_pt = {
    "Monday": "segunda-feira", "Tuesday": "terça-feira", "Wednesday": "quarta-feira",
    "Thursday": "quinta-feira", "Friday": "sexta-feira", "Saturday": "sábado", "Sunday": "domingo",
}


nivels = [0, 0.5, 2, 5, 10, 15, 20, 25, 30, 40, 50, 75, 100, 150, 200, 300, 400, 500]
cores = ["#FFFFFF","#cbcbcb","#797979","#5ce53d","#006000","#040CA5", "#3770FF","#94B3FF","#FFFF00",
          "#FFA500","#FF0000","#C00000","#800000","#330033","#660066","#c02ec0","#FFBFF5"]

color_map = ListedColormap(cores)
norma = BoundaryNorm(nivels, color_map.N)
tick_locs = [(nivels[i]+nivels[i+1])/2 for i in range(len(nivels)-1)]
tick_labels = [f"{nivels[i]}–{nivels[i+1]}" for i in range(len(nivels)-1)]
tick_labels[-1] = f">{nivels[-2]}"
extent = [-85, -30, -35, 10]

BBOX_STYLE = dict(boxstyle="round,pad=0.2", facecolor='black', alpha=0.8, edgecolor='black', linewidth=0.5)

out_dir = "mapas"
os.makedirs(out_dir, exist_ok=True)

def get_text_color_from_value(value, levels, cmap_colors, threshold=0.5):
    if pd.isna(value) or value < levels[0]: 
        return 'black'
    return 'white'

# ======================================================
# 2. Baixar ECMWF e processar
# ======================================================
def gerar_mapas():
    client = Client(source="azure")

    now_br = datetime.utcnow() - timedelta(hours=3)
    date_run = now_br.date()
    run_date_str = date_run.strftime("%Y%m%d")
    run_hour = 0
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

    if not os.path.exists(target_file):
        print("⬇️  Arquivo não encontrado. Iniciando download...")
        client.retrieve(**request_params)
        print(f"✅ Download concluído: {target_file}")
    else:
        print(f"⚠️  O arquivo '{target_file}' já existe — usando versão local.")

    print("\n📂 Abrindo arquivo GRIB2...")
    ds = xr.open_dataset(target_file, engine="cfgrib", filter_by_keys={"typeOfLevel": "surface"})
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
        
        step_start = np.argmin(np.abs(step_times - start_br_utc))
        step_end   = np.argmin(np.abs(step_times - end_br_utc))

        data_24h = tp_mm.isel(step=step_end) if day == 0 else tp_mm.isel(step=step_end) - tp_mm.isel(step=step_start)
        daily.append({"data": data_24h, "start": start_br, "end": end_br})

    # ==============================
    # 3. Mapas diários
    # ==============================
    print("\n🗺️ Gerando mapas diários...")
    for idx, item in enumerate(daily):
        daynum = idx + 1
        rain = item["data"]
        start = item["start"]

        fig = plt.figure(figsize=(10,8))
        ax = plt.axes(projection=ccrs.PlateCarree())
        ax.set_extent(extent, crs=ccrs.PlateCarree())
        ax.coastlines(resolution="10m", linewidth=0.4)
        ax.add_feature(NaturalEarthFeature("cultural", "admin_0_countries","50m", edgecolor="black", facecolor="none", linewidth=0.4))
        ax.add_feature(NaturalEarthFeature("cultural", "admin_1_states_provinces_lines","50m", edgecolor="black", facecolor="none", linewidth=0.4))
        ax.gridlines(draw_labels=False, linestyle="--", alpha=0.4)
        
        cf = rain.plot.contourf(ax=ax, transform=ccrs.PlateCarree(),
                                 cmap=color_map, norm=norma, levels=nivels, extend="max", add_colorbar=False)


        dia_semana = dias_semana_pt[start.strftime("%A")]
        ax.set_title(f"({daynum:02d}) {start:%d-%m-%y} ({dia_semana})\nRodada ECMWF: {run_time:%d-%m-%Y %H:%MZ}",
                      fontsize=11, weight="bold")

        cbar = plt.colorbar(cf, ax=ax, orientation="vertical", fraction=0.04, pad=0.02, drawedges = False)
        cbar.set_ticks(tick_locs)
        cbar.set_ticklabels(tick_labels)
        cbar.set_label("Precipitação (mm/24h)")

        fname = os.path.join(out_dir, f"{daynum:02d}.png")
        plt.savefig(fname, dpi=600, bbox_inches="tight")
        plt.close(fig)
        print(f"✅ Salvo: {fname}")

    # ==============================
    # 4. Mapa Acumulado
    # ==============================
    accum_15d = sum([item["data"] for item in daily])
    start_acc = daily[0]['start']
    end_acc = daily[-1]['end']

    fig = plt.figure(figsize=(10,8))
    ax = plt.axes(projection=ccrs.PlateCarree())
    ax.set_extent(extent, crs=ccrs.PlateCarree())
    ax.coastlines(resolution="10m", linewidth=0.4)
    ax.add_feature(NaturalEarthFeature("cultural", "admin_0_countries","50m", edgecolor="black", facecolor="none", linewidth=0.4))
    ax.add_feature(NaturalEarthFeature("cultural", "admin_1_states_provinces_lines","50m", edgecolor="black", facecolor="none", linewidth=0.4))
    ax.gridlines(draw_labels=False, linestyle="--", alpha=0.4)
    
    cf = accum_15d.plot.contourf(ax=ax, transform=ccrs.PlateCarree(),
                                  cmap=color_map, norm=norma, levels=nivels, extend="max", add_colorbar=False)


    ax.set_title(f"Precipitação acumulada - 15 dias\nPeríodo: {start_acc:%d-%m} até {end_acc:%d-%m}\nRodada ECMWF: {run_time:%d-%m-%Y %HZ}",
                  fontsize=12, weight="bold")

    cbar = plt.colorbar(cf, ax=ax, orientation="vertical", fraction=0.04, pad=0.02, drawedges = False)
    cbar.set_ticks(tick_locs)
    cbar.set_ticklabels(tick_labels)
    cbar.set_label("Precipitação (mm/15 dias)")

    fname_acc = os.path.join(out_dir, "acumulado-15-dias.png")
    plt.savefig(fname_acc, dpi=600, bbox_inches="tight")
    plt.close(fig)
    print(f"✅ Salvo: {fname_acc}")


if __name__ == "__main__":
    gerar_mapas()
