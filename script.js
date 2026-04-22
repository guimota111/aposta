const GOALS = {
    guilherme: { questions: 20, studySeconds: 3600, water: 4000 },
    luana:     { questions: 20, studySeconds: 3600, water: 2000 }
};

const state = {
    guilherme: { questions: 0, studySeconds: 0, water: 0, timerRunning: false },
    luana:     { questions: 0, studySeconds: 0, water: 0, timerRunning: false }
};

const timers = { guilherme: null, luana: null };

const STORAGE_KEY = 'aposta_state_v1';
const DATE_KEY    = 'aposta_date_v1';

function todayStr() {
    return new Date().toISOString().split('T')[0];
}

function loadState() {
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
                }
            });
        }
    } else {
        localStorage.setItem(DATE_KEY, todayStr());
        persist();
    }
}

function persist() {
    const toSave = {};
    ['guilherme', 'luana'].forEach(p => {
        toSave[p] = {
            questions:    state[p].questions,
            studySeconds: state[p].studySeconds,
            water:        state[p].water
        };
    });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
}

// ── Actions ──────────────────────────────────────────

function updateQuestions(person, delta) {
    state[person].questions = Math.max(
        0, Math.min(GOALS[person].questions, state[person].questions + delta)
    );
    persist();
    render();
}

function updateWater(person, ml) {
    state[person].water = Math.max(
        0, Math.min(GOALS[person].water, state[person].water + ml)
    );
    persist();
    render();
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
        persist();
        render();
    }, 1000);
    render();
}

// ── Helpers ──────────────────────────────────────────

function fmtTime(secs) {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    const mm = String(m).padStart(2, '0');
    const ss = String(s).padStart(2, '0');
    return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
}

function fmtWater(ml) {
    return ml >= 1000 ? `${(ml / 1000).toFixed(1)}L` : `${ml}ml`;
}

function overallPct(person) {
    const q = state[person].questions    / GOALS[person].questions;
    const s = state[person].studySeconds / GOALS[person].studySeconds;
    const w = state[person].water        / GOALS[person].water;
    return Math.round(Math.min((q + s + w) / 3, 1) * 100);
}

// ── Render ───────────────────────────────────────────

function render() {
    // Date
    document.getElementById('currentDate').textContent = new Date().toLocaleDateString('pt-BR', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });

    const prefix = { guilherme: 'g', luana: 'l' };

    ['guilherme', 'luana'].forEach(person => {
        const p  = prefix[person];
        const s  = state[person];
        const g  = GOALS[person];

        // Questões
        const qPct = Math.min((s.questions / g.questions) * 100, 100);
        document.getElementById(`${p}-questions-count`).textContent = s.questions;
        document.getElementById(`${p}-questions-bar`).style.width   = `${qPct}%`;
        document.getElementById(`${p}-questions-task`).classList.toggle('completed', s.questions >= g.questions);

        // Estudo
        const sPct = Math.min((s.studySeconds / g.studySeconds) * 100, 100);
        document.getElementById(`${p}-study-display`).textContent = `${fmtTime(s.studySeconds)} / 1:00h`;
        document.getElementById(`${p}-study-bar`).style.width     = `${sPct}%`;
        document.getElementById(`${p}-study-task`).classList.toggle('completed', s.studySeconds >= g.studySeconds);

        const btn = document.getElementById(`${p}-timer-btn`);
        if (s.studySeconds >= g.studySeconds) {
            btn.textContent = '✅ Concluído';
            btn.disabled    = true;
            btn.classList.remove('active');
        } else if (s.timerRunning) {
            btn.textContent = '⏸ Pausar';
            btn.disabled    = false;
            btn.classList.add('active');
        } else {
            btn.textContent = '▶ Iniciar';
            btn.disabled    = false;
            btn.classList.remove('active');
        }

        // Água
        const wPct = Math.min((s.water / g.water) * 100, 100);
        document.getElementById(`${p}-water-display`).textContent = fmtWater(s.water);
        document.getElementById(`${p}-water-bar`).style.width     = `${wPct}%`;
        document.getElementById(`${p}-water-task`).classList.toggle('completed', s.water >= g.water);

        // Score geral
        document.getElementById(`${p}-overall`).textContent = `${overallPct(person)}%`;
    });

    // Banner de vencedor
    const gPct   = overallPct('guilherme');
    const lPct   = overallPct('luana');
    const banner = document.getElementById('winnerBanner');
    const text   = document.getElementById('winnerText');
    const gCard  = document.getElementById('guilherme-card');
    const lCard  = document.getElementById('luana-card');

    if (gPct === 100 && lPct === 100) {
        banner.style.display = 'block';
        text.textContent = '🏆 Empate! Os dois completaram tudo hoje!';
        gCard.classList.add('winner');
        lCard.classList.add('winner');
    } else if (gPct === 100) {
        banner.style.display = 'block';
        text.textContent = '🏆 Guilherme completou todas as metas!';
        gCard.classList.add('winner');
        lCard.classList.remove('winner');
    } else if (lPct === 100) {
        banner.style.display = 'block';
        text.textContent = '🏆 Luana completou todas as metas!';
        lCard.classList.add('winner');
        gCard.classList.remove('winner');
    } else {
        banner.style.display = 'none';
        gCard.classList.remove('winner');
        lCard.classList.remove('winner');
    }
}

// ── Modal ────────────────────────────────────────────

function confirmReset() {
    document.getElementById('resetModal').style.display = 'flex';
}

function closeModal() {
    document.getElementById('resetModal').style.display = 'none';
}

function closeModalOutside(e) {
    if (e.target === document.getElementById('resetModal')) closeModal();
}

function resetDay() {
    ['guilherme', 'luana'].forEach(p => {
        if (timers[p]) { clearInterval(timers[p]); timers[p] = null; }
        state[p].questions    = 0;
        state[p].studySeconds = 0;
        state[p].water        = 0;
        state[p].timerRunning = false;
    });
    localStorage.setItem(DATE_KEY, todayStr());
    persist();
    closeModal();
    render();
}

// ── Init ─────────────────────────────────────────────
loadState();
render();
