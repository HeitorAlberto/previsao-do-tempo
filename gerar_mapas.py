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

plt.rcParams["path.simplify"] = True
plt.rcParams["path.simplify_threshold"] = 0.1
plt.rcParams["agg.path.chunksize"] = 10000

dias_semana_pt = {
    "Monday": "segunda-feira", "Tuesday": "terça-feira", "Wednesday": "quarta-feira",
    "Thursday": "quinta-feira", "Friday": "sexta-feira", "Saturday": "sábado", "Sunday": "domingo",
}

nivels = [0, 1, 3, 6, 10, 15, 20, 30, 40, 50, 75, 100, 150, 200, 300, 400, 500]

# 👉 níveis usados apenas para isolinhas (remove 0 e 1 mm)
nivels_iso = [3, 6, 10, 15, 20, 30, 40, 50, 75, 100, 150, 200, 300, 400, 500]

cores = [
    "#FFFFFF", "#A8B0BA",
    "#90EFA0", "#2A9A50",
    "#8FC9FF", "#3A9AF9",
    "#FFF175", "#D2B300",
    "#FFA45A", "#C66000",
    "#FF7A7A", "#9B0015",
    "#D2A679", "#8B5E3C",
    "#C39AF0", "#A65DFA"
]

color_map = ListedColormap(cores)
norma = BoundaryNorm(nivels, color_map.N)

extent = [-85, -30, -35, 10]

out_dir = "mapas"
os.makedirs(out_dir, exist_ok=True)

capitais = {
    "Norte": {
        "Rio Branco(AC)": (-9.97, -67.81),
        "Manaus(AM)": (-3.10, -60.02),
        "Boa Vista(RR)": (2.82, -60.67),
        "Belém(PA)": (-1.45, -48.50),
        "Macapá(AP)": (0.03, -51.05),
        "Palmas(TO)": (-10.24, -48.35),
        "Porto Velho(RO)": (-8.76, -63.90),
    },
    "Nordeste": {
        "São Luís(MA)": (-2.53, -44.30),
        "Teresina(PI)": (-5.09, -42.80),
        "Fortaleza(CE)": (-3.72, -38.54),
        "Natal(RN)": (-5.79, -35.21),
        "João Pessoa(PB)": (-7.12, -34.86),
        "Recife(PE)": (-8.05, -34.90),
        "Maceió(AL)": (-9.66, -35.74),
        "Aracaju(SE)": (-10.91, -37.07),
        "Salvador(BA)": (-12.97, -38.50),
    },
    "Centro-Oeste": {
        "Cuiabá(MT)": (-15.60, -56.10),
        "Campo Grande(MS)": (-20.45, -54.62),
        "Goiânia(GO)": (-16.68, -49.25),
        "Brasília(DF)": (-15.78, -47.93),
    },
    "Sudeste": {
        "Belo Horizonte(MG)": (-19.92, -43.94),
        "Vitória(ES)": (-20.32, -40.34),
        "Rio de Janeiro(RJ)": (-22.91, -43.17),
        "São Paulo(SP)": (-23.55, -46.63),
    },
    "Sul": {
        "Curitiba(PR)": (-25.43, -49.27),
        "Florianópolis(SC)": (-27.59, -48.55),
        "Porto Alegre(RS)": (-30.03, -51.23),
    }
}

def get_valor(ds, lat, lon):
    ponto = ds.sel(latitude=lat, longitude=lon, method="nearest")
    return float(ponto.values)

def montar_texto(regiao, ds):
    return "\n".join([
        f"{cidade} - {get_valor(ds, lat, lon):.0f}mm"
        for cidade, (lat, lon) in regiao.items()
    ])

def plotar_textos(ax, ds):
    bbox = dict(facecolor='white', alpha=0.7, pad=2)

    ax.text(0.01, 0.99, montar_texto(capitais["Norte"], ds),
            transform=ax.transAxes, ha="left", va="top", fontsize=8, linespacing=1.5, bbox=bbox)

    ax.text(0.99, 0.99, montar_texto(capitais["Nordeste"], ds),
            transform=ax.transAxes, ha="right", va="top", fontsize=8, linespacing=1.5, bbox=bbox)

    ax.text(0.01, 0.01, montar_texto(capitais["Centro-Oeste"], ds),
            transform=ax.transAxes, ha="left", va="bottom", fontsize=8, linespacing=1.5, bbox=bbox)

    sudeste_sul = {**capitais["Sudeste"], **capitais["Sul"]}

    ax.text(0.99, 0.01, montar_texto(sudeste_sul, ds),
            transform=ax.transAxes, ha="right", va="bottom", fontsize=8, linespacing=1.5, bbox=bbox)

def configurar_colorbar(cf, ax, label):
    cbar = plt.colorbar(cf, ax=ax, pad=0.03)
    cbar.set_ticks(nivels)
    cbar.set_ticklabels([str(n) for n in nivels])
    cbar.set_label(label)
    return cbar

def gerar_mapas():

    client = Client(source="azure")

    now_br = datetime.utcnow() - timedelta(hours=3)
    run_date_str = now_br.strftime("%Y%m%d")
    target_file = os.path.join(out_dir, f"dados_ecmwf_{run_date_str}.grib2")

    for f in os.listdir(out_dir):
        if (f.endswith(".grib2") or f.endswith(".idx")) and f != os.path.basename(target_file):
            os.remove(os.path.join(out_dir, f))

    steps_all = list(range(0, 145, 3)) + list(range(150, 361, 6))

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

    ds = xr.open_dataset(
        target_file,
        engine="cfgrib",
        filter_by_keys={"typeOfLevel": "surface"}
    )

    tp_mm = ds["tp"] * 1000.0

    run_time = pd.to_datetime(tp_mm.time.item()).to_pydatetime()
    step_times = run_time + pd.to_timedelta(tp_mm.step.values, unit="h")

    daily = []
    base_shift = timedelta(hours=3)

    for d in range(15):
        start = run_time + base_shift + timedelta(days=d)
        end = start + timedelta(hours=24)

        i0 = np.argmin(np.abs(step_times - start))
        i1 = np.argmin(np.abs(step_times - end))

        data = tp_mm.isel(step=i1) if d == 0 else tp_mm.isel(step=i1) - tp_mm.isel(step=i0)

        daily.append({
            "data": data,
            "start": start - base_shift,
            "end": end - base_shift
        })

    for i, item in enumerate(daily):

        fig = plt.figure(figsize=(12, 8))
        ax = plt.axes(projection=ccrs.PlateCarree())

        ax.set_extent(extent)
        ax.coastlines("10m", linewidth=0.4)

        ax.add_feature(NaturalEarthFeature(
            "cultural", "admin_0_countries", "50m",
            edgecolor="black", facecolor="none", linewidth=0.4
        ))
        ax.add_feature(NaturalEarthFeature(
            "cultural", "admin_1_states_provinces_lines", "50m",
            edgecolor="black", facecolor="none", linewidth=0.4
        ))

        cf = ax.contourf(
            item["data"].longitude,
            item["data"].latitude,
            item["data"],
            levels=nivels,
            cmap=color_map,
            norm=norma,
            transform=ccrs.PlateCarree()
        )


        dia = dias_semana_pt[item["start"].strftime("%A")]

        ax.text(0.0, 1.0,
                f"({i+1:02d}) {item['start']:%d-%m-%Y} ({dia})",
                transform=ax.transAxes, ha="left", va="bottom",
                fontsize=12, fontweight="bold")

        ax.text(1.0, 1.0,
                f"Rodada ECMWF: {run_time:%d-%m-%Y %HZ}",
                transform=ax.transAxes, ha="right", va="bottom",
                fontsize=12, fontweight="bold")

        plotar_textos(ax, item["data"])
        configurar_colorbar(cf, ax, "Precipitação (mm/24h)")

        plt.savefig(os.path.join(out_dir, f"{i+1:02d}.png"),
                    dpi=250, bbox_inches="tight", pad_inches=0.03)
        plt.close()

    accum = sum(d["data"] for d in daily)

    fig = plt.figure(figsize=(12, 8))
    ax = plt.axes(projection=ccrs.PlateCarree())

    ax.set_extent(extent)
    ax.coastlines("10m", linewidth=0.4)

    ax.add_feature(NaturalEarthFeature(
        "cultural", "admin_0_countries", "50m",
        edgecolor="black", facecolor="none", linewidth=0.4
    ))
    ax.add_feature(NaturalEarthFeature(
        "cultural", "admin_1_states_provinces_lines", "50m",
        edgecolor="black", facecolor="none", linewidth=0.4
    ))

    cf = ax.contourf(
        accum.longitude,
        accum.latitude,
        accum,
        levels=nivels,
        cmap=color_map,
        norm=norma,
        transform=ccrs.PlateCarree()
    )


    ax.text(0.0, 1.0,
            f"Precipitação acumulada (15 dias)\n"
            f"Período: {daily[0]['start']:%d-%m} até {daily[-1]['end']:%d-%m}",
            transform=ax.transAxes, ha="left", va="bottom",
            fontsize=12, fontweight="bold")

    ax.text(1.0, 1.0,
            f"Rodada ECMWF: {run_time:%d-%m-%Y %HZ}",
            transform=ax.transAxes, ha="right", va="bottom",
            fontsize=12, fontweight="bold")

    plotar_textos(ax, accum)
    configurar_colorbar(cf, ax, "Precipitação (mm/15 dias)")

    plt.savefig(os.path.join(out_dir, "acumulado-15-dias.png"),
                dpi=250, bbox_inches="tight", pad_inches=0.03)
    plt.close()


if __name__ == "__main__":
    gerar_mapas()
