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

// Função para limpar o nome do arquivo (remove acentos e espaços)
function sanitizeFilename(name) {
    if (!name) return "sem_descricao";
    return name
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // Remove acentos
        .replace(/[^a-zA-Z0-9\s]/g, '') // Remove caracteres especiais
        .trim()
        .replace(/\s+/g, '_'); // Troca espaços por underline
}

// Inicializar Mapa e centralizar no usuário
function initMap() {
    map = L.map('map').setView([-15.7801, -47.9292], 4);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap'
    }).addTo(map);

    // 1. Centralizar no usuário assim que o app abre
    navigator.geolocation.getCurrentPosition(
        (position) => {
            const { latitude, longitude } = position.coords;
            map.setView([latitude, longitude], 16);
        },
        (error) => { console.log("Não foi possível obter a localização inicial."); },
        { enableHighAccuracy: true, timeout: 10000 }
    );

    // 2. Carregar as camadas da pasta layers
    loadExternalLayers();
}

// Carregar arquivos GeoJSON da pasta "layers"
function loadExternalLayers() {
    // LISTA DE ARQUIVOS DA SUA PASTA LAYERS
    // Altere os nomes abaixo para os nomes reais dos seus arquivos .geojson
    const layers = [
        { file: 'layers/pontos.geojson', color: 'blue' },
        { file: 'layers/teste_edificacao.geojson', color: 'green' },
        // Adicione mais aqui seguindo o modelo
    ];

    layers.forEach(layerInfo => {
        fetch(layerInfo.file)
            .then(response => {
                if (!response.ok) throw new Error(`Erro ao carregar ${layerInfo.file}`);
                return response.json();
            })
            .then(data => {
                L.geoJSON(data, {
                    style: {
                        color: layerInfo.color,
                        weight: 3,
                        fillOpacity: 0.3
                    },
                    pointToLayer: function (feature, latlng) {
                        // Cria um círculo para pontos
                        return L.circleMarker(latlng, {
                            radius: 6,
                            fillColor: layerInfo.color,
                            color: "#000",
                            weight: 1,
                            fillOpacity: 0.8
                        });
                    },
                    onEachFeature: function (feature, layer) {
                        // LÓGICA PARA CLICAR E VER ATRIBUTOS
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
            .catch(error => {
                console.warn(error.message); // Avisa no console se o arquivo não existir
            });
    });
}

// Manter a tela acesa no mobile
async function requestWakeLock() {
    try {
        if ('wakeLock' in navigator) {
            wakeLock = await navigator.wakeLock.request('screen');
        }
    } catch (err) {
        console.log('Wake Lock não suportado');
    }
}

// Cálculo de Distância (Fórmula de Haversine)
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
            marker = L.marker([latitude, longitude]).addTo(map);
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
    let csv = "lat,lon,timestamp,accuracy\n";
    routeData.forEach(row => {
        csv += `${row.lat},${row.lon},${row.timestamp},${row.accuracy}\n`;
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
    
    Promise.resolve(shpwrite.zip(geojson)).then(content => {
        let url;
        if (typeof content === 'string') {
            url = 'data:application/zip;base64,' + content;
        } else {
            url = window.URL.createObjectURL(content);
        }
        const a = document.createElement('a');
        a.href = url;
        a.download = `trajeto_${desc}.zip`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        if (typeof content !== 'string') window.URL.revokeObjectURL(url);
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