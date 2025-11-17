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

// --- CONTROL PI (Proporcional-Integral) ---
const Kp = 0.9;                // Ganancia proporcional (velocidad de reacción)
const Ki = 0.2;                // Ganancia integral (elimina error estacionario)
let integralError = 0;         // Acumulador del error para la parte Integral
const maxIntegral = 100 / Ki;  // Límite Anti-Windup (evita que la integral crezca indefinidamente)
const minIntegral = -100 / Ki;

// Modelo térmico (parámetros calibrables)
// (Estos valores están hardcodeados en tu 'modeloTermico', pero los dejo aquí)
const maxHeatingRate = 20.0;   // °C por minuto a potencia 100%
const lossCoeff = 0.10;        // coeficiente de pérdidas (proporcional a temp-ambiente)
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
    // Reseteamos la integral si cambia el setpoint para que reaccione rápido
    integralError = 0; 
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

// *** NUEVO: Función de control Proporcional-Integral (PI) ***
function controlPI(error) {
    // 1. Parte Proporcional (igual que antes)
    const p = Kp * error;

    // 2. Parte Integral (la novedad)
    // Acumula el error en cada "minuto"
    integralError += error;
    
    // "Anti-Windup": Evita que el término integral crezca demasiado
    // Si la potencia está al 100%, no seguimos acumulando
    if (integralError > maxIntegral) integralError = maxIntegral;
    if (integralError < minIntegral) integralError = minIntegral;
    
    const i = Ki * integralError;

    // 3. Salida total (P + I)
    let salida = p + i;
    
    // Saturación: la potencia no puede ser < 0% o > 100%
    if (salida < 0) salida = 0;
    if (salida > 100) salida = 100;
    
    return salida;
}

// *** CORREGIDO: Modelo térmico por minuto ***
// (Ahora acepta 'puertaAbierta' y usa la pérdida continua)
function modeloTermico(temp, potencia, puertaAbierta) {
    // calor entregado por las resistencias
    const heating = (potencia / 100) * maxHeatingRate; // (Uso maxHeatingRate)

    // pérdidas térmicas normales (aislación)
    const cooling = lossCoeff * (temp - ambient); // (Uso lossCoeff y ambient)

    // *** NUEVO: Pérdida por puerta abierta ***
    let doorLoss = 0;
    if (puertaAbierta) {
        if (!caidaInicialAplicada) {
            // Aplicamos caída brusca 1 SOLA VEZ
            temp -= doorInitialDrop; 
            caidaInicialAplicada = true;
            console.log(`>> Puerta abierta: caída inicial ${-doorInitialDrop} °C -> temp=${temp.toFixed(2)}`);
        }
        // Aplicamos la pérdida continua CADA MINUTO que sigue abierta
        doorLoss = doorLossPerMin; 
    }

    return temp + heating - cooling - doorLoss;
}


// Inicio: log para debugging
console.log("Simulación iniciada (con control PI)");
console.log("Setpoint inicial =", setpoint + " °C");
console.log(`Parámetros PI: Kp=${Kp}, Ki=${Ki}`);
console.log(`Parámetros Horno: TasaCalor=${maxHeatingRate}°C/min, CoefPérdida=${lossCoeff}`);

// ---------- Bucle de simulación: 1 iteración = 1 minuto simulado ----------
const SIM_INTERVAL_MS = 1000; // cada 1000 ms representamos 1 minuto simulado

setInterval(() => {
    console.log("--------------------------------------------------");
    tiempoMin += 1;

    // lectura (medición)
    const medicion = temperatura;
    console.log(`t=${tiempoMin} min - Medición = ${medicion.toFixed(2)} °C`);

    // cálculo de error
    const error = setpoint - medicion;
    console.log(`Setpoint=${setpoint}, Error = ${error.toFixed(2)} °C`);

    // *** CAMBIO: Usamos el controlador PI ***
    const salidaControl = controlPI(error); // 0..100 (%)
    console.log(`Control PI (potencia %) = ${salidaControl.toFixed(2)} (i_acum: ${integralError.toFixed(1)})`);

    // *** CAMBIO: modelo térmico actualizado ***
    // (La lógica de la puerta abierta ahora está DENTRO del modelo)
    temperatura = modeloTermico(temperatura, salidaControl, puertaAbierta);
    console.log("Temperatura después del modelo =", temperatura.toFixed(2), "°C");

    // actualizar gráficos (ejes X en minutos)
    // (Esta lógica es idéntica y estaba bien)
    
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