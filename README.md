# Leaflet + React Novos Heatmap

Minimal Vite + React setup with a Leaflet map you can extend with more components.

## Getting started

1. Install dependencies:
   ```bash
   npm install
   ```
2. Create a `.env` file for the API (see `.env.example` for fields). Keep secrets out of git.
3. Run the API (fetches rows from Postgres). Default port: 3001
   ```bash
   npm run api
   ```
   - If the port is busy, set a different one just for the API: `PORT=3002 npm run api`
4. In another terminal, run the dev server:
   ```bash
   npm run dev
   ```
   - If you changed the API port, tell the frontend where to fetch: `VITE_API_URL=http://localhost:3002/points npm run dev`
5. Open the printed localhost URL (defaults to http://localhost:5173).

## Project structure

- `server.js` – small Express API that reads from Postgres (configurable columns for `address_data`).
- `src/App.jsx` – renders the map using `react-leaflet`; fetches markers from the API (via `VITE_API_URL` or default `http://localhost:3001/points`) and falls back to sample points on error.
- `src/index.css` – basic page styling and map sizing.
- `vite.config.js` – Vite config with the React plugin.

## Notes for extending

- Add new layers or controls by composing `react-leaflet` components inside `MapContainer`.
- Keep the map height set via CSS (see `.map-shell__map`) to avoid a collapsed map.
- The default Leaflet marker icon paths are wired for Vite bundling; reuse `L.icon` if you add custom markers.
- The API supports optional map-bounds filtering by passing `minLat`, `maxLat`, `minLng`, `maxLng` query params to `/points`. Without bounds, it now returns all rows with coordinates, so consider bounding queries if the dataset grows further.
- If your table lacks an `id` column, leave `ID_COLUMN` blank in `.env`; the API will auto-number rows.
- Example env for `address_data` columns: `ID_COLUMN=address_id`, `CITY_COLUMN=city`, `ADDRESS_COLUMN=line1`, `LAT_COLUMN=latitude`, `LNG_COLUMN=longitude`, `FDA_FDH_COLUMN=fda_fdh`, `DROP_COLUMN=drop`, `SERVICEABLE_COLUMN=serviceable`.

## .env must be created and setup with database uri and olt info
