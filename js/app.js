let showSeconds = true;

function createDigitHTML(id) {
    return `
        <div id="${id}" class="flip-unit">
            <div class="plate plate-top"><div class="digit-text">0</div></div>
            <div class="plate plate-bottom"><div class="digit-text">0</div></div>
            <div class="flap">
                <div class="flap-front plate-top"><div class="digit-text">0</div></div>
                <div class="flap-back plate-bottom"><div class="digit-text">0</div></div>
            </div>
        </div>`;
}

const clockIds = ['c-h1', 'c-h2', 'c-m1', 'c-m2', 'c-s1', 'c-s2'];
const timerIds = ['t-h1', 't-h2', 't-m1', 't-m2', 't-s1', 't-s2'];

const clockContainer = document.getElementById('clock-digits');
const timerContainer = document.getElementById('timer-digits');

clockIds.forEach((id, i) => {
    clockContainer.innerHTML += createDigitHTML(id);
    if (i === 1) clockContainer.innerHTML += `<div id="sep-hm" class="sep"><div>•</div><div>•</div></div>`;
    if (i === 3) clockContainer.innerHTML += `<div id="sep-ms" class="sep"><div>•</div><div>•</div></div>`;
});
timerIds.forEach((id, i) => {
    timerContainer.innerHTML += createDigitHTML(id);
    if (i === 1) timerContainer.innerHTML += `<div id="sep-t-hm" class="sep"><div>•</div><div>•</div></div>`;
    if (i === 3) timerContainer.innerHTML += `<div id="sep-t-ms" class="sep"><div>•</div><div>•</div></div>`;
});

function flipTo(elementId, nextValue) {
    const unit = document.getElementById(elementId);
    if (!unit) return;

    const bottomStatic = unit.querySelector('.plate-bottom .digit-text');

    // Guard against re-triggering the same flip. The bottom plate isn't
    // committed until 300ms into the animation, so at sub-second poll
    // rates we track the in-flight target synchronously via dataset
    // instead of reading the (still-old) bottom plate.
    const currentValue = unit.dataset.val !== undefined ? unit.dataset.val : bottomStatic.textContent;
    if (currentValue === nextValue) return;
    unit.dataset.val = nextValue;

    const topStatic = unit.querySelector('.plate-top .digit-text');
    const flap = unit.querySelector('.flap');
    const flapFront = unit.querySelector('.flap-front .digit-text');
    const flapBack = unit.querySelector('.flap-back .digit-text');

    topStatic.textContent = nextValue;
    flapFront.textContent = currentValue;
    flapBack.textContent = nextValue;

    flap.classList.remove('flipping');

    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            flap.classList.add('flipping');
        });
    });

    setTimeout(() => {
        bottomStatic.textContent = nextValue;
    }, 300);
}

function updateClock() {
    const now = new Date();
    const time = [
        String(now.getHours()).padStart(2, '0'),
        String(now.getMinutes()).padStart(2, '0'),
        String(now.getSeconds()).padStart(2, '0')
    ].join('').split('');

    clockIds.forEach((id, i) => {
        if (showSeconds || i < 4) {
            flipTo(id, time[i]);
        }
    });
    document.getElementById('date-display').textContent = now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }).toUpperCase();
    clockContainer.setAttribute('aria-label', `Current time ${time.slice(0, 2).join('')}:${time.slice(2, 4).join('')}`);
}
setInterval(updateClock, 1000);
updateClock();

function toggleSeconds() {
    showSeconds = !showSeconds;
    const btn = document.getElementById('toggle-seconds');
    const clockSUnits = [document.getElementById('c-s1'), document.getElementById('c-s2'), document.getElementById('sep-ms')];
    const timerSUnits = [document.getElementById('t-s1'), document.getElementById('t-s2'), document.getElementById('sep-t-ms')];

    btn.classList.toggle('active', showSeconds);
    btn.setAttribute('aria-pressed', String(showSeconds));
    clockSUnits.forEach(el => el.classList.toggle('hidden', !showSeconds));
    timerSUnits.forEach(el => el.classList.toggle('hidden', !showSeconds));
    document.body.classList.toggle('hide-seconds', !showSeconds);

    updateClock();
    refreshTimerUI();
}

let timerInt, timeLeft = 0, isPaused = false, timerDuration = 0, endTime = 0;
let wakeLock = null;

// --- Configurable time-warning checkpoints (research: predictable,
// instructor-chosen checkpoints beat a single late alarm) ---
let warningCheckpointsMin = (() => {
    try {
        const saved = JSON.parse(localStorage.getItem('warning_checkpoints'));
        if (Array.isArray(saved) && saved.length > 0) return saved;
    } catch (e) { /* fall through to default */ }
    return [5, 1];
})();
let warnedCheckpoints = new Set();

function saveWarningCheckpoints() {
    localStorage.setItem('warning_checkpoints', JSON.stringify(warningCheckpointsMin));
}

function renderWarningCheckpoints() {
    const list = document.getElementById('warning-checkpoints-list');
    if (!list) return;
    list.innerHTML = '';
    warningCheckpointsMin.slice().sort((a, b) => b - a).forEach(min => {
        const chip = document.createElement('span');
        chip.className = 'checkpoint-chip';
        const label = document.createElement('span');
        label.textContent = `${min} min`;
        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.textContent = '×';
        removeBtn.setAttribute('aria-label', `Remove ${min} minute warning`);
        removeBtn.onclick = () => removeWarningCheckpoint(min);
        chip.appendChild(label);
        chip.appendChild(removeBtn);
        list.appendChild(chip);
    });
}

function addWarningCheckpoint() {
    const input = document.getElementById('warning-checkpoint-input');
    const val = parseFloat(input.value);
    if (!val || val <= 0) return;
    if (!warningCheckpointsMin.includes(val)) {
        warningCheckpointsMin.push(val);
        saveWarningCheckpoints();
        renderWarningCheckpoints();
    }
    input.value = '';
}

function removeWarningCheckpoint(min) {
    const next = warningCheckpointsMin.filter(m => m !== min);
    warningCheckpointsMin = next.length > 0 ? next : [1];
    saveWarningCheckpoints();
    renderWarningCheckpoints();
}

// Self-contained beep via the Web Audio API — no external sound file,
// so the alarm still works with no network. The context is unlocked on
// the (user-gesture) Start click so later beeps are allowed to play.
let audioCtx = null;
function initAudio() {
    try {
        audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === 'suspended') audioCtx.resume();
    } catch (e) { /* Web Audio unavailable */ }
}
function playBeep(times = 1) {
    if (!audioCtx) initAudio();
    if (!audioCtx) return;
    if (audioCtx.state === 'suspended') audioCtx.resume();
    for (let i = 0; i < times; i++) {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        const start = audioCtx.currentTime + i * 0.28;
        osc.type = 'sine';
        osc.frequency.value = 880;
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(0.4, start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.22);
        osc.connect(gain).connect(audioCtx.destination);
        osc.start(start);
        osc.stop(start + 0.24);
    }
}

// --- Screen Wake Lock: keep the display awake while a timer runs ---
function setWakeStatus(on) {
    const pill = document.getElementById('wake-status');
    if (pill) pill.style.opacity = on ? '1' : '0';
}
async function requestWakeLock() {
    try {
        if ('wakeLock' in navigator) {
            wakeLock = await navigator.wakeLock.request('screen');
            setWakeStatus(true);
            wakeLock.addEventListener('release', () => setWakeStatus(false));
        }
    } catch (e) {
        setWakeStatus(false);
    }
}
function releaseWakeLock() {
    if (wakeLock) {
        wakeLock.release().catch(() => { });
        wakeLock = null;
    }
    setWakeStatus(false);
}
// Wake locks drop when the tab is hidden; re-acquire on return if still running.
document.addEventListener('visibilitychange', () => {
    const running = !document.getElementById('timer-running').classList.contains('hidden');
    if (document.visibilityState === 'visible' && running && !wakeLock) {
        requestWakeLock();
    }
});

// --- Persist a running timer so a reload/crash can resume it ---
function persistTimerState() {
    if (timeLeft > 0) {
        localStorage.setItem('timer_state', JSON.stringify({ endTime, timerDuration, isPaused, timeLeft }));
    }
}
function clearTimerState() {
    localStorage.removeItem('timer_state');
}
function maybeResumeTimer() {
    let s;
    try { s = JSON.parse(localStorage.getItem('timer_state')); } catch (e) { s = null; }
    if (!s) return;
    const remaining = s.isPaused ? s.timeLeft : Math.round((s.endTime - Date.now()) / 1000);
    if (!remaining || remaining <= 0) { clearTimerState(); return; }
    showConfirmModal({
        title: 'Resume timer?',
        message: `A timer was interrupted with ${formatTime(remaining)} remaining.`,
        confirmLabel: 'Resume',
        cancelLabel: 'Discard',
        danger: false,
        icon: 'clock',
        onConfirm: () => doResumeTimer(s, remaining),
        onCancel: clearTimerState
    });
}
function doResumeTimer(s, remaining) {
    showTab('timer');
    timerDuration = s.timerDuration;
    timeLeft = remaining;
    isPaused = s.isPaused;
    warnedCheckpoints = new Set(warningCheckpointsMin.filter(min => remaining <= min * 60));
    document.getElementById('timer-setup').classList.add('hidden');
    document.getElementById('progress-bar-container').classList.remove('hidden');
    document.getElementById('timer-digits').classList.remove('hidden');
    document.getElementById('timer-running').classList.remove('hidden');
    document.getElementById('pause-btn').textContent = isPaused ? 'Resume' : 'Pause';
    initAudio();
    requestWakeLock();
    if (isPaused) {
        refreshTimerUI();
        updateProgressBar();
        updateTitle();
    } else {
        runTimer();
    }
    updateQuoteVisibility();
    updateCalmDisplayVisibility();
}

// --- Formatting + tab-title countdown ---
function formatTime(t) {
    const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
    return (h > 0 ? h + ':' : '') + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
}
function formatDurationLabel(t) {
    const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
    const parts = [];
    if (h > 0) parts.push(`${h}h`);
    if (m > 0) parts.push(`${m}m`);
    if (s > 0 || parts.length === 0) parts.push(`${s}s`);
    return parts.join(' ');
}
function updateTitle() {
    const running = !document.getElementById('timer-running').classList.contains('hidden');
    document.title = running
        ? `${isPaused ? '⏸' : '⏳'} ${formatTime(timeLeft)} — Timer`
        : 'macOS Flip Clock & Timer';
}

// --- Interval warnings at each configured checkpoint ---
function checkWarnings() {
    if (warningCheckpointsMin.length === 0 || timeLeft <= 0) return;
    const mostUrgent = Math.min(...warningCheckpointsMin);
    warningCheckpointsMin.forEach(min => {
        const thresholdSec = min * 60;
        if (!warnedCheckpoints.has(min) && timeLeft <= thresholdSec) {
            warnedCheckpoints.add(min);
            playBeep(min === mostUrgent ? 2 : 1);
        }
    });
}

function setPreset(h, m, s) {
    document.getElementById('input-hr').value = String(h).padStart(2, '0');
    document.getElementById('input-min').value = String(m).padStart(2, '0');
    document.getElementById('input-sec').value = String(s).padStart(2, '0');
}

function adjustTime(seconds) {
    const timerRunning = !document.getElementById('timer-running').classList.contains('hidden');
    if (!timerRunning) return;

    if (timeLeft + seconds <= 0) {
        timeLeft = 0;
        endTime = Date.now();
        clearInterval(timerInt);
        handleTimerEnd();
    } else {
        timeLeft += seconds;
        endTime += seconds * 1000;
        if (seconds > 0) {
            timerDuration += seconds;
        }
        // Re-arm warnings if time was added back above a threshold.
        warningCheckpointsMin.forEach(min => {
            if (timeLeft > min * 60) warnedCheckpoints.delete(min);
        });
        refreshTimerUI();
        updateProgressBar();
        updateTitle();
        persistTimerState();
    }
}

// Default rules carry the matching University of Windsor "Policy on
// Conduct of Exams and Tests" reference in [brackets]. Section labels
// are the policy's own headings: "Attendance & ID" and "Exam Process".
const defaultRules = [
    "Find your seat/name (ordered by last name, snaking front-to-back)",
    "Read the cover page and sign it [Attendance & ID §3]",
    "Remove hat/caps — religious head coverings are permitted [Exam Process §13]",
    "Have your IDs on the desk [Attendance & ID §2]",
    "Remain quiet at all times [Exam Process §6–8]",
    "You cannot leave in the first 30 minutes and last 5 minutes [Exam Process §3–4]"
];

const defaultPostRules = [
    "Stop writing immediately and close your exam paper [Exam Process §18]",
    "Remain seated and quiet until all exams are collected [Exam Process §18]",
    "You need to hand in your formula sheet with your exam [Exam Process §19]",
    "Exit the room quietly once dismissed by the proctor [Exam Process §18]"
];

// A single rule-editor implementation, instantiated once for the
// pre-start rules and once for the post-exam rules.
function createRuleEditor(storageKey, containerId, defaults) {
    const editor = { rules: [], storageKey, containerId };
    try {
        const stored = localStorage.getItem(storageKey);
        editor.rules = stored ? JSON.parse(stored) : [...defaults];
    } catch (e) {
        editor.rules = [...defaults];
    }
    return editor;
}

function saveRuleEditor(editor) {
    const container = document.getElementById(editor.containerId);
    if (!container) return;
    const inputs = container.querySelectorAll('.rule-item-input');
    editor.rules = Array.from(inputs).map(i => i.value.trim()).filter(v => v !== '');
    localStorage.setItem(editor.storageKey, JSON.stringify(editor.rules));
    updateRuleCount(editor);
}

// Keep the count badge in a collapsed section's header current.
function updateRuleCount(editor) {
    if (!editor.countId) return;
    const el = document.getElementById(editor.countId);
    if (el) el.textContent = editor.rules.length;
}

function toggleRulesSection(key) {
    const body = document.getElementById(key + '-rules-body');
    const header = document.getElementById(key + '-rules-header');
    if (!body || !header) return;
    const nowHidden = body.classList.toggle('hidden');
    header.classList.toggle('open', !nowHidden);
    header.setAttribute('aria-expanded', String(!nowHidden));
}

function renderRuleEditor(editor) {
    const container = document.getElementById(editor.containerId);
    if (!container) return;
    container.innerHTML = '';
    editor.rules.forEach((rule, idx) => {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'flex items-center space-x-2 w-full group';
        itemDiv.innerHTML = `
            <span class="text-xs font-bold text-gray-500 min-w-[14px]">${idx + 1}.</span>
            <input type="text" class="rule-item-input flex-1" placeholder="Rule instruction..." aria-label="Rule ${idx + 1}">
            <button type="button" class="rule-delete-btn text-red-500 hover:text-red-400 p-1 rounded hover:bg-red-500/10 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100 cursor-pointer" title="Delete Rule" aria-label="Delete rule ${idx + 1}">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="3 6 5 6 21 6"></polyline>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
            </button>
        `;
        const input = itemDiv.querySelector('.rule-item-input');
        // Assign as a property, not via the HTML string, so text like "&amp;" or "<b>" round-trips verbatim.
        input.value = rule;
        input.addEventListener('input', () => saveRuleEditor(editor));
        itemDiv.querySelector('.rule-delete-btn').addEventListener('click', () => deleteRuleFromEditor(editor, idx));
        container.appendChild(itemDiv);
    });
    updateRuleCount(editor);
}

function addRuleToEditor(editor) {
    saveRuleEditor(editor);
    editor.rules.push('');
    renderRuleEditor(editor);
    const container = document.getElementById(editor.containerId);
    if (container) {
        const inputs = container.querySelectorAll('.rule-item-input');
        if (inputs.length > 0) inputs[inputs.length - 1].focus();
    }
}

function deleteRuleFromEditor(editor, idx) {
    saveRuleEditor(editor);
    editor.rules.splice(idx, 1);
    renderRuleEditor(editor);
    saveRuleEditor(editor);
}

const preRules = createRuleEditor('timer_rules', 'rules-input-container', defaultRules);
const postRules = createRuleEditor('timer_post_rules', 'post-rules-input-container', defaultPostRules);
preRules.countId = 'pre-rules-count';
postRules.countId = 'post-rules-count';

// Migrate: replace the old default ID-verification instruction with the formula-sheet one.
const oldIdRuleIdx = postRules.rules.indexOf("Have your ID ready on your desk for verification");
if (oldIdRuleIdx !== -1) {
    postRules.rules[oldIdRuleIdx] = "You need to hand in your formula sheet with your exam";
    localStorage.setItem(postRules.storageKey, JSON.stringify(postRules.rules));
}

// Thin wrappers so the inline HTML onclick handlers keep working.
function addNewRuleInput() { addRuleToEditor(preRules); }
function addNewPostRuleInput() { addRuleToEditor(postRules); }

// Restore both rule lists to the shipped defaults (confirmed first,
// since it discards any custom rules the user has entered).
function resetRulesToDefault() {
    showConfirmModal({
        title: 'Reset rules to default?',
        message: 'Your custom pre-start and post-exam rules will be replaced with the default set.',
        confirmLabel: 'Reset',
        cancelLabel: 'Cancel',
        danger: true,
        icon: 'warning',
        onConfirm: doResetRulesToDefault
    });
}
function doResetRulesToDefault() {
    preRules.rules = [...defaultRules];
    postRules.rules = [...defaultPostRules];
    localStorage.setItem(preRules.storageKey, JSON.stringify(preRules.rules));
    localStorage.setItem(postRules.storageKey, JSON.stringify(postRules.rules));
    renderRuleEditor(preRules);
    renderRuleEditor(postRules);
}

// --- Simple vs. Exam mode ---
// Simple: a bare countdown. Exam: also shows pre-start & post-exam rule
// editors and their presentation screens. The choice is persisted.
let timerMode = localStorage.getItem('timer_mode') === 'exam' ? 'exam' : 'simple';

function applyTimerMode() {
    const isExam = timerMode === 'exam';
    document.getElementById('mode-simple').classList.toggle('active', !isExam);
    document.getElementById('mode-exam').classList.toggle('active', isExam);
    document.getElementById('mode-simple').setAttribute('aria-selected', String(!isExam));
    document.getElementById('mode-exam').setAttribute('aria-selected', String(isExam));
    document.getElementById('timer-setup').classList.toggle('exam-mode', isExam);
    document.getElementById('mode-desc').textContent = isExam
        ? 'For proctored exams — add rules shown before the start and after time is up.'
        : 'A quick countdown — pick a duration and go.';
}

function setTimerMode(mode) {
    timerMode = mode === 'exam' ? 'exam' : 'simple';
    localStorage.setItem('timer_mode', timerMode);
    applyTimerMode();
}

// --- Calm Display: hides the numeric countdown while an exam timer
// runs, leaving only the progress bar (research: exact numeric
// countdowns raise anxiety for test-anxious students more than a
// softer visual does). ---
let calmDisplayEnabled = localStorage.getItem('calm_display_enabled') === 'true';

function applyCalmDisplayToggleUI() {
    const btn = document.getElementById('calm-display-toggle-btn');
    const label = document.getElementById('calm-display-toggle-label');
    if (!btn || !label) return;
    btn.classList.toggle('active', calmDisplayEnabled);
    btn.setAttribute('aria-pressed', String(calmDisplayEnabled));
    label.textContent = `Hide Numbers: ${calmDisplayEnabled ? 'On' : 'Off'}`;
}

function toggleCalmDisplay() {
    calmDisplayEnabled = !calmDisplayEnabled;
    localStorage.setItem('calm_display_enabled', String(calmDisplayEnabled));
    applyCalmDisplayToggleUI();
    updateCalmDisplayVisibility();
    updateCalmProgressVisual();
}

// Keeps the digits/label/progress-visual grouping in sync with both
// the toggle and whether the timer is actually running right now.
// In calm mode the thin top strip hands off to the centered visual
// so there's only ever one progress indicator on screen.
function updateCalmDisplayVisibility() {
    const digits = document.getElementById('timer-digits');
    const label = document.getElementById('calm-display-label');
    const progressVisual = document.getElementById('calm-progress-visual');
    const topBar = document.getElementById('progress-bar-container');
    if (!digits || !label) return;
    const running = !document.getElementById('timer-running').classList.contains('hidden');
    const calmActive = calmDisplayEnabled && running;
    digits.classList.toggle('calm-hide', calmActive);
    label.classList.toggle('visible', calmActive);
    if (progressVisual) progressVisual.classList.toggle('visible', calmActive);
    if (topBar) topBar.classList.toggle('calm-hide', calmActive);
}

// Mirrors the thin top bar's percentage onto the calm-mode visual,
// with a coarse phase caption instead of an exact number — softer
// than a countdown while still showing genuine progress.
function updateCalmProgressVisual() {
    const fill = document.getElementById('calm-progress-fill');
    const caption = document.getElementById('calm-progress-caption');
    if (!fill || !caption) return;
    const percent = timerDuration > 0 ? (timeLeft / timerDuration) * 100 : 0;
    fill.style.width = `${percent}%`;
    fill.style.background = timeLeft <= 60
        ? 'linear-gradient(90deg, #f87171, #ef4444)'
        : (timeLeft <= 300 ? 'linear-gradient(90deg, #fbbf24, #f59e0b)' : 'linear-gradient(90deg, #60a5fa, #3b82f6)');
    let phase = 'Plenty of time left';
    if (percent <= 10) phase = 'Final moments';
    else if (percent <= 33) phase = 'Time is running low';
    else if (percent <= 66) phase = 'About halfway';
    caption.textContent = phase;
}

// --- Accessible Text: higher-contrast, wider-spaced rules screens ---
let a11yTextEnabled = localStorage.getItem('a11y_text_enabled') === 'true';

function applyA11yTextUI() {
    const btn = document.getElementById('a11y-text-toggle-btn');
    const label = document.getElementById('a11y-text-toggle-label');
    document.body.classList.toggle('a11y-text', a11yTextEnabled);
    if (!btn || !label) return;
    btn.classList.toggle('active', a11yTextEnabled);
    btn.setAttribute('aria-pressed', String(a11yTextEnabled));
    label.textContent = `Accessible Text: ${a11yTextEnabled ? 'On' : 'Off'}`;
}

function toggleA11yText() {
    a11yTextEnabled = !a11yTextEnabled;
    localStorage.setItem('a11y_text_enabled', String(a11yTextEnabled));
    applyA11yTextUI();
}

// --- Read rules aloud via the browser's built-in text-to-speech ---
let rulesSpeechUtterance = null;

// Bracketed citations like "[Attendance & ID §3]" are for the
// on-screen reader, not the listener — strip them before speaking.
function stripCitations(text) {
    return text.replace(/\s*\[[^\]]*\]/g, '').trim();
}

// Picks the most natural-sounding available voice instead of the
// OS default robotic one. Prefers "Natural"/"Neural"/online voices,
// then well-known higher-quality engines, then any English voice.
function pickNaturalVoice() {
    const synth = window.speechSynthesis;
    if (!synth) return null;
    const voices = synth.getVoices().filter(v => v.lang && v.lang.startsWith('en'));
    if (voices.length === 0) return null;
    const rank = v => {
        const name = v.name.toLowerCase();
        if (name.includes('natural') || name.includes('neural') || name.includes('online')) return 0;
        if (name.includes('google')) return 1;
        if (name.includes('microsoft') && (name.includes('aria') || name.includes('jenny') || name.includes('guy'))) return 1;
        if (name.includes('samantha') || name.includes('daniel') || name.includes('karen')) return 2;
        return 3;
    };
    return voices.slice().sort((a, b) => rank(a) - rank(b))[0];
}

function toggleReadRulesAloud(listId) {
    const synth = window.speechSynthesis;
    if (!synth) return;
    if (synth.speaking) {
        stopReadingRulesAloud();
        return;
    }
    const items = [...document.querySelectorAll(`#${listId} li`)]
        .map((li, i) => `Rule ${i + 1}. ${stripCitations(li.textContent)}`);
    if (items.length === 0) return;
    rulesSpeechUtterance = new SpeechSynthesisUtterance(items.join('. '));
    const voice = pickNaturalVoice();
    if (voice) rulesSpeechUtterance.voice = voice;
    rulesSpeechUtterance.rate = 0.95;
    rulesSpeechUtterance.pitch = 1;
    rulesSpeechUtterance.onend = resetReadAloudButton;
    rulesSpeechUtterance.onerror = resetReadAloudButton;
    synth.speak(rulesSpeechUtterance);
    const btn = document.getElementById('read-aloud-btn');
    const label = document.getElementById('read-aloud-label');
    if (btn) btn.classList.add('speaking');
    if (label) label.textContent = '⏹ Stop Reading';
}

function stopReadingRulesAloud() {
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    resetReadAloudButton();
}

function resetReadAloudButton() {
    const btn = document.getElementById('read-aloud-btn');
    const label = document.getElementById('read-aloud-label');
    if (btn) btn.classList.remove('speaking');
    if (label) label.textContent = '🔊 Read Aloud';
}

// --- Research info page ---
function openResearchPage() {
    const page = document.getElementById('research-page');
    if (page) page.classList.remove('hidden');
}

function closeResearchPage() {
    const page = document.getElementById('research-page');
    if (page) page.classList.add('hidden');
}

function clampField(id, max) {
    const el = document.getElementById(id);
    let val = parseInt(el.value, 10);
    if (isNaN(val) || val < 0) val = 0;
    if (val > max) val = max;
    el.value = String(val).padStart(2, '0');
    return val;
}

function reviewRulesOrStart() {
    const h = clampField('input-hr', 23);
    const m = clampField('input-min', 59);
    const s = clampField('input-sec', 59);
    timeLeft = (h * 3600) + (m * 60) + s;
    if (timeLeft <= 0) return;

    timerDuration = timeLeft;

    // Simple mode: no rules — go straight to the countdown.
    if (timerMode !== 'exam') {
        beginCountdown();
        return;
    }

    saveRuleEditor(preRules);

    if (preRules.rules.length > 0) {
        const durationDisplay = document.getElementById('rules-duration-display');
        if (durationDisplay) durationDisplay.textContent = `Duration: ${formatDurationLabel(timerDuration)}`;

        const list = document.getElementById('rules-display-list');
        if (list) {
            list.innerHTML = '';
            preRules.rules.forEach((rule, idx) => {
                const li = document.createElement('li');
                li.textContent = rule;
                li.className = 'rules-list-item';
                li.style.animationDelay = `${idx * 100}ms`;
                list.appendChild(li);
            });
        }

        document.getElementById('timer-setup').classList.add('hidden');
        document.getElementById('view-rules').classList.remove('hidden');
        updateQuoteVisibility();
    } else {
        beginCountdown();
    }
}

function beginCountdown() {
    const viewRules = document.getElementById('view-rules');
    if (viewRules) viewRules.classList.add('hidden');
    document.getElementById('timer-setup').classList.add('hidden');

    document.getElementById('progress-bar-container').classList.remove('hidden');
    updateProgressBar();

    document.getElementById('timer-digits').classList.remove('hidden');
    document.getElementById('timer-running').classList.remove('hidden');
    isPaused = false;
    // Suppress warnings that are already past for the chosen duration.
    warnedCheckpoints = new Set(warningCheckpointsMin.filter(min => timeLeft <= min * 60));
    initAudio();
    requestWakeLock();
    if (quoteCategory === 'motivational') {
        lastMotivationalTier = getMotivationalTier();
        currentQuoteIndex = Math.floor(Math.random() * getActiveQuoteList().length) - 1;
        renderQuote(1);
    }
    runTimer();
    persistTimerState();
    updateQuoteVisibility();
    updateCalmDisplayVisibility();
}

function showTimerSetup() {
    const viewRules = document.getElementById('view-rules');
    if (viewRules) viewRules.classList.add('hidden');
    document.getElementById('timer-setup').classList.remove('hidden');
    updateQuoteVisibility();
}

function updateProgressBar() {
    const percent = timerDuration > 0 ? (timeLeft / timerDuration) * 100 : 0;
    const bar = document.getElementById('progress-bar');
    bar.style.width = `${percent}%`;
    // Warn visually as time runs low: blue -> amber (<=5m) -> red (<=1m).
    bar.style.backgroundColor = timeLeft <= 60 ? '#ef4444' : (timeLeft <= 300 ? '#f59e0b' : '#3b82f6');
    updateCalmProgressVisual();
}

function runTimer() {
    clearInterval(timerInt);
    // Anchor to a wall-clock end time so the countdown stays accurate
    // even when the tab is backgrounded and setInterval is throttled.
    endTime = Date.now() + timeLeft * 1000;
    timerInt = setInterval(() => {
        if (!isPaused) {
            timeLeft = Math.max(0, Math.round((endTime - Date.now()) / 1000));
            refreshTimerUI();
            updateProgressBar();
            updateTitle();
            checkWarnings();
            maybeRotateMotivationalQuote();
            persistTimerState();
            if (timeLeft <= 0) {
                clearInterval(timerInt);
                handleTimerEnd();
            }
        }
    }, 250);
    refreshTimerUI();
    updateProgressBar();
    updateTitle();
}

function handleTimerEnd() {
    playBeep(3);

    // Clear countdown interval
    clearInterval(timerInt);
    timeLeft = 0;
    timerDuration = 0;
    releaseWakeLock();
    clearTimerState();
    lastMotivationalTier = null;

    // Hide clock digits, running overlay, progress bar
    document.getElementById('timer-digits').classList.add('hidden');
    document.getElementById('timer-running').classList.add('hidden');
    document.getElementById('progress-bar-container').classList.add('hidden');
    updateTitle();
    updateQuoteVisibility();
    updateCalmDisplayVisibility();

    // Simple mode: no post-exam rules — just return to setup.
    if (timerMode !== 'exam') {
        stopTimer();
        return;
    }

    saveRuleEditor(postRules);
    if (postRules.rules.length > 0) {
        // Render and show post exam rules
        const list = document.getElementById('post-rules-display-list');
        if (list) {
            list.innerHTML = '';
            postRules.rules.forEach((rule, idx) => {
                const li = document.createElement('li');
                li.textContent = rule;
                li.className = 'rules-list-item';
                li.style.animationDelay = `${idx * 100}ms`;
                list.appendChild(li);
            });
        }
        document.getElementById('timer-setup').classList.add('hidden');
        document.getElementById('view-post-rules').classList.remove('hidden');

        // Reset countdown numbers on background plates
        timerIds.forEach(id => {
            flipTo(id, '0');
        });
    } else {
        stopTimer();
    }
}

function refreshTimerUI() {
    const h = Math.floor(timeLeft / 3600);
    const m = Math.floor((timeLeft % 3600) / 60);
    const s = Math.max(0, timeLeft % 60);
    const timeStr = [String(h).padStart(2, '0'), String(m).padStart(2, '0'), String(s).padStart(2, '0')].join('').split('');
    timerIds.forEach((id, i) => {
        if (showSeconds || i < 4) {
            flipTo(id, timeStr[i]);
        }
    });
    timerContainer.setAttribute('aria-label', `Time remaining ${formatTime(timeLeft)}`);
}

function stopTimer() {
    clearInterval(timerInt);
    timeLeft = 0;
    timerDuration = 0;
    releaseWakeLock();
    clearTimerState();
    lastMotivationalTier = null;

    // Clean exam displays & states
    document.getElementById('timer-digits').classList.add('hidden');
    const viewRules = document.getElementById('view-rules');
    if (viewRules) viewRules.classList.add('hidden');
    const viewPostRules = document.getElementById('view-post-rules');
    if (viewPostRules) viewPostRules.classList.add('hidden');
    document.getElementById('timer-setup').classList.remove('hidden');
    document.getElementById('timer-running').classList.add('hidden');

    document.getElementById('progress-bar-container').classList.add('hidden');

    timerIds.forEach(id => {
        flipTo(id, '0');
    });
    updateTitle();
    updateQuoteVisibility();
    updateCalmDisplayVisibility();
    stopReadingRulesAloud();
}
// --- Reusable confirmation modal ---
const MODAL_ICONS = {
    warning: '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>',
    clock: '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>'
};
let modalConfirmCb = null, modalCancelCb = null;

function showConfirmModal(opts) {
    const danger = opts.danger !== false; // default to the red/danger style
    document.getElementById('confirm-modal-title').textContent = opts.title || 'Are you sure?';
    document.getElementById('confirm-modal-message').textContent = opts.message || '';

    const confirmBtn = document.getElementById('confirm-modal-confirm');
    confirmBtn.textContent = opts.confirmLabel || 'Confirm';
    confirmBtn.className = 'modal-btn ' + (danger ? 'modal-btn-danger' : 'modal-btn-primary');

    document.getElementById('confirm-modal-cancel').textContent = opts.cancelLabel || 'Cancel';

    const iconEl = document.getElementById('confirm-modal-icon');
    iconEl.className = 'modal-icon' + (danger ? '' : ' modal-icon-info');
    iconEl.innerHTML = MODAL_ICONS[opts.icon] || (danger ? MODAL_ICONS.warning : MODAL_ICONS.clock);

    modalConfirmCb = opts.onConfirm || null;
    modalCancelCb = opts.onCancel || null;
    document.getElementById('confirm-modal').classList.remove('hidden');
}
function hideConfirmModal() {
    document.getElementById('confirm-modal').classList.add('hidden');
}
function modalConfirm() {
    const cb = modalConfirmCb;
    modalConfirmCb = null; modalCancelCb = null;
    hideConfirmModal();
    if (cb) cb();
}
function modalCancel() {
    const cb = modalCancelCb;
    modalConfirmCb = null; modalCancelCb = null;
    hideConfirmModal();
    if (cb) cb();
}
function isModalOpen() {
    return !document.getElementById('confirm-modal').classList.contains('hidden');
}

// Confirm before discarding a running timer (guards accidental Reset/Escape).
function confirmStop() {
    const running = !document.getElementById('timer-running').classList.contains('hidden');
    if (running && timeLeft > 0) {
        showConfirmModal({
            title: 'Reset timer?',
            message: 'The current countdown will be lost.',
            confirmLabel: 'Reset',
            cancelLabel: 'Cancel',
            danger: true,
            icon: 'warning',
            onConfirm: stopTimer
        });
    } else {
        stopTimer();
    }
}

function togglePause() {
    isPaused = !isPaused;
    if (isPaused) {
        // Freeze remaining time at the moment of pausing.
        timeLeft = Math.max(0, Math.round((endTime - Date.now()) / 1000));
    } else {
        // Re-anchor the end time so the paused duration isn't counted.
        endTime = Date.now() + timeLeft * 1000;
    }
    document.getElementById('pause-btn').textContent = isPaused ? 'Resume' : 'Pause';
    persistTimerState();
    updateTitle();
}

function showTab(tab) {
    document.getElementById('view-clock').classList.toggle('hidden', tab !== 'clock');
    document.getElementById('view-timer').classList.toggle('hidden', tab !== 'timer');
    document.getElementById('tab-clock').classList.toggle('active', tab === 'clock');
    document.getElementById('tab-timer').classList.toggle('active', tab === 'timer');
    document.getElementById('tab-clock').setAttribute('aria-pressed', String(tab === 'clock'));
    document.getElementById('tab-timer').setAttribute('aria-pressed', String(tab === 'timer'));

    // Persist tab selection
    localStorage.setItem('active_tab', tab);

    updateQuoteVisibility();
}

// Quotes show on the clock always, and on the timer ONLY while it's
// running — not on the setup, rules, or post-exam screens.
function updateQuoteVisibility() {
    const quoteWrapper = document.getElementById('quote-wrapper');
    if (!quoteWrapper) return;
    const onClock = !document.getElementById('view-clock').classList.contains('hidden');
    const timerRunning = !document.getElementById('timer-running').classList.contains('hidden');
    quoteWrapper.classList.toggle('hidden', !(onClock || timerRunning));
}

const engineeringQuotes = [
    { text: "Scientists study the world as it is; engineers create the world that has never been.", author: "Theodore von Kármán" },
    { text: "Any fool can make something complicated. It takes a genius to make it simple.", author: "Woody Guthrie" },
    { text: "Simplicity is the ultimate sophistication.", author: "Leonardo da Vinci" },
    { text: "Make things as simple as possible, but not simpler.", author: "Albert Einstein" },
    { text: "Anything that can go wrong will go wrong.", author: "Murphy's Law" },
    { text: "Move fast and break things. Unless you are a civil engineer.", author: "Engineering Proverb" },
    { text: "The best way to predict the future is to invent it.", author: "Alan Kay" },
    { text: "I have not failed. I've just found 10,000 ways that won't work.", author: "Thomas A. Edison" },
    { text: "If you can't explain it simply, you don't understand it well enough.", author: "Albert Einstein" },
    { text: "An engineer is someone who can do for a dime what any fool can do for a dollar.", author: "Arthur M. Wellington" },
    { text: "We build too many walls and not enough bridges.", author: "Isaac Newton" },
    { text: "Nature cannot be fooled.", author: "Richard Feynman" },
    { text: "Measure twice, cut once.", author: "Workshop Proverb" },
    { text: "One accurate measurement is worth a thousand expert opinions.", author: "Grace Hopper" },
    { text: "The science of today is the technology of tomorrow.", author: "Edward Teller" },
    { text: "If you want to find the secrets of the universe, think in terms of energy, frequency and vibration.", author: "Nikola Tesla" },
    { text: "Design is not just what it looks like and feels like. Design is how it works.", author: "Steve Jobs" },
    { text: "Mathematics is the language in which God has written the universe.", author: "Galileo Galilei" },
    { text: "Engineering is the closest thing to magic that exists in the world.", author: "Elon Musk" },
    { text: "Good design is as little design as possible.", author: "Dieter Rams" },
    { text: "Strive for perfection in everything you do. Accept nothing nearly right or nearly good.", author: "Henry Royce" },
    { text: "Manufacturing is more than just putting parts together.", author: "Henry Ford" },
    { text: "To the engineer, the world is a toybox full of sub-optimized tools.", author: "Unknown" },
    { text: "There is nothing so useless as doing efficiently that which should not be done at all.", author: "Peter Drucker" },
    { text: "I do not think there is any thrill like that felt by the inventor as he sees success.", author: "Nikola Tesla" },
    { text: "An investment in knowledge pays the best interest.", author: "Benjamin Franklin" },
    { text: "Engineers turn dreams into reality.", author: "Hayao Miyazaki" },
    { text: "Equations are more important to me; politics is for the present, but an equation is for eternity.", author: "Albert Einstein" },
    { text: "If I have seen further, it is by standing on the shoulders of Giants.", author: "Isaac Newton" },
    { text: "There is no substitute for hard work.", author: "Thomas A. Edison" },
    { text: "First, rule out the impossible. Whatever remains, however improbable, must be the truth.", author: "Sherlock Holmes" },
    { text: "Simplicity is the soul of efficiency.", author: "Austin Freeman" },
    { text: "The problem is not that there are problems. The problem is expecting otherwise.", author: "Theodore Rubin" },
    { text: "Experience is simply the name we give our mistakes.", author: "Oscar Wilde" },
    { text: "Quality is not an act, it is a habit.", author: "Aristotle" },
    { text: "If you can't measure it, you can't improve it.", author: "Lord Kelvin" },
    { text: "Nature is pleased with simplicity. And nature is no dummy.", author: "Isaac Newton" },
    { text: "Simplicity, carried to an extreme, becomes elegance.", author: "Jon Franklin" },
    { text: "A problem well-stated is a problem half-solved.", author: "Charles Kettering" },
    { text: "It's not that I'm so smart, it's just that I stay with problems longer.", author: "Albert Einstein" },
    { text: "Design must serve people, reflecting the practical and aesthetic.", author: "Thomas J. Watson" },
    { text: "Nothing has such power to broaden the mind as systematic investigation.", author: "Marcus Aurelius" },
    { text: "Science is a way of thinking much more than it is a body of knowledge.", author: "Carl Sagan" },
    { text: "The best design is the one that gets out of the way.", author: "Dieter Rams" },
    { text: "In mathematics, proposing a question is of higher value than solving it.", author: "Georg Cantor" },
    { text: "If you want to understand the machine, look at the output.", author: "Workshop Proverb" },
    { text: "Action is the foundational key to all success.", author: "Pablo Picasso" },
    { text: "The history of engineering is the history of solving problems.", author: "Unknown" },
    { text: "A good tool is an opinionated tool.", author: "Unknown" },
    { text: "Detail is everything.", author: "Christian Dior" }
];

const lifeQuotes = [
    { text: "The unexamined life is not worth living.", author: "Socrates" },
    { text: "What we think, we become.", author: "Buddha" },
    { text: "Life is what happens to you while you're busy making other plans.", author: "John Lennon" },
    { text: "The two most important days in your life are the day you are born and the day you find out why.", author: "Mark Twain" },
    { text: "It is not length of life, but depth of life.", author: "Ralph Waldo Emerson" },
    { text: "Turn your wounds into wisdom.", author: "Oprah Winfrey" },
    { text: "The purpose of our lives is to be happy.", author: "Dalai Lama" },
    { text: "Life is really simple, but we insist on making it complicated.", author: "Confucius" },
    { text: "Between stimulus and response there is a space. In that space is our power to choose our response.", author: "Viktor Frankl" },
    { text: "He who has a why to live can bear almost any how.", author: "Friedrich Nietzsche" },
    { text: "The only way to make sense out of change is to plunge into it, move with it, and join the dance.", author: "Alan Watts" },
    { text: "Not how long, but how well you have lived is the main thing.", author: "Seneca" },
    { text: "You have power over your mind — not outside events. Realize this, and you will find strength.", author: "Marcus Aurelius" },
    { text: "The privilege of a lifetime is to become who you truly are.", author: "Carl Jung" },
    { text: "Life is really about not knowing, having to change, taking the moment and making the best of it.", author: "Gilda Radner" },
    { text: "What lies behind us and what lies before us are tiny matters compared to what lies within us.", author: "Ralph Waldo Emerson" },
    { text: "In the end, it's not the years in your life that count. It's the life in your years.", author: "Abraham Lincoln" },
    { text: "The good life is a process, not a state of being.", author: "Carl Rogers" },
    { text: "Everything can be taken from a man but one thing: the last of the human freedoms — to choose one's attitude.", author: "Viktor Frankl" },
    { text: "Life shrinks or expands in proportion to one's courage.", author: "Anaïs Nin" },
    { text: "The best way out is always through.", author: "Robert Frost" },
    { text: "We are what we repeatedly do. Excellence, then, is not an act, but a habit.", author: "Will Durant" },
    { text: "Do not wait to strike till the iron is hot; but make it hot by striking.", author: "William Butler Yeats" },
    { text: "The journey of a thousand miles begins with one step.", author: "Lao Tzu" },
    { text: "It does not matter how slowly you go as long as you do not stop.", author: "Confucius" }
];

// Motivational quotes are tiered by how much time is left on the
// timer, so the tone shifts from "settle in" to "final push".
const motivationalTiers = {
    start: [
        { text: "You showed up. That's the hardest part — now go do the work.", author: "" },
        { text: "Deep breath. You've prepared for this moment.", author: "" },
        { text: "Focus on the next line, not the whole page.", author: "" },
        { text: "Slow and steady beats rushed and sloppy.", author: "" },
        { text: "Trust your preparation. You know more than you think.", author: "" }
    ],
    mid: [
        { text: "Halfway there. Keep the same energy you started with.", author: "" },
        { text: "One question at a time. You've got this.", author: "" },
        { text: "Stay with it — momentum is on your side.", author: "" },
        { text: "Don't rush. A clear mind finds the answer faster.", author: "" },
        { text: "You've handled harder things than this.", author: "" }
    ],
    late: [
        { text: "The finish line is closer than it feels. Keep going.", author: "" },
        { text: "This is where discipline beats talent. Push through.", author: "" },
        { text: "Almost there — don't let up now.", author: "" },
        { text: "Every minute left is still a chance to improve your answer.", author: "" },
        { text: "You've come this far. Finish strong.", author: "" }
    ],
    final: [
        { text: "Final stretch. Breathe, focus, finish.", author: "" },
        { text: "Wrap up with confidence — you did the work.", author: "" },
        { text: "Last few minutes: review, don't second-guess everything.", author: "" },
        { text: "This is it. Give it everything you've got left.", author: "" },
        { text: "Almost done. Make these last minutes count.", author: "" }
    ],
    idle: [
        { text: "Success is the sum of small efforts, repeated day in and day out.", author: "Robert Collier" },
        { text: "You don't have to be great to start, but you have to start to be great.", author: "Zig Ziglar" },
        { text: "Discipline is choosing between what you want now and what you want most.", author: "Abraham Lincoln" },
        { text: "Push yourself, because no one else is going to do it for you.", author: "Unknown" },
        { text: "The pain of discipline weighs ounces; the pain of regret weighs tons.", author: "Jim Rohn" }
    ]
};

const quoteCategories = {
    general: engineeringQuotes,
    life: lifeQuotes
};

let quoteCategory = localStorage.getItem('quote_category') || 'general';
if (!['general', 'motivational', 'life'].includes(quoteCategory)) quoteCategory = 'general';

// Returns which motivational tier applies right now, based on the
// fraction of timer duration remaining. 'idle' when no timer is running.
function getMotivationalTier() {
    const timerRunning = !document.getElementById('timer-running').classList.contains('hidden');
    if (!timerRunning || !timerDuration) return 'idle';
    const fraction = timeLeft / timerDuration;
    if (fraction > 0.66) return 'start';
    if (fraction > 0.33) return 'mid';
    if (fraction > 0.1) return 'late';
    return 'final';
}

let lastMotivationalTier = null;

function getActiveQuoteList() {
    if (quoteCategory === 'motivational') {
        return motivationalTiers[getMotivationalTier()];
    }
    return quoteCategories[quoteCategory] || quoteCategories.general;
}

let currentQuoteIndex = Math.floor(Math.random() * getActiveQuoteList().length);

function renderQuote(direction = 0) {
    const container = document.getElementById('quote-container');
    container.style.opacity = "0";
    setTimeout(() => {
        const list = getActiveQuoteList();
        currentQuoteIndex = (currentQuoteIndex + direction + list.length) % list.length;
        const quote = list[currentQuoteIndex];
        document.getElementById('quote-text').textContent = `"${quote.text}"`;
        document.getElementById('quote-author').textContent = quote.author ? `— ${quote.author}` : '';
        container.style.opacity = "1";
    }, 300);
}

// Re-renders the current motivational tier's quote when the timer
// crosses into a new tier, so the message stays relevant to time left.
function maybeRotateMotivationalQuote() {
    if (quoteCategory !== 'motivational') return;
    const tier = getMotivationalTier();
    if (tier !== lastMotivationalTier) {
        lastMotivationalTier = tier;
        currentQuoteIndex = Math.floor(Math.random() * motivationalTiers[tier].length) - 1;
        renderQuote(1);
    }
}

function applyQuoteCategoryUI() {
    document.querySelectorAll('.quote-cat-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.category === quoteCategory);
    });
}

function setQuoteCategory(category) {
    if (!['general', 'motivational', 'life'].includes(category)) return;
    quoteCategory = category;
    localStorage.setItem('quote_category', category);
    applyQuoteCategoryUI();
    lastMotivationalTier = quoteCategory === 'motivational' ? getMotivationalTier() : null;
    currentQuoteIndex = Math.floor(Math.random() * getActiveQuoteList().length) - 1;
    renderQuote(1);
}

window.addEventListener('load', () => {
    applyQuoteCategoryUI();
    renderQuote(0);
    setInterval(() => {
        renderQuote(1);
    }, 90000);
    renderRuleEditor(preRules);
    renderRuleEditor(postRules);
    applyTimerMode();
    applyCalmDisplayToggleUI();
    applyA11yTextUI();
    renderWarningCheckpoints();

    // Warm up the speech synthesis voice list — some browsers only
    // populate it asynchronously after this event fires.
    if (window.speechSynthesis) {
        window.speechSynthesis.getVoices();
        window.speechSynthesis.addEventListener('voiceschanged', () => window.speechSynthesis.getVoices());
    }

    // Restore persistent tab selection
    const savedTab = localStorage.getItem('active_tab') || 'clock';
    showTab(savedTab);

    // Offer to resume a timer that was interrupted by a reload/crash.
    maybeResumeTimer();
});

function toggleLargeView() {
    const isLarge = document.body.classList.toggle('large-view');
    const btn = document.getElementById('btn-fullscreen');
    const icon = document.getElementById('fullscreen-icon');
    btn.classList.toggle('active', isLarge);
    btn.setAttribute('aria-pressed', String(isLarge));
    if (isLarge) {
        if (document.documentElement.requestFullscreen) {
            document.documentElement.requestFullscreen().catch(() => { });
        }
        icon.innerHTML = '<path d="M4 14h6v6M20 10h-6V4M14 20h-4v-6h6M10 4v6H4"></path>';
    } else {
        if (document.exitFullscreen && document.fullscreenElement) {
            document.exitFullscreen().catch(() => { });
        }
        icon.innerHTML = '<path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path>';
    }
}

function updateThemeIcon() {
    const icon = document.getElementById('theme-icon');
    const isLight = document.body.classList.contains('light-theme');
    if (isLight) {
        icon.innerHTML = '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>';
    } else {
        icon.innerHTML = '<path d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m12.728 0l-.707-.707M6.343 6.343l-.707-.707M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z"></path>';
    }
    // Keep the mobile browser chrome in sync with the active theme.
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', isLight ? '#f5f5f7' : '#0d0d0d');
}

function toggleTheme() {
    const isLight = document.body.classList.toggle('light-theme');
    localStorage.setItem('theme', isLight ? 'light' : 'dark');
    updateThemeIcon();
}

function applyInitialTheme() {
    // Honor a saved manual choice; otherwise fall back to the system preference.
    const saved = localStorage.getItem('theme');
    const isLight = saved
        ? saved === 'light'
        : window.matchMedia('(prefers-color-scheme: light)').matches;
    document.body.classList.toggle('light-theme', isLight);
    updateThemeIcon();
}

applyInitialTheme();

// Keyboard Shortcuts (Clicker Friendly)
window.addEventListener('keydown', (e) => {
    // When a confirmation modal is open, Escape cancels it (nothing else fires).
    if (isModalOpen()) {
        if (e.code === 'Escape') {
            e.preventDefault();
            modalCancel();
        }
        return;
    }

    // When the research page is open, Escape closes it (nothing else fires).
    const researchPage = document.getElementById('research-page');
    if (researchPage && !researchPage.classList.contains('hidden')) {
        if (e.code === 'Escape') {
            e.preventDefault();
            closeResearchPage();
        }
        return;
    }

    const activeEl = document.activeElement;
    if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) {
        return; // Ignore if user is typing
    }

    if (e.code === 'Space') {
        e.preventDefault();
        const timerRunning = !document.getElementById('timer-running').classList.contains('hidden');
        if (timerRunning) {
            togglePause();
        }
    } else if (e.code === 'KeyF') {
        e.preventDefault();
        toggleLargeView();
    } else if (e.code === 'Escape') {
        const timerRunning = !document.getElementById('timer-running').classList.contains('hidden');
        if (timerRunning) {
            confirmStop();
        }
    } else if (e.code === 'KeyT') {
        e.preventDefault();
        const viewClock = document.getElementById('view-clock');
        if (viewClock.classList.contains('hidden')) {
            showTab('clock');
        } else {
            showTab('timer');
        }
    }
});
