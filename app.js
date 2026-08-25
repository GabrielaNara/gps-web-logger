// ======================================================
// VARIÁVEIS GLOBAIS
// ======================================================
let map;
let watchId = null;
let isPaused = false;
let routeCoords = [];
let routeData = []; 
let currentPolyline;
let marker;
let initialLocationMarker;
let startTime;
let totalDistance = 0;
let timerInterval;
let wakeLock = null;
let currentHeading = 0;
let routeId = "";

// ======================================================
// ÍCONES (BÚSSOLA E MARCADOR INICIAL)
// ======================================================
const arrowIcon = L.divIcon({
    className: 'compass-marker',
    html: `<svg class="compass-arrow" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
                <path d="M20 2 L28 30 L20 24 L12 30 Z" fill="#dc3545" stroke="white" stroke-width="2"/>
           </svg>`,
    iconSize: [40, 40],
    iconAnchor: [20, 20]
});

const initialDotIcon = L.divIcon({
    className: 'initial-dot-marker',
    html: `<div style="width: 20px; height: 20px; background: #007bff; border: 3px solid white; border-radius: 50%; box-shadow: 0 0 10px rgba(0,0,0,0.5);"></div>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10]
});

// ======================================================
// FUNÇÕES UTILITÁRIAS
// ======================================================
function sanitizeFilename(name) {
    if (!name) return "sem_descricao";
    return name
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9\s]/g, '')
        .trim()
        .replace(/\s+/g, '_');
}

function generateRouteId() {
    const date = new Date();
    const format = (n) => n.toString().padStart(2, '0');
    return `ROUTE_${date.getFullYear()}${format(date.getMonth()+1)}${format(date.getDate())}${format(date.getHours())}${format(date.getMinutes())}${format(date.getSeconds())}`;
}

function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3; 
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

// ======================================================
// INICIALIZAÇÃO DO MAPA
// ======================================================
function initMap() {
    map = L.map('map').setView([-15.7801, -47.9292], 4);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap'
    }).addTo(map);

    // Marcador inicial azul assim que o app abre
    map.locate({setView: true, maxZoom: 16});
    
    function onLocationFound(e) {
        if (initialLocationMarker) map.removeLayer(initialLocationMarker);
        initialLocationMarker = L.marker(e.latlng, { icon: initialDotIcon }).addTo(map).bindPopup("Você está aqui");
    }
    map.on('locationfound', onLocationFound);

    loadExternalLayers();
}

function loadExternalLayers() {
    const layers = [
        { file: 'layers/pontos.geojson', color: 'blue' },
        { file: 'layers/teste_edificacao.geojson', color: 'green' }
    ];

    layers.forEach(layerInfo => {
        fetch(layerInfo.file)
            .then(response => {
                if (!response.ok) throw new Error(`Erro ao carregar ${layerInfo.file}`);
                return response.json();
            })
            .then(data => {
                L.geoJSON(data, {
                    style: { color: layerInfo.color, weight: 3, fillOpacity: 0.3 },
                    pointToLayer: function (feature, latlng) {
                        return L.circleMarker(latlng, {
                            radius: 6,
                            fillColor: layerInfo.color,
                            color: "#000",
                            weight: 1,
                            fillOpacity: 0.8
                        });
                    },
                    onEachFeature: function (feature, layer) {
                        if (feature.properties) {
                            let popupContent = '<div class="popup-attrs">';
                            for (let key in feature.properties) {
                                popupContent += `<b>${key}:</b> ${feature.properties[key]}<br>`;
                            }
                            popupContent += '</div>';
                            layer.bindPopup(popupContent);
                        }
                    }
                }).addTo(map);
            })
            .catch(error => console.warn(error.message));
    });
}

// ======================================================
// WAKE LOCK E BÚSSOLA
// ======================================================
async function requestWakeLock() {
    try {
        if ('wakeLock' in navigator) {
            wakeLock = await navigator.wakeLock.request('screen');
        }
    } catch (err) { console.log('Wake Lock não suportado'); }
}

function requestCompassPermission() {
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        DeviceOrientationEvent.requestPermission()
            .then(permissionState => {
                if (permissionState === 'granted') {
                    window.addEventListener('deviceorientation', handleDeviceOrientation);
                }
            })
            .catch(console.error);
    } else if (typeof DeviceOrientationEvent !== 'undefined') {
        window.addEventListener('deviceorientationabsolute', handleDeviceOrientation, true);
        window.addEventListener('deviceorientation', handleDeviceOrientation, true);
    }
}

function handleDeviceOrientation(event) {
    let heading = null;
    if (event.webkitCompassHeading) {
        heading = event.webkitCompassHeading;
    } else if (event.absolute === true || event.alpha !== null) {
        heading = 360 - event.alpha;
    }

    if (heading !== null) {
        currentHeading = heading;
        updateMarkerRotation();
    }
}

function updateMarkerRotation() {
    if (marker) {
        const markerEl = marker.getElement();
        if (markerEl) {
            const arrow = markerEl.querySelector('.compass-arrow');
            if (arrow) {
                arrow.style.transform = `rotate(${currentHeading}deg)`;
            }
        }
    }
}

// ======================================================
// EVENTOS DOS BOTÕES
// ======================================================
document.getElementById('btn-start').addEventListener('click', () => {
    if (watchId) return;
    
    routeCoords = [];
    routeData = [];
    totalDistance = 0;
    startTime = Date.now();
    isPaused = false;
    routeId = generateRouteId();

    if (currentPolyline) map.removeLayer(currentPolyline);
    if (marker) { map.removeLayer(marker); marker = null; }
    if (initialLocationMarker) map.removeLayer(initialLocationMarker);

    requestWakeLock();
    requestCompassPermission();

    watchId = navigator.geolocation.watchPosition(
        (position) => {
            if (isPaused) return;

            const { latitude, longitude, accuracy } = position.coords;
            
            if (routeCoords.length > 0) {
                const lastCoord = routeCoords[routeCoords.length - 1];
                totalDistance += calculateDistance(lastCoord.lat, lastCoord.lng, latitude, longitude);
            }

            routeCoords.push({ lat: latitude, lng: longitude });
            
            // Adiciona o ID em cada um dos registros da memória
            routeData.push({ 
                id: routeId, 
                lat: latitude, 
                lon: longitude, 
                timestamp: Date.now(), 
                accuracy: accuracy 
            });

            document.getElementById('distance').innerText = totalDistance.toFixed(0);
            document.getElementById('accuracy').innerText = accuracy.toFixed(0);
            
            if (currentPolyline) map.removeLayer(currentPolyline);
            currentPolyline = L.polyline(routeCoords, {color: 'red', weight: 4}).addTo(map);
            
            if (!marker) {
                marker = L.marker([latitude, longitude], { icon: arrowIcon }).addTo(map);
            } else {
                marker.setLatLng([latitude, longitude]);
            }
            updateMarkerRotation();
            
            map.setView([latitude, longitude], 18);
        },
        (error) => alert("Erro ao obter localização: " + error.message),
        { enableHighAccuracy: true, maximumAge: 1000, timeout: 5000 }
    );

    timerInterval = setInterval(() => {
        if (watchId && !isPaused) {
            const elapsed = Math.floor((Date.now() - startTime) / 1000);
            document.getElementById('time').innerText = elapsed;
        }
    }, 1000);

    document.getElementById('btn-start').disabled = true;
    document.getElementById('btn-pause').disabled = false;
    document.getElementById('btn-stop').disabled = false;
});

document.getElementById('btn-pause').addEventListener('click', (e) => {
    isPaused = !isPaused;
    e.target.innerText = isPaused ? "RESUME" : "PAUSE";
});

document.getElementById('btn-stop').addEventListener('click', () => {
    if (navigator.geolocation && watchId) {
        navigator.geolocation.clearWatch(watchId);
        watchId = null;
        clearInterval(timerInterval);
        
        if (wakeLock) {
            wakeLock.release();
            wakeLock = null;
        }
        document.getElementById('stop-modal').classList.remove('hidden');
    }
});

document.getElementById('btn-continue').addEventListener('click', () => {
    document.getElementById('stop-modal').classList.add('hidden');
    document.getElementById('result-modal').classList.remove('hidden');
});

// ======================================================
// DOWNLOADS
// ======================================================
document.getElementById('btn-csv').addEventListener('click', () => {
    let csv = "id,dia,hora,timestamp,lat,lon,accuracy\n";
    routeData.forEach(row => {
        const date = new Date(row.timestamp);
        const dia = date.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
        const hora = date.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo' });
        csv += `${row.id},${dia},${hora},${row.timestamp},${row.lat},${row.lon},${row.accuracy}\n`;
    });
    
    const desc = sanitizeFilename(document.getElementById('route-description').value);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `trajeto_${desc}_${routeId}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
});

document.getElementById('btn-shp').addEventListener('click', async () => {
    if (routeData.length < 2) {
        alert("Caminhe um pouco para registrar pelo menos 2 pontos antes de baixar o SHP.");
        return;
    }

    const rawDesc = document.getElementById('route-description').value || "Sem_descricao";
    const desc = sanitizeFilename(rawDesc);
    
    const coordinatesArray = routeData.map(p => [Number(p.lon), Number(p.lat)]);
    
    const geojson = {
        type: "FeatureCollection",
        features: [{
            type: "Feature",
            geometry: { 
                type: "LineString", 
                coordinates: coordinatesArray 
            },
            properties: { 
                id: routeId, 
                descricao: rawDesc 
            }
        }]
    };
    
    try {
        if (typeof shpwrite === 'undefined') {
            alert("Erro: Biblioteca SHP não carregou. Verifique a pasta libs.");
            return;
        }

        // SOLUÇÃO DEFINITIVA: Usar outputType: "blob"
        const zipBlob = await shpwrite.zip(geojson, {
            folder: "trajeto",
            filename: `trajeto_${desc}_${routeId}`,
            outputType: "blob"
        });

        const url = window.URL.createObjectURL(zipBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `trajeto_${desc}_${routeId}.zip`;
        document.body.appendChild(a);
        a.click();
        
        setTimeout(() => {
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
        }, 100);
        
    } catch (err) {
        console.error("Erro SHP:", err);
        alert("Erro ao gerar SHP: " + err.message);
    }
});

document.getElementById('btn-new').addEventListener('click', () => {
    document.getElementById('result-modal').classList.add('hidden');
    document.getElementById('btn-start').disabled = false;
    document.getElementById('btn-pause').disabled = true;
    document.getElementById('btn-pause').innerText = "PAUSE";
    document.getElementById('btn-stop').disabled = true;
    document.getElementById('time').innerText = '0';
    document.getElementById('distance').innerText = '0';
    document.getElementById('accuracy').innerText = '-';
    document.getElementById('route-description').value = '';
    if (currentPolyline) map.removeLayer(currentPolyline);
    if (marker) { map.removeLayer(marker); marker = null; }
    
    // Reativa o marcador azul inicial
    map.locate({setView: true, maxZoom: 16});
});

// ======================================================
// INICIAR APLICAÇÃO
// ======================================================
initMap();

// CORREÇÃO DO MAPA CORTADO: Força o Leaflet a recalcular o tamanho da tela 
// depois que o navegador do celular termina de carregar 100%
window.addEventListener('load', function() {
    setTimeout(function() {
        if (map) {
            map.invalidateSize();
        }
    }, 300);
});

// Recalcula se a pessoa girar o celular
window.addEventListener('orientationchange', function() {
    setTimeout(function() {
        if (map) {
            map.invalidateSize();
        }
    }, 300);
});