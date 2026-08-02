// ── Configuração e regras compartilhadas (todas as páginas) ──
// Este arquivo é a ÚNICA fonte da verdade das regras de pontuação.
// A moeda da competição são GARRAFINHAS DE ÁGUA (ver pontuacao.html).

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
const db     = firebase.database();
const ROOT   = db.ref('aposta');
const DB_URL = firebaseConfig.databaseURL;

// ── Temporada ──────────────────────────────────────────────
// Ao mudar CURRENT_SEASON o placar é zerado automaticamente.
const CURRENT_SEASON = 'agosto-setembro-2026';
const SEASON_START   = '2026-08-03';   // segunda-feira
const SEASON_END     = '2026-09-30';
const SEASON_LABEL   = 'Temporada Ago–Set 2026';

// ── Regras de garrafinhas ──────────────────────────────────
const BOTTLE_RULES = {
    perHabit:    1,   // cada hábito completado no dia
    perfectDay:  3,   // bônus por completar TODOS os hábitos no mesmo dia
    streakBlock: 3    // a cada 3 dias úteis seguidos do mesmo hábito
};
// Streak escalonado: fechou 3 dias → +1, 6 dias → +2, 9 dias → +3 …
// (streak de 9 dias vale 1+2+3 = 6 garrafinhas acumuladas)
function streakAward(streakLength) {
    return (streakLength > 0 && streakLength % BOTTLE_RULES.streakBlock === 0)
        ? streakLength / BOTTLE_RULES.streakBlock
        : 0;
}

// ── Metas ──────────────────────────────────────────────────
const GOALS = {
    guilherme: { questions: 20, studySeconds: 7200, water: 4000, bookPages: 10, steps: 10000, meditationMinutes: 10 },
    luana:     { questions: 20, studySeconds: 7200, water: 2500, bookPages: 10, steps: 10000, meditationMinutes: 10 }
};

// ── Hábitos ────────────────────────────────────────────────
// `id` é o prefixo usado nos ids do HTML (g-<id>-task, l-<id>-bar, …)
const HABITS = [
    { key: 'questions',    id: 'questions',  label: 'Questões',           icon: '📝' },
    { key: 'studySeconds', id: 'study',      label: 'Estudo',             icon: '📚' },
    { key: 'water',        id: 'water',      label: 'Água',               icon: '💧' },
    { key: 'gym',          id: 'gym',        label: 'Academia',           icon: '🏋️' },
    { key: 'aerobic',      id: 'aerobic',    label: 'Exercício Aeróbico', icon: '🏃' },
    { key: 'bookPages',    id: 'book',       label: 'Leitura de livro',   icon: '📖' },
    { key: 'steps',        id: 'steps',      label: 'Passos',             icon: '👟' },
    { key: 'meditation',   id: 'meditation', label: 'Meditação',          icon: '🧘' }
];

const PEOPLE = ['guilherme', 'luana'];
const PREFIX = { guilherme: 'g', luana: 'l' };
const NAMES  = { guilherme: 'Guilherme', luana: 'Luana' };

function emptyPerson() {
    return {
        questions: 0, studySeconds: 0, water: 0, gym: false, aerobic: false,
        bookPages: 0, steps: 0, meditation: false,
        timerRunning: false, timerStartedAt: null
    };
}

const EMPTY_STATE = { guilherme: emptyPerson(), luana: emptyPerson() };

// ── Datas ──────────────────────────────────────────────────
function pad2(n) { return String(n).padStart(2, '0'); }

function todayStr() {
    const d = new Date();
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function addDays(dateStr, n) {
    const d = new Date(dateStr + 'T12:00:00');
    d.setDate(d.getDate() + n);
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function isWeekend(dateStr) {
    const d = new Date(dateStr + 'T12:00:00');
    return d.getDay() === 0 || d.getDay() === 6;
}

function isInSeason(dateStr) {
    return dateStr >= SEASON_START && dateStr <= SEASON_END;
}

// ── Progresso de um hábito ─────────────────────────────────
function effStudySeconds(s) {
    return (s && s.timerRunning && s.timerStartedAt)
        ? (s.studySeconds || 0) + Math.floor((Date.now() - s.timerStartedAt) / 1000)
        : ((s && s.studySeconds) || 0);
}

// Valor atual e meta de um hábito, já normalizados.
function habitValue(key, s, g) {
    s = s || {};
    switch (key) {
        case 'studySeconds': return { value: effStudySeconds(s),      goal: g.studySeconds };
        case 'gym':          return { value: s.gym        ? 1 : 0,    goal: 1 };
        case 'aerobic':      return { value: s.aerobic    ? 1 : 0,    goal: 1 };
        case 'meditation':   return { value: s.meditation ? 1 : 0,    goal: 1 };
        default:             return { value: s[key] || 0,             goal: g[key] };
    }
}

function habitDone(key, s, g) {
    const { value, goal } = habitValue(key, s, g);
    return value >= goal;
}

function habitPct(key, s, g) {
    const { value, goal } = habitValue(key, s, g);
    return goal > 0 ? Math.min(value / goal, 1) : 0;
}

// Porcentagem geral do dia (média dos hábitos) — só progresso visual,
// as garrafinhas dependem apenas de completar ou não cada hábito.
function calcPct(s, g) {
    const sum = HABITS.reduce((acc, h) => acc + habitPct(h.key, s, g), 0);
    return Math.round((sum / HABITS.length) * 100);
}

// ── Garrafinhas de um único dia (sem streaks) ──────────────
function dayBottles(s, g) {
    const done  = HABITS.filter(h => habitDone(h.key, s, g)).map(h => h.key);
    const base  = done.length * BOTTLE_RULES.perHabit;
    const bonus = done.length === HABITS.length ? BOTTLE_RULES.perfectDay : 0;
    return { done, base, bonus, subtotal: base + bonus };
}

// Resultado do dia gravado no histórico: 'fds' | 'guilherme' | 'luana' | 'empate'
// (o calendário recalcula tudo em tempo real; isto é só o registro salvo)
function dayWinner(dateStr, dayState) {
    if (isWeekend(dateStr)) return 'fds';
    const st = dayState || {};
    const g  = dayBottles(st.guilherme || {}, GOALS.guilherme).subtotal;
    const l  = dayBottles(st.luana     || {}, GOALS.luana).subtotal;
    if (g > l) return 'guilherme';
    if (l > g) return 'luana';
    return 'empate';
}

// Registros antigos eram apenas a string do resultado; os novos são objetos.
function resultOf(record) {
    if (typeof record === 'string')           return record;
    if (record && typeof record === 'object') return record.result || null;
    return null;
}

function stateOf(record) {
    return (record && typeof record === 'object' && record.state) ? record.state : {};
}

// ── Placar da temporada ────────────────────────────────────
// Percorre todo dia útil da temporada (do início até hoje), acumulando
// garrafinhas de hábito, bônus de dia perfeito e bônus de streak.
// Fim de semana é pulado: não pontua e nem quebra streak.
//
// `liveState` é o dia em aberto (ainda fora do histórico) e `liveDate` é a
// data a que ele pertence — normalmente hoje, mas pode ser ontem se ninguém
// abriu o site depois da meia-noite e a virada do dia ainda não rodou.
function computeSeason(history, liveState, liveDate, todayDate) {
    history   = history   || {};
    todayDate = todayDate || todayStr();
    liveDate  = liveDate  || todayDate;

    const lastDate = todayDate < SEASON_END ? todayDate : SEASON_END;
    const totals   = { guilherme: 0, luana: 0 };
    const days     = {};
    const streaks  = { guilherme: {}, luana: {} };
    const run      = { guilherme: {}, luana: {} };   // streak corrente por hábito

    PEOPLE.forEach(p => HABITS.forEach(h => { run[p][h.key] = 0; }));

    const dates = [];
    if (SEASON_START <= lastDate) {
        for (let d = SEASON_START; d <= lastDate; d = addDays(d, 1)) {
            if (!isWeekend(d)) dates.push(d);
        }
    }

    // Streak de antes de hoje — usado para não zerar o foguinho no meio do dia
    let runBeforeToday = null;

    for (const date of dates) {
        if (date === todayDate) {
            runBeforeToday = { guilherme: { ...run.guilherme }, luana: { ...run.luana } };
        }

        const st = (date === liveDate) ? (liveState || {}) : stateOf(history[date]);
        const entry = {};

        PEOPLE.forEach(p => {
            const s = st[p] || {};
            const g = GOALS[p];
            let base = 0, streakBonus = 0;

            HABITS.forEach(h => {
                if (habitDone(h.key, s, g)) {
                    base += BOTTLE_RULES.perHabit;
                    run[p][h.key]++;
                    streakBonus += streakAward(run[p][h.key]);
                } else {
                    run[p][h.key] = 0;
                }
            });

            const bonus = (base === HABITS.length * BOTTLE_RULES.perHabit) ? BOTTLE_RULES.perfectDay : 0;
            const total = base + bonus + streakBonus;

            entry[p] = { base, bonus, streak: streakBonus, total };
            totals[p] += total;
        });

        entry.winner = entry.guilherme.total > entry.luana.total ? 'guilherme'
                     : entry.luana.total > entry.guilherme.total ? 'luana'
                     : 'empate';
        days[date] = entry;
    }

    // Foguinho exibido: se hoje é dia útil e o hábito ainda não foi feito,
    // mostra o streak que vem de ontem marcado como "em risco".
    const todayCounted = dates.length > 0 && dates[dates.length - 1] === todayDate;
    PEOPLE.forEach(p => HABITS.forEach(h => {
        const current = run[p][h.key];
        if (current > 0) {
            streaks[p][h.key] = { count: current, atRisk: false };
        } else if (todayCounted && runBeforeToday && runBeforeToday[p][h.key] > 0) {
            streaks[p][h.key] = { count: runBeforeToday[p][h.key], atRisk: true };
        } else {
            streaks[p][h.key] = { count: 0, atRisk: false };
        }
    }));

    return { totals, days, streaks, dates };
}

// Quem deve garrafinhas para quem
function balanceOf(totals) {
    const g = totals.guilherme || 0;
    const l = totals.luana     || 0;
    if (g === l) return { debtor: null, creditor: null, amount: 0 };
    return g < l
        ? { debtor: 'guilherme', creditor: 'luana',     amount: l - g }
        : { debtor: 'luana',     creditor: 'guilherme', amount: g - l };
}

// ── Ícone da garrafinha (SVG inline, injetado uma vez por página) ──
const BOTTLE_SPRITE = `
<svg width="0" height="0" style="position:absolute" aria-hidden="true">
  <symbol id="bottle-icon" viewBox="0 0 24 24">
    <rect x="9.5" y="1.2" width="5" height="2.9" rx="1" fill="#bae6fd"/>
    <rect x="10.6" y="4" width="2.8" height="1.7" fill="#7dd3fc" opacity=".6"/>
    <rect x="6.5" y="5.3" width="11" height="17.4" rx="3.7"
          fill="#38bdf8" fill-opacity=".16" stroke="#7dd3fc" stroke-width="1.1"/>
    <path d="M6.5 12.6h11v6.4a3.7 3.7 0 0 1-3.7 3.7h-3.6a3.7 3.7 0 0 1-3.7-3.7z" fill="#38bdf8"/>
    <path d="M6.5 12.6c1.4 0 1.4 1.1 2.75 1.1S10.65 12.6 12 12.6s1.4 1.1 2.75 1.1S16.1 12.6 17.5 12.6v1.4c-1.4 0-1.4 1.1-2.75 1.1S13.35 14 12 14s-1.4 1.1-2.75 1.1S7.9 14 6.5 14z"
          fill="#7dd3fc" opacity=".55"/>
    <rect x="8.4" y="7.6" width="1.5" height="4.2" rx=".75" fill="#e0f2fe" opacity=".55"/>
  </symbol>
</svg>`;

function injectBottleSprite() {
    if (document.getElementById('bottle-icon')) return;
    const holder = document.createElement('div');
    holder.innerHTML = BOTTLE_SPRITE;
    document.body.insertBefore(holder.firstElementChild, document.body.firstChild);
}

function bottleIcon(extraClass) {
    return `<svg class="bottle-ico ${extraClass || ''}"><use href="#bottle-icon"></use></svg>`;
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectBottleSprite);
} else {
    injectBottleSprite();
}
