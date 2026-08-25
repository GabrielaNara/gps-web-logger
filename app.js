// Variáveis Globais
let map;
let watchId = null;
let isPaused = false;
let routeCoords = [];
let routeData = []; // {lat, lon, timestamp, accuracy}
let currentPolyline;
let marker;
let startTime;
let totalDistance = 0;
let timerInterval;
let wakeLock = null;

// Inicializar Mapa
function initMap() {
    map = L.map('map').setView([-15.7801, -47.9292], 13); // Inicia em Brasília
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap'
    }).addTo(map);

    // Aqui você pode carregar um arquivo GeoJSON local da sua equipe
    // fetch('dados/camadas_preexistentes.geojson').then(...)
}

// Manter a tela acesa no mobile
async function requestWakeLock() {
    try {
        if ('wakeLock' in navigator) {
            wakeLock = await navigator.wakeLock.request('screen');
        }
    } catch (err) {
        console.log('Wake Lock não suportado ou negado');
    }
}

// Cálculo de Distância (Fórmula de Haversine)
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // Raio da Terra em metros
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

// Botão START
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

            // Atualiza UI
            document.getElementById('distance').innerText = totalDistance.toFixed(0);
            document.getElementById('accuracy').innerText = accuracy.toFixed(0);
            
            // Atualiza Mapa
            if (currentPolyline) map.removeLayer(currentPolyline);
            currentPolyline = L.polyline(routeCoords, {color: 'red', weight: 4}).addTo(map);
            
            if (marker) map.removeLayer(marker);
            marker = L.marker([latitude, longitude]).addTo(map);
            map.setView([latitude, longitude], 18);
        },
        (error) => alert("Erro ao obter localização: " + error.message),
        { enableHighAccuracy: true, maximumAge: 1000, timeout: 5000 }
    );

    // Timer
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

// Botão PAUSE / RESUME
document.getElementById('btn-pause').addEventListener('click', (e) => {
    isPaused = !isPaused;
    e.target.innerText = isPaused ? "RESUME" : "PAUSE";
});

// Botão STOP
document.getElementById('btn-stop').addEventListener('click', () => {
    if (navigator.geolocation && watchId) {
        navigator.geolocation.clearWatch(watchId);
        watchId = null;
        clearInterval(timerInterval);
        
        // Libera a tela para apagar novamente
        if (wakeLock) {
            wakeLock.release();
            wakeLock = null;
        }
        
        document.getElementById('stop-modal').classList.remove('hidden');
    }
});

// Botão CONTINUAR (Após descrever)
document.getElementById('btn-continue').addEventListener('click', () => {
    document.getElementById('stop-modal').classList.add('hidden');
    document.getElementById('result-modal').classList.remove('hidden');
});

// Botão Download CSV
document.getElementById('btn-csv').addEventListener('click', () => {
    let csv = "lat,lon,timestamp,accuracy\n";
    routeData.forEach(row => {
        csv += `${row.lat},${row.lon},${row.timestamp},${row.accuracy}\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'trajeto.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
});

// Botão Download SHP
document.getElementById('btn-shp').addEventListener('click', () => {
    const desc = document.getElementById('route-description').value || "Sem descrição";
    
    const geojson = {
        type: "FeatureCollection",
        features: [{
            type: "Feature",
            geometry: { type: "LineString", coordinates: routeData.map(p => [p.lon, p.lat]) },
            properties: { descricao: desc }
        }]
    };
    
    // shpwrite gera um zip contendo .shp, .shx, .dbf, .prj
    shpwrite.zip(geojson).then(content => {
        const blob = new Blob([content], { type: 'application/zip' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'trajeto_shp.zip';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
    });
});

// Botão NOVO TRAJETO
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