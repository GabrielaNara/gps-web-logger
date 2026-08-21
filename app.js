// ======================================================
// GPS WEB LOGGER
// ======================================================


// ======================================================
// ESTADO DA APLICAÇÃO
// ======================================================

let points = [];

let watchId = null;

let isRecording = false;

let isPaused = false;

let trackId = null;

let startTime = null;

let endTime = null;

let elapsedBeforePause = 0;

let pauseStartTime = null;

let totalDistance = 0;

let timerInterval = null;


// ======================================================
// MAPA
// ======================================================

const map = L.map("map").setView(
    [-23.5505, -46.6333],
    13
);


// OPENSTREETMAP

L.tileLayer(

    "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",

    {

        maxZoom: 19,

        attribution:
            "&copy; OpenStreetMap contributors"

    }

).addTo(map);


// MARCADOR DA POSIÇÃO ATUAL

let currentMarker = null;


// LINHA DO TRAJETO

let trackLine = null;


// COORDENADAS DO TRAJETO

let trackCoordinates = [];


// CAMADA EXTERNA

let externalLayer = null;


// ======================================================
// ELEMENTOS DA INTERFACE
// ======================================================

const statusElement =
    document.getElementById("status");

const pointCountElement =
    document.getElementById("pointCount");

const durationElement =
    document.getElementById("duration");

const distanceElement =
    document.getElementById("distance");

const accuracyElement =
    document.getElementById("accuracy");

const latitudeElement =
    document.getElementById("latitude");

const longitudeElement =
    document.getElementById("longitude");

const startBtn =
    document.getElementById("startBtn");

const pauseBtn =
    document.getElementById("pauseBtn");

const stopBtn =
    document.getElementById("stopBtn");

const metadataSection =
    document.getElementById("metadataSection");

const exportSection =
    document.getElementById("exportSection");

const descriptionInput =
    document.getElementById("description");

const saveMetadataBtn =
    document.getElementById("saveMetadataBtn");

const csvBtn =
    document.getElementById("csvBtn");

const shpBtn =
    document.getElementById("shpBtn");

const shpInput =
    document.getElementById("shpInput");

const removeLayerBtn =
    document.getElementById("removeLayerBtn");


// ======================================================
// LOCALIZAR USUÁRIO
// ======================================================

function locateUser() {

    if (!navigator.geolocation) {

        statusElement.textContent =
            "Geolocalização não suportada.";

        return;

    }


    navigator.geolocation.getCurrentPosition(

        function(position) {

            const latitude =
                position.coords.latitude;

            const longitude =
                position.coords.longitude;

            const accuracy =
                position.coords.accuracy;


            const latlng = [
                latitude,
                longitude
            ];


            latitudeElement.textContent =
                latitude.toFixed(7);

            longitudeElement.textContent =
                longitude.toFixed(7);

            accuracyElement.textContent =
                `± ${accuracy.toFixed(1)} m`;


            map.setView(
                latlng,
                17
            );


            if (currentMarker === null) {

                currentMarker =
                    L.marker(latlng)
                        .addTo(map);

            }

            else {

                currentMarker.setLatLng(
                    latlng
                );

            }


            statusElement.textContent =
                "Pronto para iniciar";

        },


        function(error) {

            console.error(error);

            statusElement.textContent =
                "Não foi possível obter a localização.";

        },


        {

            enableHighAccuracy: true,

            maximumAge: 0,

            timeout: 10000

        }

    );

}


// ======================================================
// START
// ======================================================

function startRecording() {

    points = [];

    trackCoordinates = [];

    totalDistance = 0;

    elapsedBeforePause = 0;

    pauseStartTime = null;

    startTime = Date.now();

    endTime = null;


    if (trackLine !== null) {

        map.removeLayer(trackLine);

        trackLine = null;

    }


    trackId =
        "track_" +
        new Date(startTime)
            .toISOString()
            .replace(/[:.]/g, "-");


    isRecording = true;

    isPaused = false;


    statusElement.textContent =
        "Gravando posição GPS...";


    startBtn.disabled = true;

    pauseBtn.disabled = false;

    stopBtn.disabled = false;


    metadataSection.classList.add("hidden");

    exportSection.classList.add("hidden");


    descriptionInput.value = "";


    watchId =
        navigator.geolocation.watchPosition(

            handlePosition,

            handlePositionError,

            {

                enableHighAccuracy: true,

                maximumAge: 0,

                timeout: 10000

            }

        );


    startTimer();

}


// ======================================================
// RECEBER POSIÇÃO GPS
// ======================================================

function handlePosition(position) {

    if (
        !isRecording ||
        isPaused
    ) {

        return;

    }


    const latitude =
        position.coords.latitude;

    const longitude =
        position.coords.longitude;

    const accuracy =
        position.coords.accuracy;


    latitudeElement.textContent =
        latitude.toFixed(7);

    longitudeElement.textContent =
        longitude.toFixed(7);

    accuracyElement.textContent =
        `± ${accuracy.toFixed(1)} m`;


    // DATA E HORA LOCAL

    const date =
        new Date(position.timestamp);

    const dia =
        date.toLocaleDateString("sv-SE");

    const hora =
        date.toLocaleTimeString(
            "pt-BR",
            {
                hour12: false
            }
        );


    // ATUALIZA MAPA

    updateMap(
        latitude,
        longitude
    );


    // NOVO PONTO

    const point = {

        id:
            points.length + 1,

        track_id:
            trackId,

        dia:
            dia,

        hora:
            hora,

        latitude:
            latitude,

        longitude:
            longitude,

        accuracy_m:
            accuracy

    };


    // DISTÂNCIA

    if (points.length > 0) {

        const previousPoint =
            points[
                points.length - 1
            ];


        const distance =
            calculateDistance(

                previousPoint.latitude,

                previousPoint.longitude,

                latitude,

                longitude

            );


        totalDistance += distance;

    }


    points.push(point);


    updateInterface();

}


// ======================================================
// ATUALIZAR MAPA
// ======================================================

function updateMap(
    latitude,
    longitude
) {

    const latlng = [
        latitude,
        longitude
    ];


    trackCoordinates.push(
        latlng
    );


    if (currentMarker === null) {

        currentMarker =
            L.marker(latlng)
                .addTo(map);

    }

    else {

        currentMarker.setLatLng(
            latlng
        );

    }


    if (trackLine === null) {

        trackLine =
            L.polyline(
                trackCoordinates
            ).addTo(map);

    }

    else {

        trackLine.setLatLngs(
            trackCoordinates
        );

    }


    if (
        trackCoordinates.length === 1
    ) {

        map.setView(
            latlng,
            18
        );

    }

}


// ======================================================
// PAUSE / RESUME
// ======================================================

function pauseRecording() {

    if (!isRecording) {

        return;

    }


    if (!isPaused) {

        isPaused = true;

        pauseStartTime =
            Date.now();


        statusElement.textContent =
            "Gravação pausada";


        pauseBtn.textContent =
            "RESUME";


        if (watchId !== null) {

            navigator.geolocation.clearWatch(
                watchId
            );

            watchId = null;

        }

    }

    else {

        isPaused = false;


        elapsedBeforePause +=

            Date.now() -
            pauseStartTime;


        pauseStartTime = null;


        statusElement.textContent =
            "Gravando posição GPS...";


        pauseBtn.textContent =
            "PAUSE";


        watchId =
            navigator.geolocation.watchPosition(

                handlePosition,

                handlePositionError,

                {

                    enableHighAccuracy: true,

                    maximumAge: 0,

                    timeout: 10000

                }

            );

    }

}


// ======================================================
// STOP
// ======================================================

function stopRecording() {

    if (!isRecording) {

        return;

    }


    endTime =
        Date.now();


    isRecording = false;


    if (watchId !== null) {

        navigator.geolocation.clearWatch(
            watchId
        );

        watchId = null;

    }


    stopTimer();


    if (
        isPaused &&
        pauseStartTime !== null
    ) {

        elapsedBeforePause +=

            endTime -
            pauseStartTime;

    }


    isPaused = false;


    statusElement.textContent =
        "Trajeto finalizado";


    startBtn.disabled =
        false;

    pauseBtn.disabled =
        true;

    stopBtn.disabled =
        true;


    pauseBtn.textContent =
        "PAUSE";


    metadataSection.classList.remove(
        "hidden"
    );


    updateInterface();

}


// ======================================================
// ERRO DE GEOLOCALIZAÇÃO
// ======================================================

function handlePositionError(error) {

    console.error(
        "Erro de geolocalização:",
        error
    );


    statusElement.textContent =
        "Erro ao obter localização.";

}


// ======================================================
// TIMER
// ======================================================

function startTimer() {

    stopTimer();

    timerInterval =
        setInterval(
            updateInterface,
            1000
        );

}


function stopTimer() {

    if (timerInterval !== null) {

        clearInterval(timerInterval);

        timerInterval = null;

    }

}


// ======================================================
// INTERFACE
// ======================================================

function updateInterface() {

    pointCountElement.textContent =
        points.length;


    durationElement.textContent =
        formatDuration(
            getElapsedTime()
        );


    if (totalDistance < 1000) {

        distanceElement.textContent =
            `${totalDistance.toFixed(1)} m`;

    }

    else {

        distanceElement.textContent =
            `${(
                totalDistance / 1000
            ).toFixed(2)} km`;

    }

}


// ======================================================
// TEMPO DECORRIDO
// ======================================================

function getElapsedTime() {

    if (!startTime) {

        return 0;

    }


    const now =
        endTime || Date.now();


    let elapsed =
        now - startTime;


    elapsed -=
        elapsedBeforePause;


    if (
        isPaused &&
        pauseStartTime !== null
    ) {

        elapsed -=
            Date.now() -
            pauseStartTime;

    }


    return elapsed;

}


// ======================================================
// FORMATA DURAÇÃO
// ======================================================

function formatDuration(milliseconds) {

    const totalSeconds =
        Math.floor(milliseconds / 1000);

    const hours =
        Math.floor(totalSeconds / 3600);

    const minutes =
        Math.floor(
            (totalSeconds % 3600) / 60
        );

    const seconds =
        totalSeconds % 60;


    return [

        String(hours)
            .padStart(2, "0"),

        String(minutes)
            .padStart(2, "0"),

        String(seconds)
            .padStart(2, "0")

    ].join(":");

}


// ======================================================
// DISTÂNCIA - HAVERSINE
// ======================================================

function calculateDistance(
    lat1,
    lon1,
    lat2,
    lon2
) {

    const R = 6371000;


    const toRadians =
        degrees =>
            degrees * Math.PI / 180;


    const dLat =
        toRadians(lat2 - lat1);

    const dLon =
        toRadians(lon2 - lon1);


    const a =

        Math.sin(dLat / 2) *
        Math.sin(dLat / 2)

        +

        Math.cos(
            toRadians(lat1)
        )

        *

        Math.cos(
            toRadians(lat2)
        )

        *

        Math.sin(dLon / 2)
        *
        Math.sin(dLon / 2);


    const c =
        2 *
        Math.atan2(
            Math.sqrt(a),
            Math.sqrt(1 - a)
        );


    return R * c;

}


// ======================================================
// METADADOS
// ======================================================

function saveMetadata() {

    metadataSection.classList.add(
        "hidden"
    );

    exportSection.classList.remove(
        "hidden"
    );

}


// ======================================================
// EXPORTAR CSV
// ======================================================

function exportCSV() {

    if (points.length === 0) {

        alert(
            "Nenhum ponto foi registrado."
        );

        return;

    }


    const headers = [

        "id",

        "track_id",

        "dia",

        "hora",

        "latitude",

        "longitude",

        "accuracy_m"

    ];


    const rows =
        points.map(

            point =>

                headers
                    .map(
                        header =>
                            point[header]
                    )
                    .join(",")

        );


    const csv = [

        headers.join(","),

        ...rows

    ].join("\n");


    downloadFile(

        csv,

        `${trackId}.csv`,

        "text/csv"

    );

}


// ======================================================
// EXPORTAR SHAPEFILE
// ======================================================

async function exportSHP() {

    if (points.length === 0) {

        alert(
            "Nenhum ponto foi registrado."
        );

        return;

    }


    const geojson = {

        type:
            "FeatureCollection",


        features:

            points.map(
                point => ({

                    type:
                        "Feature",


                    geometry: {

                        type:
                            "Point",


                        coordinates: [

                            point.longitude,

                            point.latitude

                        ]

                    },


                    properties: {

                        id:
                            point.id,

                        track_id:
                            point.track_id,

                        dia:
                            point.dia,

                        hora:
                            point.hora,

                        latitude:
                            point.latitude,

                        longitude:
                            point.longitude,

                        accuracy_m:
                            point.accuracy_m

                    }

                })
            )

    };


    try {

        const zipBlob =
            await shpwrite.zip(

                geojson,

                {

                    folder:
                        "gps_track",

                    filename:
                        trackId,

                    outputType:
                        "blob"

                }

            );


        const url =
            URL.createObjectURL(
                zipBlob
            );


        const link =
            document.createElement("a");


        link.href =
            url;


        link.download =
            `${trackId}.zip`;


        document.body.appendChild(
            link
        );


        link.click();


        document.body.removeChild(
            link
        );


        URL.revokeObjectURL(
            url
        );


        statusElement.textContent =
            "Shapefile exportado.";

    }

    catch (error) {

        console.error(
            error
        );


        alert(
            "Erro ao gerar o Shapefile."
        );

    }

}


// ======================================================
// CARREGAR SHAPEFILE
// ======================================================

async function loadShapefile(event) {

    const file =
        event.target.files[0];


    if (!file) {

        return;

    }


    try {

        const buffer =
            await file.arrayBuffer();


        const geojson =
            await shp(buffer);


        if (externalLayer !== null) {

            map.removeLayer(
                externalLayer
            );

        }


        externalLayer =
            L.geoJSON(
                geojson
            ).addTo(map);


        map.fitBounds(
            externalLayer.getBounds()
        );


        statusElement.textContent =
            "Camada adicionada.";

    }

    catch (error) {

        console.error(
            error
        );


        alert(
            "Erro ao carregar o Shapefile."
        );

    }

}


// ======================================================
// REMOVER CAMADA EXTERNA
// ======================================================

function removeExternalLayer() {

    if (externalLayer !== null) {

        map.removeLayer(
            externalLayer
        );


        externalLayer = null;


        statusElement.textContent =
            "Camada removida.";

    }

}


// ======================================================
// DOWNLOAD GENÉRICO
// ======================================================

function downloadFile(
    content,
    filename,
    type
) {

    const blob =
        new Blob(
            [content],
            {
                type: type
            }
        );


    const url =
        URL.createObjectURL(
            blob
        );


    const link =
        document.createElement("a");


    link.href =
        url;

    link.download =
        filename;


    document.body.appendChild(
        link
    );


    link.click();


    document.body.removeChild(
        link
    );


    URL.revokeObjectURL(
        url
    );

}


// ======================================================
// EVENTOS
// ======================================================

startBtn.addEventListener(
    "click",
    startRecording
);


pauseBtn.addEventListener(
    "click",
    pauseRecording
);


stopBtn.addEventListener(
    "click",
    stopRecording
);


saveMetadataBtn.addEventListener(
    "click",
    saveMetadata
);


csvBtn.addEventListener(
    "click",
    exportCSV
);


shpBtn.addEventListener(
    "click",
    exportSHP
);


shpInput.addEventListener(
    "change",
    loadShapefile
);


removeLayerBtn.addEventListener(
    "click",
    removeExternalLayer
);


// ======================================================
// INICIALIZA
// ======================================================

locateUser();