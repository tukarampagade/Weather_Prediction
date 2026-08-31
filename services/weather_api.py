"""
services/weather_api.py
------------------------
Live "Today's Weather" integration (OpenWeatherMap Current Weather API).

This module is called by app.py's `/weather` route to fetch real-time
conditions for a city (or a lat/lon pair from browser geolocation) and
return them in a clean, JSON-serialisable shape for the frontend.

SETUP
-----
1. Sign up for a free API key at https://openweathermap.org/api
2. Set it as an environment variable -- never hard-code it:
       Windows (PowerShell):  $env:WEATHER_API_KEY="your_key_here"
       Linux / macOS:         export WEATHER_API_KEY="your_key_here"
   or add it to a local `.env` file (see `.env.example`):
       WEATHER_API_KEY=your_key_here
3. Install dependencies:  pip install requests python-dotenv

The API key is read on the server only and is never sent to the browser.
"""

import os
import time

OPENWEATHER_BASE_URL = "https://api.openweathermap.org/data/2.5/weather"
REQUEST_TIMEOUT_SECONDS = 8


class WeatherAPIError(Exception):
    """Base class for all live-weather failures."""
    pass


class WeatherAPIConfigError(WeatherAPIError):
    """Raised when WEATHER_API_KEY is missing or the client library is unavailable."""
    pass


class CityNotFoundError(WeatherAPIError):
    """Raised when the requested city cannot be found by the weather provider."""
    pass


class WeatherAPITimeoutError(WeatherAPIError):
    """Raised when the weather provider does not respond in time."""
    pass


def get_api_key():
    """Reads the weather API key from the environment. Never hard-code it."""
    api_key = os.environ.get("WEATHER_API_KEY")
    if not api_key:
        raise WeatherAPIConfigError(
            "WEATHER_API_KEY environment variable is not set. "
            "See services/weather_api.py for setup steps."
        )
    return api_key


def _get_requests_module():
    try:
        import requests
        return requests
    except ImportError as exc:
        raise WeatherAPIConfigError(
            "The 'requests' package is required for live weather. "
            "Install it with: pip install requests"
        ) from exc


def _call_openweather(params):
    """Shared HTTP call + error translation for both city- and coordinate-based lookups."""
    requests = _get_requests_module()
    api_key = get_api_key()

    query = dict(params)
    query["appid"] = api_key
    query["units"] = "metric"  # Celsius, m/s (converted to km/h below)

    try:
        response = requests.get(OPENWEATHER_BASE_URL, params=query, timeout=REQUEST_TIMEOUT_SECONDS)
    except Exception as exc:
        # Covers requests.exceptions.Timeout and any connection-level failure.
        name = exc.__class__.__name__.lower()
        if "timeout" in name:
            raise WeatherAPITimeoutError("The weather service took too long to respond.") from exc
        raise WeatherAPIError(f"Could not reach the weather service: {exc}") from exc

    if response.status_code == 404:
        raise CityNotFoundError("City not found.")
    if response.status_code == 401:
        raise WeatherAPIConfigError("The weather API key was rejected. Check WEATHER_API_KEY.")
    if response.status_code >= 400:
        raise WeatherAPIError(f"Weather service returned an error (HTTP {response.status_code}).")

    try:
        return response.json()
    except ValueError as exc:
        raise WeatherAPIError("Weather service returned an unreadable response.") from exc


def _parse_reading(data):
    """Normalizes an OpenWeatherMap response into the shape the frontend expects."""
    try:
        wind_speed_ms = float(data.get("wind", {}).get("speed", 0.0))
        wind_speed_kmh = round(wind_speed_ms * 3.6, 1)  # OpenWeatherMap wind speed is in m/s

        weather_list = data.get("weather") or [{}]
        condition = weather_list[0].get("main", "-")
        description = weather_list[0].get("description", "-")
        icon = weather_list[0].get("icon", "01d")

        visibility_m = data.get("visibility")
        visibility_km = round(visibility_m / 1000, 1) if isinstance(visibility_m, (int, float)) else None

        return {
            "city": data.get("name") or "Unknown",
            "country": data.get("sys", {}).get("country", ""),
            "temperature_c": round(float(data["main"]["temp"]), 1),
            "feels_like_c": round(float(data["main"]["feels_like"]), 1),
            "humidity_pct": round(float(data["main"]["humidity"]), 0),
            "pressure_hpa": round(float(data["main"]["pressure"]), 0),
            "wind_speed_kmh": wind_speed_kmh,
            "cloud_cover_pct": round(float(data.get("clouds", {}).get("all", 0)), 0),
            "condition": condition,
            "description": description.title() if isinstance(description, str) else description,
            "icon": icon,
            "visibility_km": visibility_km,
            "last_updated_unix": int(data.get("dt", time.time())),
            "lat": data.get("coord", {}).get("lat"),
            "lon": data.get("coord", {}).get("lon"),
        }
    except (KeyError, TypeError, ValueError) as exc:
        raise WeatherAPIError(f"Unexpected response format from the weather service: {exc}") from exc


def fetch_weather_by_city(city_name):
    """
    Fetches current live weather conditions for a given city name.

    Returns a dict with: city, country, temperature_c, feels_like_c,
    humidity_pct, pressure_hpa, wind_speed_kmh, cloud_cover_pct, condition,
    description, icon, visibility_km, last_updated_unix, lat, lon.

    Raises WeatherAPIConfigError, CityNotFoundError, WeatherAPITimeoutError,
    or WeatherAPIError on failure.
    """
    city_name = (city_name or "").strip()
    if not city_name:
        raise WeatherAPIError("City name must not be empty.")

    data = _call_openweather({"q": city_name})
    return _parse_reading(data)


def fetch_weather_by_coords(lat, lon):
    """
    Fetches current live weather conditions for a latitude/longitude pair
    (used by the "Use my location" browser-geolocation option).

    Returns the same shape as `fetch_weather_by_city`.
    """
    data = _call_openweather({"lat": lat, "lon": lon})
    return _parse_reading(data)


def prediction_fields_from_reading(reading):
    """
    Maps a live-weather reading onto the five fields the prediction form
    and model expect. Wind speed is already converted to km/h upstream.
    """
    return {
        "Temperature": reading["temperature_c"],
        "Humidity": reading["humidity_pct"],
        "Pressure": reading["pressure_hpa"],
        "WindSpeed": reading["wind_speed_kmh"],
        "CloudCover": reading["cloud_cover_pct"],
    }


if __name__ == "__main__":
    # Manual smoke test: python services/weather_api.py
    try:
        reading = fetch_weather_by_city("Bengaluru")
        print("Live weather reading:", reading)
    except WeatherAPIError as e:
        print("Could not fetch live weather (expected without WEATHER_API_KEY set):")
        print(f"  {e}")
