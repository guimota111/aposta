// Firebase, temporada, metas e regras de garrafinhas vivem em config.js
// (carregado antes deste arquivo).

// Espelho local do estado Firebase (atualizado pelo listener)
const state = {
    guilherme: emptyPerson(),
    luana:     emptyPerson()
};

let history          = {};
let lastFirebaseData = null;

function effectiveStudySeconds(person) {
    return effStudySeconds(state[person]);
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

function updateStudy(person, seconds) {
    const s      = state[person];
    const newVal = Math.max(0, Math.min(GOALS[person].studySeconds, effectiveStudySeconds(person) + seconds));
    fbUpdate(person, s.timerRunning
        ? { studySeconds: newVal, timerStartedAt: Date.now() }
        : { studySeconds: newVal });
}

function updateBookPages(person, delta) {
    const val = Math.max(0, Math.min(GOALS[person].bookPages, (state[person].bookPages || 0) + delta));
    fbUpdate(person, { bookPages: val });
}

// Passos: valor absoluto do dia (mesma semântica do endpoint do atalho).
// Não limita na meta — 14 mil passos aparecem como 14 mil.
function saveSteps(person) {
    const input = document.getElementById(`${PREFIX[person]}-steps-input`);
    const raw   = (input.value || '').trim();
    if (raw === '') return;
    const val = Math.max(0, Math.round(Number(raw)));
    if (!Number.isFinite(val)) return;
    fbUpdate(person, { steps: val });
    input.blur();
}

function toggleFlag(person, field) {
    fbUpdate(person, { [field]: !state[person][field] });
}

function toggleTimer(person) {
    const s = state[person];
    if (s.timerRunning) {
        const elapsed = s.timerStartedAt ? Math.floor((Date.now() - s.timerStartedAt) / 1000) : 0;
        const total   = Math.min((s.studySeconds || 0) + elapsed, GOALS[person].studySeconds);
        fbUpdate(person, { timerRunning: false, timerStartedAt: null, studySeconds: total });
    } else {
        if (effectiveStudySeconds(person) >= GOALS[person].studySeconds) return;
        fbUpdate(person, { timerRunning: true, timerStartedAt: Date.now() });
    }
}

// ── Virada de dia ──────────────────────────────────────────
// Fecha o dia anterior no histórico e zera o estado. As garrafinhas não são
// gravadas: o placar é sempre recalculado a partir do histórico.
function checkAndCloseDay(data) {
    if (!data.date || data.date === todayStr()) return;

    const oldDate = data.date;
    const fbState = data.state || {};

    ROOT.child('date').transaction(currentDate => {
        if (currentDate !== oldDate) return undefined;
        return todayStr();
    }, (error, committed) => {
        if (error || !committed) return;

        ROOT.update({
            [`history/${oldDate}`]: { result: dayWinner(oldDate, fbState), state: fbState },
            state: EMPTY_STATE
        });
    });
}

// ── Troca de temporada (zera placar) ──────────────────────
function checkSeason(data) {
    // Congela a chave antiga: é o que impede uma aba com a versão anterior
    // do site de achar que virou a temporada e zerar o dia em andamento.
    if (data[LEGACY_SEASON_KEY] !== LEGACY_SEASON_VALUE) {
        ROOT.child(LEGACY_SEASON_KEY).set(LEGACY_SEASON_VALUE);
    }

    if (data[SEASON_KEY] === CURRENT_SEASON) return;

    ROOT.child(SEASON_KEY).transaction(currentSeason => {
        if (currentSeason === CURRENT_SEASON) return undefined;
        return CURRENT_SEASON;
    }, (error, committed) => {
        if (error || !committed) return;

        // NUNCA apagar um dia em andamento. Se o estado já é de hoje, ele
        // pertence à temporada nova e tem que sobreviver à troca — senão uma
        // aba com a versão antiga do site (que aponta para outra temporada)
        // fica zerando o dia toda vez que carrega.
        // O histórico antigo continua no banco: fora da janela da temporada
        // ele não conta garrafinhas nem aparece no calendário.
        if (data.date === todayStr()) return;

        ROOT.update({
            state: EMPTY_STATE,
            date:  todayStr()
        });
    });
}

// ── Listener Firebase (tempo real) ────────────────────────
function startListening() {
    ROOT.on('value', snapshot => {
        const data = snapshot.val();

        if (!data) {
            ROOT.set({
                [SEASON_KEY]:        CURRENT_SEASON,
                [LEGACY_SEASON_KEY]: LEGACY_SEASON_VALUE,
                date:                todayStr(),
                state:               EMPTY_STATE
            });
            return;
        }

        lastFirebaseData = data;

        checkSeason(data);
        checkAndCloseDay(data);

        PEOPLE.forEach(p => {
            if (data.state && data.state[p]) Object.assign(state[p], data.state[p]);
        });

        history = data.history || {};

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

function fmtNum(n) {
    return (n || 0).toLocaleString('pt-BR');
}

function renderStreak(elId, info) {
    const el = document.getElementById(elId);
    if (!el) return;
    const count = info ? info.count : 0;
    if (count < 2) {
        el.style.display = 'none';
        el.textContent   = '';
        return;
    }
    el.style.display = '';
    el.textContent   = `🔥 ${count}`;
    el.classList.toggle('streak-hot',  count % BOTTLE_RULES.streakBlock === 0 && !info.atRisk);
    el.classList.toggle('streak-risk', !!info.atRisk);
    el.title = info.atRisk
        ? `Streak de ${count} dias — ainda não fez hoje!`
        : `${count} dias úteis seguidos`;
}

// ── Render ────────────────────────────────────────────────
function render() {
    const today = todayStr();

    document.getElementById('seasonBadge').textContent = `🔥 ${SEASON_LABEL}`;
    document.getElementById('currentDate').textContent = new Date().toLocaleDateString('pt-BR', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });

    // `state` pertence ao dia gravado no banco, que só vira quando
    // checkAndCloseDay roda — pode estar um dia atrás por um instante.
    const liveDate = (lastFirebaseData && lastFirebaseData.date) || today;
    const season   = computeSeason(history, state, liveDate, today);

    // ── Placar de garrafinhas ──
    document.getElementById('g-bottles').textContent = season.totals.guilherme;
    document.getElementById('l-bottles').textContent = season.totals.luana;

    const bal     = balanceOf(season.totals);
    const balEl   = document.getElementById('sbBalance');
    if (bal.amount === 0) {
        balEl.innerHTML = `Saldo: <strong>empatado</strong> — ninguém deve nada`;
    } else {
        const word = bal.amount === 1 ? 'garrafinha' : 'garrafinhas';
        balEl.innerHTML = `Saldo: <strong>${NAMES[bal.debtor]}</strong> deve ` +
            `<strong>${bal.amount}</strong> ${bottleIcon()} ${word} a <strong>${NAMES[bal.creditor]}</strong>`;
    }

    PEOPLE.forEach(person => {
        const p        = PREFIX[person];
        const s        = state[person];
        const g        = GOALS[person];
        const effStudy = Math.min(effectiveStudySeconds(person), g.studySeconds);

        if (s.timerRunning && effStudy >= g.studySeconds) {
            s.timerRunning   = false;
            s.timerStartedAt = null;
            s.studySeconds   = g.studySeconds;
            fbUpdate(person, { timerRunning: false, timerStartedAt: null, studySeconds: g.studySeconds });
        }

        // Questões
        const qPct = habitPct('questions', s, g) * 100;
        document.getElementById(`${p}-questions-count`).textContent = s.questions || 0;
        document.getElementById(`${p}-questions-bar`).style.width   = `${qPct}%`;
        document.getElementById(`${p}-questions-task`).classList.toggle('completed', habitDone('questions', s, g));

        // Estudo
        const sPct = habitPct('studySeconds', s, g) * 100;
        document.getElementById(`${p}-study-display`).textContent = `${fmtTime(effStudy)} / 2:00h`;
        document.getElementById(`${p}-study-bar`).style.width     = `${sPct}%`;
        document.getElementById(`${p}-study-task`).classList.toggle('completed', habitDone('studySeconds', s, g));

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
        const wPct = habitPct('water', s, g) * 100;
        document.getElementById(`${p}-water-display`).textContent = fmtWater(s.water || 0);
        document.getElementById(`${p}-water-bar`).style.width     = `${wPct}%`;
        document.getElementById(`${p}-water-task`).classList.toggle('completed', habitDone('water', s, g));

        // Academia
        const gymDone = !!s.gym;
        document.getElementById(`${p}-gym-status`).textContent = gymDone ? 'Fui!' : 'Não fui';
        document.getElementById(`${p}-gym-bar`).style.width    = gymDone ? '100%' : '0%';
        document.getElementById(`${p}-gym-task`).classList.toggle('completed', gymDone);
        const gymBtn = document.getElementById(`${p}-gym-btn`);
        gymBtn.textContent = gymDone ? 'Desfazer' : 'Marcar como feito';
        gymBtn.classList.toggle('gym-done', gymDone);

        // Exercício Aeróbico
        const aerobicDone = !!s.aerobic;
        document.getElementById(`${p}-aerobic-status`).textContent = aerobicDone ? 'Fiz!' : 'Não fiz';
        document.getElementById(`${p}-aerobic-bar`).style.width    = aerobicDone ? '100%' : '0%';
        document.getElementById(`${p}-aerobic-task`).classList.toggle('completed', aerobicDone);
        const aerobicBtn = document.getElementById(`${p}-aerobic-btn`);
        aerobicBtn.textContent = aerobicDone ? 'Desfazer' : 'Marcar como feito';
        aerobicBtn.classList.toggle('gym-done', aerobicDone);

        // Leitura de livro
        const bPct = habitPct('bookPages', s, g) * 100;
        document.getElementById(`${p}-book-count`).textContent = s.bookPages || 0;
        document.getElementById(`${p}-book-bar`).style.width   = `${bPct}%`;
        document.getElementById(`${p}-book-task`).classList.toggle('completed', habitDone('bookPages', s, g));

        // Passos
        const stepsDone = habitDone('steps', s, g);
        const stPct     = habitPct('steps', s, g) * 100;
        document.getElementById(`${p}-steps-display`).textContent = fmtNum(s.steps || 0);
        document.getElementById(`${p}-steps-bar`).style.width     = `${stPct}%`;
        document.getElementById(`${p}-steps-task`).classList.toggle('completed', stepsDone);
        const stepsInput = document.getElementById(`${p}-steps-input`);
        if (document.activeElement !== stepsInput) {
            stepsInput.value = (s.steps || 0) > 0 ? s.steps : '';
        }

        // Meditação
        const medDone = !!s.meditation;
        document.getElementById(`${p}-meditation-status`).textContent = medDone ? 'Meditei!' : 'Não meditei';
        document.getElementById(`${p}-meditation-bar`).style.width    = medDone ? '100%' : '0%';
        document.getElementById(`${p}-meditation-task`).classList.toggle('completed', medDone);
        const medBtn = document.getElementById(`${p}-meditation-btn`);
        medBtn.textContent = medDone ? 'Desfazer' : 'Meditei 10 min ✓';
        medBtn.classList.toggle('gym-done', medDone);

        // Foguinhos
        HABITS.forEach(h => renderStreak(`${p}-${h.id}-streak`, season.streaks[person][h.key]));

        // Garrafinhas do dia em aberto.
        // Dia que não pontua (fim de semana ou fora da temporada) não entra em
        // season.days — aí mostramos quanto teria rendido, sem contar streak,
        // já que streak também não anda nesses dias.
        const dayInfo = season.days[liveDate] ? season.days[liveDate][person] : null;
        const counts  = !!dayInfo;
        const bottles = counts ? dayInfo.total : dayBottles(s, g).subtotal;

        const scoreEl = document.getElementById(`${p}-overall`);
        const noteEl  = document.getElementById(`${p}-overall-note`);
        scoreEl.textContent = bottles;
        noteEl.textContent  = counts ? '' : (isWeekend(liveDate) ? 'teria ganhado' : 'não conta');
        scoreEl.closest('.overall-score').classList.toggle('not-counting', !counts);

        const dayEl = document.getElementById(`${p}-day-bottles`);
        if (!counts) {
            dayEl.innerHTML = isWeekend(liveDate)
                ? `<span class="db-muted">Fim de semana não pontua 🌴</span>`
                : `<span class="db-muted">Fora da temporada</span>`;
        } else {
            const parts = [`${dayInfo.base} de hábito`];
            if (dayInfo.bonus)  parts.push(`+${dayInfo.bonus} dia perfeito`);
            if (dayInfo.streak) parts.push(`+${dayInfo.streak} streak 🔥`);
            dayEl.innerHTML = `<span class="db-detail">${parts.join(' · ')}</span>`;
        }

        // Barra de progresso continua sendo a média dos hábitos
        document.getElementById(`${p}-overall-bar`).style.width = `${overallPct(person)}%`;

        // Garrafinha em cada hábito completado
        HABITS.forEach(h => {
            const el = document.getElementById(`${p}-${h.id}-bottle`);
            if (!el) return;
            const want = habitDone(h.key, s, g) ? 'on' : 'off';
            if (el.dataset.state === want) return;
            el.innerHTML   = want === 'on' ? bottleIcon() : '';
            el.dataset.state = want;
        });
    });

    // Banner de dia perfeito
    const gPct   = overallPct('guilherme');
    const lPct   = overallPct('luana');
    const banner = document.getElementById('winnerBanner');
    const text   = document.getElementById('winnerText');
    const gCard  = document.getElementById('guilherme-card');
    const lCard  = document.getElementById('luana-card');

    if (gPct === 100 && lPct === 100) {
        banner.style.display = 'block';
        text.textContent = '🏆 Os dois fecharam o dia perfeito! +3 garrafinhas para cada.';
        gCard.classList.add('winner'); lCard.classList.add('winner');
    } else if (gPct === 100) {
        banner.style.display = 'block';
        text.textContent = '🏆 Guilherme fechou o dia perfeito! +3 garrafinhas.';
        gCard.classList.add('winner'); lCard.classList.remove('winner');
    } else if (lPct === 100) {
        banner.style.display = 'block';
        text.textContent = '🏆 Luana fechou o dia perfeito! +3 garrafinhas.';
        lCard.classList.add('winner'); gCard.classList.remove('winner');
    } else {
        banner.style.display = 'none';
        gCard.classList.remove('winner'); lCard.classList.remove('winner');
    }
}

// Atualiza display do timer e verifica virada de dia a cada segundo
setInterval(() => {
    if (lastFirebaseData && lastFirebaseData.date !== todayStr()) {
        checkAndCloseDay(lastFirebaseData);
    }
    render();
}, 1000);

// ── Init ──────────────────────────────────────────────────
// Um espaço por hábito para a garrafinha de "completado". Fica aqui em vez de
// no HTML para o desenho do ícone continuar existindo num lugar só (config.js).
function setupTaskBottles() {
    PEOPLE.forEach(person => {
        const p = PREFIX[person];
        HABITS.forEach(h => {
            const info = document.querySelector(`#${p}-${h.id}-task .task-info`);
            if (!info) return;
            const span = document.createElement('span');
            span.className = 'task-bottle';
            span.id        = `${p}-${h.id}-bottle`;
            info.appendChild(span);
        });
    });
}

setupTaskBottles();
startListening();
