'use client';
import { useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

const customIcon = L.icon({
    iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
});

interface MapProps {
    theme: 'dark' | 'light';
    onLocationSelect: (lat: number, lng: number, locationName: string) => void;
    position: [number, number];
}

function getLocationName(lat: number, lng: number): string {
    if (lat > 13.0 && lat < 14.5 && lng > 79.5 && lng < 81.0) return "SDSC SHAR, Sriharikota (Launch Complex)";
    if (lat > 12.5 && lat < 13.5 && lng > 77.0 && lng < 78.0) return "ISTRAC / ISRO HQ, Bengaluru";
    if (lat > 17.0 && lat < 18.0 && lng > 78.0 && lng < 79.0) return "NRSC Earth Station, Shadnagar";
    if (lat > 18.5 && lat < 19.5 && lng > 72.5 && lng < 73.5) return "Mumbai Coastal Surveillance Sector";
    if (lat > 28.0 && lat < 29.0 && lng > 76.8 && lng < 77.8) return "National Capital Region (NCR) Swath";
    if (lat > 22.5 && lat < 23.5 && lng > 72.0 && lng < 73.0) return "SAC (Space Applications Centre), Ahmedabad";
    return `Target Sector (${lat.toFixed(2)}°N, ${lng.toFixed(2)}°E)`;
}

function LocationMarker({ position, onLocationSelect }: { position: [number, number], onLocationSelect: (lat: number, lng: number, name: string) => void }) {
    useMapEvents({
        click(e) {
            const lat = Number(e.latlng.lat.toFixed(4));
            const lng = Number(e.latlng.lng.toFixed(4));
            const name = getLocationName(lat, lng);
            onLocationSelect(lat, lng, name);
        },
    });

    return position === null ? null : (
        <Marker position={position} icon={customIcon}>
            <Popup>
                <div className="text-slate-900 text-xs font-mono">
                    <strong>{getLocationName(position[0], position[1])}</strong><br />
                    Lat: {position[0]} | Lng: {position[1]}<br />
                    UTM Zone 45N | GSD: 0.28m PAN
                </div>
            </Popup>
        </Marker>
    );
}

export default function InteractiveMap({ theme, onLocationSelect, position }: MapProps) {
    const [mapStyle, setMapStyle] = useState<'satellite' | 'dark' | 'streets'>('satellite');

    const getTileConfig = () => {
        if (mapStyle === 'satellite') {
            return {
                url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
                attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS'
            };
        } else {
            return {
                url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            };
        }
    };

    const tileConfig = getTileConfig();

    return (
        <div className="w-full h-full rounded-xl overflow-hidden relative flex flex-col bg-[#070b14]">

            {/* MAP LAYER SWITCHER CONTROLS */}
            <div className="absolute top-3 right-4 z-[1000] flex space-x-1.5 bg-slate-950/90 backdrop-blur-md p-1.5 rounded-xl border border-slate-700/80 text-xs shadow-2xl pointer-events-auto">
                <button
                    onClick={() => setMapStyle('satellite')}
                    className={`px-3 py-1 rounded-lg font-medium transition ${mapStyle === 'satellite' ? 'bg-amber-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}
                >
                    Satellite
                </button>
                <button
                    onClick={() => setMapStyle('dark')}
                    className={`px-3 py-1 rounded-lg font-medium transition ${mapStyle === 'dark' ? 'bg-amber-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}
                >
                    Dark Canvas
                </button>
                <button
                    onClick={() => setMapStyle('streets')}
                    className={`px-3 py-1 rounded-lg font-medium transition ${mapStyle === 'streets' ? 'bg-amber-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}
                >
                    Street View
                </button>
            </div>

            <div className={`w-full h-full relative flex-1 ${mapStyle === 'dark' ? 'invert hue-rotate-180 brightness-95 contrast-125' : ''}`}>
                <MapContainer
                    key={mapStyle}
                    center={position}
                    zoom={11}
                    scrollWheelZoom={true}
                    style={{ height: '100%', width: '100%', position: 'absolute', top: 0, left: 0, background: '#070b14' }}
                >
                    <TileLayer attribution={tileConfig.attribution} url={tileConfig.url} />
                    <LocationMarker position={position} onLocationSelect={onLocationSelect} />
                </MapContainer>
            </div>
        </div>
    );
}