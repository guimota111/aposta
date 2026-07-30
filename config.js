// ── Configuração e regras compartilhadas (index.html + historico.html) ──
// Este arquivo é a ÚNICA fonte da verdade das regras de pontuação.
// Antes, index e histórico tinham cópias diferentes do cálculo, o que fazia
// o placar discordar dos quadradinhos do calendário.

const firebaseConfig = {
    apiKey:            "AIzaSyBqeUSV1CAY216gI5HzaVtHA8ncpt4FoYM",
    authDomain:        "apostaluana-551f2.firebaseapp.com",
    databaseURL:       "https://apostaluana-551f2-default-rtdb.firebaseio.com",
    projectId:         "apostaluana-551f2",
    storageBucket:     "apostaluana-551f2.firebasestorage.app",
    messagingSenderId: "749165322076",
    appId:             "1:749165322076:web:ebefaac6f0afff47f22b99",
    measurementId:     "G-WFGPT03Z1X"
};

firebase.initializeApp(firebaseConfig);
const db   = firebase.database();
const ROOT = db.ref('aposta');

// Temporada atual — ao mudar este valor, o placar é zerado automaticamente
const CURRENT_SEASON = 'junho-julho-2026';
// Primeiro dia que conta para o placar desta temporada (YYYY-MM-DD).
// Dias anteriores continuam no histórico, mas não somam pontos.
const SEASON_START   = '2026-06-01';

// ── Metas ──────────────────────────────────────────────────
const GOALS = {
    guilherme: { questions: 20, studySeconds: 7200, water: 4000, bookPages: 10 },
    luana:     { questions: 20, studySeconds: 7200, water: 2500, bookPages: 10 }
};

const EMPTY_STATE = {
    guilherme: { questions: 0, studySeconds: 0, water: 0, gym: false, aerobic: false, bookPages: 0, timerRunning: false, timerStartedAt: null },
    luana:     { questions: 0, studySeconds: 0, water: 0, gym: false, aerobic: false, bookPages: 0, timerRunning: false, timerStartedAt: null }
};

// ── Datas ──────────────────────────────────────────────────
function pad2(n) { return String(n).padStart(2, '0'); }

function todayStr() {
    const d = new Date();
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function isWeekend(dateStr) {
    const d = new Date(dateStr + 'T12:00:00');
    return d.getDay() === 0 || d.getDay() === 6;
}

function isInSeason(dateStr) {
    return dateStr >= SEASON_START;
}

// ── Cálculo de porcentagem (6 critérios) ───────────────────
function calcPct(s, g) {
    const effStudy = (s.timerRunning && s.timerStartedAt)
        ? (s.studySeconds || 0) + Math.floor((Date.now() - s.timerStartedAt) / 1000)
        : (s.studySeconds || 0);
    const q       = Math.min((s.questions  || 0) / g.questions,    1);
    const st      = Math.min(effStudy            / g.studySeconds, 1);
    const w       = Math.min((s.water      || 0) / g.water,        1);
    const gym     = (s.gym     || false) ? 1 : 0;
    const aerobic = (s.aerobic || false) ? 1 : 0;
    const book    = Math.min((s.bookPages  || 0) / g.bookPages,    1);
    return Math.round(((q + st + w + gym + aerobic + book) / 6) * 100);
}

// Resultado do dia a partir do estado: 'fds' | 'guilherme' | 'luana' | 'empate'
function dayWinner(dateStr, dayState) {
    if (isWeekend(dateStr)) return 'fds';
    const st   = dayState || {};
    const gPct = calcPct(st.guilherme || {}, GOALS.guilherme);
    const lPct = calcPct(st.luana     || {}, GOALS.luana);
    if (gPct > lPct) return 'guilherme';
    if (lPct > gPct) return 'luana';
    return 'empate';
}

// Registros antigos eram apenas a string do resultado; os novos são objetos.
function resultOf(record) {
    if (typeof record === 'string')                 return record;
    if (record && typeof record === 'object')       return record.result || null;
    return null;
}

// ── Placar da temporada, derivado do histórico ─────────────
// Conta SOMENTE dias a partir de SEASON_START — é isso que os quadradinhos
// do calendário mostram.
function countSeasonPoints(history) {
    const totals = { guilherme: 0, luana: 0, empate: 0 };
    for (const date in (history || {})) {
        if (!isInSeason(date)) continue;
        const result = resultOf(history[date]);
        if (result === 'guilherme' || result === 'luana' || result === 'empate') {
            totals[result]++;
        }
    }
    return totals;
}
