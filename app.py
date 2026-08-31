"""
app.py
------
Flask web server for the Weather Prediction Using Neural Network project.

Routes:
    GET  /         -> Main dashboard (form, dataset stats, model accuracy, graphs)
    POST /predict   -> Accepts form input, runs the trained model, returns risk result
    GET  /about     -> Academic breakdown and syllabus mapping page
"""

import os
import numpy as np
import pandas as pd
import joblib
from flask import Flask, render_template, request, jsonify

from neural_network import NeuralNetwork
from preprocess import DATA_PATH, TARGET
from services.weather_api import (
    fetch_weather_by_city,
    fetch_weather_by_coords,
    WeatherAPIError,
    WeatherAPIConfigError,
    CityNotFoundError,
    WeatherAPITimeoutError,
)

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass  # python-dotenv is optional; WEATHER_API_KEY can still be set via the OS environment

# ------------------------------------------------------------------
# Path setup (works cross-platform, safe for PyCharm on Windows)
# ------------------------------------------------------------------
BASE_DIR = os.path.abspath(os.path.dirname(__file__))
MODELS_DIR = os.path.join(BASE_DIR, "models")
WEIGHTS_PATH = os.path.join(MODELS_DIR, "model_weights.npz")
SCALER_PATH = os.path.join(MODELS_DIR, "scaler.pkl")
METRICS_PATH = os.path.join(MODELS_DIR, "metrics.npz")

app = Flask(
    __name__,
    template_folder=os.path.join(BASE_DIR, "templates"),
    static_folder=os.path.join(BASE_DIR, "static"),
)

# ------------------------------------------------------------------
# Load trained model, scaler, and metadata at server startup
# ------------------------------------------------------------------
_bundle = joblib.load(SCALER_PATH)
scaler = _bundle["scaler"]
feature_names = _bundle["feature_names"]
target_name = _bundle["target"]

model = NeuralNetwork(input_size=len(feature_names))
model.load_weights(WEIGHTS_PATH)

if os.path.exists(METRICS_PATH):
    _metrics = np.load(METRICS_PATH)
    MODEL_METRICS = {
        "accuracy": round(float(_metrics["accuracy"]) * 100, 2),
        "precision": round(float(_metrics["precision"]) * 100, 2),
        "recall": round(float(_metrics["recall"]) * 100, 2),
        "f1": round(float(_metrics["f1"]) * 100, 2),
        "tp": int(_metrics["tp"]), "tn": int(_metrics["tn"]),
        "fp": int(_metrics["fp"]), "fn": int(_metrics["fn"]),
        "train_samples": int(_metrics["train_samples"]),
        "test_samples": int(_metrics["test_samples"]),
        "epochs": int(_metrics["epochs"]),
        "optimizer": str(_metrics["optimizer"]),
    }
else:
    MODEL_METRICS = {}

GRAPH_FILES = [
    "training_loss.png", "accuracy.png", "confusion_matrix.png",
    "heatmap.png", "activation_functions.png", "rain_distribution.png",
    "optimizer_comparison.png",
]

# The five numeric fields exposed on the prediction form. Any remaining
# model features (e.g. one-hot wind-direction columns) are auto-filled
# with dataset means / the most frequent category so the form stays simple.
FORM_FIELDS = ["Temperature", "Humidity", "Pressure", "WindSpeed", "CloudCover"]


def _dataset_stats():
    """Loads weather.csv and produces summary stats for the dashboard."""
    df = pd.read_csv(DATA_PATH)
    stats = {
        "total_rows": len(df),
        "total_columns": len(df.columns),
        "rain_yes": int((df["RainTomorrow"] == "Yes").sum()),
        "rain_no": int((df["RainTomorrow"] == "No").sum()),
        "columns": list(df.columns),
    }
    return stats, df


def _build_feature_vector(form_data):
    """
    Builds a full feature row (in the exact order the scaler/model expect)
    from the simplified web form, filling any engineering-only columns
    (MinTemp, MaxTemp, SunshineHours, Rainfall, RainToday, WindDir_*) with
    sensible defaults derived from the dataset so the form stays short.
    """
    _, df = _dataset_stats()

    temperature = float(form_data["Temperature"])
    humidity = float(form_data["Humidity"])
    pressure = float(form_data["Pressure"])
    wind_speed = float(form_data["WindSpeed"])
    cloud_cover = float(form_data["CloudCover"])

    row = {}
    for col in feature_names:
        if col == "Temperature":
            row[col] = temperature
        elif col == "Humidity":
            row[col] = humidity
        elif col == "Pressure":
            row[col] = pressure
        elif col == "WindSpeed":
            row[col] = wind_speed
        elif col == "CloudCover":
            row[col] = cloud_cover
        elif col == "MinTemp":
            row[col] = temperature - 5.0
        elif col == "MaxTemp":
            row[col] = temperature + 5.0
        elif col == "SunshineHours":
            row[col] = max(0.0, 10 - cloud_cover / 12)
        elif col == "Rainfall":
            # Estimated rainfall proxy, calibrated against this dataset's
            # 75th-percentile Humidity/CloudCover (roughly the point where
            # "genuinely humid/overcast" starts) rather than its mean — using
            # the mean caused ordinary, everyday readings to look wet enough
            # to flip RainToday below, which dominates the prediction.
            row[col] = max(0.0, (humidity - 75) * 0.30 + (cloud_cover - 65) * 0.20)
        elif col == "RainToday":
            row[col] = 1.0 if row.get("Rainfall", 0.0) > 3.0 else 0.0
        elif col.startswith("WindDir_"):
            row[col] = 0.0  # default: base direction category
        else:
            # Fallback: use the column's dataset mean for any unmapped feature
            row[col] = float(pd.to_numeric(df.get(col, pd.Series([0])), errors="coerce").mean() or 0.0)

    ordered = np.array([[row[c] for c in feature_names]], dtype=float)
    return ordered


def _risk_level(probability_pct):
    if probability_pct < 30:
        return "LOW", "risk-low"
    elif probability_pct < 60:
        return "MEDIUM", "risk-medium"
    elif probability_pct < 80:
        return "HIGH", "risk-high"
    else:
        return "VERY HIGH", "risk-very-high"


@app.route("/", methods=["GET"])
def index():
    stats, _ = _dataset_stats()
    return render_template(
        "index.html",
        stats=stats,
        metrics=MODEL_METRICS,
        graphs=GRAPH_FILES,
        target_name=target_name,
        prediction=None,
    )


@app.route("/predict", methods=["POST"])
def predict():
    stats, _ = _dataset_stats()
    error = None
    prediction = None

    try:
        form_values = {field: request.form.get(field, "") for field in FORM_FIELDS}

        # Basic server-side validation mirroring the client-side ranges
        temp = float(form_values["Temperature"])
        hum = float(form_values["Humidity"])
        pres = float(form_values["Pressure"])
        wind = float(form_values["WindSpeed"])
        cloud = float(form_values["CloudCover"])

        if not (-50 <= temp <= 60):
            raise ValueError("Temperature must be between -50 and 60 C")
        if not (0 <= hum <= 100):
            raise ValueError("Humidity must be between 0 and 100%")
        if not (800 <= pres <= 1100):
            raise ValueError("Pressure must be between 800 and 1100 hPa")
        if not (0 <= wind <= 200):
            raise ValueError("Wind speed must be a realistic non-negative value")
        if not (0 <= cloud <= 100):
            raise ValueError("Cloud cover must be between 0 and 100%")

        X_raw = _build_feature_vector(form_values)
        X_scaled = scaler.transform(X_raw)

        probability = float(model.predict_proba(X_scaled)[0][0])
        probability_pct = round(probability * 100, 2)
        predicted_class = "Rain" if probability >= 0.5 else "No Rain"
        risk_label, risk_class = _risk_level(probability_pct)

        prediction = {
            "probability_pct": probability_pct,
            "predicted_class": predicted_class,
            "risk_label": risk_label,
            "risk_class": risk_class,
            "inputs": form_values,
        }
    except (ValueError, KeyError) as exc:
        error = str(exc)

    return render_template(
        "index.html",
        stats=stats,
        metrics=MODEL_METRICS,
        graphs=GRAPH_FILES,
        target_name=target_name,
        prediction=prediction,
        error=error,
    )


@app.route("/weather", methods=["GET"])
def weather():
    """
    Live "Today's Weather" endpoint used by the dashboard's city-search
    widget. Looks up either a city name (?city=) or a lat/lon pair
    (?lat=&lon=, used by the "Use my location" button) and returns a
    clean JSON reading. The WEATHER_API_KEY is read on the server only
    and is never exposed to the browser.
    """
    city = request.args.get("city", "").strip()
    lat = request.args.get("lat", "").strip()
    lon = request.args.get("lon", "").strip()

    try:
        if lat and lon:
            try:
                lat_f, lon_f = float(lat), float(lon)
            except ValueError:
                return jsonify({"error": "Invalid location coordinates."}), 400
            reading = fetch_weather_by_coords(lat_f, lon_f)
        elif city:
            reading = fetch_weather_by_city(city)
        else:
            return jsonify({"error": "Please enter a city name."}), 400

        return jsonify(reading)

    except CityNotFoundError:
        label = city if city else "that location"
        return jsonify({"error": f'City "{label}" could not be found. Check the spelling and try again.'}), 404
    except WeatherAPITimeoutError:
        return jsonify({"error": "The weather service took too long to respond. Please try again."}), 504
    except WeatherAPIConfigError:
        return jsonify({"error": "Live weather is not configured on this server yet."}), 503
    except WeatherAPIError:
        return jsonify({"error": "The weather service is currently unavailable. Please try again later."}), 502


@app.route("/about", methods=["GET"])
def about():
    return render_template("about.html", metrics=MODEL_METRICS)


if __name__ == "__main__":
    app.run(debug=True, host="0.0.0.0", port=5000)
