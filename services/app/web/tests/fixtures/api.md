# Weatherline API

A small JSON API for today's weather by city.

## Endpoints

- `GET /forecast/{city}`: today's forecast.
- `POST /alerts`: subscribe to alerts.

```bash
curl http://localhost:8080/api/forecast/oslo
```

## Configuration

Set `API_KEY` to the provider's key.
