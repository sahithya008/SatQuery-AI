'use client';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
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
}

export default function InteractiveMap({ theme }: MapProps) {
    // Free, token-free tile URLs that never require an API key
    const tileUrl = theme === 'dark'
        ? 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png' // Clean bright/neutral style
        : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

    return (
        <div className={`w-full h-full rounded-xl overflow-hidden relative z-0 ${theme === 'dark' ? 'invert hue-rotate-180 brightness-90 contrast-125' : ''}`}>
            <MapContainer
                key={theme}
                center={[20.5937, 78.9629]}
                zoom={4}
                scrollWheelZoom={true}
                style={{ height: '100%', width: '100%', background: theme === 'dark' ? '#070b14' : '#f8fafc' }}
            >
                <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <Marker position={[13.0827, 80.2707]} icon={customIcon}>
                    <Popup>
                        <div className="text-slate-900 text-xs">
                            <strong>Cartosat-3 Active Swath</strong><br />
                            Altitude: 505 km | UTM Zone 45N
                        </div>
                    </Popup>
                </Marker>
            </MapContainer>
        </div>
    );
}