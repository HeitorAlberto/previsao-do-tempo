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

warnings.filterwarnings("ignore", category=FutureWarning)

# ==============================
# 1. Configurações iniciais
# ==============================
dias_semana_pt = {
    "Monday": "segunda-feira", "Tuesday": "terça-feira", "Wednesday": "quarta-feira",
    "Thursday": "quinta-feira", "Friday": "sexta-feira", "Saturday": "sábado", "Sunday": "domingo",
}

nivels = [0, 0.5, 2, 5, 10, 15, 20, 25, 30, 40, 50, 75, 100, 150, 200, 300, 400, 500]
cores = ["#FFFFFF","#cbcbcb","#797979","#5ce53d","#006000","#040CA5", "#3770FF","#94B3FF",
         "#FFFF00","#FFA500","#FF0000","#C00000","#800000","#330033","#660066","#c02ec0","#FFBFF5"]

color_map = ListedColormap(cores)
norma = BoundaryNorm(nivels, color_map.N)

tick_locs = [(nivels[i] + nivels[i+1]) / 2 for i in range(len(nivels)-1)]
tick_labels = [f"{nivels[i]}–{nivels[i+1]}" for i in range(len(nivels)-1)]
tick_labels[-1] = f">{nivels[-2]}"

extent = [-85, -30, -35, 10]

out_dir = "mapas"
os.makedirs(out_dir, exist_ok=True)

# ======================================================
# 2. Baixar ECMWF e processar
# ======================================================
def gerar_mapas():
    client = Client(source="azure")

    now_br = datetime.utcnow() - timedelta(hours=3)
    run_date_str = now_br.strftime("%Y%m%d")
    target_file = os.path.join(out_dir, f"dados_ecmwf_{run_date_str}.grib2")

    for f in os.listdir(out_dir):
        if (f.endswith(".grib2") or f.endswith(".idx")) and f != os.path.basename(target_file):
            os.remove(os.path.join(out_dir, f))

    steps_all = list(range(0,145,3)) + list(range(150,361,6))
    client.retrieve(
        date=run_date_str,
        time=0,
        step=steps_all,
        param="tp",
        type="fc",
        levtype="sfc",
        stream="oper",
        target=target_file
    )

    ds = xr.open_dataset(target_file, engine="cfgrib",
                         filter_by_keys={"typeOfLevel": "surface"})
    tp_mm = ds["tp"] * 1000.0
    run_time = pd.to_datetime(tp_mm.time.item()).to_pydatetime()

    step_times = run_time + pd.to_timedelta(tp_mm.step.values, unit="h")

    daily = []
    for d in range(15):
        start = run_time + timedelta(days=d)
        end = start + timedelta(hours=24)
        i0 = np.argmin(np.abs(step_times - start))
        i1 = np.argmin(np.abs(step_times - end))
        data = tp_mm.isel(step=i1) if d == 0 else tp_mm.isel(step=i1) - tp_mm.isel(step=i0)
        daily.append({"data": data, "start": start, "end": end})

    # ==============================
    # 3. Mapas diários
    # ==============================
    for i, item in enumerate(daily):
        fig = plt.figure(figsize=(10, 8))
        ax = plt.axes(projection=ccrs.PlateCarree())

        ax.set_extent(extent)
        ax.set_position([0.02, 0.08, 0.878, 0.84])
        ax.coastlines("10m", linewidth=0.4)
        ax.add_feature(NaturalEarthFeature("cultural","admin_0_countries","50m",
                                           edgecolor="black", facecolor="none", linewidth=0.4))
        ax.add_feature(NaturalEarthFeature("cultural","admin_1_states_provinces_lines","50m",
                                           edgecolor="black", facecolor="none", linewidth=0.4))

        cf = item["data"].plot.contourf(
            ax=ax, transform=ccrs.PlateCarree(),
            cmap=color_map, norm=norma,
            levels=nivels, extend="max",
            extendrect=True,
            add_colorbar=False, add_labels=False
        )

        dia = dias_semana_pt[item["start"].strftime("%A")]

        ax.text(0.0, 1.0,
                f"({i+1:02d}) {item['start']:%d-%m-%Y} ({dia})",
                transform=ax.transAxes, ha="left",
                va="bottom", fontsize=12, fontweight="bold")

        ax.text(1.0, 1.0,
                f"Rodada ECMWF: {run_time:%d-%m-%Y %HZ}",
                transform=ax.transAxes, ha="right",
                va="bottom", fontsize=12, fontweight="bold")

        cax = fig.add_axes([0.898, 0.08, 0.030, 0.84])

        cbar = plt.colorbar(cf, cax=cax)
        cbar.set_ticks(tick_locs)
        cbar.set_ticklabels(tick_labels)
        cbar.set_label("Precipitação (mm/24h)")

        plt.savefig(os.path.join(out_dir, f"{i+1:02d}.png"),
                    dpi=300, bbox_inches="tight", pad_inches=0.03)
        plt.close()

    # ==============================
    # 4. Mapa acumulado
    # ==============================
    accum = sum(d["data"] for d in daily)

    fig = plt.figure(figsize=(10, 8))
    ax = plt.axes(projection=ccrs.PlateCarree())

    ax.set_extent(extent)
    ax.set_position([0.02, 0.08, 0.878, 0.84])
    ax.coastlines("10m", linewidth=0.4)
    ax.add_feature(NaturalEarthFeature("cultural","admin_0_countries","50m",
                                       edgecolor="black", facecolor="none", linewidth=0.4))
    ax.add_feature(NaturalEarthFeature("cultural","admin_1_states_provinces_lines","50m",
                                       edgecolor="black", facecolor="none", linewidth=0.4))

    cf = accum.plot.contourf(
        ax=ax, transform=ccrs.PlateCarree(),
        cmap=color_map, norm=norma,
        levels=nivels, extend="max",
        extendrect=True,
        add_colorbar=False, add_labels=False
    )

    ax.text(0.0, 1.0,
            f"Precipitação acumulada (15 dias)\n"
            f"Período: {daily[0]['start']:%d-%m} até {daily[-1]['end']:%d-%m}",
            transform=ax.transAxes, ha="left",
            va="bottom", fontsize=12, fontweight="bold")

    ax.text(1.0, 1.0,
            f"Rodada ECMWF: {run_time:%d-%m-%Y %HZ}",
            transform=ax.transAxes, ha="right",
            va="bottom", fontsize=12, fontweight="bold")

    cax = fig.add_axes([0.898, 0.08, 0.030, 0.84])


    cbar = plt.colorbar(cf, cax=cax)
    cbar.set_ticks(tick_locs)
    cbar.set_ticklabels(tick_labels)
    cbar.set_label("Precipitação (mm/15 dias)")

    plt.savefig(os.path.join(out_dir, "acumulado-15-dias.png"),
                dpi=300, bbox_inches="tight", pad_inches=0.03)
    plt.close()

if __name__ == "__main__":
    gerar_mapas()
