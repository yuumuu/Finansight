// FinanSight — App Logic v2.0
'use strict';

// ===================== DATABASE =====================
const db = new Dexie('FinanSightDB');
db.version(1).stores({
    debts:    '++id, name, type, amount, dueDate, status, note, createdAt',
    tasks:    '++id, name, dueDate, priority, notes, completed, createdAt',
    wishlist: '++id, name, targetPrice, priority, currentSavings, createdAt',
    events:   '++id, title, type, date, description, createdAt',
    pin:      '++id, hash',
    settings: '++id, key, value'
});

// ===================== STATE =====================
let currentTab = 'dashboard';
let calYear, calMonth, calSelectedDate;
let debtFilter = 'all';
let taskFilter = 'all';
let pinBuffer = '';
let isSetupMode = false;

// ===================== INIT =====================
document.addEventListener('DOMContentLoaded', async () => {
    await loadTheme();
    await checkPin();
    initCalendar();
    lucide.createIcons();
});

// ===================== THEME =====================
async function loadTheme() {
    try {
        const setting = await db.settings.where('key').equals('theme').first();
        if (setting && setting.value === 'light') {
            document.body.classList.add('light');
            updateThemeIcon(true);
        }
    } catch(e) {}
}

function updateThemeIcon(isLight) {
    const icon = document.getElementById('themeIcon');
    if (!icon) return;
    icon.setAttribute('data-lucide', isLight ? 'sun' : 'moon');
    lucide.createIcons();
}

async function toggleTheme() {
    const isLight = document.body.classList.toggle('light');
    updateThemeIcon(isLight);
    try {
        const existing = await db.settings.where('key').equals('theme').first();
        if (existing) await db.settings.update(existing.id, { value: isLight ? 'light' : 'dark' });
        else await db.settings.add({ key: 'theme', value: isLight ? 'light' : 'dark' });
    } catch(e) {}
}

// ===================== PIN =====================
async function checkPin() {
    const pinRecord = await db.pin.toArray();
    isSetupMode = pinRecord.length === 0;
    document.getElementById('pinLabel').textContent = isSetupMode
        ? 'Buat PIN 6 digit baru untuk keamanan'
        : 'Masukkan PIN untuk melanjutkan';
    document.getElementById('pinScreen').classList.remove('hidden');
    document.getElementById('mainApp').classList.add('hidden');
    pinBuffer = '';
    updatePinDots();
}

function hidePin() {
    const screen = document.getElementById('pinScreen');
    screen.style.opacity = '0';
    screen.style.transform = 'scale(1.04)';
    screen.style.transition = 'all 0.3s ease';
    setTimeout(() => {
        screen.classList.add('hidden');
        screen.style.opacity = '';
        screen.style.transform = '';
    }, 300);
    document.getElementById('mainApp').classList.remove('hidden');
    switchTab('dashboard');
}

function pinInput(digit) {
    if (pinBuffer.length >= 6) return;
    pinBuffer += digit;
    updatePinDots();
    if (pinBuffer.length === 6) setTimeout(pinSubmit, 180);
}

function pinClear() {
    pinBuffer = pinBuffer.slice(0, -1);
    updatePinDots();
}

function updatePinDots() {
    for (let i = 0; i < 6; i++) {
        const dot = document.getElementById(`dot${i}`);
        if (!dot) continue;
        if (i < pinBuffer.length) {
            dot.classList.add('filled');
        } else {
            dot.classList.remove('filled');
        }
    }
}

async function pinSubmit() {
    if (pinBuffer.length < 6) { showToast('PIN harus 6 digit'); return; }
    if (isSetupMode) {
        await db.pin.clear();
        await db.pin.add({ hash: simpleHash(pinBuffer) });
        showToast('PIN berhasil dibuat!');
        hidePin();
    } else {
        const records = await db.pin.toArray();
        if (records.length && records[0].hash === simpleHash(pinBuffer)) {
            hidePin();
        } else {
            showToast('PIN salah, coba lagi');
            pinBuffer = '';
            updatePinDots();
            document.getElementById('pinDots').style.animation = 'shake 0.4s ease';
            setTimeout(() => { document.getElementById('pinDots').style.animation = ''; }, 400);
        }
    }
}

function resetPinFlow() {
    showConfirm('Reset PIN?', 'PIN akan dihapus. Data kamu tetap aman.', async () => {
        await db.pin.clear();
        isSetupMode = true;
        pinBuffer = '';
        updatePinDots();
        document.getElementById('pinLabel').textContent = 'Buat PIN 6 digit baru';
        showToast('Silakan buat PIN baru');
    });
}

function simpleHash(str) {
    let h = 5381;
    for (let i = 0; i < str.length; i++) h = ((h << 5) + h) + str.charCodeAt(i);
    return (h >>> 0).toString(36);
}

// ===================== NAVIGATION =====================
function switchTab(tab) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
    document.querySelectorAll('.nav-btn').forEach(el => el.classList.remove('active'));

    const tabEl = document.getElementById(`tab-${tab}`);
    if (tabEl) { tabEl.classList.remove('hidden'); }

    const navBtn = document.querySelector(`.nav-btn[data-tab="${tab}"]`);
    if (navBtn) navBtn.classList.add('active');

    currentTab = tab;
    lucide.createIcons();

    if (tab === 'dashboard') loadDashboard();
    if (tab === 'debts') renderDebts();
    if (tab === 'tasks') renderTasks();
    if (tab === 'planner') renderWishlist();
    if (tab === 'calendar') renderCalendar();
}

// ===================== MODALS =====================
function openModal(id) {
    const m = document.getElementById(id);
    m.classList.remove('hidden');
    m.classList.add('flex');
    lucide.createIcons();
}
function closeModal(id) {
    document.getElementById(id).classList.add('hidden');
    document.getElementById(id).classList.remove('flex');
}

// ===================== TOAST =====================
let toastTimer;
function showToast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2800);
}

// ===================== CONFIRM =====================
function showConfirm(title, msg, cb) {
    document.getElementById('confirmTitle').textContent = title;
    document.getElementById('confirmMsg').textContent = msg;
    document.getElementById('confirmYes').onclick = () => { closeConfirm(); cb(); };
    openModal('confirmModal');
}
function closeConfirm() { closeModal('confirmModal'); }

// ===================== EXPORT/IMPORT =====================
function showExportModal() { openModal('exportModal'); }

async function exportData() {
    const data = {
        version: 2, exported: new Date().toISOString(),
        debts: await db.debts.toArray(),
        tasks: await db.tasks.toArray(),
        wishlist: await db.wishlist.toArray(),
        events: await db.events.toArray()
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `finansight-${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    showToast('Data berhasil diekspor!');
}

async function importData(event) {
    const file = event.target.files[0];
    if (!file) return;
    try {
        const text = await file.text();
        const data = JSON.parse(text);
        showConfirm('Impor Data?', 'Data yang ada akan ditimpa dengan data dari file.', async () => {
            const strip = arr => (arr || []).map(d => { const c = {...d}; delete c.id; return c; });
            await db.debts.clear(); if (data.debts) await db.debts.bulkAdd(strip(data.debts));
            await db.tasks.clear(); if (data.tasks) await db.tasks.bulkAdd(strip(data.tasks));
            await db.wishlist.clear(); if (data.wishlist) await db.wishlist.bulkAdd(strip(data.wishlist));
            await db.events.clear(); if (data.events) await db.events.bulkAdd(strip(data.events));
            closeModal('exportModal');
            showToast('Data berhasil diimpor!');
            loadDashboard();
        });
    } catch(e) { showToast('File tidak valid'); }
}

// ===================== HELPERS =====================
function fmtRp(n) { return 'Rp\u00a0' + Number(n || 0).toLocaleString('id-ID'); }
function fmtDate(str) {
    if (!str) return '–';
    return new Date(str + 'T00:00:00').toLocaleDateString('id-ID', { day:'numeric', month:'short', year:'numeric' });
}
function daysDiff(dateStr) {
    if (!dateStr) return null;
    const d = new Date(dateStr + 'T00:00:00');
    const now = new Date(); now.setHours(0,0,0,0);
    return Math.round((d - now) / 86400000);
}
function escHtml(str) {
    return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ===================== DASHBOARD =====================
async function loadDashboard() {
    const unpaidDebts = await db.debts.where('status').equals('unpaid').toArray();
    const totalDebt = unpaidDebts.filter(d => d.type === 'debt').reduce((s,d) => s + Number(d.amount), 0);
    const totalRec  = unpaidDebts.filter(d => d.type === 'receivable').reduce((s,d) => s + Number(d.amount), 0);

    document.getElementById('dash-debt').textContent = fmtRp(totalDebt);
    document.getElementById('dash-debt-count').textContent = unpaidDebts.filter(d=>d.type==='debt').length + ' aktif';
    document.getElementById('dash-receivable').textContent = fmtRp(totalRec);
    document.getElementById('dash-receivable-count').textContent = unpaidDebts.filter(d=>d.type==='receivable').length + ' aktif';

    // Wishlist progress
    const wishes = await db.wishlist.orderBy('priority').limit(3).toArray();
    const progEl = document.getElementById('dash-progress');
    if (!wishes.length) {
        progEl.innerHTML = `<div class="empty-state py-4"><p class="text-sm">Belum ada wishlist. Tambahkan di tab Planner.</p></div>`;
    } else {
        progEl.innerHTML = wishes.map(w => {
            const pct = w.targetPrice ? Math.min(100, Math.round((w.currentSavings / w.targetPrice) * 100)) : 0;
            const isComplete = pct >= 100;
            return `<div>
                <div class="flex justify-between items-center mb-2">
                    <span class="text-sm font-medium">${escHtml(w.name)}</span>
                    <span class="text-xs font-bold" style="color:${isComplete ? 'var(--green)' : 'var(--accent)'}">${pct}%</span>
                </div>
                <div class="progress-track">
                    <div class="progress-fill ${isComplete ? 'progress-green' : 'progress-accent'}" style="width:${pct}%"></div>
                </div>
                <div class="flex justify-between text-xs mt-1.5" style="color:var(--text-muted)">
                    <span>${fmtRp(w.currentSavings)}</span>
                    <span>${fmtRp(w.targetPrice)}</span>
                </div>
            </div>`;
        }).join('');
    }

    // Recent
    const recentDebts = (await db.debts.orderBy('createdAt').reverse().limit(3).toArray()).map(d => ({
        name: d.name, sub: fmtRp(d.amount),
        icon: 'hand-coins', color: d.type==='debt' ? 'var(--red)' : 'var(--green)',
        bg: d.type==='debt' ? 'rgba(255,92,92,0.1)' : 'rgba(46,204,143,0.1)',
        label: d.type==='debt' ? 'Utang' : 'Piutang', ts: d.createdAt
    }));
    const recentTasks = (await db.tasks.orderBy('createdAt').reverse().limit(2).toArray()).map(t => ({
        name: t.name, sub: t.completed ? 'Selesai' : `Deadline ${fmtDate(t.dueDate)}`,
        icon: 'check-square', color: 'var(--blue)', bg: 'rgba(79,142,247,0.1)',
        label: 'Tugas', ts: t.createdAt
    }));
    const recentWishes = (await db.wishlist.orderBy('createdAt').reverse().limit(2).toArray()).map(w => ({
        name: w.name, sub: fmtRp(w.targetPrice),
        icon: 'shopping-bag', color: 'var(--purple)', bg: 'rgba(155,127,255,0.1)',
        label: 'Wishlist', ts: w.createdAt
    }));

    const all = [...recentDebts, ...recentTasks, ...recentWishes]
        .sort((a,b) => new Date(b.ts) - new Date(a.ts)).slice(0,5);

    const recEl = document.getElementById('dash-recent');
    if (!all.length) {
        recEl.innerHTML = `<div class="empty-state py-4"><p class="text-sm">Belum ada aktivitas</p></div>`;
    } else {
        recEl.innerHTML = all.map(r => `
            <div class="flex items-center gap-3 py-2.5 border-b" style="border-color:var(--border)">
                <div style="width:38px;height:38px;border-radius:12px;background:${r.bg};display:flex;align-items:center;justify-content:center;flex-shrink:0">
                    <i data-lucide="${r.icon}" class="w-4 h-4" style="color:${r.color}"></i>
                </div>
                <div class="flex-1 min-w-0">
                    <p class="text-sm font-medium truncate">${escHtml(r.name)}</p>
                    <p class="text-xs truncate" style="color:var(--text-muted)">${escHtml(r.sub)}</p>
                </div>
                <span class="badge badge-muted">${r.label}</span>
            </div>
        `).join('');
    }
    lucide.createIcons();
}

// ===================== DEBTS =====================
function showAddDebtModal() {
    ['debtId','debtAmount','debtDue','debtNote'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('debtName').value = '';
    document.getElementById('debtType').value = 'debt';
    document.getElementById('debtModalTitle').textContent = 'Tambah Transaksi';
    openModal('debtModal');
}

async function showEditDebtModal(id) {
    const d = await db.debts.get(id);
    if (!d) return;
    document.getElementById('debtId').value = d.id;
    document.getElementById('debtName').value = d.name;
    document.getElementById('debtType').value = d.type;
    document.getElementById('debtAmount').value = d.amount;
    document.getElementById('debtDue').value = d.dueDate || '';
    document.getElementById('debtNote').value = d.note || '';
    document.getElementById('debtModalTitle').textContent = 'Edit Transaksi';
    openModal('debtModal');
}

async function saveDebt() {
    const name = document.getElementById('debtName').value.trim();
    const amount = parseFloat(document.getElementById('debtAmount').value);
    if (!name) { showToast('Nama wajib diisi'); return; }
    if (!amount || amount <= 0) { showToast('Jumlah tidak valid'); return; }

    const data = {
        name, type: document.getElementById('debtType').value,
        amount, dueDate: document.getElementById('debtDue').value || null,
        note: document.getElementById('debtNote').value.trim(),
        status: 'unpaid', createdAt: new Date().toISOString()
    };
    const id = document.getElementById('debtId').value;
    if (id) await db.debts.update(Number(id), data);
    else await db.debts.add(data);

    closeModal('debtModal');
    showToast('Transaksi disimpan!');
    renderDebts();
    if (currentTab === 'dashboard') loadDashboard();
}

async function renderDebts() {
    let items = await db.debts.orderBy('dueDate').toArray();
    const today = new Date(); today.setHours(0,0,0,0);

    if (debtFilter === 'debt') items = items.filter(d => d.type === 'debt');
    else if (debtFilter === 'receivable') items = items.filter(d => d.type === 'receivable');
    else if (debtFilter === 'overdue') items = items.filter(d => d.status==='unpaid' && d.dueDate && new Date(d.dueDate+'T00:00:00') < today);
    else if (debtFilter === 'paid') items = items.filter(d => d.status === 'paid');

    const el = document.getElementById('debtsList');
    if (!items.length) {
        el.innerHTML = `<div class="empty-state"><i data-lucide="inbox" class="w-12 h-12 mx-auto mb-3"></i><p class="font-medium">Tidak ada data</p></div>`;
        lucide.createIcons(); return;
    }

    el.innerHTML = items.map(d => {
        const diff = daysDiff(d.dueDate);
        const overdue = diff !== null && diff < 0 && d.status === 'unpaid';
        const soon = diff !== null && diff >= 0 && diff <= 3 && d.status === 'unpaid';
        const isPaid = d.status === 'paid';

        let badges = d.type === 'debt'
            ? `<span class="badge badge-debt">Utang</span>`
            : `<span class="badge badge-rec">Piutang</span>`;
        if (overdue) badges += ` <span class="badge badge-warn">Terlambat</span>`;
        if (soon && !overdue) badges += ` <span class="badge badge-blue">Segera</span>`;
        if (isPaid) badges += ` <span class="badge badge-muted">Lunas</span>`;

        const amtColor = d.type === 'debt' ? 'var(--red)' : 'var(--green)';

        return `
        <div class="card item-card p-4 ${isPaid ? 'opacity-60' : ''}">
            <div class="flex gap-3 items-start">
                <div style="width:44px;height:44px;border-radius:14px;flex-shrink:0;display:flex;align-items:center;justify-content:center;background:${d.type==='debt'?'rgba(255,92,92,0.1)':'rgba(46,204,143,0.1)'}">
                    <i data-lucide="${d.type==='debt'?'arrow-up-right':'arrow-down-left'}" class="w-5 h-5" style="color:${amtColor}"></i>
                </div>
                <div class="flex-1 min-w-0">
                    <div class="flex flex-wrap gap-1 mb-1.5">${badges}</div>
                    <p class="font-semibold text-sm ${isPaid ? 'line-through' : ''}">${escHtml(d.name)}</p>
                    <p class="font-display font-bold text-lg" style="color:${amtColor}">${fmtRp(d.amount)}</p>
                    ${d.dueDate ? `<p class="text-xs mt-1" style="color:${overdue?'var(--red)':'var(--text-muted)'}">
                        <i data-lucide="calendar" class="w-3 h-3 inline-block mr-1" style="vertical-align:-1px"></i>${fmtDate(d.dueDate)}${overdue ? ` · ${Math.abs(diff)} hari terlambat` : diff === 0 ? ' · Hari ini' : diff !== null && diff > 0 ? ` · ${diff} hari lagi` : ''}</p>` : ''}
                    ${d.note ? `<p class="text-xs mt-1 truncate" style="color:var(--text-muted)">${escHtml(d.note)}</p>` : ''}
                </div>
                <div class="flex flex-col gap-1.5 ml-1">
                    ${!isPaid ? `<button onclick="markDebtPaid(${d.id})" class="btn-icon" title="Lunas" style="background:rgba(46,204,143,0.1);border-color:rgba(46,204,143,0.2);color:var(--green)"><i data-lucide="check" class="w-4 h-4"></i></button>` : ''}
                    <button onclick="showEditDebtModal(${d.id})" class="btn-icon" title="Edit"><i data-lucide="pencil" class="w-3.5 h-3.5"></i></button>
                    <button onclick="deleteDebt(${d.id})" class="btn-icon" style="color:var(--red);background:rgba(255,92,92,0.08);border-color:rgba(255,92,92,0.15)" title="Hapus"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i></button>
                </div>
            </div>
        </div>`;
    }).join('');
    lucide.createIcons();
}

function setDebtFilter(f) {
    debtFilter = f;
    document.querySelectorAll('.filter-pill[data-df]').forEach(b => b.classList.toggle('active', b.dataset.df === f));
    renderDebts();
}

async function markDebtPaid(id) {
    await db.debts.update(id, { status: 'paid' });
    showToast('Ditandai lunas!');
    renderDebts();
    if (currentTab === 'dashboard') loadDashboard();
}

async function deleteDebt(id) {
    showConfirm('Hapus Transaksi?', 'Data ini akan dihapus permanen.', async () => {
        await db.debts.delete(id);
        showToast('Dihapus');
        renderDebts();
        if (currentTab === 'dashboard') loadDashboard();
    });
}

// ===================== TASKS =====================
function showAddTaskModal() {
    ['taskId','taskName','taskDue','taskNotes'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('taskPriority').value = 'medium';
    document.getElementById('taskModalTitle').textContent = 'Tambah Kegiatan';
    openModal('taskModal');
}

async function showEditTaskModal(id) {
    const t = await db.tasks.get(id);
    if (!t) return;
    document.getElementById('taskId').value = t.id;
    document.getElementById('taskName').value = t.name;
    document.getElementById('taskDue').value = t.dueDate || '';
    document.getElementById('taskPriority').value = t.priority;
    document.getElementById('taskNotes').value = t.notes || '';
    document.getElementById('taskModalTitle').textContent = 'Edit Kegiatan';
    openModal('taskModal');
}

async function saveTask() {
    const name = document.getElementById('taskName').value.trim();
    if (!name) { showToast('Nama kegiatan wajib diisi'); return; }
    const data = {
        name, dueDate: document.getElementById('taskDue').value || null,
        priority: document.getElementById('taskPriority').value,
        notes: document.getElementById('taskNotes').value.trim(),
        completed: false, createdAt: new Date().toISOString()
    };
    const id = document.getElementById('taskId').value;
    if (id) { const upd = {...data}; delete upd.completed; await db.tasks.update(Number(id), upd); }
    else await db.tasks.add(data);
    closeModal('taskModal');
    showToast('Kegiatan disimpan!');
    renderTasks();
}

async function renderTasks() {
    let items = await db.tasks.toArray();
    if (taskFilter === 'pending') items = items.filter(t => !t.completed);
    else if (taskFilter === 'completed') items = items.filter(t => t.completed);

    const pw = { high: 0, medium: 1, low: 2 };
    items.sort((a,b) => {
        if (a.completed !== b.completed) return a.completed ? 1 : -1;
        const pd = pw[a.priority] - pw[b.priority];
        if (pd !== 0 && !a.completed) return pd;
        return (a.dueDate || '9999') < (b.dueDate || '9999') ? -1 : 1;
    });

    const el = document.getElementById('tasksList');
    if (!items.length) {
        el.innerHTML = `<div class="empty-state"><i data-lucide="check-circle" class="w-12 h-12 mx-auto mb-3"></i><p class="font-medium">Tidak ada kegiatan</p></div>`;
        lucide.createIcons(); return;
    }

    const pColor = { high: 'var(--red)', medium: 'var(--accent)', low: 'var(--green)' };
    const pLabel = { high: 'Tinggi', medium: 'Sedang', low: 'Rendah' };

    el.innerHTML = items.map(t => {
        const diff = daysDiff(t.dueDate);
        const overdue = diff !== null && diff < 0 && !t.completed;
        const checkStyle = t.completed
            ? `background:var(--accent);border-color:var(--accent);`
            : `border:2px solid var(--border-strong);`;

        return `
        <div class="card item-card p-4 ${t.completed ? 'opacity-60' : ''}">
            <div class="flex items-start gap-3">
                <button onclick="toggleTask(${t.id})"
                    style="width:24px;height:24px;border-radius:8px;${checkStyle}flex-shrink:0;display:flex;align-items:center;justify-content:center;transition:all 0.2s;margin-top:1px">
                    ${t.completed ? `<i data-lucide="check" class="w-3 h-3" style="color:#0a0a0f"></i>` : ''}
                </button>
                <div class="flex-1 min-w-0">
                    <p class="font-medium text-sm ${t.completed ? 'line-through' : ''}">${escHtml(t.name)}</p>
                    <div class="flex flex-wrap gap-2 mt-1.5 items-center">
                        <span class="text-xs font-semibold" style="color:${pColor[t.priority]}">${pLabel[t.priority]}</span>
                        ${t.dueDate ? `<span class="text-xs" style="color:${overdue?'var(--red)':'var(--text-muted)'}">
                            ${overdue ? '⚠ ' : ''}${fmtDate(t.dueDate)}${diff === 0 ? ' · Hari ini' : ''}</span>` : ''}
                    </div>
                    ${t.notes ? `<p class="text-xs mt-1 truncate" style="color:var(--text-muted)">${escHtml(t.notes)}</p>` : ''}
                </div>
                <div class="flex gap-1 ml-1">
                    <button onclick="showEditTaskModal(${t.id})" class="btn-icon"><i data-lucide="pencil" class="w-3.5 h-3.5"></i></button>
                    <button onclick="deleteTask(${t.id})" class="btn-icon" style="color:var(--red);background:rgba(255,92,92,0.08);border-color:rgba(255,92,92,0.15)"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i></button>
                </div>
            </div>
        </div>`;
    }).join('');
    lucide.createIcons();
}

function setTaskFilter(f) {
    taskFilter = f;
    document.querySelectorAll('.filter-pill[data-tf]').forEach(b => b.classList.toggle('active', b.dataset.tf === f));
    renderTasks();
}

async function toggleTask(id) {
    const t = await db.tasks.get(id);
    await db.tasks.update(id, { completed: !t.completed });
    showToast(t.completed ? 'Belum selesai' : 'Selesai!');
    renderTasks();
}

async function deleteTask(id) {
    showConfirm('Hapus Kegiatan?', 'Data ini akan dihapus permanen.', async () => {
        await db.tasks.delete(id);
        showToast('Dihapus');
        renderTasks();
    });
}

// ===================== WISHLIST =====================
function showAddWishlistModal() {
    ['wishId','wishName','wishPrice'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('wishSaved').value = '0';
    document.getElementById('wishPriority').value = '3';
    document.getElementById('wishModalTitle').textContent = 'Tambah Wishlist';
    openModal('wishlistModal');
}

async function showEditWishlistModal(id) {
    const w = await db.wishlist.get(id);
    if (!w) return;
    document.getElementById('wishId').value = w.id;
    document.getElementById('wishName').value = w.name;
    document.getElementById('wishPrice').value = w.targetPrice;
    document.getElementById('wishSaved').value = w.currentSavings || 0;
    document.getElementById('wishPriority').value = w.priority;
    document.getElementById('wishModalTitle').textContent = 'Edit Wishlist';
    openModal('wishlistModal');
}

async function saveWishlist() {
    const name = document.getElementById('wishName').value.trim();
    const price = parseFloat(document.getElementById('wishPrice').value);
    if (!name) { showToast('Nama barang wajib diisi'); return; }
    if (!price || price <= 0) { showToast('Harga tidak valid'); return; }

    const data = {
        name, targetPrice: price,
        currentSavings: parseFloat(document.getElementById('wishSaved').value) || 0,
        priority: parseInt(document.getElementById('wishPriority').value) || 3,
        createdAt: new Date().toISOString()
    };
    const id = document.getElementById('wishId').value;
    if (id) await db.wishlist.update(Number(id), data);
    else await db.wishlist.add(data);

    closeModal('wishlistModal');
    showToast('Wishlist disimpan!');
    renderWishlist();
    updateSimOptions();
}

async function renderWishlist() {
    const items = await db.wishlist.orderBy('priority').toArray();
    const el = document.getElementById('wishlistList');

    if (!items.length) {
        el.innerHTML = `<div class="card empty-state py-10"><i data-lucide="shopping-bag" class="w-12 h-12 mx-auto mb-3"></i><p class="font-medium">Belum ada wishlist</p></div>`;
        lucide.createIcons(); return;
    }

    el.innerHTML = items.map(w => {
        const pct = w.targetPrice ? Math.min(100, Math.round((w.currentSavings / w.targetPrice) * 100)) : 0;
        const isComplete = pct >= 100;
        const remaining = Math.max(0, w.targetPrice - w.currentSavings);

        return `
        <div class="card item-card p-5 ${isComplete ? '' : ''}">
            ${isComplete ? `<div class="flex items-center gap-2 mb-3"><span class="badge badge-rec">Tercapai!</span></div>` : ''}
            <div class="flex items-start justify-between gap-3 mb-4">
                <div>
                    <div class="flex items-center gap-2 mb-1">
                        <span class="section-label">P${w.priority}</span>
                    </div>
                    <p class="font-display font-bold text-base">${escHtml(w.name)}</p>
                    <p class="font-display font-bold text-xl mt-0.5" style="color:var(--accent)">${fmtRp(w.targetPrice)}</p>
                    ${!isComplete ? `<p class="text-xs mt-1" style="color:var(--text-muted)">Sisa ${fmtRp(remaining)}</p>` : ''}
                </div>
                <div class="flex flex-col gap-1.5">
                    <button onclick="openAddSavings(${w.id})" class="btn-icon" style="background:rgba(46,204,143,0.1);border-color:rgba(46,204,143,0.2);color:var(--green)" title="Tambah tabungan">
                        <i data-lucide="plus" class="w-4 h-4"></i>
                    </button>
                    <button onclick="showEditWishlistModal(${w.id})" class="btn-icon" title="Edit"><i data-lucide="pencil" class="w-3.5 h-3.5"></i></button>
                    <button onclick="deleteWishlist(${w.id})" class="btn-icon" style="color:var(--red);background:rgba(255,92,92,0.08);border-color:rgba(255,92,92,0.15)" title="Hapus"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i></button>
                </div>
            </div>
            <div class="progress-track mb-2">
                <div class="progress-fill ${isComplete ? 'progress-green' : 'progress-accent'}" style="width:${pct}%"></div>
            </div>
            <div class="flex justify-between text-xs" style="color:var(--text-muted)">
                <span>${fmtRp(w.currentSavings)} terkumpul</span>
                <span class="font-bold" style="color:${isComplete?'var(--green)':'var(--accent)'}">${pct}%</span>
            </div>
        </div>`;
    }).join('');
    lucide.createIcons();
    updateSimOptions();
}

async function openAddSavings(id) {
    const w = await db.wishlist.get(id);
    if (!w) return;
    document.getElementById('savingsItemId').value = id;
    document.getElementById('savingsItemName').textContent = `${w.name} — terkumpul: ${fmtRp(w.currentSavings)}`;
    document.getElementById('savingsAmount').value = '';
    openModal('addSavingsModal');
}

async function addSavings() {
    const id = Number(document.getElementById('savingsItemId').value);
    const amt = parseFloat(document.getElementById('savingsAmount').value);
    if (!amt || amt <= 0) { showToast('Jumlah tidak valid'); return; }
    const w = await db.wishlist.get(id);
    await db.wishlist.update(id, { currentSavings: (w.currentSavings || 0) + amt });
    closeModal('addSavingsModal');
    showToast('Tabungan ditambahkan!');
    renderWishlist();
    if (currentTab === 'dashboard') loadDashboard();
}

async function deleteWishlist(id) {
    showConfirm('Hapus Wishlist?', 'Data ini akan dihapus permanen.', async () => {
        await db.wishlist.delete(id);
        showToast('Dihapus');
        renderWishlist();
        if (currentTab === 'dashboard') loadDashboard();
    });
}

// ===================== SIMULATOR =====================
async function updateSimOptions() {
    const items = await db.wishlist.orderBy('priority').toArray();
    const sel = document.getElementById('simItem');
    if (!sel) return;
    sel.innerHTML = '<option value="">-- Pilih barang --</option>' +
        items.map(w => `<option value="${w.id}" data-price="${w.targetPrice}" data-saved="${w.currentSavings}">${escHtml(w.name)}</option>`).join('');
}

function fillSimFromWishlist() {
    const sel = document.getElementById('simItem');
    const opt = sel.options[sel.selectedIndex];
    if (opt && opt.dataset.price) {
        document.getElementById('simPrice').value = opt.dataset.price;
        document.getElementById('simCurrent').value = opt.dataset.saved || 0;
    }
}

function clearOther(id) { document.getElementById(id).value = ''; }

function calculateSim() {
    const price = parseFloat(document.getElementById('simPrice').value) || 0;
    const current = parseFloat(document.getElementById('simCurrent').value) || 0;
    const months = parseFloat(document.getElementById('simMonths').value);
    const monthly = parseFloat(document.getElementById('simMonthly').value);
    const remaining = Math.max(0, price - current);
    if (price <= 0) { showToast('Masukkan harga target'); return; }

    const resultEl = document.getElementById('simResult');
    resultEl.classList.remove('hidden');

    const row = (label, val, accent) => `
        <div class="flex justify-between items-center py-2 border-b" style="border-color:var(--border)">
            <span class="text-sm" style="color:var(--text-muted)">${label}</span>
            <span class="text-sm font-bold" style="color:${accent || 'var(--text)'}">${val}</span>
        </div>`;

    let html = `<p class="font-display font-bold text-base mb-3">Hasil Simulasi</p>`;

    if (months > 0) {
        const needed = Math.ceil(remaining / months);
        const endDate = new Date(); endDate.setMonth(endDate.getMonth() + months);
        html += row('Harga Target', fmtRp(price));
        html += row('Sudah Terkumpul', fmtRp(current), 'var(--green)');
        html += row('Sisa Kebutuhan', fmtRp(remaining), 'var(--red)');
        html += row('Target', months + ' bulan');
        html += row('Per Bulan', fmtRp(needed), 'var(--accent)');
        html += row('Estimasi Selesai', endDate.toLocaleDateString('id-ID', { month:'long', year:'numeric' }), 'var(--accent)');
    } else if (monthly > 0) {
        const monthsNeeded = Math.ceil(remaining / monthly);
        const endDate = new Date(); endDate.setMonth(endDate.getMonth() + monthsNeeded);
        html += row('Harga Target', fmtRp(price));
        html += row('Sudah Terkumpul', fmtRp(current), 'var(--green)');
        html += row('Sisa Kebutuhan', fmtRp(remaining), 'var(--red)');
        html += row('Tabungan Per Bulan', fmtRp(monthly));
        html += row('Selesai Dalam', monthsNeeded + ' bulan', 'var(--accent)');
        html += row('Estimasi Selesai', endDate.toLocaleDateString('id-ID', { month:'long', year:'numeric' }), 'var(--accent)');
    } else {
        showToast('Isi salah satu: target bulan atau nominal per bulan');
        resultEl.classList.add('hidden'); return;
    }
    resultEl.innerHTML = html;
}

// ===================== CALENDAR =====================
const MONTHS_ID = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];

function initCalendar() {
    const now = new Date();
    calYear = now.getFullYear();
    calMonth = now.getMonth();
    calSelectedDate = now.toISOString().slice(0, 10);
}

function changeMonth(delta) {
    calMonth += delta;
    if (calMonth < 0) { calMonth = 11; calYear--; }
    if (calMonth > 11) { calMonth = 0; calYear++; }
    renderCalendar();
}

async function renderCalendar() {
    document.getElementById('calMonthLabel').textContent = `${MONTHS_ID[calMonth]} ${calYear}`;

    const [evs, debts, tasks] = await Promise.all([
        db.events.toArray(),
        db.debts.where('status').equals('unpaid').toArray(),
        db.tasks.where('completed').equals(0).toArray()
    ]);
    const eventDates = new Set([
        ...evs.map(e => e.date),
        ...debts.filter(d => d.dueDate).map(d => d.dueDate),
        ...tasks.filter(t => t.dueDate).map(t => t.dueDate)
    ]);

    const firstDay = new Date(calYear, calMonth, 1).getDay();
    const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
    const todayStr = new Date().toISOString().slice(0, 10);

    let html = '';
    for (let i = 0; i < firstDay; i++) html += '<div></div>';
    for (let d = 1; d <= daysInMonth; d++) {
        const ds = `${calYear}-${String(calMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        const sel = ds === calSelectedDate;
        const today = ds === todayStr;
        const hasEv = eventDates.has(ds);
        html += `<div class="cal-day ${sel ? 'selected' : ''} ${today && !sel ? 'today' : ''}" onclick="selectCalDay('${ds}')">
            <span>${d}</span>
            ${hasEv ? '<div class="cal-dot"></div>' : ''}
        </div>`;
    }
    document.getElementById('calGrid').innerHTML = html;
    showCalDayEvents(calSelectedDate);
}

async function selectCalDay(dateStr) {
    calSelectedDate = dateStr;
    renderCalendar();
}

async function showCalDayEvents(dateStr) {
    const label = new Date(dateStr + 'T00:00:00').toLocaleDateString('id-ID', { weekday:'long', day:'numeric', month:'long' });
    document.getElementById('calDayLabel').textContent = label;

    const [events, debts, tasks] = await Promise.all([
        db.events.where('date').equals(dateStr).toArray(),
        db.debts.where('dueDate').equals(dateStr).toArray(),
        db.tasks.where('dueDate').equals(dateStr).toArray()
    ]);

    const all = [
        ...events.map(e => ({ label: e.title, sub: e.description || e.type, icon: 'bell', color: 'var(--accent)', id: e.id, src: 'event' })),
        ...debts.map(d => ({ label: d.name, sub: `${d.type==='debt'?'Utang':'Piutang'} · ${fmtRp(d.amount)}`, icon: 'hand-coins', color: d.type==='debt'?'var(--red)':'var(--green)', id: d.id, src: 'debt' })),
        ...tasks.map(t => ({ label: t.name, sub: `Kegiatan · Prioritas ${t.priority}`, icon: 'check-square', color: 'var(--blue)', id: t.id, src: 'task' }))
    ];

    const el = document.getElementById('calDayEvents');
    if (!all.length) {
        el.innerHTML = `<div class="empty-state py-6"><p class="text-sm">Tidak ada event di tanggal ini</p></div>`;
    } else {
        el.innerHTML = all.map(e => `
            <div class="flex items-center gap-3 p-3 rounded-2xl" style="background:var(--surface);border:1px solid var(--border)">
                <div style="width:36px;height:36px;border-radius:12px;background:rgba(255,255,255,0.05);display:flex;align-items:center;justify-content:center;flex-shrink:0">
                    <i data-lucide="${e.icon}" class="w-4 h-4" style="color:${e.color}"></i>
                </div>
                <div class="flex-1 min-w-0">
                    <p class="text-sm font-medium">${escHtml(e.label)}</p>
                    <p class="text-xs truncate" style="color:var(--text-muted)">${escHtml(e.sub)}</p>
                </div>
                ${e.src === 'event' ? `<button onclick="deleteEvent(${e.id})" class="btn-icon" style="color:var(--red);background:rgba(255,92,92,0.08);border-color:rgba(255,92,92,0.1)"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i></button>` : ''}
            </div>
        `).join('');
    }
    lucide.createIcons();
}

function showAddEventModal() {
    document.getElementById('evTitle').value = '';
    document.getElementById('evType').value = 'reminder';
    document.getElementById('evDate').value = calSelectedDate || new Date().toISOString().slice(0,10);
    document.getElementById('evDesc').value = '';
    openModal('eventModal');
}

async function saveEvent() {
    const title = document.getElementById('evTitle').value.trim();
    const date  = document.getElementById('evDate').value;
    if (!title) { showToast('Judul wajib diisi'); return; }
    if (!date)  { showToast('Pilih tanggal'); return; }
    await db.events.add({
        title, type: document.getElementById('evType').value,
        date, description: document.getElementById('evDesc').value.trim(),
        createdAt: new Date().toISOString()
    });
    closeModal('eventModal');
    showToast('Event ditambahkan!');
    renderCalendar();
}

async function deleteEvent(id) {
    await db.events.delete(id);
    showToast('Event dihapus');
    renderCalendar();
}