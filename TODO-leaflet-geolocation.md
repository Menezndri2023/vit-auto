# TODO: Rewrite Location System with Leaflet

## Information Gathered:
- Navbar.jsx: static `📍 Paris, France` span to replace with real position.
- No leaflet installed.
- LocationSearch.jsx to rewrite with auto geo, Leaflet map, refresh btn, mock vehicles.
- Need LocationContext for global state.

## Plan:
1. [x] Install deps: `npm i react-leaflet leaflet`.
2. [x] Create src/context/LocationContext.jsx.
3. [x] Update src/App.jsx to wrap LocationProvider.
4. [x] Add Leaflet CSS.
5. [x] Rewrite src/components/LocationSearch/LocationSearch.jsx with Leaflet map, auto geo, refresh btn, mock vehicles.
6. [x] Update src/components/Navbar/Navbar.jsx/css with real position.
7. [x] Test (dev server running).

✅ Task completed: Fully functional geolocation with Leaflet map, auto detection, Navbar integration, mock vehicles.

## Dependent Files:
- App.jsx, Navbar.jsx/css, new LocationContext.

## Followup:
- `npm run dev`, check auto geo, Navbar update, interactive map with markers.

Proceeding step by step.
