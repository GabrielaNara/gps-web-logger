// Variáveis Globais
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

// Ícone da Seta (SVG) - Bússola
const arrowIcon = L.divIcon({
    className: 'compass-marker',
    html: `<svg class="compass-arrow" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
                <path d="M20 2 L28 30 L20 24 L12 30 Z" fill="#dc3545" stroke="white" stroke-width="2"/>
           </svg>`,
    iconSize: [40, 40],
    iconAnchor: [20, 20]
});

// Limpar nome de arquivo
function sanitizeFilename(name) {
    if (!name) return "sem_descricao";
    return name
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9\s]/g, '')
        .trim()
        .replace(/\s+/g, '_');
}

// Gerar ID único do Roteiro
function generateRouteId() {
    const date = new Date();
    const format = (n) => n.toString().padStart(2, '0');
    return `ROUTE_${date.getFullYear()}${format(date.getMonth()+1)}${format(date.getDate())}${format(date.getHours())}${format(date.getMinutes())}${format(date.getSeconds())}`;
}

// Inicializar Mapa
function initMap() {
    map = L.map('map').setView([-15.7801, -47.9292], 4);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap'
    }).addTo(map);

    // (3) Centralizar e mostrar localização assim que o app abre
    map.locate({setView: true, maxZoom: 16});
    map.on('locationfound', (e) => {
        if (initialLocationMarker) map.removeLayer(initialLocationMarker);
        initialLocationMarker = L.circle(e.latlng, {
            radius: e.accuracy / 2,
            color: '#007bff',
            fillColor: '#007bff',
            fillOpacity: 0.2
        }).addTo(map).bindPopup("Você está aqui");
    });

    loadExternalLayers();
}

// Carregar arquivos GeoJSON
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

// Manter tela acesa
async function requestWakeLock() {
    try {
        if ('wakeLock' in navigator) {
            wakeLock = await navigator.wakeLock.request('screen');
        }
    } catch (err) { console.log('Wake Lock não suportado'); }
}

// PERMISSÃO DA BÚSSOLA
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

// Distância (Haversine)
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

// START
document.getElementById('btn-start').addEventListener('click', () => {
    if (watchId) return;
    
    routeCoords = [];
    routeData = [];
    totalDistance = 0;
    startTime = Date.now();
    isPaused = false;
    routeId = generateRouteId(); // Gera o ID

    if (currentPolyline) map.removeLayer(currentPolyline);
    if (marker) { map.removeLayer(marker); marker = null; } // Limpa qualquer marcador antigo
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
            
            // (1) Adiciona o ID em cada linha dos dados coletados
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
            
            // (3) Garante que o marcador será criado na primeira vez e apenas movido depois
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

// PAUSE / RESUME
document.getElementById('btn-pause').addEventListener('click', (e) => {
    isPaused = !isPaused;
    e.target.innerText = isPaused ? "RESUME" : "PAUSE";
});

// STOP
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

// CONTINUAR
document.getElementById('btn-continue').addEventListener('click', () => {
    document.getElementById('stop-modal').classList.add('hidden');
    document.getElementById('result-modal').classList.remove('hidden');
});

// Download CSV
document.getElementById('btn-csv').addEventListener('click', () => {
    let csv = "id,dia,hora,timestamp,lat,lon,accuracy\n";
    routeData.forEach(row => {
        const date = new Date(row.timestamp);
        const dia = date.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
        const hora = date.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo' });
        csv += `${row.id},${dia},${hora},${row.timestamp},${row.lat},${row.lon},${row.accuracy}\n`;
    });
    
    const desc = sanitizeFilename(document.getElementById('route-description').value);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `trajeto_${desc}_${routeId}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
});

// Download SHP (Corrigido)
document.getElementById('btn-shp').addEventListener('click', () => {
    // (2) O SHP precisa de pelo menos 2 pontos para formar uma linha
    if (routeData.length < 2) {
        alert("Caminhe um pouco para registrar pelo menos 2 pontos antes de baixar o SHP.");
        return;
    }

    const rawDesc = document.getElementById('route-description').value || "Sem_descricao";
    const desc = sanitizeFilename(rawDesc);
    
    const geojson = {
        type: "FeatureCollection",
        features: [{
            type: "Feature",
            geometry: { type: "LineString", coordinates: routeData.map(p => [p.lon, p.lat]) },
            properties: { id: routeId, descricao: rawDesc }
        }]
    };
    
    try {
        if (typeof shpwrite === 'undefined') {
            alert("Erro: Biblioteca SHP não carregou. Verifique sua internet.");
            return;
        }

        // shpwrite.zip(geojson) retorna uma string Base64
        const base64Data = shpwrite.zip(geojson);
        
        // Converte Base64 para Blob
        let byteString = base64Data;
        if (byteString.startsWith('data:application/zip;base64,')) {
            byteString = byteString.split(',')[1];
        }
        
        const byteNumbers = new Array(byteString.length);
        for (let i = 0; i < byteString.length; i++) {
            byteNumbers[i] = byteString.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: 'application/zip' });

        const url = window.URL.createObjectURL(blob);
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

// NOVO TRAJETO
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
    
    // Busca a localização inicial novamente
    map.locate({setView: true, maxZoom: 16});
});

// Iniciar App
initMap();