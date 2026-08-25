// Variáveis Globais
let map;
let watchId = null;
let isPaused = false;
let routeCoords = [];
let routeData = []; 
let currentPolyline;
let marker;
let startTime;
let totalDistance = 0;
let timerInterval;
let wakeLock = null;
let currentHeading = 0;

// Ícone da Seta (SVG)
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

// Inicializar Mapa
function initMap() {
    map = L.map('map').setView([-15.7801, -47.9292], 4);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap'
    }).addTo(map);

    navigator.geolocation.getCurrentPosition(
        (position) => {
            const { latitude, longitude } = position.coords;
            map.setView([latitude, longitude], 16);
        },
        (error) => { console.log("Não foi possível obter a localização inicial."); },
        { enableHighAccuracy: true, timeout: 10000 }
    );

    loadExternalLayers();
}

// Carregar arquivos GeoJSON
function loadExternalLayers() {
    const layers = [
        { file: 'layers/camada_escolas.geojson', color: 'blue' },
        { file: 'layers/camada_ruas.geojson', color: 'green' }
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

// PEDIDO DE PERMISSÃO DA BÚSSOLA (necessário para iPhone)
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
        // Android não precisa de permissão explícita
        window.addEventListener('deviceorientationabsolute', handleDeviceOrientation, true);
        window.addEventListener('deviceorientation', handleDeviceOrientation, true);
    }
}

// Capturar giro do celular
function handleDeviceOrientation(event) {
    let heading = null;
    
    // iOS (webkitCompassHeading) já vem em graus (0 a 360) relativo ao Norte
    if (event.webkitCompassHeading) {
        heading = event.webkitCompassHeading;
    } 
    // Android (alpha) vem em rotação matemática, precisa inverter
    else if (event.absolute === true || event.alpha !== null) {
        heading = 360 - event.alpha;
    }

    if (heading !== null) {
        currentHeading = heading;
        // Atualiza a rotação da seta no mapa
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

    if (currentPolyline) map.removeLayer(currentPolyline);
    if (marker) map.removeLayer(marker);

    requestWakeLock();
    requestCompassPermission(); // Pede a bússola ao clicar em START

    watchId = navigator.geolocation.watchPosition(
        (position) => {
            if (isPaused) return;

            const { latitude, longitude, accuracy } = position.coords;
            
            if (routeCoords.length > 0) {
                const lastCoord = routeCoords[routeCoords.length - 1];
                totalDistance += calculateDistance(lastCoord.lat, lastCoord.lng, latitude, longitude);
            }

            routeCoords.push({ lat: latitude, lng: longitude });
            routeData.push({ lat: latitude, lon: longitude, timestamp: Date.now(), accuracy: accuracy });

            document.getElementById('distance').innerText = totalDistance.toFixed(0);
            document.getElementById('accuracy').innerText = accuracy.toFixed(0);
            
            if (currentPolyline) map.removeLayer(currentPolyline);
            currentPolyline = L.polyline(routeCoords, {color: 'red', weight: 4}).addTo(map);
            
            if (marker) map.removeLayer(marker);
            marker = L.marker([latitude, longitude], { icon: arrowIcon }).addTo(map);
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
    // Colunas atualizadas: dia, hora, timestamp, lat, lon, accuracy
    let csv = "dia,hora,timestamp,lat,lon,accuracy\n";
    routeData.forEach(row => {
        // Conversão para Fuso de São Paulo (America/Sao_Paulo)
        const date = new Date(row.timestamp);
        const dia = date.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
        const hora = date.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo' });
        csv += `${dia},${hora},${row.timestamp},${row.lat},${row.lon},${row.accuracy}\n`;
    });
    
    const desc = sanitizeFilename(document.getElementById('route-description').value);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `trajeto_${desc}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
});

// Download SHP
document.getElementById('btn-shp').addEventListener('click', () => {
    const rawDesc = document.getElementById('route-description').value || "Sem descricao";
    const desc = sanitizeFilename(rawDesc);
    
    const geojson = {
        type: "FeatureCollection",
        features: [{
            type: "Feature",
            geometry: { type: "LineString", coordinates: routeData.map(p => [p.lon, p.lat]) },
            properties: { descricao: rawDesc }
        }]
    };
    
    // shpwrite.zip retorna uma string Base64 em versões mais antigas
    Promise.resolve(shpwrite.zip(geojson)).then(content => {
        let blob;
        
        // Verifica se o retorno é uma string Base64 ou um Blob
        if (typeof content === 'string') {
            // Converte Base64 para Blob (resolve o problema de não baixar no mobile)
            const byteCharacters = atob(content);
            const byteNumbers = new Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) {
                byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            const byteArray = new Uint8Array(byteNumbers);
            blob = new Blob([byteArray], { type: 'application/zip' });
        } else {
            // Se já for um Blob
            blob = content;
        }

        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `trajeto_${desc}.zip`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
    }).catch(err => {
        alert("Erro ao gerar SHP: " + err.message);
        console.error(err);
    });
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
    if (marker) map.removeLayer(marker);
});

// Iniciar App
initMap();