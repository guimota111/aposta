const GOALS = {
    guilherme: { questions: 20, studySeconds: 7200, water: 4000 },
    luana:     { questions: 20, studySeconds: 7200, water: 2500 }
};

const state = {
    guilherme: { questions: 0, studySeconds: 0, water: 0, gym: false, timerRunning: false },
    luana:     { questions: 0, studySeconds: 0, water: 0, gym: false, timerRunning: false }
};

const timers = { guilherme: null, luana: null };

const STORAGE_KEY = 'aposta_state_v2';
const DATE_KEY    = 'aposta_date_v2';
const POINTS_KEY  = 'aposta_points_v1';

function todayStr() {
    return new Date().toISOString().split('T')[0];
}

// ── Points ────────────────────────────────────────────────
function loadPoints() {
    const raw = localStorage.getItem(POINTS_KEY);
    return raw ? JSON.parse(raw) : { guilherme: 0, luana: 0 };
}

function savePoints(pts) {
    localStorage.setItem(POINTS_KEY, JSON.stringify(pts));
}

// ── Percentage (pure, works on any state snapshot) ────────
function calcPct(s, g) {
    const q   = Math.min((s.questions    || 0) / g.questions,    1);
    const st  = Math.min((s.studySeconds || 0) / g.studySeconds, 1);
    const w   = Math.min((s.water        || 0) / g.water,        1);
    const gym = (s.gym || false) ? 1 : 0;
    return Math.round(((q + st + w + gym) / 4) * 100);
}

function overallPct(person) {
    return calcPct(state[person], GOALS[person]);
}

// ── Award points when a new day is detected ───────────────
function checkAndAwardPoints() {
    const savedDate = localStorage.getItem(DATE_KEY);
    if (!savedDate || savedDate === todayStr()) return;

    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;

    const saved = JSON.parse(raw);
    const gPct  = calcPct(saved.guilherme || {}, GOALS.guilherme);
    const lPct  = calcPct(saved.luana     || {}, GOALS.luana);

    if (gPct === lPct) return; // empate, sem ponto

    const pts = loadPoints();
    if (gPct > lPct) pts.guilherme++;
    else             pts.luana++;
    savePoints(pts);
}

// ── State persistence ─────────────────────────────────────
function persist() {
    const toSave = {};
    ['guilherme', 'luana'].forEach(p => {
        toSave[p] = {
            questions:    state[p].questions,
            studySeconds: state[p].studySeconds,
            water:        state[p].water,
            gym:          state[p].gym
        };
    });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
}

function loadState() {
    checkAndAwardPoints();

    const savedDate = localStorage.getItem(DATE_KEY);
    if (savedDate === todayStr()) {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
            const saved = JSON.parse(raw);
            ['guilherme', 'luana'].forEach(p => {
                if (saved[p]) {
                    state[p].questions    = saved[p].questions    || 0;
                    state[p].studySeconds = saved[p].studySeconds || 0;
                    state[p].water        = saved[p].water        || 0;
                    state[p].gym          = saved[p].gym          || false;
                }
            });
        }
    } else {
        localStorage.setItem(DATE_KEY, todayStr());
        persist();
    }
}

// ── Actions ───────────────────────────────────────────────
function updateQuestions(person, delta) {
    state[person].questions = Math.max(0, Math.min(GOALS[person].questions, state[person].questions + delta));
    persist(); render();
}

function updateWater(person, ml) {
    state[person].water = Math.max(0, Math.min(GOALS[person].water, state[person].water + ml));
    persist(); render();
}

function toggleGym(person) {
    state[person].gym = !state[person].gym;
    persist(); render();
}

function toggleTimer(person) {
    if (state[person].timerRunning) {
        clearInterval(timers[person]);
        timers[person] = null;
        state[person].timerRunning = false;
        render();
        return;
    }
    if (state[person].studySeconds >= GOALS[person].studySeconds) return;
    state[person].timerRunning = true;
    timers[person] = setInterval(() => {
        state[person].studySeconds++;
        if (state[person].studySeconds >= GOALS[person].studySeconds) {
            clearInterval(timers[person]);
            timers[person] = null;
            state[person].timerRunning = false;
        }
        persist(); render();
    }, 1000);
    render();
}

// ── Helpers ───────────────────────────────────────────────
function fmtTime(secs) {
    const h  = Math.floor(secs / 3600);
    const m  = Math.floor((secs % 3600) / 60);
    const s  = secs % 60;
    const mm = String(m).padStart(2, '0');
    const ss = String(s).padStart(2, '0');
    return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
}

function fmtWater(ml) {
    return ml >= 1000 ? `${(ml / 1000).toFixed(1)}L` : `${ml}ml`;
}

// ── Render ────────────────────────────────────────────────
function render() {
    document.getElementById('currentDate').textContent = new Date().toLocaleDateString('pt-BR', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });

    const pts = loadPoints();
    document.getElementById('g-points').textContent = pts.guilherme;
    document.getElementById('l-points').textContent = pts.luana;

    const prefix     = { guilherme: 'g', luana: 'l' };

    ['guilherme', 'luana'].forEach(person => {
        const p = prefix[person];
        const s = state[person];
        const g = GOALS[person];

        // Questões
        const qPct = Math.min((s.questions / g.questions) * 100, 100);
        document.getElementById(`${p}-questions-count`).textContent = s.questions;
        document.getElementById(`${p}-questions-bar`).style.width   = `${qPct}%`;
        document.getElementById(`${p}-questions-task`).classList.toggle('completed', s.questions >= g.questions);

        // Estudo
        const sPct = Math.min((s.studySeconds / g.studySeconds) * 100, 100);
        document.getElementById(`${p}-study-display`).textContent = `${fmtTime(s.studySeconds)} / 2:00h`;
        document.getElementById(`${p}-study-bar`).style.width     = `${sPct}%`;
        document.getElementById(`${p}-study-task`).classList.toggle('completed', s.studySeconds >= g.studySeconds);

        const timerBtn = document.getElementById(`${p}-timer-btn`);
        if (s.studySeconds >= g.studySeconds) {
            timerBtn.textContent = '✅ Concluído';
            timerBtn.disabled    = true;
            timerBtn.classList.remove('active');
        } else if (s.timerRunning) {
            timerBtn.textContent = '⏸ Pausar';
            timerBtn.disabled    = false;
            timerBtn.classList.add('active');
        } else {
            timerBtn.textContent = '▶ Iniciar';
            timerBtn.disabled    = false;
            timerBtn.classList.remove('active');
        }

        // Água
        const wPct = Math.min((s.water / g.water) * 100, 100);
        document.getElementById(`${p}-water-display`).textContent = fmtWater(s.water);
        document.getElementById(`${p}-water-bar`).style.width     = `${wPct}%`;
        document.getElementById(`${p}-water-task`).classList.toggle('completed', s.water >= g.water);

        // Academia
        const gymDone = s.gym;
        document.getElementById(`${p}-gym-status`).textContent  = gymDone ? 'Fui! ✅' : 'Não fui';
        document.getElementById(`${p}-gym-bar`).style.width     = gymDone ? '100%' : '0%';
        document.getElementById(`${p}-gym-task`).classList.toggle('completed', gymDone);
        const gymBtn = document.getElementById(`${p}-gym-btn`);
        gymBtn.textContent = gymDone ? 'Desfazer' : 'Marcar como feito';
        gymBtn.classList.toggle('gym-done', gymDone);

        // Score geral
        const overall = overallPct(person);
        document.getElementById(`${p}-overall`).textContent     = `${overall}%`;
        document.getElementById(`${p}-overall-bar`).style.width = `${overall}%`;
    });

    // Banner de vencedor do dia
    const gPct  = overallPct('guilherme');
    const lPct  = overallPct('luana');
    const banner = document.getElementById('winnerBanner');
    const text   = document.getElementById('winnerText');
    const gCard  = document.getElementById('guilherme-card');
    const lCard  = document.getElementById('luana-card');

    if (gPct === 100 && lPct === 100) {
        banner.style.display = 'block';
        text.textContent = '🏆 Empate! Os dois completaram tudo hoje!';
        gCard.classList.add('winner'); lCard.classList.add('winner');
    } else if (gPct === 100) {
        banner.style.display = 'block';
        text.textContent = '🏆 Guilherme completou todas as metas!';
        gCard.classList.add('winner'); lCard.classList.remove('winner');
    } else if (lPct === 100) {
        banner.style.display = 'block';
        text.textContent = '🏆 Luana completou todas as metas!';
        lCard.classList.add('winner'); gCard.classList.remove('winner');
    } else {
        banner.style.display = 'none';
        gCard.classList.remove('winner'); lCard.classList.remove('winner');
    }
}

// ── Modal ─────────────────────────────────────────────────
function confirmReset() { document.getElementById('resetModal').style.display = 'flex'; }
function closeModal()    { document.getElementById('resetModal').style.display = 'none'; }
function closeModalOutside(e) {
    if (e.target === document.getElementById('resetModal')) closeModal();
}

function resetDay() {
    ['guilherme', 'luana'].forEach(p => {
        if (timers[p]) { clearInterval(timers[p]); timers[p] = null; }
        state[p].questions    = 0;
        state[p].studySeconds = 0;
        state[p].water        = 0;
        state[p].gym          = false;
        state[p].timerRunning = false;
    });
    localStorage.setItem(DATE_KEY, todayStr());
    persist();
    closeModal();
    render();
}

// ── Init ──────────────────────────────────────────────────
loadState();
render();
