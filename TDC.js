// TDC.js - Simulación horno eléctrico (1 iteración = 1 minuto simulado)

// contexto de charts (asumo que los canvas están en el HTML)
const ChartSalida = document.getElementById('ChartSalida').getContext('2d');
const ChartMedicion = document.getElementById('ChartMedicion').getContext('2d');
const ChartError = document.getElementById('ChartError').getContext('2d');

// helper para crear charts (ejes en minutos)
function createChart(ctx, labelY) {
    return new Chart(ctx, {
        type: 'line',
        data: { labels: [], datasets: [{ label: labelY, borderColor: 'rgba(0,123,255,1)', backgroundColor: 'rgba(0,123,255,0.15)', data: [], fill: false, tension: 0.25 }] },
        options: {
            animation: false,
            responsive: true,
            scales: {
                x: { type: 'linear', title: { display: true, text: 'Tiempo (min)' } },
                y: { title: { display: true, text: labelY } }
            },
            plugins: { legend: { display: false } }
        }
    });
}

const salidaChart = createChart(ChartSalida, "Potencia aplicada (%)");
const medicionChart = createChart(ChartMedicion, "Temperatura (°C)");
const errorChart = createChart(ChartError, "Error (°C)");

// --------- Parámetros físicos y control ---------
let setpoint = 180;            // referencia (°C) - controlable con slider
let temperatura = 25;          // temperatura inicial ambiente (°C)
let tiempoMin = 0;             // tiempo simulado en minutos

// Control
const Kp = 0.9;                // ganancia proporcional (ajustable)

// Modelo térmico (parámetros calibrables)
const maxHeatingRate = 15.0;   // °C por minuto a potencia 100% (aumenta si querés más rapidez)
const lossCoeff = 0.03;        // coeficiente de pérdidas (proporcional a temp-ambiente)
const ambient = 25;            // temperatura ambiente (°C)

// Pérdida por puerta abierta (perturbación)
const doorInitialDrop = 8.0;   // °C caída instantánea cuando se abre la puerta (aplicable 1 vez)
const doorLossPerMin = 6.0;    // °C por minuto mientras la puerta esté abierta (continua)

// Referencias a DOM
const slider = document.getElementById('slider');
const sliderValue = document.getElementById('sliderValue');
const perturbacionCheck = document.getElementById('myCheckbox');
const perturbacionTxt = document.getElementById('perturbacion');

// flags
let puertaAbierta = false;
let caidaInicialAplicada = false;

// eventos UI
slider.addEventListener('input', () => {
    setpoint = parseInt(slider.value, 10);
    sliderValue.textContent = setpoint;
});

perturbacionCheck.addEventListener('change', () => {
    if (perturbacionCheck.checked) {
        puertaAbierta = true;
        caidaInicialAplicada = false; // habilita caída inicial
    } else {
        puertaAbierta = false;
    }
    perturbacionTxt.innerText = "Perturbación: " + (puertaAbierta ? "sí" : "no");
});

// Función de control proporcional (devuelve potencia 0..100)
function controlProporcional(error) {
    let p = Kp * error;
    if (p < 0) p = 0;
    if (p > 100) p = 100;
    return p;
}

// Modelo térmico por minuto
// potencia: 0..100 (%)
function modeloTermico(temp, potencia) {
    const ambiente = 25;

    // calor entregado por las resistencias (potencia máxima ~20°C/min)
    const heating = (potencia / 100) * 20;

    // pérdidas térmicas realistas
    const cooling = 0.10 * (temp - ambiente);

    return temp + heating - cooling;
}


// Inicio: log para debugging (como querías en la consola)
console.log("Simulación iniciada");
console.log("Setpoint inicial =", setpoint + " °C");
console.log("Parámetros: maxHeatingRate=", maxHeatingRate, "°C/min, lossCoeff=", lossCoeff, ", doorLoss/min=", doorLossPerMin);

// ---------- Bucle de simulación: 1 iteración = 1 minuto simulado ----------
const SIM_INTERVAL_MS = 1000; // cada 1000 ms representamos 1 minuto simulado (ajustable)

setInterval(() => {
    console.log("--------------------------------------------------");
    tiempoMin += 1;

    // lectura (medición)
    const medicion = temperatura;
    console.log(`t=${tiempoMin} min - Medición = ${medicion.toFixed(2)} °C`);

    // perturbación: apertura de puerta
    if (puertaAbierta) {
        if (!caidaInicialAplicada) {
            temperatura -= doorInitialDrop;
            caidaInicialAplicada = true;
            console.log(`>> Puerta abierta: caída inicial ${-doorInitialDrop} °C -> temp=${temperatura.toFixed(2)}`);
        } else {
            console.log(">> Puerta abierta: pérdida continua activa.");
        }
    }

    // cálculo de error
    const error = setpoint - medicion;
    console.log("Error =", error.toFixed(2), "°C");

    // controlador (P)
    const salidaControl = controlProporcional(error); // 0..100 (%)
    console.log("Control P (potencia %) =", salidaControl.toFixed(2));

    // modelo térmico: actualizamos temperatura considerando la potencia y si la puerta está abierta
    temperatura = modeloTermico(temperatura, salidaControl, puertaAbierta);
    console.log("Temperatura después del modelo =", temperatura.toFixed(2), "°C");

    // actualizar gráficos (ejes X en minutos)
    // salida (potencia)
    salidaChart.data.labels.push(tiempoMin);
    salidaChart.data.datasets[0].data.push(salidaControl);
    if (salidaChart.data.labels.length > 120) {
        salidaChart.data.labels.shift(); salidaChart.data.datasets[0].data.shift();
    }
    salidaChart.update();

    // medición (temperatura)
    medicionChart.data.labels.push(tiempoMin);
    medicionChart.data.datasets[0].data.push(temperatura);
    if (medicionChart.data.labels.length > 120) {
        medicionChart.data.labels.shift(); medicionChart.data.datasets[0].data.shift();
    }
    medicionChart.update();

    // error
    errorChart.data.labels.push(tiempoMin);
    errorChart.data.datasets[0].data.push(error);
    if (errorChart.data.labels.length > 120) {
        errorChart.data.labels.shift(); errorChart.data.datasets[0].data.shift();
    }
    errorChart.update();

}, SIM_INTERVAL_MS);