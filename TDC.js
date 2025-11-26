// TDC.js - Simulación horno eléctrico (Control PI, potencia deseada en %)

// ===================== CHARTS =====================
const ctxDeseada      = document.getElementById('ChartDeseada').getContext('2d');
const ctxMedicion     = document.getElementById('ChartMedicion').getContext('2d');
const ctxError        = document.getElementById('ChartError').getContext('2d');
const ctxSalida       = document.getElementById('ChartSalida').getContext('2d');
const ctxPerturbacion = document.getElementById('ChartPerturbacion').getContext('2d');

// Plugin para banda de error (verde) en la temperatura medida
const bandaErrorPlugin = {
  id: 'bandaError',
  beforeDraw(chart, args, options) {
    const { ctx, chartArea, scales } = chart;
    const setpoint = options.setpoint;
    const banda = options.bandaError;
    if (setpoint == null) return;

    const yTop = scales.y.getPixelForValue(setpoint + banda);
    const yBottom = scales.y.getPixelForValue(setpoint - banda);

    ctx.save();
    ctx.fillStyle = 'rgba(0, 255, 0, 0.12)';
    ctx.fillRect(chartArea.left, yTop, chartArea.right - chartArea.left, yBottom - yTop);
    ctx.restore();
  }
};

Chart.register(bandaErrorPlugin);

function createChart(ctx, labelY, yMin, yMax) {
  return new Chart(ctx, {
    type: 'line',
    data: {
      labels: [],
      datasets: [{
        label: labelY,
        borderColor: 'rgba(0,123,255,1)',
        backgroundColor: 'rgba(0,123,255,0.15)',
        data: [],
        fill: false,
        tension: 0.25,
        pointRadius: 0,
        pointHoverRadius: 0
      }]
    },
    options: {
      animation: false,
      responsive: true,
      interaction: {
        mode: 'nearest',
        intersect: false
      },
      elements: {
        point: {
          radius: 0
        }
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          enabled: true,
          callbacks: {
            title(items) {
              if (!items.length) return '';
              const x = items[0].parsed.x;
              return `Tiempo: ${x.toFixed(1)} min`;
            },
            label(context) {
              const label = context.dataset.label || '';
              const y = context.parsed.y;
              return `${label}: ${y.toFixed(2)}`;
            }
          }
        }
      },
      scales: {
        x: {
          type: 'linear',
          title: { display: true, text: 'Tiempo (min)' },
          min: 0,
          max: 120
        },
        y: {
          title: { display: true, text: labelY },
          min: yMin,
          max: yMax
        }
      }
    }
  });
}

// Gráficos con escalas fijas
const deseadaChart      = createChart(ctxDeseada,      'Temperatura objetivo (°C)', 0, 300);
const medicionChart     = createChart(ctxMedicion,     'Temperatura medida (°C)',   0, 300);
const errorChart        = createChart(ctxError,        'Error (°C)',               -50, 300);
const salidaChart       = createChart(ctxSalida,       'Potencia deseada (%)',      0, 100);
const perturbacionChart = createChart(ctxPerturbacion, 'Perturbación (0/1)',        0, 1.2);

// Banda de error ±5 °C alrededor del setpoint (en el gráfico de temperatura medida)
const bandaError = 5;
medicionChart.options.plugins.bandaError = {
  setpoint: 180,
  bandaError: bandaError
};

// ===================== PARÁMETROS DEL SISTEMA =====================
let setpoint    = 180;  // °C
let ambient     = 20;   // °C ambiente
let temperatura = ambient;
let tiempoMin   = 0;    // tiempo simulado en minutos

// Control PI
let Kp = 1.0;
let Ki = 0.2;
let integralError = 0;

// Física del horno (modelo simplificado)
const maxHeatingRate = 25.0; // °C/min a 100% potencia
const lossCoeff      = 0.10; // pérdidas térmicas

// Simulación
const SIM_INTERVAL_MS = 100; // 100 ms entre pasos (~10 fps)
let   simSpeedMinPerSec = 10; // minutos simulados por segundo
let   DT_MIN = 0;             // minutos simulados por paso

let simDurationMin = 120;     // duración total de la simulación en minutos

// Perturbación (puerta abierta)
const doorInitialDrop = 8.0;  // caída instantánea de temperatura
const doorLossPerMin  = 6.0;  // pérdida extra por minuto

let puertaAbierta = false;
let caidaInicialAplicada = false;
let pertRestanteMin = 0;

// ===================== DOM =====================
const slider      = document.getElementById('slider');
const sliderValue = document.getElementById('sliderValue');

const ambientInput      = document.getElementById('ambientInput');
const KpInput           = document.getElementById('KpInput');
const KiInput           = document.getElementById('KiInput');
const duracionSimInput  = document.getElementById('duracionSim');
const velocidadSimInput = document.getElementById('velocidadSim');
const duracionPertInput = document.getElementById('duracionPert');

const btnPert         = document.getElementById('btnPert');
const perturbacionTxt = document.getElementById('perturbacion');

const btnStart = document.getElementById('btnStart');
const btnPause = document.getElementById('btnPause');
const btnAbort = document.getElementById('btnAbort');

// ===================== VELOCIDAD =====================
function recalcularDT() {
  const stepsPerSecond = 1000 / SIM_INTERVAL_MS;
  DT_MIN = simSpeedMinPerSec / stepsPerSecond; // min/paso
}

simSpeedMinPerSec = parseFloat(velocidadSimInput.value) || 10;
recalcularDT();

// ===================== EVENTOS UI =====================

// Slider temperatura objetivo
slider.addEventListener("input", () => {
  setpoint = parseInt(slider.value, 10);
  sliderValue.textContent = setpoint;
  integralError = 0;
  medicionChart.options.plugins.bandaError.setpoint = setpoint;
});

// Temperatura ambiente
ambientInput.addEventListener("change", () => {
  ambient = Number(ambientInput.value);
});

// Kp, Ki
KpInput.addEventListener('change', () => {
  const v = parseFloat(KpInput.value);
  if (!isNaN(v)) Kp = v;
});

KiInput.addEventListener('change', () => {
  const v = parseFloat(KiInput.value);
  if (!isNaN(v) && v > 0) Ki = v;
});

// Duración simulación
duracionSimInput.addEventListener('change', () => {
  const v = parseInt(duracionSimInput.value, 10);
  if (!isNaN(v) && v > 0) {
    simDurationMin = v;
    [deseadaChart, medicionChart, errorChart, salidaChart, perturbacionChart].forEach(ch => {
      ch.options.scales.x.min = 0;
      ch.options.scales.x.max = simDurationMin;
      ch.update();
    });
  }
});

// Velocidad (1 a 10 min/s)
velocidadSimInput.addEventListener("change", () => {
  let v = parseFloat(velocidadSimInput.value);
  if (isNaN(v) || v < 1) v = 1;
  if (v > 10) v = 10;
  simSpeedMinPerSec = v;
  velocidadSimInput.value = v;
  recalcularDT();
});

// Botón perturbación
btnPert.addEventListener('click', () => {
  if (puertaAbierta) return;

  const dur = parseInt(duracionPertInput.value, 10);
  if (isNaN(dur) || dur <= 0) return;

  puertaAbierta = true;
  caidaInicialAplicada = false;
  pertRestanteMin = dur;

  perturbacionTxt.textContent = `Perturbación: en curso (${dur} min)`;
  btnPert.disabled = true;
});

// ===================== CONTROL PI (0–100 %) =====================
function controlPI(error) {
  const p = Kp * error;

  // integral con dt
  integralError += error * DT_MIN;

  // anti-windup simple para 0–100 %
  const maxIntegral = 100 / Math.max(Ki, 0.0001);
  if (integralError >  maxIntegral) integralError =  maxIntegral;
  if (integralError < -maxIntegral) integralError = -maxIntegral;

  const i = Ki * integralError;

  let salidaPct = p + i;  // %
  if (salidaPct < 0)   salidaPct = 0;
  if (salidaPct > 100) salidaPct = 100;

  return salidaPct;
}

// ===================== MODELO TÉRMICO =====================
function modeloTermico(temp, potenciaPct) {
  const heating = (potenciaPct / 100) * maxHeatingRate * DT_MIN;
  const cooling = lossCoeff * (temp - ambient) * DT_MIN;

  let doorLossExtra = 0;
  if (puertaAbierta) {
    if (!caidaInicialAplicada) {
      temp -= doorInitialDrop;
      caidaInicialAplicada = true;
    }
    doorLossExtra = doorLossPerMin * DT_MIN;
  }

  return temp + heating - cooling - doorLossExtra;
}

// ===================== SIMULACIÓN =====================
let simIntervalId = null;

function resetSimulationData() {
  tiempoMin = 0;
  ambient = Number(ambientInput.value);
  temperatura = ambient;
  integralError = 0;

  puertaAbierta = false;
  caidaInicialAplicada = false;
  pertRestanteMin = 0;
  perturbacionTxt.textContent = "Perturbación: inactiva";
  btnPert.disabled = false;

  [deseadaChart, medicionChart, errorChart, salidaChart, perturbacionChart].forEach(ch => {
    ch.data.labels = [];
    ch.data.datasets[0].data = [];
    ch.options.scales.x.min = 0;
    ch.options.scales.x.max = simDurationMin;
    ch.update();
  });
}

function stepSimulation() {
  tiempoMin += DT_MIN;

  const medicion = temperatura;
  const error = setpoint - medicion;

  // salida de control en % (potencia deseada)
  const salidaPct = controlPI(error);

  // dinámica térmica
  temperatura = modeloTermico(temperatura, salidaPct);

  // Manejo perturbación
  if (puertaAbierta && pertRestanteMin > 0) {
    pertRestanteMin -= DT_MIN;
    if (pertRestanteMin <= 0) {
      puertaAbierta = false;
      perturbacionTxt.textContent = "Perturbación: finalizada";
      btnPert.disabled = false;
    } else {
      const mostrada = Math.max(0, Math.ceil(pertRestanteMin));
      perturbacionTxt.textContent = `Perturbación: en curso (${mostrada} min)`;
    }
  }
  const pertSignal = puertaAbierta ? 1 : 0;

  // Actualizar gráficos
  const charts = [
    { chart: deseadaChart,      value: setpoint },
    { chart: medicionChart,     value: temperatura },
    { chart: errorChart,        value: error },
    { chart: salidaChart,       value: salidaPct },
    { chart: perturbacionChart, value: pertSignal }
  ];

  charts.forEach(({ chart, value }) => {
    chart.data.labels.push(tiempoMin);
    chart.data.datasets[0].data.push(value);
    if (chart.data.labels.length > 600) {
      chart.data.labels.shift();
      chart.data.datasets[0].data.shift();
    }
    chart.update();
  });

  // Fin automático por duración
  if (tiempoMin >= simDurationMin) {
    clearInterval(simIntervalId);
    simIntervalId = null;

    slider.disabled            = false;
    ambientInput.disabled      = false;
    KpInput.disabled           = false;
    KiInput.disabled           = false;
    duracionSimInput.disabled  = false;
    velocidadSimInput.disabled = false;
  }
}

// ===================== BOTONES =====================

// Iniciar nueva simulación
btnStart.addEventListener('click', () => {
  if (simIntervalId !== null) {
    clearInterval(simIntervalId);
    simIntervalId = null;
  }

  resetSimulationData();

  // deshabilitar variables de control mientras corre la simulación
  slider.disabled           = true;
  ambientInput.disabled     = true;
  KpInput.disabled          = true;
  KiInput.disabled          = true;
  duracionSimInput.disabled = true;
  velocidadSimInput.disabled= true;
  // perturbación queda habilitada

  simIntervalId = setInterval(stepSimulation, SIM_INTERVAL_MS);
});

// Pausar / continuar
btnPause.addEventListener('click', () => {
  if (simIntervalId !== null) {
    clearInterval(simIntervalId);
    simIntervalId = null;
  } else {
    simIntervalId = setInterval(stepSimulation, SIM_INTERVAL_MS);
  }
});

// Abortar simulación
btnAbort.addEventListener('click', () => {
  if (simIntervalId !== null) {
    clearInterval(simIntervalId);
    simIntervalId = null;
  }

  slider.disabled            = false;
  ambientInput.disabled      = false;
  KpInput.disabled           = false;
  KiInput.disabled           = false;
  duracionSimInput.disabled  = false;
  velocidadSimInput.disabled = false;

  resetSimulationData();
});
