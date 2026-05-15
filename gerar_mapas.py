from ecmwf.opendata import Client
import xarray as xr
import json
import os
import numpy as np
import matplotlib.pyplot as plt

from matplotlib.colors import (
    ListedColormap,
    BoundaryNorm
)

from scipy.ndimage import gaussian_filter
from PIL import Image

from datetime import datetime, timedelta
import traceback

# ==========================================================
# CONFIGURAÇÕES
# ==========================================================

BASE_DIR = (
    os.path.dirname(os.path.abspath(__file__))
    if "__file__" in locals()
    else os.getcwd()
)

os.chdir(BASE_DIR)

hoje_utc = datetime.utcnow()

data_query = hoje_utc.strftime("%Y%m%d")

grib_file = os.path.join(
    BASE_DIR,
    f"tp_{data_query}_00.grib2"
)

json_meta = os.path.join(
    BASE_DIR,
    "metadados.json"
)

# ==========================================================
# RECORTE BRASIL
# ==========================================================

LAT_MIN = -35
LAT_MAX = 6

LON_MIN = -75
LON_MAX = -30

# ==========================================================
# DOWNLOAD ECMWF OPEN DATA VIA AZURE
# ==========================================================

if not os.path.exists(grib_file):

    print(f"⬇️ Baixando ECMWF {data_query}...")

    client = Client(source="azure")

    try:

        client.retrieve(
            date=data_query,
            time=0,
            type="fc",
            stream="oper",
            param="tp",
            step=list(range(0, 121, 3)),
            target=grib_file,
        )

        print("✅ Download concluído.")

    except Exception:

        traceback.print_exc()
        raise SystemExit(1)

else:

    print("✅ GRIB já existe.")

# ==========================================================
# PROCESSAMENTO
# ==========================================================

try:

    print("📦 Abrindo GRIB...")

    ds = xr.open_dataset(
        grib_file,
        engine="cfgrib",
        backend_kwargs={
            "filter_by_keys": {
                "shortName": "tp"
            },
            "indexpath": ""
        }
    )

    # ======================================================
    # LONGITUDE 0-360 -> -180/+180
    # ======================================================

    ds = ds.assign_coords(
        longitude=((ds.longitude + 180) % 360) - 180
    )

    ds = ds.sortby("longitude")
    ds = ds.sortby("latitude")

    # ======================================================
    # RECORTE BRASIL
    # ======================================================

    ds = ds.sel(
        latitude=slice(LAT_MIN, LAT_MAX),
        longitude=slice(LON_MIN, LON_MAX)
    )

    # ======================================================
    # VARIÁVEL TP
    # ======================================================

    tp = ds["tp"].load()

    # ======================================================
    # CHUVA INCREMENTAL
    # ======================================================

    tp_inc = tp.diff("step", label="upper")

    tp_inc = tp_inc.where(tp_inc >= 0, 0)

    tp_inc = tp_inc.fillna(0)

    # metros -> mm
    tp_inc = tp_inc * 1000

    # ======================================================
    # INTERPOLAÇÃO ESPACIAL
    # ======================================================

    novas_lats = np.arange(
        LAT_MIN,
        LAT_MAX + 0.03,
        0.03
    )

    novas_lons = np.arange(
        LON_MIN,
        LON_MAX + 0.03,
        0.03
    )

    tp_inc_suave = tp_inc.interp(
        latitude=novas_lats,
        longitude=novas_lons,
        method="linear"
    )

    # ======================================================
    # ESCALA DE CORES
    # ======================================================

    cores_escala = [
        "#BDBDBD",
        "#81C784",
        "#1B5E20",
        "#4FC3F7",
        "#0D47A1",
        "#FFFF8D",
        "#FDD835",
        "#FB8C00",
        "#E65100",
        "#ff5959",
        "#a10e0e",
        "#8D6E63",
        "#5D4037",
        "#DDA0DD",
        "#9370DB"
    ]

    niveis_chuva = [
        1,
        3,
        6,
        10,
        15,
        20,
        30,
        40,
        50,
        75,
        100,
        150,
        200,
        300,
        400,
        1000
    ]

    cmap_custom = ListedColormap(
        cores_escala
    )

    norm = BoundaryNorm(
        niveis_chuva,
        cmap_custom.N,
        clip=True
    )

    # ======================================================
    # METADADOS
    # ======================================================

    dias_semana = [
        "Segunda",
        "Terça",
        "Quarta",
        "Quinta",
        "Sexta",
        "Sábado",
        "Domingo"
    ]

    data_base = datetime.strptime(
        data_query,
        "%Y%m%d"
    )

    frames_meta = []

    # ======================================================
    # GERAÇÃO DOS PNGS
    # ======================================================

    print("🖼️ Gerando imagens...")

    for i in range(5):

        start_step = i * 8
        end_step = (i + 1) * 8

        grid_dia = tp_inc_suave.isel(
            step=slice(start_step, end_step)
        ).sum(dim="step")

        dados_imagem = np.flipud(
            grid_dia.values
        )

        # ==================================================
        # SUAVIZAÇÃO
        # ==================================================

        dados_imagem = gaussian_filter(
            dados_imagem,
            sigma=0.7
        )

        # ==================================================
        # TRANSPARÊNCIA < 1mm
        # ==================================================

        dados_imagem_mascarados = np.ma.masked_where(
            dados_imagem < 1.0,
            dados_imagem
        )

        # ==================================================
        # FIGURA
        # ==================================================

        fig, ax = plt.subplots(
            figsize=(12, 12),
            dpi=100
        )

        fig.subplots_adjust(
            left=0,
            right=1,
            bottom=0,
            top=1
        )

        ax.axis("off")

        ax.imshow(
            dados_imagem_mascarados,
            cmap=cmap_custom,
            norm=norm,
            interpolation="bilinear",
            aspect="auto"
        )

        nome_imagem = f"chuva_dia_{i}.png"

        caminho_imagem = os.path.join(
            BASE_DIR,
            nome_imagem
        )

        plt.savefig(
            caminho_imagem,
            transparent=True,
            bbox_inches="tight",
            pad_inches=0,
            dpi=120
        )

        plt.close(fig)

        # ==================================================
        # COMPRESSÃO PNG
        # ==================================================

        img = Image.open(caminho_imagem)

        img.save(
            caminho_imagem,
            optimize=True,
            compress_level=9
        )

        print(f"✅ {nome_imagem}")

        # ==================================================
        # METADADOS FRAME
        # ==================================================

        data_alvo = data_base + timedelta(days=i)

        label = (
            f"{data_alvo.strftime('%d/%m')} - "
            f"{dias_semana[data_alvo.weekday()]}"
        )

        frames_meta.append({
            "label": label,
            "arquivo": nome_imagem
        })

    # ======================================================
    # JSON METADADOS
    # ======================================================

    output_meta = {
        "model": "ECMWF OpenData Azure",
        "updated": datetime.utcnow().strftime(
            "%d/%m/%Y %H:%M UTC"
        ),
        "bounds": [
            [LAT_MIN, LON_MIN],
            [LAT_MAX, LON_MAX]
        ],
        "frames": frames_meta
    }

    with open(
        json_meta,
        "w",
        encoding="utf-8"
    ) as f:

        json.dump(
            output_meta,
            f,
            ensure_ascii=False,
            indent=2
        )

    print("✨ SUCESSO TOTAL")

except Exception:

    traceback.print_exc()
    raise SystemExit(1)