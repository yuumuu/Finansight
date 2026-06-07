// FinanSight - Full Application Logic
// Database + PIN + Dashboard + Debts + Tasks + Wishlist + Calendar + Simulator

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
let confirmCallback = null;
let pinBuffer = '';
let isSetupMode = false;

// ===================== INIT =====================
document.addEventListener('DOMContentLoaded', async () => {
    lucide.createIcons();
    document.getElementById('headerDate').textContent =
        new Date().toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    await loadTheme();
    await checkPin();
    initCalendar();
    lucide.createIcons();
});

// ===================== THEME =====================
async function loadTheme() {
    const setting = await db.settings.where('key').equals('theme').first();
    if (setting && setting.value === 'dark') {
        document.body.classList.add('dark');
        const icon = document.getElementById('themeIcon');
        if (icon) { icon.setAttribute('data-lucide', 'sun'); lucide.createIcons(); }
    }
}

async function toggleTheme() {
    const isDark = document.body.classList.toggle('dark');
    const icon = document.getElementById('themeIcon');
    icon.setAttribute('data-lucide', isDark ? 'sun' : 'moon');
    lucide.createIcons();
    const existing = await db.settings.where('key').equals('theme').first();
    if (existing) await db.settings.update(existing.id, { value: isDark ? 'dark' : 'light' });
    else await db.settings.add({ key: 'theme', value: isDark ? 'dark' : 'light' });
}

// ===================== PIN SYSTEM =====================
async function checkPin() {
    const pinRecord = await db.pin.toArray();
    if (pinRecord.length === 0) {
        isSetupMode = true;
        document.getElementById('pinLabel').textContent = 'Buat PIN 6 digit baru';
        showPinScreen();
    } else {
        isSetupMode = false;
        document.getElementById('pinLabel').textContent = 'Masukkan PIN untuk mengakses';
        showPinScreen();
    }
}

function showPinScreen() {
    document.getElementById('pinScreen').classList.remove('hidden');
    document.getElementById('mainApp').classList.add('hidden');
    pinBuffer = '';
    updatePinDots();
}

function hidePin() {
    document.getElementById('pinScreen').classList.add('hidden');
    document.getElementById('mainApp').classList.remove('hidden');
    switchTab('dashboard');
}

function pinInput(digit) {
    if (pinBuffer.length >= 6) return;
    pinBuffer += digit;
    updatePinDots();
    if (pinBuffer.length === 6) setTimeout(pinSubmit, 150);
}

function pinClear() {
    pinBuffer = pinBuffer.slice(0, -1);
    updatePinDots();
}

function updatePinDots() {
    for (let i = 0; i < 6; i++) {
        const dot = document.getElementById(`dot${i}`);
        if (dot) {
            dot.style.background = i < pinBuffer.length ? '#3b82f6' : '';
            dot.style.borderColor = i < pinBuffer.length ? '#3b82f6' : '';
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
        const record = await db.pin.toArray();
        if (record.length && record[0].hash === simpleHash(pinBuffer)) {
            hidePin();
        } else {
            showToast('PIN salah, coba lagi');
            pinBuffer = '';
            updatePinDots();
            shakePinDots();
        }
    }
}

function shakePinDots() {
    const dots = document.getElementById('pinDots');
    dots.style.animation = 'shake 0.4s ease';
    setTimeout(() => { dots.style.animation = ''; }, 400);
}

function resetPinFlow() {
    showConfirm('Reset PIN?', 'Semua data TIDAK akan dihapus, hanya PIN yang direset.', async () => {
        await db.pin.clear();
        isSetupMode = true;
        pinBuffer = '';
        updatePinDots();
        document.getElementById('pinLabel').textContent = 'Buat PIN 6 digit baru';
        showToast('Silakan buat PIN baru');
    });
}

function simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash) + str.charCodeAt(i);
        hash |= 0;
    }
    return hash.toString();
}

// ===================== NAVIGATION =====================
function switchTab(tab) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
    document.querySelectorAll('.nav-btn').forEach(el => el.classList.remove('active-nav'));

    const tabEl = document.getElementById(`tab-${tab}`);
    if (tabEl) { tabEl.classList.remove('hidden'); tabEl.classList.add('fade-in'); }

    const navBtns = document.querySelectorAll('.nav-btn');
    const tabOrder = ['dashboard', 'calendar', 'debts', 'tasks', 'planner'];
    const idx = tabOrder.indexOf(tab);
    if (navBtns[idx]) navBtns[idx].classList.add('active-nav');

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
    const m = document.getElementById(id);
    m.classList.add('hidden');
    m.classList.remove('flex');
}

// ===================== TOAST =====================
function showToast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 2500);
}

// ===================== CONFIRM =====================
function showConfirm(title, msg, cb) {
    document.getElementById('confirmTitle').textContent = title;
    document.getElementById('confirmMsg').textContent = msg;
    confirmCallback = cb;
    openModal('confirmModal');
    document.getElementById('confirmYes').onclick = () => { closeConfirm(); cb(); };
}
function closeConfirm() { closeModal('confirmModal'); }

// ===================== EXPORT / IMPORT =====================
function showExportModal() { openModal('exportModal'); }

async function exportData() {
    const data = {
        version: 1,
        exported: new Date().toISOString(),
        debts: await db.debts.toArray(),
        tasks: await db.tasks.toArray(),
        wishlist: await db.wishlist.toArray(),
        events: await db.events.toArray()
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `finansight-backup-${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    showToast('Data berhasil diekspor!');
}

async function importData(event) {
    const file = event.target.files[0];
    if (!file) return;
    try {
        const text = await file.text();
        const data = JSON.parse(text);
        if (!data.version) throw new Error('Format tidak valid');
        showConfirm('Impor Data?', 'Data lama akan ditimpa. Lanjutkan?', async () => {
            if (data.debts) { await db.debts.clear(); await db.debts.bulkAdd(data.debts.map(d => { delete d.id; return d; })); }
            if (data.tasks) { await db.tasks.clear(); await db.tasks.bulkAdd(data.tasks.map(d => { delete d.id; return d; })); }
            if (data.wishlist) { await db.wishlist.clear(); await db.wishlist.bulkAdd(data.wishlist.map(d => { delete d.id; return d; })); }
            if (data.events) { await db.events.clear(); await db.events.bulkAdd(data.events.map(d => { delete d.id; return d; })); }
            closeModal('exportModal');
            showToast('Data berhasil diimpor!');
            loadDashboard();
        });
    } catch (e) {
        showToast('Gagal impor: format tidak valid');
    }
}

// ===================== FORMAT =====================
function fmtRp(n) {
    return 'Rp ' + Number(n || 0).toLocaleString('id-ID');
}
function fmtDate(str) {
    if (!str) return '-';
    return new Date(str).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}
function daysDiff(dateStr) {
    const d = new Date(dateStr);
    const now = new Date(); now.setHours(0,0,0,0);
    d.setHours(0,0,0,0);
    return Math.round((d - now) / 86400000);
}

// ===================== DASHBOARD =====================
async function loadDashboard() {
    // Debts summary
    const debts = await db.debts.where('status').equals('unpaid').toArray();
    const totalDebt = debts.filter(d => d.type === 'debt').reduce((s, d) => s + Number(d.amount), 0);
    const totalRec  = debts.filter(d => d.type === 'receivable').reduce((s, d) => s + Number(d.amount), 0);
    const debtCount = debts.filter(d => d.type === 'debt').length;
    const recCount  = debts.filter(d => d.type === 'receivable').length;

    document.getElementById('dash-debt').textContent = fmtRp(totalDebt);
    document.getElementById('dash-debt-count').textContent = `${debtCount} transaksi aktif`;
    document.getElementById('dash-receivable').textContent = fmtRp(totalRec);
    document.getElementById('dash-receivable-count').textContent = `${recCount} transaksi aktif`;

    // Wishlist progress
    const wishes = await db.wishlist.orderBy('priority').toArray();
    const progEl = document.getElementById('dash-progress');
    if (wishes.length === 0) {
        progEl.innerHTML = `<div class="empty-state py-4"><p class="text-sm">Belum ada wishlist</p></div>`;
    } else {
        progEl.innerHTML = wishes.slice(0, 3).map(w => {
            const pct = Math.min(100, Math.round((w.currentSavings / w.targetPrice) * 100)) || 0;
            return `<div>
                <div class="flex justify-between text-xs mb-1">
                    <span class="font-medium">${escHtml(w.name)}</span>
                    <span class="text-sec-c">${pct}%</span>
                </div>
                <div class="progress-bar"><div class="progress-fill bg-blue-500" style="width:${pct}%"></div></div>
                <div class="flex justify-between text-xs text-sec-c mt-1">
                    <span>${fmtRp(w.currentSavings)}</span>
                    <span>${fmtRp(w.targetPrice)}</span>
                </div>
            </div>`;
        }).join('');
    }

    // Recent activities (last 5 from all tables)
    const allDebts = (await db.debts.orderBy('createdAt').reverse().limit(3).toArray()).map(d => ({
        label: d.type === 'debt' ? 'Utang' : 'Piutang',
        name: d.name,
        sub: fmtRp(d.amount),
        icon: 'hand-coins',
        color: d.type === 'debt' ? 'text-red-500' : 'text-green-500',
        ts: d.createdAt
    }));
    const allTasks = (await db.tasks.orderBy('createdAt').reverse().limit(3).toArray()).map(t => ({
        label: 'Kegiatan',
        name: t.name,
        sub: t.completed ? 'Selesai' : `Deadline: ${fmtDate(t.dueDate)}`,
        icon: 'check-square',
        color: 'text-blue-500',
        ts: t.createdAt
    }));
    const allWishes = (await db.wishlist.orderBy('createdAt').reverse().limit(2).toArray()).map(w => ({
        label: 'Wishlist',
        name: w.name,
        sub: fmtRp(w.targetPrice),
        icon: 'shopping-bag',
        color: 'text-purple-500',
        ts: w.createdAt
    }));

    const recent = [...allDebts, ...allTasks, ...allWishes]
        .sort((a, b) => new Date(b.ts) - new Date(a.ts))
        .slice(0, 5);

    const recEl = document.getElementById('dash-recent');
    if (recent.length === 0) {
        recEl.innerHTML = `<div class="empty-state py-4"><p class="text-sm">Belum ada aktivitas</p></div>`;
    } else {
        recEl.innerHTML = recent.map(r => `
            <div class="flex items-center gap-3">
                <div class="w-9 h-9 rounded-xl flex items-center justify-center" style="background:var(--border)">
                    <i data-lucide="${r.icon}" class="w-4 h-4 ${r.color}"></i>
                </div>
                <div class="flex-1 min-w-0">
                    <p class="text-sm font-medium truncate">${escHtml(r.name)}</p>
                    <p class="text-xs text-sec-c">${escHtml(r.sub)}</p>
                </div>
                <span class="text-xs px-2 py-1 rounded-lg" style="background:var(--border);color:var(--text-sec)">${r.label}</span>
            </div>
        `).join('');
    }
    lucide.createIcons();
}

// ===================== DEBTS =====================
function showAddDebtModal(id) {
    document.getElementById('debtId').value = '';
    document.getElementById('debtName').value = '';
    document.getElementById('debtType').value = 'debt';
    document.getElementById('debtAmount').value = '';
    document.getElementById('debtDue').value = '';
    document.getElementById('debtNote').value = '';
    document.getElementById('debtModalTitle').textContent = id ? 'Edit Transaksi' : 'Tambah Transaksi';
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
    if (!amount || amount <= 0) { showToast('Jumlah harus valid'); return; }

    const data = {
        name,
        type: document.getElementById('debtType').value,
        amount,
        dueDate: document.getElementById('debtDue').value || null,
        note: document.getElementById('debtNote').value.trim(),
        status: 'unpaid',
        createdAt: new Date().toISOString()
    };
    const id = document.getElementById('debtId').value;
    if (id) await db.debts.update(Number(id), data);
    else await db.debts.add(data);

    closeModal('debtModal');
    showToast('Transaksi disimpan!');
    renderDebts();
    loadDashboard();
}

async function renderDebts() {
    let items = await db.debts.orderBy('dueDate').toArray();
    const today = new Date(); today.setHours(0,0,0,0);

    if (debtFilter === 'debt') items = items.filter(d => d.type === 'debt');
    else if (debtFilter === 'receivable') items = items.filter(d => d.type === 'receivable');
    else if (debtFilter === 'overdue') items = items.filter(d => d.status === 'unpaid' && d.dueDate && new Date(d.dueDate) < today);
    else if (debtFilter === 'paid') items = items.filter(d => d.status === 'paid');

    const el = document.getElementById('debtsList');
    if (items.length === 0) {
        el.innerHTML = `<div class="empty-state"><i data-lucide="inbox" class="w-10 h-10 mx-auto mb-3 opacity-30"></i><p>Tidak ada data</p></div>`;
        lucide.createIcons(); return;
    }

    el.innerHTML = items.map(d => {
        const diff = d.dueDate ? daysDiff(d.dueDate) : null;
        const overdue = diff !== null && diff < 0 && d.status === 'unpaid';
        const soon = diff !== null && diff >= 0 && diff <= 3 && d.status === 'unpaid';
        const isPaid = d.status === 'paid';

        let badge = d.type === 'debt'
            ? `<span class="badge badge-debt">Utang</span>`
            : `<span class="badge badge-rec">Piutang</span>`;
        if (overdue) badge += `<span class="badge badge-warn ml-1">Terlambat</span>`;
        if (soon && !overdue) badge += `<span class="badge badge-blue ml-1">Segera</span>`;
        if (isPaid) badge += `<span class="badge ml-1" style="background:var(--border);color:var(--text-sec)">Lunas</span>`;

        return `
        <div class="card p-4 item-card">
            <div class="flex justify-between items-start gap-2">
                <div class="flex-1 min-w-0">
                    <div class="flex flex-wrap gap-1 mb-1">${badge}</div>
                    <p class="font-semibold ${isPaid ? 'line-through opacity-60' : ''}">${escHtml(d.name)}</p>
                    <p class="text-lg font-bold ${d.type === 'debt' ? 'text-red-500' : 'text-green-600'}">${fmtRp(d.amount)}</p>
                    ${d.dueDate ? `<p class="text-xs text-sec-c mt-1"><i data-lucide="calendar" class="w-3 h-3 inline"></i> ${fmtDate(d.dueDate)}${overdue ? ` · <span class="text-red-500">${Math.abs(diff)} hari terlambat</span>` : diff !== null && diff >= 0 ? ` · ${diff === 0 ? 'Hari ini' : diff + ' hari lagi'}` : ''}</p>` : ''}
                    ${d.note ? `<p class="text-xs text-sec-c mt-1 truncate">${escHtml(d.note)}</p>` : ''}
                </div>
                <div class="flex flex-col gap-2 ml-2">
                    ${!isPaid ? `<button onclick="markDebtPaid(${d.id})" class="p-2 rounded-xl bg-green-500 text-white" title="Lunas"><i data-lucide="check" class="w-4 h-4"></i></button>` : ''}
                    <button onclick="showEditDebtModal(${d.id})" class="p-2 rounded-xl" style="background:var(--border)" title="Edit"><i data-lucide="pencil" class="w-4 h-4"></i></button>
                    <button onclick="deleteDebt(${d.id})" class="p-2 rounded-xl bg-red-50 text-red-500" title="Hapus"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
                </div>
            </div>
        </div>`;
    }).join('');
    lucide.createIcons();
}

function setDebtFilter(f) {
    debtFilter = f;
    document.querySelectorAll('.filter-btn[data-df]').forEach(b => {
        b.classList.toggle('active', b.dataset.df === f);
    });
    renderDebts();
}

async function markDebtPaid(id) {
    await db.debts.update(id, { status: 'paid' });
    showToast('Ditandai lunas!');
    renderDebts();
    loadDashboard();
}

async function deleteDebt(id) {
    showConfirm('Hapus Transaksi?', 'Data ini akan dihapus permanen.', async () => {
        await db.debts.delete(id);
        showToast('Dihapus!');
        renderDebts();
        loadDashboard();
    });
}

// ===================== TASKS =====================
function showAddTaskModal() {
    document.getElementById('taskId').value = '';
    document.getElementById('taskName').value = '';
    document.getElementById('taskDue').value = '';
    document.getElementById('taskPriority').value = 'medium';
    document.getElementById('taskNotes').value = '';
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
        name,
        dueDate: document.getElementById('taskDue').value || null,
        priority: document.getElementById('taskPriority').value,
        notes: document.getElementById('taskNotes').value.trim(),
        completed: false,
        createdAt: new Date().toISOString()
    };
    const id = document.getElementById('taskId').value;
    if (id) { delete data.completed; await db.tasks.update(Number(id), data); }
    else await db.tasks.add(data);

    closeModal('taskModal');
    showToast('Kegiatan disimpan!');
    renderTasks();
}

async function renderTasks() {
    let items = await db.tasks.orderBy('dueDate').toArray();
    if (taskFilter === 'pending') items = items.filter(t => !t.completed);
    else if (taskFilter === 'completed') items = items.filter(t => t.completed);

    // Sort: incomplete first by priority weight, then date
    const pw = { high: 0, medium: 1, low: 2 };
    items.sort((a, b) => {
        if (a.completed !== b.completed) return a.completed ? 1 : -1;
        if (!a.completed) {
            const pd = pw[a.priority] - pw[b.priority];
            if (pd !== 0) return pd;
        }
        return (a.dueDate || '9999') < (b.dueDate || '9999') ? -1 : 1;
    });

    const el = document.getElementById('tasksList');
    if (items.length === 0) {
        el.innerHTML = `<div class="empty-state"><i data-lucide="check-circle" class="w-10 h-10 mx-auto mb-3 opacity-30"></i><p>Tidak ada kegiatan</p></div>`;
        lucide.createIcons(); return;
    }

    const pColor = { high: 'text-red-500', medium: 'text-yellow-500', low: 'text-green-500' };
    const pLabel = { high: 'Tinggi', medium: 'Sedang', low: 'Rendah' };

    el.innerHTML = items.map(t => {
        const diff = t.dueDate ? daysDiff(t.dueDate) : null;
        const overdue = diff !== null && diff < 0 && !t.completed;
        return `
        <div class="card p-4 item-card ${t.completed ? 'opacity-70' : ''}">
            <div class="flex items-start gap-3">
                <button onclick="toggleTask(${t.id})" class="mt-0.5 w-6 h-6 rounded-lg border-2 flex items-center justify-center flex-shrink-0 transition-all ${t.completed ? 'bg-blue-500 border-blue-500' : 'border-gray-300'}">
                    ${t.completed ? '<i data-lucide="check" class="w-3 h-3 text-white"></i>' : ''}
                </button>
                <div class="flex-1 min-w-0">
                    <p class="font-medium ${t.completed ? 'line-through opacity-60' : ''}">${escHtml(t.name)}</p>
                    <div class="flex flex-wrap gap-2 mt-1">
                        <span class="text-xs font-medium ${pColor[t.priority]}">${pLabel[t.priority]}</span>
                        ${t.dueDate ? `<span class="text-xs text-sec-c">${overdue ? '<span class="text-red-500">Terlambat · ' : ''}${fmtDate(t.dueDate)}${overdue ? '</span>' : ''}</span>` : ''}
                    </div>
                    ${t.notes ? `<p class="text-xs text-sec-c mt-1 truncate">${escHtml(t.notes)}</p>` : ''}
                </div>
                <div class="flex gap-1 ml-2">
                    <button onclick="showEditTaskModal(${t.id})" class="p-2 rounded-xl" style="background:var(--border)"><i data-lucide="pencil" class="w-3 h-3"></i></button>
                    <button onclick="deleteTask(${t.id})" class="p-2 rounded-xl bg-red-50 text-red-500"><i data-lucide="trash-2" class="w-3 h-3"></i></button>
                </div>
            </div>
        </div>`;
    }).join('');
    lucide.createIcons();
}

function setTaskFilter(f) {
    taskFilter = f;
    document.querySelectorAll('.filter-btn[data-tf]').forEach(b => {
        b.classList.toggle('active', b.dataset.tf === f);
    });
    renderTasks();
}

async function toggleTask(id) {
    const t = await db.tasks.get(id);
    await db.tasks.update(id, { completed: !t.completed });
    showToast(t.completed ? 'Ditandai belum selesai' : 'Selesai!');
    renderTasks();
}

async function deleteTask(id) {
    showConfirm('Hapus Kegiatan?', 'Data ini akan dihapus permanen.', async () => {
        await db.tasks.delete(id);
        showToast('Dihapus!');
        renderTasks();
    });
}

// ===================== WISHLIST =====================
function showAddWishlistModal() {
    document.getElementById('wishId').value = '';
    document.getElementById('wishName').value = '';
    document.getElementById('wishPrice').value = '';
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
    if (!price || price <= 0) { showToast('Harga harus valid'); return; }

    const data = {
        name,
        targetPrice: price,
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

    if (items.length === 0) {
        el.innerHTML = `<div class="empty-state card py-10"><i data-lucide="shopping-bag" class="w-10 h-10 mx-auto mb-3 opacity-30"></i><p>Belum ada wishlist</p></div>`;
        lucide.createIcons(); return;
    }

    el.innerHTML = items.map(w => {
        const pct = Math.min(100, Math.round((w.currentSavings / w.targetPrice) * 100)) || 0;
        const remaining = Math.max(0, w.targetPrice - w.currentSavings);
        return `
        <div class="card p-4 item-card">
            <div class="flex justify-between items-start gap-2 mb-3">
                <div>
                    <div class="flex items-center gap-2 mb-1">
                        <span class="text-xs font-bold text-blue-500">P${w.priority}</span>
                        <p class="font-semibold">${escHtml(w.name)}</p>
                    </div>
                    <p class="text-xl font-bold">${fmtRp(w.targetPrice)}</p>
                    <p class="text-xs text-sec-c">Sisa: ${fmtRp(remaining)}</p>
                </div>
                <div class="flex gap-1">
                    <button onclick="openAddSavings(${w.id})" class="p-2 rounded-xl bg-green-500 text-white" title="Tambah Tabungan"><i data-lucide="plus" class="w-4 h-4"></i></button>
                    <button onclick="showEditWishlistModal(${w.id})" class="p-2 rounded-xl" style="background:var(--border)"><i data-lucide="pencil" class="w-4 h-4"></i></button>
                    <button onclick="deleteWishlist(${w.id})" class="p-2 rounded-xl bg-red-50 text-red-500"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
                </div>
            </div>
            <div class="progress-bar mb-1"><div class="progress-fill ${pct >= 100 ? 'bg-green-500' : 'bg-blue-500'}" style="width:${pct}%"></div></div>
            <div class="flex justify-between text-xs text-sec-c">
                <span>${fmtRp(w.currentSavings)} terkumpul</span>
                <span class="font-semibold ${pct >= 100 ? 'text-green-500' : 'text-blue-500'}">${pct}%</span>
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
    document.getElementById('savingsItemName').textContent = w.name + ' — terkumpul: ' + fmtRp(w.currentSavings);
    document.getElementById('savingsAmount').value = '';
    openModal('addSavingsModal');
}

async function addSavings() {
    const id = Number(document.getElementById('savingsItemId').value);
    const amt = parseFloat(document.getElementById('savingsAmount').value);
    if (!amt || amt <= 0) { showToast('Jumlah harus valid'); return; }
    const w = await db.wishlist.get(id);
    await db.wishlist.update(id, { currentSavings: (w.currentSavings || 0) + amt });
    closeModal('addSavingsModal');
    showToast('Tabungan ditambahkan!');
    renderWishlist();
    loadDashboard();
}

async function deleteWishlist(id) {
    showConfirm('Hapus Wishlist?', 'Data ini akan dihapus permanen.', async () => {
        await db.wishlist.delete(id);
        showToast('Dihapus!');
        renderWishlist();
        loadDashboard();
    });
}

// ===================== SAVINGS SIMULATOR =====================
async function updateSimOptions() {
    const items = await db.wishlist.orderBy('priority').toArray();
    const sel = document.getElementById('simItem');
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

function clearOther(id) {
    document.getElementById(id).value = '';
}

function calculateSim() {
    const price = parseFloat(document.getElementById('simPrice').value) || 0;
    const current = parseFloat(document.getElementById('simCurrent').value) || 0;
    const months = parseFloat(document.getElementById('simMonths').value);
    const monthly = parseFloat(document.getElementById('simMonthly').value);
    const remaining = Math.max(0, price - current);

    if (price <= 0) { showToast('Masukkan harga target'); return; }
    const resultEl = document.getElementById('simResult');
    resultEl.classList.remove('hidden');

    let html = '';
    if (months > 0) {
        const needed = remaining / months;
        const endDate = new Date();
        endDate.setMonth(endDate.getMonth() + months);
        html = `
            <p class="font-semibold text-sm mb-2">Hasil Simulasi</p>
            <div class="space-y-1 text-sm">
                <div class="flex justify-between"><span class="text-sec-c">Harga target</span><span class="font-medium">${fmtRp(price)}</span></div>
                <div class="flex justify-between"><span class="text-sec-c">Sudah terkumpul</span><span class="font-medium text-green-500">${fmtRp(current)}</span></div>
                <div class="flex justify-between"><span class="text-sec-c">Sisa kebutuhan</span><span class="font-medium text-red-500">${fmtRp(remaining)}</span></div>
                <div class="flex justify-between"><span class="text-sec-c">Target bulan</span><span class="font-medium">${months} bulan</span></div>
                <div class="flex justify-between border-t border-gray-200 pt-2 mt-2"><span class="font-semibold">Per bulan</span><span class="font-bold text-blue-500">${fmtRp(Math.ceil(needed))}</span></div>
                <div class="flex justify-between"><span class="text-sec-c">Estimasi selesai</span><span class="font-medium">${endDate.toLocaleDateString('id-ID', {month:'long', year:'numeric'})}</span></div>
            </div>`;
    } else if (monthly > 0) {
        const monthsNeeded = Math.ceil(remaining / monthly);
        const endDate = new Date();
        endDate.setMonth(endDate.getMonth() + monthsNeeded);
        html = `
            <p class="font-semibold text-sm mb-2">Hasil Simulasi</p>
            <div class="space-y-1 text-sm">
                <div class="flex justify-between"><span class="text-sec-c">Harga target</span><span class="font-medium">${fmtRp(price)}</span></div>
                <div class="flex justify-between"><span class="text-sec-c">Sudah terkumpul</span><span class="font-medium text-green-500">${fmtRp(current)}</span></div>
                <div class="flex justify-between"><span class="text-sec-c">Sisa kebutuhan</span><span class="font-medium text-red-500">${fmtRp(remaining)}</span></div>
                <div class="flex justify-between"><span class="text-sec-c">Tabungan per bulan</span><span class="font-medium">${fmtRp(monthly)}</span></div>
                <div class="flex justify-between border-t border-gray-200 pt-2 mt-2"><span class="font-semibold">Selesai dalam</span><span class="font-bold text-blue-500">${monthsNeeded} bulan</span></div>
                <div class="flex justify-between"><span class="text-sec-c">Estimasi selesai</span><span class="font-medium">${endDate.toLocaleDateString('id-ID', {month:'long', year:'numeric'})}</span></div>
            </div>`;
    } else {
        showToast('Isi salah satu: target bulan atau nominal per bulan');
        resultEl.classList.add('hidden');
        return;
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
    renderCalendar();
}

function changeMonth(delta) {
    calMonth += delta;
    if (calMonth < 0) { calMonth = 11; calYear--; }
    if (calMonth > 11) { calMonth = 0; calYear++; }
    renderCalendar();
}

async function renderCalendar() {
    document.getElementById('calMonthLabel').textContent = `${MONTHS_ID[calMonth]} ${calYear}`;

    // Get all events for markers
    const allEvents = await db.events.toArray();
    const allDebts  = await db.debts.where('status').equals('unpaid').toArray();
    const allTasks  = await db.tasks.where('completed').equals(0).toArray();

    const eventDates = new Set([
        ...allEvents.map(e => e.date),
        ...allDebts.filter(d => d.dueDate).map(d => d.dueDate),
        ...allTasks.filter(t => t.dueDate).map(t => t.dueDate)
    ]);

    const firstDay = new Date(calYear, calMonth, 1).getDay(); // 0=Sun
    const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
    const todayStr = new Date().toISOString().slice(0, 10);

    const grid = document.getElementById('calGrid');
    let html = '';

    for (let i = 0; i < firstDay; i++) html += `<div></div>`;
    for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${calYear}-${String(calMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        const sel = dateStr === calSelectedDate;
        const today = dateStr === todayStr;
        const hasEv = eventDates.has(dateStr);
        html += `<div class="cal-day ${sel ? 'selected' : ''} ${today && !sel ? 'today' : ''}" onclick="selectCalDay('${dateStr}')">
            <span>${d}</span>
            ${hasEv ? '<div class="dot"></div>' : ''}
        </div>`;
    }
    grid.innerHTML = html;
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

    const el = document.getElementById('calDayEvents');
    const all = [
        ...events.map(e => ({ label: e.title, sub: e.description || e.type, icon: 'bell', color: 'text-orange-500', id: e.id, src: 'event' })),
        ...debts.map(d => ({ label: d.name, sub: `${d.type === 'debt' ? 'Utang' : 'Piutang'} · ${fmtRp(d.amount)}`, icon: 'hand-coins', color: d.type === 'debt' ? 'text-red-500' : 'text-green-500', id: d.id, src: 'debt' })),
        ...tasks.map(t => ({ label: t.name, sub: `Deadline Kegiatan · Prioritas ${t.priority}`, icon: 'check-square', color: 'text-blue-500', id: t.id, src: 'task' }))
    ];

    if (all.length === 0) {
        el.innerHTML = `<div class="empty-state py-6"><p class="text-sm">Tidak ada event di tanggal ini</p></div>`;
    } else {
        el.innerHTML = all.map(e => `
            <div class="flex items-start gap-3 p-3 rounded-xl" style="background:var(--border)">
                <i data-lucide="${e.icon}" class="w-4 h-4 mt-0.5 ${e.color} flex-shrink-0"></i>
                <div class="flex-1 min-w-0">
                    <p class="text-sm font-medium">${escHtml(e.label)}</p>
                    <p class="text-xs text-sec-c truncate">${escHtml(e.sub)}</p>
                </div>
                ${e.src === 'event' ? `<button onclick="deleteEvent(${e.id})" class="text-red-400"><i data-lucide="trash-2" class="w-3 h-3"></i></button>` : ''}
            </div>
        `).join('');
    }
    lucide.createIcons();
}

function showAddEventModal() {
    document.getElementById('evTitle').value = '';
    document.getElementById('evType').value = 'reminder';
    document.getElementById('evDate').value = calSelectedDate || new Date().toISOString().slice(0, 10);
    document.getElementById('evDesc').value = '';
    openModal('eventModal');
}

async function saveEvent() {
    const title = document.getElementById('evTitle').value.trim();
    const date  = document.getElementById('evDate').value;
    if (!title) { showToast('Judul event wajib diisi'); return; }
    if (!date)  { showToast('Pilih tanggal'); return; }

    await db.events.add({
        title,
        type: document.getElementById('evType').value,
        date,
        description: document.getElementById('evDesc').value.trim(),
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

// ===================== UTILS =====================
function escHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// Add CSS shake keyframes dynamically
const style = document.createElement('style');
style.textContent = `@keyframes shake { 0%,100%{transform:translateX(0)} 25%{transform:translateX(-8px)} 75%{transform:translateX(8px)} }`;
document.head.appendChild(style);
