// ======================================================
// GPS WEB LOGGER
// ======================================================


// ======================================================
// CHAVES DO LOCALSTORAGE
// ======================================================

const STORAGE_KEY =
    "gps_web_logger_track";


// ======================================================
// ESTADO
// ======================================================

let points = [];

let watchId = null;

let recordingInterval = null;

let timerInterval = null;

let lastPosition = null;

let lastPositionReceivedAt = null;

let isRecording = false;

let isPaused = false;

let trackId = null;

let startTime = null;

let endTime = null;

let elapsedBeforePause = 0;

let pauseStartTime = null;

let totalDistance = 0;

let description = "";

let trackCoordinates = [];

let trackLine = null;

let currentMarker = null;


// ======================================================
// MAPA
// ======================================================

const map = L.map("map").setView(
    [-23.5505, -46.6333],
    13
);


L.tileLayer(
    "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    {
        maxZoom: 19,
        attribution:
            "&copy; OpenStreetMap contributors"
    }
).addTo(map);


// ======================================================
// CAMADAS PREDEFINIDAS
// ======================================================

const predefinedLayers = [

    {
        name: "Pontos de referência",
        file: "./layers/pontos.geojson"
    },

    {
        name: "Polígono",
        file: "./layers/teste_edificacao.geojson"
    }

];


// ======================================================
// ELEMENTOS HTML
// ======================================================

const statusElement =
    document.getElementById("status");

const durationElement =
    document.getElementById("duration");

const distanceElement =
    document.getElementById("distance");

const accuracyElement =
    document.getElementById("accuracy");

const startBtn =
    document.getElementById("startBtn");

const pauseBtn =
    document.getElementById("pauseBtn");

const stopBtn =
    document.getElementById("stopBtn");

const metadataPanel =
    document.getElementById("metadataPanel");

const exportPanel =
    document.getElementById("exportPanel");

const descriptionInput =
    document.getElementById("description");

const saveMetadataBtn =
    document.getElementById("saveMetadataBtn");

const csvBtn =
    document.getElementById("csvBtn");

const shpBtn =
    document.getElementById("shpBtn");

const newTrackBtn =
    document.getElementById("newTrackBtn");


// ======================================================
// SALVAR ESTADO
// ======================================================

function saveState() {

    const state = {

        points:
            points,

        trackId:
            trackId,

        startTime:
            startTime,

        endTime:
            endTime,

        elapsedBeforePause:
            elapsedBeforePause,

        pauseStartTime:
            pauseStartTime,

        totalDistance:
            totalDistance,

        description:
            description,

        trackCoordinates:
            trackCoordinates,

        isRecording:
            isRecording,

        isPaused:
            isPaused

    };


    localStorage.setItem(

        STORAGE_KEY,

        JSON.stringify(state)

    );

}


// ======================================================
// RESTAURAR ESTADO
// ======================================================

function restoreState() {

    const savedState =
        localStorage.getItem(
            STORAGE_KEY
        );


    if (!savedState) {

        return;

    }


    try {

        const state =
            JSON.parse(
                savedState
            );


        points =
            state.points || [];


        trackId =
            state.trackId;


        startTime =
            state.startTime;


        endTime =
            state.endTime;


        elapsedBeforePause =
            state.elapsedBeforePause || 0;


        pauseStartTime =
            state.pauseStartTime;


        totalDistance =
            state.totalDistance || 0;


        description =
            state.description || "";


        trackCoordinates =
            state.trackCoordinates || [];


        isRecording =
            false;


        isPaused =
            false;


        // RESTAURAR LINHA

        if (

            trackCoordinates.length > 0

        ) {

            trackLine =
                L.polyline(
                    trackCoordinates
                ).addTo(map);


            map.fitBounds(
                trackLine.getBounds(),
                {
                    padding: [40, 40]
                }
            );

        }


        // SE HOUVER TRAJETO FINALIZADO

        if (

            endTime !== null

        ) {

            statusElement.textContent =
                "Trajeto restaurado";


            startBtn.disabled =
                false;

            pauseBtn.disabled =
                true;

            stopBtn.disabled =
                true;

        }


        updateInterface();

    }

    catch (error) {

        console.error(
            "Erro ao restaurar trajeto:",
            error
        );

    }

}


// ======================================================
// LIMPAR ESTADO
// ======================================================

function clearState() {

    localStorage.removeItem(
        STORAGE_KEY
    );

}


// ======================================================
// CARREGAR CAMADAS GEOJSON
// ======================================================

async function loadPredefinedLayers() {

    for (

        const layerConfig
        of predefinedLayers

    ) {

        try {

            const response =
                await fetch(
                    layerConfig.file
                );


            if (!response.ok) {

                throw new Error(

                    `HTTP ${response.status}: ` +
                    layerConfig.file

                );

            }


            const geojson =
                await response.json();


            L.geoJSON(

                geojson,

                {

                    style: {

                        weight: 2,

                        fillOpacity: 0.15

                    },


                    pointToLayer:

                        function (
                            feature,
                            latlng
                        ) {

                            return L.circleMarker(

                                latlng,

                                {

                                    radius: 7,

                                    weight: 2,

                                    fillOpacity: 0.8

                                }

                            );

                        },


                    onEachFeature:

                        function (
                            feature,
                            leafletLayer
                        ) {

                            if (

                                feature.properties

                            ) {

                                let popupContent =
                                    "<div class='featurePopup'>";


                                for (

                                    const [key, value]

                                    of Object.entries(

                                        feature.properties

                                    )

                                ) {

                                    popupContent += `

                                        <div class="popupRow">

                                            <strong>
                                                ${key}
                                            </strong>

                                            ${value}

                                        </div>

                                    `;

                                }


                                popupContent +=
                                    "</div>";


                                leafletLayer.bindPopup(
                                    popupContent
                                );

                            }

                        }

                }

            ).addTo(map);


            console.log(
                `Camada carregada: ${layerConfig.name}`
            );

        }

        catch (error) {

            console.error(

                `Erro ao carregar ${layerConfig.name}:`,

                error

            );

        }

    }

}


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

        updateCurrentPosition,

        handlePositionError,

        {

            enableHighAccuracy: true,

            maximumAge: 0,

            timeout: 10000

        }

    );

}


// ======================================================
// ATUALIZAR POSIÇÃO
// ======================================================

function updateCurrentPosition(
    position
) {

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


    accuracyElement.textContent =
        `± ${accuracy.toFixed(1)} m`;


    if (

        currentMarker === null

    ) {

        currentMarker =
            L.marker(
                latlng
            ).addTo(map);


        if (

            trackCoordinates.length === 0

        ) {

            map.setView(
                latlng,
                17
            );

        }

    }

    else {

        currentMarker.setLatLng(
            latlng
        );

    }

}


// ======================================================
// RECEBER GPS
// ======================================================

function receivePosition(
    position
) {

    lastPosition =
        position;


    lastPositionReceivedAt =
        Date.now();


    updateCurrentPosition(
        position
    );

}


// ======================================================
// START
// ======================================================

function startRecording() {

    // NOVO TRAJETO

    points = [];

    trackCoordinates = [];

    totalDistance = 0;

    description = "";

    elapsedBeforePause = 0;

    pauseStartTime = null;

    startTime = Date.now();

    endTime = null;

    lastPosition = null;

    lastPositionReceivedAt = null;


    if (

        trackLine !== null

    ) {

        map.removeLayer(
            trackLine
        );

        trackLine = null;

    }


    trackId =

        "track_" +

        new Date(
            startTime
        )

        .toISOString()

        .replace(
            /[:.]/g,
            "-"
        );


    isRecording =
        true;

    isPaused =
        false;


    statusElement.textContent =
        "Gravando...";


    startBtn.disabled =
        true;

    pauseBtn.disabled =
        false;

    stopBtn.disabled =
        false;


    startGPSWatch();

    startRecordingInterval();

    startTimer();

    saveState();

}


// ======================================================
// REGISTRAR A CADA SEGUNDO
// ======================================================

function recordSecond() {

    if (

        !isRecording ||

        isPaused

    ) {

        return;

    }


    const now =
        new Date();


    const dia =

        now.toLocaleDateString(
            "sv-SE"
        );


    const hora =

        now.toLocaleTimeString(
            "pt-BR",
            {
                hour12: false
            }
        );


    let latitude = null;

    let longitude = null;

    let accuracy = null;

    let gpsAvailable = 0;


    const positionIsRecent =

        lastPosition !== null &&

        lastPositionReceivedAt !== null &&

        (

            Date.now() -

            lastPositionReceivedAt

        )

        <= 2000;


    if (positionIsRecent) {

        latitude =
            lastPosition.coords.latitude;

        longitude =
            lastPosition.coords.longitude;

        accuracy =
            lastPosition.coords.accuracy;

        gpsAvailable =
            1;


        const previousValidPoint =
            findPreviousValidPoint();


        if (

            previousValidPoint !== null

        ) {

            totalDistance +=

                calculateDistance(

                    previousValidPoint.latitude,

                    previousValidPoint.longitude,

                    latitude,

                    longitude

                );

        }


        updateTrack(
            latitude,
            longitude
        );

    }


    points.push({

        id:
            points.length + 1,

        track_id:
            trackId,

        timestamp:
            now.getTime(),

        dia:
            dia,

        hora:
            hora,

        latitude:
            latitude,

        longitude:
            longitude,

        accuracy_m:
            accuracy,

        gps_available:
            gpsAvailable

    });


    updateInterface();

    saveState();

}


// ======================================================
// ÚLTIMO PONTO VÁLIDO
// ======================================================

function findPreviousValidPoint() {

    for (

        let i =
            points.length - 1;

        i >= 0;

        i--

    ) {

        if (

            points[i]
                .gps_available === 1

        ) {

            return points[i];

        }

    }


    return null;

}


// ======================================================
// LINHA DO TRAJETO
// ======================================================

function updateTrack(
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


    if (

        trackLine === null

    ) {

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

}


// ======================================================
// GPS WATCH
// ======================================================

function startGPSWatch() {

    watchId =

        navigator.geolocation.watchPosition(

            receivePosition,

            handlePositionError,

            {

                enableHighAccuracy:
                    true,

                maximumAge:
                    0,

                timeout:
                    10000

            }

        );

}


function stopGPSWatch() {

    if (

        watchId !== null

    ) {

        navigator.geolocation.clearWatch(
            watchId
        );

        watchId = null;

    }

}


// ======================================================
// INTERVALO
// ======================================================

function startRecordingInterval() {

    recordingInterval =

        setInterval(

            recordSecond,

            1000

        );

}


function stopRecordingInterval() {

    if (

        recordingInterval !== null

    ) {

        clearInterval(
            recordingInterval
        );

        recordingInterval =
            null;

    }

}


// ======================================================
// PAUSE
// ======================================================

function pauseRecording() {

    if (!isRecording) {

        return;

    }


    if (!isPaused) {

        isPaused =
            true;


        pauseStartTime =
            Date.now();


        statusElement.textContent =
            "Gravação pausada";


        pauseBtn.textContent =
            "RESUME";


        stopGPSWatch();

        stopRecordingInterval();

    }

    else {

        isPaused =
            false;


        elapsedBeforePause +=

            Date.now() -

            pauseStartTime;


        pauseStartTime =
            null;


        statusElement.textContent =
            "Gravando...";


        pauseBtn.textContent =
            "PAUSE";


        startGPSWatch();

        startRecordingInterval();

    }


    saveState();

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


    if (

        isPaused &&

        pauseStartTime !== null

    ) {

        elapsedBeforePause +=

            endTime -

            pauseStartTime;

    }


    isRecording =
        false;

    isPaused =
        false;


    stopGPSWatch();

    stopRecordingInterval();

    stopTimer();


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


    saveState();


    metadataPanel.classList.remove(
        "hidden"
    );

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

    if (

        timerInterval !== null

    ) {

        clearInterval(
            timerInterval
        );

        timerInterval =
            null;

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
// INTERFACE
// ======================================================

function updateInterface() {

    durationElement.textContent =

        formatDuration(

            getElapsedTime()

        );


    if (

        totalDistance < 1000

    ) {

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
// FORMATAR TEMPO
// ======================================================

function formatDuration(
    milliseconds
) {

    const totalSeconds =

        Math.floor(
            milliseconds / 1000
        );


    const hours =

        Math.floor(
            totalSeconds / 3600
        );


    const minutes =

        Math.floor(

            (
                totalSeconds % 3600
            ) / 60

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

    const R =
        6371000;


    const toRadians =
        value =>
            value *
            Math.PI /
            180;


    const dLat =
        toRadians(
            lat2 - lat1
        );


    const dLon =
        toRadians(
            lon2 - lon1
        );


    const a =

        Math.sin(
            dLat / 2
        ) ** 2

        +

        Math.cos(
            toRadians(lat1)
        )

        *

        Math.cos(
            toRadians(lat2)
        )

        *

        Math.sin(
            dLon / 2
        ) ** 2;


    const c =

        2 *

        Math.atan2(

            Math.sqrt(a),

            Math.sqrt(1 - a)

        );


    return R * c;

}


// ======================================================
// ERRO GPS
// ======================================================

function handlePositionError(
    error
) {

    console.error(
        "Erro GPS:",
        error
    );


    if (isRecording) {

        statusElement.textContent =
            "GPS temporariamente indisponível";

    }

    else {

        statusElement.textContent =
            "Não foi possível obter localização.";

    }

}


// ======================================================
// SALVAR DESCRIÇÃO
// ======================================================

function saveMetadata() {

    description =
        descriptionInput.value.trim();


    saveState();


    metadataPanel.classList.add(
        "hidden"
    );


    exportPanel.classList.remove(
        "hidden"
    );

}


// ======================================================
// EXPORTAR CSV
// ======================================================

function exportCSV() {

    if (

        points.length === 0

    ) {

        alert(
            "Nenhum registro disponível."
        );

        return;

    }


    const headers = [

        "id",

        "track_id",

        "timestamp",

        "dia",

        "hora",

        "latitude",

        "longitude",

        "accuracy_m",

        "gps_available"

    ];


    const rows =

        points.map(

            point =>

                headers.map(

                    header => {

                        const value =
                            point[header] ?? "";


                        return `"${

                            String(value)

                            .replace(
                                /"/g,
                                '""'
                            )

                        }"`;

                    }

                )

                .join(",")

        );


    const csv = [

        headers.join(","),

        ...rows

    ].join("\n");


    downloadFile(

        csv,

        createFilename("csv"),

        "text/csv;charset=utf-8"

    );

}


// ======================================================
// EXPORTAR SHAPEFILE
// ======================================================

async function exportSHP() {

    const validPoints =

        points.filter(

            point =>

                point.gps_available === 1

        );


    if (

        validPoints.length === 0

    ) {

        alert(
            "Nenhum ponto GPS válido."
        );

        return;

    }


    const geojson = {

        type:
            "FeatureCollection",


        features:

            validPoints.map(

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

                        timestamp:
                            point.timestamp,

                        dia:
                            point.dia,

                        hora:
                            point.hora,

                        accuracy_m:
                            point.accuracy_m,

                        gps_avail:
                            point.gps_available

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


        downloadBlob(

            zipBlob,

            createFilename("zip")

        );

    }

    catch (error) {

        console.error(
            error
        );


        alert(
            "Erro ao gerar Shapefile."
        );

    }

}

// ======================================================
// CRIAR NOME DO ARQUIVO
// ======================================================

function createFilename(extension) {

    const date = new Date(startTime)
        .toISOString()
        .replace(/[:.]/g, "-")
        .replace("T", "_")
        .replace("Z", "");

    // Pega diretamente o valor atual da descrição
    const currentDescription =
        descriptionInput.value.trim() || description;

    const safeDescription = currentDescription

        ? currentDescription
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "")
            .substring(0, 50)

        : "trajeto";

    return `gps_${date}_${safeDescription}.${extension}`;

}

// ======================================================
// DOWNLOAD
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
                type:
                    type
            }

        );


    downloadBlob(
        blob,
        filename
    );

}


function downloadBlob(
    blob,
    filename
) {

    const url =
        URL.createObjectURL(
            blob
        );


    const link =
        document.createElement(
            "a"
        );


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


    setTimeout(

        function () {

            URL.revokeObjectURL(
                url
            );

        },

        1000

    );

}


// ======================================================
// NOVO TRAJETO
// ======================================================

function newTrack() {

    exportPanel.classList.add(
        "hidden"
    );


    descriptionInput.value =
        "";


    clearState();


    points = [];

    trackCoordinates = [];

    totalDistance = 0;

    trackId = null;

    startTime = null;

    endTime = null;

    description = "";


    if (

        trackLine !== null

    ) {

        map.removeLayer(
            trackLine
        );

        trackLine = null;

    }


    durationElement.textContent =
        "00:00:00";


    distanceElement.textContent =
        "0 m";


    statusElement.textContent =
        "Pronto para iniciar";

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


newTrackBtn.addEventListener(
    "click",
    newTrack
);


// ======================================================
// INICIALIZAÇÃO
// ======================================================

loadPredefinedLayers();

restoreState();

locateUser();