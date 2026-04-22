// ── Firebase config ────────────────────────────────────────
// Preencha com as credenciais do seu projeto Firebase:
// Console → Project Settings → Your apps → SDK setup and configuration
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

// ── Metas ──────────────────────────────────────────────────
const GOALS = {
    guilherme: { questions: 20, studySeconds: 7200, water: 4000 },
    luana:     { questions: 20, studySeconds: 7200, water: 2500 }
};

// Espelho local do estado Firebase (atualizado pelo listener)
const state = {
    guilherme: { questions: 0, studySeconds: 0, water: 0, gym: false, timerRunning: false, timerStartedAt: null },
    luana:     { questions: 0, studySeconds: 0, water: 0, gym: false, timerRunning: false, timerStartedAt: null }
};

let points = { guilherme: 0, luana: 0 };

function todayStr() {
    return new Date().toISOString().split('T')[0];
}

// ── Segundos efetivos de estudo (inclui timer rodando) ─────
function effectiveStudySeconds(person) {
    const s = state[person];
    if (s.timerRunning && s.timerStartedAt) {
        return s.studySeconds + Math.floor((Date.now() - s.timerStartedAt) / 1000);
    }
    return s.studySeconds || 0;
}

// ── Cálculo de porcentagem ─────────────────────────────────
function calcPct(s, g) {
    const effStudy = (s.timerRunning && s.timerStartedAt)
        ? (s.studySeconds || 0) + Math.floor((Date.now() - s.timerStartedAt) / 1000)
        : (s.studySeconds || 0);
    const q   = Math.min((s.questions || 0) / g.questions,    1);
    const st  = Math.min(effStudy             / g.studySeconds, 1);
    const w   = Math.min((s.water    || 0) / g.water,          1);
    const gym = (s.gym || false) ? 1 : 0;
    return Math.round(((q + st + w + gym) / 4) * 100);
}

function overallPct(person) {
    return calcPct(state[person], GOALS[person]);
}

// ── Escrita no Firebase ────────────────────────────────────
function fbUpdate(person, data) {
    ROOT.child('state').child(person).update(data);
}

// ── Ações ──────────────────────────────────────────────────
function updateQuestions(person, delta) {
    const val = Math.max(0, Math.min(GOALS[person].questions, (state[person].questions || 0) + delta));
    fbUpdate(person, { questions: val });
}

function updateWater(person, ml) {
    const val = Math.max(0, Math.min(GOALS[person].water, (state[person].water || 0) + ml));
    fbUpdate(person, { water: val });
}

function toggleGym(person) {
    fbUpdate(person, { gym: !state[person].gym });
}

function toggleTimer(person) {
    const s = state[person];
    if (s.timerRunning) {
        // Pausa: salva os segundos acumulados
        const elapsed = s.timerStartedAt ? Math.floor((Date.now() - s.timerStartedAt) / 1000) : 0;
        const total   = Math.min((s.studySeconds || 0) + elapsed, GOALS[person].studySeconds);
        fbUpdate(person, { timerRunning: false, timerStartedAt: null, studySeconds: total });
    } else {
        if (effectiveStudySeconds(person) >= GOALS[person].studySeconds) return;
        fbUpdate(person, { timerRunning: true, timerStartedAt: Date.now() });
    }
}

// ── Virada de dia e pontuação ──────────────────────────────
// Usa transaction no campo 'date' para garantir que apenas UM browser
// contabilize o vencedor e resete o estado (evita corrida entre browsers).
function checkAndAwardPoints(data) {
    if (!data.date || data.date === todayStr()) return;

    const oldDate  = data.date;
    const fbState  = data.state  || {};
    const fbPoints = data.points || { guilherme: 0, luana: 0 };

    ROOT.child('date').transaction(currentDate => {
        if (currentDate !== oldDate) return undefined; // já foi tratado
        return todayStr();
    }, (error, committed) => {
        if (error || !committed) return;

        const gPct = calcPct(fbState.guilherme || {}, GOALS.guilherme);
        const lPct = calcPct(fbState.luana     || {}, GOALS.luana);

        const newPoints = {
            guilherme: fbPoints.guilherme || 0,
            luana:     fbPoints.luana     || 0
        };
        let dayResult = 'empate';
        if (gPct > lPct)      { newPoints.guilherme++; dayResult = 'guilherme'; }
        else if (lPct > gPct) { newPoints.luana++;     dayResult = 'luana';     }

        ROOT.update({
            [`history/${oldDate}`]: dayResult,
            state: {
                guilherme: { questions: 0, studySeconds: 0, water: 0, gym: false, timerRunning: false, timerStartedAt: null },
                luana:     { questions: 0, studySeconds: 0, water: 0, gym: false, timerRunning: false, timerStartedAt: null }
            },
            points: newPoints
        });
    });
}

// ── Listener Firebase (tempo real) ────────────────────────
function startListening() {
    ROOT.on('value', snapshot => {
        const data = snapshot.val();

        if (!data) {
            // Primeira vez: inicializa o banco
            ROOT.set({
                date:  todayStr(),
                state: {
                    guilherme: { questions: 0, studySeconds: 0, water: 0, gym: false, timerRunning: false, timerStartedAt: null },
                    luana:     { questions: 0, studySeconds: 0, water: 0, gym: false, timerRunning: false, timerStartedAt: null }
                },
                points: { guilherme: 0, luana: 0 }
            });
            return;
        }

        checkAndAwardPoints(data);

        ['guilherme', 'luana'].forEach(p => {
            if (data.state && data.state[p]) {
                Object.assign(state[p], data.state[p]);
            }
        });

        if (data.points) points = data.points;

        render();
    });
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

    document.getElementById('g-points').textContent = points.guilherme || 0;
    document.getElementById('l-points').textContent = points.luana     || 0;

    const prefix = { guilherme: 'g', luana: 'l' };

    ['guilherme', 'luana'].forEach(person => {
        const p        = prefix[person];
        const s        = state[person];
        const g        = GOALS[person];
        const effStudy = Math.min(effectiveStudySeconds(person), g.studySeconds);

        // Auto-para o timer quando bate a meta (qualquer browser detecta)
        if (s.timerRunning && effStudy >= g.studySeconds) {
            state[person].timerRunning   = false;
            state[person].timerStartedAt = null;
            state[person].studySeconds   = g.studySeconds;
            fbUpdate(person, { timerRunning: false, timerStartedAt: null, studySeconds: g.studySeconds });
        }

        // Questões
        const qPct = Math.min(((s.questions || 0) / g.questions) * 100, 100);
        document.getElementById(`${p}-questions-count`).textContent = s.questions || 0;
        document.getElementById(`${p}-questions-bar`).style.width   = `${qPct}%`;
        document.getElementById(`${p}-questions-task`).classList.toggle('completed', (s.questions || 0) >= g.questions);

        // Estudo
        const sPct = Math.min((effStudy / g.studySeconds) * 100, 100);
        document.getElementById(`${p}-study-display`).textContent = `${fmtTime(effStudy)} / 2:00h`;
        document.getElementById(`${p}-study-bar`).style.width     = `${sPct}%`;
        document.getElementById(`${p}-study-task`).classList.toggle('completed', effStudy >= g.studySeconds);

        const timerBtn = document.getElementById(`${p}-timer-btn`);
        if (effStudy >= g.studySeconds) {
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
        const wPct = Math.min(((s.water || 0) / g.water) * 100, 100);
        document.getElementById(`${p}-water-display`).textContent = fmtWater(s.water || 0);
        document.getElementById(`${p}-water-bar`).style.width     = `${wPct}%`;
        document.getElementById(`${p}-water-task`).classList.toggle('completed', (s.water || 0) >= g.water);

        // Academia
        const gymDone = !!s.gym;
        document.getElementById(`${p}-gym-status`).textContent = gymDone ? 'Fui! ✅' : 'Não fui';
        document.getElementById(`${p}-gym-bar`).style.width    = gymDone ? '100%' : '0%';
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
    const gPct   = overallPct('guilherme');
    const lPct   = overallPct('luana');
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

// Atualiza o display do timer a cada segundo sem escrever no Firebase
setInterval(render, 1000);

// ── Modal ─────────────────────────────────────────────────
function confirmReset() { document.getElementById('resetModal').style.display = 'flex'; }
function closeModal()    { document.getElementById('resetModal').style.display = 'none'; }
function closeModalOutside(e) {
    if (e.target === document.getElementById('resetModal')) closeModal();
}

function resetDay() {
    ROOT.update({
        date:  todayStr(),
        state: {
            guilherme: { questions: 0, studySeconds: 0, water: 0, gym: false, timerRunning: false, timerStartedAt: null },
            luana:     { questions: 0, studySeconds: 0, water: 0, gym: false, timerRunning: false, timerStartedAt: null }
        }
    });
    closeModal();
}

// ── Init ──────────────────────────────────────────────────
startListening();
