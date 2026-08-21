// ======================================================
// GPS WEB LOGGER
// ======================================================


// ------------------------------
// Estado da aplicação
// ------------------------------

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


// ------------------------------
// Elementos da interface
// ------------------------------

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

const geojsonBtn =
    document.getElementById("geojsonBtn");


// ======================================================
// START
// ======================================================

function startRecording() {

    // Reinicia os dados

    points = [];

    totalDistance = 0;

    elapsedBeforePause = 0;

    pauseStartTime = null;

    startTime = Date.now();

    endTime = null;


    // Identificador da sessão

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


    // Verifica suporte

    if (!navigator.geolocation) {

        alert(
            "Seu navegador não suporta geolocalização."
        );

        return;
    }


    // Inicia observação contínua do GPS

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
// RECEBE UMA POSIÇÃO
// ======================================================

function handlePosition(position) {

    if (!isRecording || isPaused) {
        return;
    }


    const latitude =
        position.coords.latitude;

    const longitude =
        position.coords.longitude;

    const accuracy =
        position.coords.accuracy;


    // Atualiza interface

    latitudeElement.textContent =
        latitude.toFixed(7);

    longitudeElement.textContent =
        longitude.toFixed(7);

    accuracyElement.textContent =
        `± ${accuracy.toFixed(1)} m`;


    // Cria data e hora

    const date =
        new Date(position.timestamp);


    const point = {

        id:
            points.length + 1,

        track_id:
            trackId,

        dia:
            date.toISOString().split("T")[0],

        hora:
            date.toISOString().split("T")[1]
                .replace("Z", ""),

        latitude:
            latitude,

        longitude:
            longitude,

        accuracy_m:
            accuracy

    };


    // Calcula distância em relação
    // ao ponto anterior

    if (points.length > 0) {

        const previousPoint =
            points[points.length - 1];


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
// PAUSE
// ======================================================

function pauseRecording() {

    if (!isRecording) {
        return;
    }


    if (!isPaused) {

        isPaused = true;

        pauseStartTime = Date.now();


        statusElement.textContent =
            "Gravação pausada";


        pauseBtn.textContent =
            "RESUME";


        // Interrompe o GPS

        if (watchId !== null) {

            navigator.geolocation.clearWatch(
                watchId
            );

            watchId = null;
        }


    } else {

        isPaused = false;


        // Calcula duração da pausa

        elapsedBeforePause +=
            Date.now() - pauseStartTime;


        pauseStartTime = null;


        statusElement.textContent =
            "Gravando posição GPS...";


        pauseBtn.textContent =
            "PAUSE";


        // Reinicia GPS

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


    endTime = Date.now();


    isRecording = false;


    if (watchId !== null) {

        navigator.geolocation.clearWatch(
            watchId
        );

        watchId = null;
    }


    stopTimer();


    // Se estava pausado, não contabiliza
    // o período de pausa

    if (isPaused && pauseStartTime !== null) {

        elapsedBeforePause +=
            endTime - pauseStartTime;
    }


    isPaused = false;


    statusElement.textContent =
        "Trajeto finalizado";


    startBtn.disabled = false;

    pauseBtn.disabled = true;

    stopBtn.disabled = true;


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


    let message =
        "Não foi possível obter sua localização.";


    switch (error.code) {

        case error.PERMISSION_DENIED:

            message =
                "Permissão de localização negada.";

            break;


        case error.POSITION_UNAVAILABLE:

            message =
                "Posição indisponível.";

            break;


        case error.TIMEOUT:

            message =
                "Tempo esgotado ao tentar obter a posição.";

            break;

    }


    statusElement.textContent =
        message;
}


// ======================================================
// TIMER
// ======================================================

function startTimer() {

    stopTimer();


    timerInterval =
        setInterval(() => {

            updateInterface();

        }, 1000);
}


function stopTimer() {

    if (timerInterval !== null) {

        clearInterval(
            timerInterval
        );

        timerInterval = null;
    }
}


// ======================================================
// ATUALIZA INTERFACE
// ======================================================

function updateInterface() {

    pointCountElement.textContent =
        points.length;


    const duration =
        getElapsedTime();


    durationElement.textContent =
        formatDuration(duration);


    if (totalDistance < 1000) {

        distanceElement.textContent =
            `${totalDistance.toFixed(1)} m`;

    } else {

        distanceElement.textContent =
            `${(totalDistance / 1000).toFixed(2)} km`;
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


    if (isPaused &&
        pauseStartTime !== null) {

        elapsed -=
            Date.now() - pauseStartTime;
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

        String(hours).padStart(2, "0"),

        String(minutes).padStart(2, "0"),

        String(seconds).padStart(2, "0")

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
// EXPORTAÇÃO CSV
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
        points.map(point =>

            headers
                .map(header =>
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
// EXPORTAÇÃO GEOJSON
// ======================================================

function exportGeoJSON() {

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

            points.map(point => ({

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

            }))

    };


    downloadFile(

        JSON.stringify(
            geojson,
            null,
            2
        ),

        `${trackId}.geojson`,

        "application/geo+json"

    );
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


geojsonBtn.addEventListener(

    "click",

    exportGeoJSON

);