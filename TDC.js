// =====================================================
//   TDC.js - Simulación horno eléctrico (Control PI)
// =====================================================


// ===================== CHARTS =====================
const ctxDeseada      = document.getElementById('ChartDeseada').getContext('2d');
const ctxMedicion     = document.getElementById('ChartMedicion').getContext('2d');
const ctxError        = document.getElementById('ChartError').getContext('2d');
const ctxSalida       = document.getElementById('ChartSalida').getContext('2d');
const ctxPerturbacion = document.getElementById('ChartPerturbacion').getContext('2d');

// Plugin para banda de error (verde)
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
    data: { labels: [], datasets: [{
      label: labelY,
      borderColor: 'rgba(0,123,255,1)',
      backgroundColor: 'rgba(0,123,255,0.15)',
      data: [],
      fill: false,
      tension: 0.25,
      pointRadius: 0,
      pointHoverRadius: 0
    }]},
    options: {
      animation: false,
      responsive: true,
      scales: {
        x: { type: 'linear', min: 0, max: 120 },
        y: { min: yMin, max: yMax }
      },
      plugins: { legend: { display: false } }
    }
  });
}

const deseadaChart      = createChart(ctxDeseada,      'Temp. objetivo (°C)', 0, 300);
const medicionChart     = createChart(ctxMedicion,     'Temp. medida (°C)',   0, 300);
const errorChart        = createChart(ctxError,        'Error (°C)',         -50, 300);
const salidaChart       = createChart(ctxSalida,       'Potencia (%)',         0, 100);
const perturbacionChart = createChart(ctxPerturbacion, 'Perturbación',         0, 1.2);

const bandaError = 5;
medicionChart.options.plugins.bandaError = { setpoint: 180, bandaError };


// ===================== PARÁMETROS =====================
let setpoint    = 180;
let ambient     = 20;
let temperatura = ambient;
let tiempoMin   = 0;

let Kp = 1.0;
let Ki = 0.2;
let integralError = 0;

const maxHeatingRate = 25;
const lossCoeff      = 0.10;

const SIM_INTERVAL_MS = 100;
let simSpeedMinPerSec = 10;
let DT_MIN = 0;
let simDurationMin = 120;

let puertaAbierta = false;
let caidaInicialAplicada = false;
let pertRestanteMin = 0;


// ===================== DOM =====================
const slider      = document.getElementById('slider');
const sliderValue = document.getElementById('sliderValue');

const ambientInput = document.getElementById('ambientKnob');
const KpInput      = document.getElementById('KpKnob');
const KiInput      = document.getElementById('KiKnob');

const btnPert         = document.getElementById('btnPert');
const perturbacionTxt = document.getElementById('perturb-status');

const btnStart = document.getElementById('btnStart');
const btnPause = document.getElementById('btnPause');
const btnAbort = document.getElementById('btnAbort');


// ===================== VELOCIDAD =====================
function recalcularDT() {
  const stepsPerSecond = 1000 / SIM_INTERVAL_MS;
  DT_MIN = simSpeedMinPerSec / stepsPerSecond;
}
recalcularDT();


// ===================== CONTROL PI =====================
function controlPI(error) {
  integralError += error * DT_MIN;
  const maxInt = 100 / Math.max(Ki, 0.001);

  if (integralError >  maxInt) integralError =  maxInt;
  if (integralError < -maxInt) integralError = -maxInt;

  let salidaPct = Kp * error + Ki * integralError;
  return Math.min(100, Math.max(0, salidaPct));
}


// ===================== MODELO =====================
function modeloTermico(temp, potenciaPct) {
  const heating = (potenciaPct / 100) * maxHeatingRate * DT_MIN;
  const cooling = lossCoeff * (temp - ambient) * DT_MIN;

  let doorLoss = 0;
  if (puertaAbierta) {
    if (!caidaInicialAplicada) { temp -= 8; caidaInicialAplicada = true; }
    doorLoss = 6 * DT_MIN;
  }

  return temp + heating - cooling - doorLoss;
}


// ===================== SIMULACIÓN =====================
let simIntervalId = null;

function resetSimulationData() {
  tiempoMin = 0;
  temperatura = ambient;
  integralError = 0;

  puertaAbierta = false;
  caidaInicialAplicada = false;
  pertRestanteMin = 0;

  perturbacionTxt.textContent = "Inactiva";

  [deseadaChart, medicionChart, errorChart, salidaChart, perturbacionChart].forEach(ch => {
    ch.data.labels = [];
    ch.data.datasets[0].data = [];
    ch.options.scales.x.max = simDurationMin;
    ch.update();
  });
}

function stepSimulation() {
  tiempoMin += DT_MIN;

  const medicion = temperatura;
  const error = setpoint - medicion;
  const salidaPct = controlPI(error);
  temperatura = modeloTermico(temperatura, salidaPct);

  if (puertaAbierta) {
    pertRestanteMin -= DT_MIN;
    if (pertRestanteMin <= 0) {
      puertaAbierta = false;
      perturbacionTxt.textContent = "Inactiva";
    } else {
      perturbacionTxt.textContent = `Activa (${Math.ceil(pertRestanteMin)} min)`;
    }
  }

  const chartValues = [
    { chart: deseadaChart,      value: setpoint },
    { chart: medicionChart,     value: temperatura },
    { chart: errorChart,        value: error },
    { chart: salidaChart,       value: salidaPct },
    { chart: perturbacionChart, value: puertaAbierta ? 1 : 0 }
  ];

  chartValues.forEach(({ chart, value }) => {
    chart.data.labels.push(tiempoMin);
    chart.data.datasets[0].data.push(value);
    chart.update();
  });

  if (tiempoMin >= simDurationMin) {
    clearInterval(simIntervalId);
    simIntervalId = null;
  }
}


// ===================== BOTONES =====================
btnStart.addEventListener('click', () => {
  if (simIntervalId) clearInterval(simIntervalId);
  resetSimulationData();
  simIntervalId = setInterval(stepSimulation, SIM_INTERVAL_MS);
});
btnPause.addEventListener('click', () => {
  if (simIntervalId) { clearInterval(simIntervalId); simIntervalId = null; }
  else simIntervalId = setInterval(stepSimulation, SIM_INTERVAL_MS);
});
btnAbort.addEventListener('click', () => {
  if (simIntervalId) clearInterval(simIntervalId);
  simIntervalId = null;
  resetSimulationData();
});
btnPert.addEventListener('click', () => {
  if (puertaAbierta) return;
  puertaAbierta = true;
  pertRestanteMin = Number(document.getElementById("pertDurationKnob").value);
  perturbacionTxt.textContent = `Activa (${pertRestanteMin} min)`;
});


// ===================== PERILLAS CON BARRAS =====================
function conectarPerillaConBarra(knobId, displayId, visualId, barId, callback) {
  const knob = document.getElementById(knobId);
  const bar  = document.getElementById(barId);
  const disp = document.getElementById(displayId);
  const visual = document.getElementById(visualId);

  const min = parseFloat(knob.min);
  const max = parseFloat(knob.max);

  function actualizar(v) {
    disp.textContent = v;
    const ang = -135 + ((v - min) / (max - min)) * 270;
    visual.style.transform = `rotate(${ang}deg)`;
    if (callback) callback(parseFloat(v));
  }

  bar.addEventListener("input", () => { knob.value = bar.value; actualizar(bar.value); });
  knob.addEventListener("input", () => { bar.value = knob.value; actualizar(knob.value); });

  actualizar(knob.value);
}

// Temp objetivo
conectarPerillaConBarra("slider", "sliderValue", "sliderVisual", "sliderBar", v => {
  setpoint = v;
  medicionChart.options.plugins.bandaError.setpoint = v;
  medicionChart.update();
});

// Ambiente
conectarPerillaConBarra("ambientKnob", "ambientDisplay", "ambientVisual", "ambientBar", v => {
  ambient = v;
});

// Kp
conectarPerillaConBarra("KpKnob", "KpDisplay", "KpVisual", "KpBar", v => {
  Kp = v;
});

// Ki
conectarPerillaConBarra("KiKnob", "KiDisplay", "KiVisual", "KiBar", v => {
  Ki = v;
});

// Duración simulación
conectarPerillaConBarra("simDurationKnob", "sim-duration", "simDurationVisual", "simDurationBar", v => {
  simDurationMin = v;
});

// Velocidad simulación
conectarPerillaConBarra("simSpeedKnob", "sim-speed", "simSpeedVisual", "simSpeedBar", v => {
  simSpeedMinPerSec = v;
  recalcularDT();
});

// Duración perturbación
conectarPerillaConBarra("pertDurationKnob", "perturb-duration", "pertDurationVisual", "pertDurationBar", v => {
  pertRestanteMin = v;
});

// Estado perturbación (visual)
conectarPerillaConBarra("pertStatusKnob", "perturb-status", "pertStatusVisual", "pertStatusBar", v => {
  perturbacionTxt.textContent = v == 0 ? "Inactiva" : "Activa";
});
