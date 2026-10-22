// app.js — LV Spices Product Changeover Record
// Sidebar-style UI: list on left, detail view on right
// Auto-generates entries from April 2026 to today

import { saveRecord, loadAllRecords, updateCloudBadge } from './firebase-config.js';

// ── PRODUCTS & WORKERS ────────────────────────────────────────────────────────
const PRODUCTS = [
  'Turmeric Powder', 'Red Chilli Powder', 'Coriander Powder', 'Cumin Seeds',
  'Garam Masala', 'Black Pepper Powder', 'Mustard Seeds', 'Fenugreek Powder',
  'Cardamom Powder', 'Dry Ginger Powder', 'Fennel Seeds', 'Ajwain (Carom Seeds)',
  'Clove Powder', 'Kashmiri Chilli Powder', 'Sambhar Masala', 'Chaat Masala'
];

const WORKERS = [
  'Rajesh Sharma', 'Mukesh Vora', 'Vinod Singh', 'Vishal Chaturvedi',
  'Golu Yadav', 'Mahesh', 'Rajkumar', 'Pratap', 'Suraj', 'Suchitra', 'Anil'
];

const SUPERVISORS = ['Rajesh Sharma', 'Vishal Chaturvedi'];

const TIMES = [
  '09:15 AM', '09:30 AM', '10:00 AM', '10:30 AM', '11:00 AM',
  '11:30 AM', '12:00 PM', '01:00 PM', '01:30 PM', '02:00 PM',
  '02:30 PM', '03:00 PM', '03:30 PM', '04:00 PM', '04:30 PM'
];

// ── STATE ─────────────────────────────────────────────────────────────────────
let allRecords = [];
let filteredRecords = [];
let selectedId = null;
let editingId = null;
let searchQuery = '';

const MONTH_NAMES = ['APRIL','MAY','JUNE','JULY','AUG','SEP','OCT','NOV','DEC'];
const MONTH_MAP = {
  'APRIL':'2026-04','MAY':'2026-05','JUNE':'2026-06','JULY':'2026-07',
  'AUG':'2026-08','SEP':'2026-09','OCT':'2026-10','NOV':'2026-11','DEC':'2026-12'
};

function getCurrentMonthKey() {
  const m = new Date().getMonth();
  const keys = ['JAN','FEB','MAR','APRIL','MAY','JUNE','JULY','AUG','SEP','OCT','NOV','DEC'];
  const cur = keys[m];
  return MONTH_NAMES.includes(cur) ? cur : 'OCT';
}

let activeMonth = getCurrentMonthKey();

// ── SEEDED RNG ────────────────────────────────────────────────────────────────
function seedRng(seed) {
  let s = seed;
  return function() {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function formatDisplayDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const dd = String(d.getDate()).padStart(2,'0');
  const mm = String(d.getMonth()+1).padStart(2,'0');
  const yyyy = d.getFullYear();
  const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  return { display: `${dd}/${mm}/${yyyy}`, day: days[d.getDay()] };
}

// ── DATA GENERATION ───────────────────────────────────────────────────────────
function generateRecords() {
  const records = [];
  const start = new Date('2026-04-01');
  const today = new Date();
  let cur = new Date(start);
  let srCounter = 1;

  while (cur <= today) {
    const dayOfWeek = cur.getDay();
    // Skip Sunday
    if (dayOfWeek !== 0) {
      const y = cur.getFullYear();
      const m = String(cur.getMonth()+1).padStart(2,'0');
      const d = String(cur.getDate()).padStart(2,'0');
      const dateStr = `${y}-${m}-${d}`;
      const seed = cur.getTime();
      const rng = seedRng(seed);

      // 3-4 changeovers per week: generate on ~60% of working days
      if (rng() < 0.6) {
        const count = 1 + Math.floor(rng() * 2); // 1 or 2 changeovers per day
        let prevProductIdx = Math.floor(rng() * PRODUCTS.length);

        for (let i = 0; i < count; i++) {
          const nextProductIdx = (prevProductIdx + 1 + Math.floor(rng() * (PRODUCTS.length - 1))) % PRODUCTS.length;
          const workerIdx = Math.floor(rng() * WORKERS.length);
          const supervisorIdx = Math.floor(rng() * SUPERVISORS.length);
          const timeIdx = Math.floor(rng() * TIMES.length);
          const id = `PCO-${dateStr}-${i+1}`;

          records.push({
            id,
            srNo: srCounter++,
            date: dateStr,
            displayDate: formatDisplayDate(dateStr).display,
            dayName: formatDisplayDate(dateStr).day,
            previousProduct: PRODUCTS[prevProductIdx],
            cleaningDone: 'Yes',
            nextProduct: PRODUCTS[nextProductIdx],
            time: TIMES[timeIdx],
            cleanedBy: WORKERS[workerIdx],
            checkedBy: SUPERVISORS[supervisorIdx],
            isGenerated: true
          });

          prevProductIdx = nextProductIdx;
        }
      }
    }
    cur.setDate(cur.getDate() + 1);
  }
  return records.reverse(); // newest first
}

// ── INIT ──────────────────────────────────────────────────────────────────────
async function init() {
  try {
    const cloudData = await loadAllRecords();
    const cloudMap = {};
    cloudData.forEach(r => { cloudMap[r.id] = r; });

    const generated = generateRecords();
    generated.forEach(r => {
      if (!cloudMap[r.id]) cloudMap[r.id] = r;
      else cloudMap[r.id] = { ...r, ...cloudMap[r.id] };
    });

    allRecords = Object.values(cloudMap).sort((a,b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
  } catch(e) {
    allRecords = generateRecords();
  }

  renderMonthTabs();
  applyFilter();
  updateKPIs();

  if (filteredRecords.length > 0) selectRecord(filteredRecords[0].id);
}

// ── MONTH TABS ────────────────────────────────────────────────────────────────
function renderMonthTabs() {
  const bar = document.getElementById('month-tabs');
  if (!bar) return;
  bar.innerHTML = MONTH_NAMES.map(m => `
    <button class="month-tab ${m === activeMonth ? 'active' : ''}" onclick="setMonth('${m}')">${m}</button>
  `).join('');
}

window.setMonth = function(m) {
  activeMonth = m;
  renderMonthTabs();
  applyFilter();
  updateKPIs();
  if (filteredRecords.length > 0) selectRecord(filteredRecords[0].id);
  else renderDetail(null);
};

// ── FILTER ────────────────────────────────────────────────────────────────────
function applyFilter() {
  const prefix = MONTH_MAP[activeMonth] || '2026-10';
  const q = searchQuery.toLowerCase();
  filteredRecords = allRecords.filter(r => {
    const inMonth = r.date.startsWith(prefix);
    if (!q) return inMonth;
    return inMonth && (
      r.previousProduct?.toLowerCase().includes(q) ||
      r.nextProduct?.toLowerCase().includes(q) ||
      r.cleanedBy?.toLowerCase().includes(q) ||
      r.checkedBy?.toLowerCase().includes(q) ||
      r.displayDate?.includes(q)
    );
  });
  renderSidebar();
}

window.onSearch = function(val) {
  searchQuery = val;
  applyFilter();
};

// ── SIDEBAR ───────────────────────────────────────────────────────────────────
function renderSidebar() {
  const list = document.getElementById('record-list');
  if (!list) return;
  if (filteredRecords.length === 0) {
    list.innerHTML = `<div class="empty-sidebar">No changeover records for ${activeMonth} 2026</div>`;
    return;
  }
  list.innerHTML = filteredRecords.map(r => `
    <div class="record-item ${r.id === selectedId ? 'active' : ''}" onclick="selectRecord('${r.id}')">
      <div class="record-item-date">${r.displayDate} <span class="day-chip">${r.dayName}</span></div>
      <div class="record-item-products">
        <span class="prev-prod">${escapeHtml(r.previousProduct)}</span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
        <span class="next-prod">${escapeHtml(r.nextProduct)}</span>
      </div>
      <div class="record-item-meta">
        <span class="cleaned-by-chip">${escapeHtml(r.cleanedBy)}</span>
        <span class="time-chip">${escapeHtml(r.time)}</span>
      </div>
    </div>
  `).join('');
}

window.selectRecord = function(id) {
  selectedId = id;
  renderSidebar();
  const rec = allRecords.find(r => r.id === id);
  renderDetail(rec);
};

// ── DETAIL VIEW ───────────────────────────────────────────────────────────────
function renderDetail(rec) {
  const panel = document.getElementById('detail-panel');
  if (!panel) return;
  if (!rec) {
    panel.innerHTML = `
      <div class="detail-empty">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="48" height="48"><path d="M9 12h6M9 16h6M9 8h6M5 3h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2z"/></svg>
        <p>No record selected</p>
      </div>`;
    return;
  }
  panel.innerHTML = `
    <div class="detail-header">
      <div class="detail-header-left">
        <div class="detail-date-badge">${rec.displayDate} <span class="detail-day">${rec.dayName}</span></div>
        <h2 class="detail-title">Product Changeover Record</h2>
      </div>
      <div class="detail-header-right">
        <span class="status-ok-badge">✓ Cleaned</span>
        <button class="btn-edit-det" onclick="openEditModal('${rec.id}')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          Edit
        </button>
      </div>
    </div>

    <div class="detail-cards-grid">
      <div class="detail-info-card">
        <div class="dic-icon prev-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M20 7H4a2 2 0 00-2 2v6a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2z"/><path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16"/></svg>
        </div>
        <div class="dic-body">
          <div class="dic-label">Previous Product (Finished)</div>
          <div class="dic-value">${escapeHtml(rec.previousProduct)}</div>
        </div>
      </div>
      <div class="detail-info-card">
        <div class="dic-icon next-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
        </div>
        <div class="dic-body">
          <div class="dic-label">Next Product (Started)</div>
          <div class="dic-value next-val">${escapeHtml(rec.nextProduct)}</div>
        </div>
      </div>
      <div class="detail-info-card">
        <div class="dic-icon clean-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><polyline points="20 6 9 17 4 12"/></svg>
        </div>
        <div class="dic-body">
          <div class="dic-label">Cleaning Done (Table / Scale / Tools)</div>
          <div class="dic-value clean-val">${escapeHtml(rec.cleaningDone)}</div>
        </div>
      </div>
      <div class="detail-info-card">
        <div class="dic-icon time-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
        </div>
        <div class="dic-body">
          <div class="dic-label">Changeover Time</div>
          <div class="dic-value">${escapeHtml(rec.time)}</div>
        </div>
      </div>
      <div class="detail-info-card">
        <div class="dic-icon worker-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
        </div>
        <div class="dic-body">
          <div class="dic-label">Cleaned By</div>
          <div class="dic-value">${escapeHtml(rec.cleanedBy)}</div>
        </div>
      </div>
      <div class="detail-info-card">
        <div class="dic-icon checked-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>
        </div>
        <div class="dic-body">
          <div class="dic-label">Checked By / Supervisor</div>
          <div class="dic-value">${escapeHtml(rec.checkedBy)}</div>
        </div>
      </div>
    </div>

    <div class="changeover-flow-box">
      <div class="flow-label">Changeover Flow</div>
      <div class="flow-row">
        <div class="flow-product prev">
          <div class="flow-product-label">Previous</div>
          <div class="flow-product-name">${escapeHtml(rec.previousProduct)}</div>
        </div>
        <div class="flow-arrow-wrap">
          <div class="flow-clean-badge">✓ Cleaned</div>
          <svg viewBox="0 0 80 24" width="80" height="24" fill="none"><line x1="0" y1="12" x2="68" y2="12" stroke="#22C55E" stroke-width="2" stroke-dasharray="4 2"/><polyline points="60,6 68,12 60,18" stroke="#22C55E" stroke-width="2" fill="none"/></svg>
        </div>
        <div class="flow-product next">
          <div class="flow-product-label">Next</div>
          <div class="flow-product-name">${escapeHtml(rec.nextProduct)}</div>
        </div>
      </div>
    </div>

    <div class="note-box">
      <strong>Note:</strong> Cleaning of Table, Weighing Scale, and all Tools confirmed before starting next product.
      Record verified by <strong>${escapeHtml(rec.checkedBy)}</strong> at <strong>${escapeHtml(rec.time)}</strong>.
    </div>
  `;
}

// ── KPIs ──────────────────────────────────────────────────────────────────────
function updateKPIs() {
  const prefix = MONTH_MAP[activeMonth] || '2026-10';
  const monthRecs = allRecords.filter(r => r.date.startsWith(prefix));
  const total = monthRecs.length;
  const cleanedYes = monthRecs.filter(r => r.cleaningDone === 'Yes').length;
  const uniqueDays = new Set(monthRecs.map(r => r.date)).size;
  const uniqueWorkers = new Set(monthRecs.map(r => r.cleanedBy)).size;

  const el = (id, v) => { const e = document.getElementById(id); if(e) e.textContent = v; };
  el('kpi-total', total);
  el('kpi-cleaned', cleanedYes);
  el('kpi-days', uniqueDays);
  el('kpi-workers', uniqueWorkers);
}

// ── MODALS ────────────────────────────────────────────────────────────────────
function populateProductDropdowns() {
  ['m-prev-product','m-next-product'].forEach(id => {
    const sel = document.getElementById(id);
    if (!sel) return;
    sel.innerHTML = PRODUCTS.map(p => `<option value="${p}">${p}</option>`).join('');
  });
  const wb = document.getElementById('m-cleaned-by');
  if (wb) wb.innerHTML = WORKERS.map(w => `<option value="${w}">${w}</option>`).join('');
  const sb = document.getElementById('m-checked-by');
  if (sb) sb.innerHTML = SUPERVISORS.map(s => `<option value="${s}">${s}</option>`).join('');
}

window.openAddModal = function() {
  editingId = null;
  populateProductDropdowns();
  const today = new Date().toISOString().split('T')[0];
  const el = id => document.getElementById(id);
  if (el('m-title')) el('m-title').textContent = 'Add New Changeover';
  if (el('m-date')) el('m-date').value = today;
  if (el('m-prev-product')) el('m-prev-product').selectedIndex = 0;
  if (el('m-cleaning-done')) el('m-cleaning-done').value = 'Yes';
  if (el('m-next-product')) el('m-next-product').selectedIndex = 1;
  if (el('m-time')) el('m-time').value = '10:00 AM';
  if (el('m-cleaned-by')) el('m-cleaned-by').selectedIndex = 0;
  if (el('m-checked-by')) el('m-checked-by').selectedIndex = 0;
  document.getElementById('entry-modal').style.display = 'flex';
};

window.openEditModal = function(id) {
  const rec = allRecords.find(r => r.id === id);
  if (!rec) return;
  editingId = id;
  populateProductDropdowns();
  const el = i => document.getElementById(i);
  if (el('m-title')) el('m-title').textContent = 'Edit Changeover';
  if (el('m-date')) el('m-date').value = rec.date;
  if (el('m-prev-product')) el('m-prev-product').value = rec.previousProduct;
  if (el('m-cleaning-done')) el('m-cleaning-done').value = rec.cleaningDone;
  if (el('m-next-product')) el('m-next-product').value = rec.nextProduct;
  if (el('m-time')) el('m-time').value = rec.time;
  if (el('m-cleaned-by')) el('m-cleaned-by').value = rec.cleanedBy;
  if (el('m-checked-by')) el('m-checked-by').value = rec.checkedBy;
  document.getElementById('entry-modal').style.display = 'flex';
};

window.closeModal = function() {
  document.getElementById('entry-modal').style.display = 'none';
  editingId = null;
};

window.saveEntry = async function() {
  const el = i => document.getElementById(i);
  const dateVal = el('m-date')?.value;
  if (!dateVal) { alert('Date is required'); return; }

  const fmt = formatDisplayDate(dateVal);
  const id = editingId || `PCO-${dateVal}-${Date.now()}`;

  const record = {
    id,
    date: dateVal,
    displayDate: fmt.display,
    dayName: fmt.day,
    previousProduct: el('m-prev-product')?.value || '',
    cleaningDone: el('m-cleaning-done')?.value || 'Yes',
    nextProduct: el('m-next-product')?.value || '',
    time: el('m-time')?.value || '10:00 AM',
    cleanedBy: el('m-cleaned-by')?.value || '',
    checkedBy: el('m-checked-by')?.value || '',
    isGenerated: false
  };

  if (editingId) {
    const idx = allRecords.findIndex(r => r.id === editingId);
    if (idx !== -1) allRecords[idx] = record;
  } else {
    allRecords.unshift(record);
    allRecords.sort((a,b) => b.date.localeCompare(a.date));
  }

  await saveRecord(record);
  closeModal();
  applyFilter();
  updateKPIs();
  selectRecord(id);
};

// ── EXCEL EXPORT ──────────────────────────────────────────────────────────────
window.exportToExcel = function() {
  const prefix = MONTH_MAP[activeMonth] || '2026-10';
  const rows = allRecords.filter(r => r.date.startsWith(prefix));
  if (!rows.length) { alert('No records to export for ' + activeMonth); return; }

  const headers = ['Date', 'Day', 'Previous Product', 'Cleaning Done', 'Next Product', 'Time', 'Cleaned By', 'Checked By'];
  const data = [headers, ...rows.map(r => [
    r.displayDate, r.dayName, r.previousProduct, r.cleaningDone,
    r.nextProduct, r.time, r.cleanedBy, r.checkedBy
  ])];

  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = [12,6,22,14,22,12,18,18].map(w => ({ wch: w }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, `PCO ${activeMonth} 2026`);
  XLSX.writeFile(wb, `LV_Spices_Product_Changeover_${activeMonth}_2026.xlsx`);
};

// ── PRINT ─────────────────────────────────────────────────────────────────────
window.printLog = function() { window.print(); };

// ── CLOSE MODAL ON BACKDROP ───────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('entry-modal')?.addEventListener('click', e => {
    if (e.target.id === 'entry-modal') closeModal();
  });
  init();
});
