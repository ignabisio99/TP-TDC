// =====================================================
//   TDC.js - Simulación horno eléctrico (Control PI)
// =====================================================


// =====================================================
// DECLARACION DE PARAMETROS PARÁMETROS
// =====================================================

let setpoint;
let ambient;
let temperatura;
let tiempoMin;

let Kp;
let Ki;
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


// =====================================================
// DECLARACION DE BARRA PARA OBTENER VALORES
// =====================================================

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


// =====================================================
// ARMADO Y CONFIGURACION DE LOS GRAFICOS
// =====================================================

const ctxDeseada      = document.getElementById('ChartDeseada').getContext('2d');
const ctxMedicion     = document.getElementById('ChartMedicion').getContext('2d');
const ctxError        = document.getElementById('ChartError').getContext('2d');
const ctxSalida       = document.getElementById('ChartSalida').getContext('2d');
const ctxPerturbacion = document.getElementById('ChartPerturbacion').getContext('2d');

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

const valorFinalPlugin = {
  id: 'valorFinalPlugin',
  afterDatasetsDraw(chart, args, options) {
    const ctx = chart.ctx;

    const dataset = chart.data.datasets[0];

    if (!dataset.data.length) return;

    const ultimoValor = dataset.data[dataset.data.length - 1];

    const x = chart.scales.x.getPixelForValue(
      chart.data.labels[dataset.data.length - 1]
    );
    const y = chart.scales.y.getPixelForValue(ultimoValor);

    ctx.save();
    ctx.font = "14px Arial";
    ctx.fillStyle = options.color || "red";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(`${ultimoValor.toFixed(1)}°C`, x + 10, y);
    ctx.restore();
  }
};

Chart.register(valorFinalPlugin);


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
medicionChart.options.plugins.valorFinalPlugin = { color: "red" };

function actualizarColorVidrio(temp) {
  const vidrio = document.querySelector(".oven-glass-overlay");
  if (!vidrio) return;

  const t = Math.min(Math.max(temp, 0), 300);
  const f = t / 300;

  const r = Math.floor(255 * f);
  const g = Math.floor(60 * (1 - f));
  const b = Math.floor(20 * (1 - f));

  const alpha = 0.60 + f * 0.25;

  vidrio.style.backgroundColor = `rgba(${r}, ${g}, ${b}, ${alpha})`;
}




// =====================================================
// MANEJO DE LA PERILLA CON BARRA DE VALORES
// =====================================================

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


// =====================================================
// OBTENCION DE VALORES SETEADOS DESDE EL FRONT
// =====================================================

conectarPerillaConBarra("slider", "sliderValue", "sliderVisual", "sliderBar", v => {
  setpoint = v;
  medicionChart.options.plugins.bandaError.setpoint = v;
  medicionChart.update();
});

conectarPerillaConBarra("ambientKnob", "ambientDisplay", "ambientVisual", "ambientBar", v => {
  ambient = v;
});

conectarPerillaConBarra("KpKnob", "KpDisplay", "KpVisual", "KpBar", v => {
  Kp = v;
});

conectarPerillaConBarra("KiKnob", "KiDisplay", "KiVisual", "KiBar", v => {
  Ki = v;
});

conectarPerillaConBarra("simDurationKnob", "sim-duration", "simDurationVisual", "simDurationBar", v => {
  simDurationMin = v;
});

conectarPerillaConBarra("simSpeedKnob", "sim-speed", "simSpeedVisual", "simSpeedBar", v => {
  simSpeedMinPerSec = v;
  recalcularDT();
});

conectarPerillaConBarra("pertDurationKnob", "perturb-duration", "pertDurationVisual", "pertDurationBar", v => {
  pertRestanteMin = v;
});

conectarPerillaConBarra("pertStatusKnob", "perturb-status", "pertStatusVisual", "pertStatusBar", v => {
  perturbacionTxt.textContent = v == 0 ? "Inactiva" : "Activa";
});

// =====================================================
// BOTONES
// =====================================================
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

// =====================================================
// VELOCIDAD DE SIMULACIÓN
// =====================================================

function recalcularDT() {
  const stepsPerSecond = 1000 / SIM_INTERVAL_MS;
  DT_MIN = simSpeedMinPerSec / stepsPerSecond;
}
recalcularDT();


// =====================================================
// CONTROLADOR PI
// =====================================================

function controlPI(error) {
  integralError += error * DT_MIN;
  const maxInt = 100 / Math.max(Ki, 0.001);

  integralError = Math.min(maxInt, Math.max(-maxInt, integralError));

  let salidaPct = Kp * error + Ki * integralError;
  return Math.min(100, Math.max(0, salidaPct));
}


// =====================================================
// MODELO TÉRMICO
// =====================================================

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


// =====================================================
// SIMULACIÓN
// =====================================================

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

  actualizarColorVidrio(temperatura);

  if (puertaAbierta) {
    pertRestanteMin -= DT_MIN;
    perturbacionTxt.textContent =
      pertRestanteMin <= 0 ? "Inactiva" : `Activa (${Math.ceil(pertRestanteMin)} min)`;

    if (pertRestanteMin <= 0) puertaAbierta = false;
  }

  const valores = [
    { chart: deseadaChart,      value: setpoint },
    { chart: medicionChart,     value: temperatura },
    { chart: errorChart,        value: error },
    { chart: salidaChart,       value: salidaPct },
    { chart: perturbacionChart, value: puertaAbierta ? 1 : 0 }
  ];

  valores.forEach(({ chart, value }) => {
    chart.data.labels.push(tiempoMin);
    chart.data.datasets[0].data.push(value);
    chart.update();
  });

  if (tiempoMin >= simDurationMin) {
    clearInterval(simIntervalId);
    simIntervalId = null;
  }
}
