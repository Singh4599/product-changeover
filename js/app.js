// app.js — LV Spices Product Changeover Record
// ✅ LIFETIME: Generates daily records from April 1, 2026 → today (auto-extends every day)
// ✅ 15-18 changeovers per working day, 9:30 AM → ~5:45 PM, ~30 min intervals
// ✅ Sidebar: dates grouped by month → click date → table shows all that day's records
// ✅ Firebase only for manual add/edit (no bulk writes for generated records)

import { saveRecord as saveEntryToCloud, loadAllRecords as loadAllEntriesFromCloud, updateCloudBadge } from './firebase-config.js';

// ── ACTUAL LV SPICES PRODUCTS ─────────────────────────────────────────────────
const PRODUCTS = [
  'Golden Turmeric Powder',
  'Selam Turmeric Powder',
  'Chilli Powder Kashmiri',
  'Malvani Mix Special Masala',
  'Coriander Green Seasoning',
  'Dhanajeera (Mix Masala Powder)',
  'Coriander Saras Seasoning',
  'Reshampatti Khandela Chilli Blend Seasoning',
  'Dandicut Khandela Chilli Blend Seasoning',
  'Palitana Khandela Chilli Blend Seasoning',
  'Kashmiri Khandela Chilli Blend Seasoning',
  'Chilli Powder SP Lal',
  'Chilli Powder SP Lal Uncha',
  'Ginger Seasoning',
  'Cumin Seasoning',
  'Dry Mango Seasoning',
  'Black Pepper Seasoning',
  'Methi Seasoning',
  'Coriander Seasoning',
  'Sambhar Chilli Blend Seasoning',
  'Sambhar Kashmiri Chilli Blend Seasoning',
  'Jeera Super',
  'Rai',
  'Rajwadi Garam Masala',
  'Special Garam Masala',
  'Variyali Seasoning',
  'Chilli Powder SP Line'
];

const WORKERS     = ['Mukesh Vora','Vinod Singh','SHIVSHANKAR YADAV','Mahesh','Rajkumar','SANVALDAS','Suraj','Suchitra','Anil'];
const SUPERVISORS = ['BHIMLAL SHARMA','Vishal Chaturvedi'];
const DAYS        = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

// ── STATE ─────────────────────────────────────────────────────────────────────
let allRecords   = [];  // all generated + cloud records
let cloudOverrides = {}; // user-edited records from Firebase
let selectedDate = null; // currently selected date in sidebar
let searchQuery  = '';
let editingId    = null;

// ── HELPERS ───────────────────────────────────────────────────────────────────
function seedRng(seed) {
  let s = (seed | 0) + 1;
  return () => { s=(s*1664525+1013904223)&0xffffffff; return (s>>>0)/0xffffffff; };
}
function esc(s)  { return s ? String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') : ''; }
function fmtDate(ds) {
  if (!ds) return '';
  const d = new Date(ds + 'T00:00:00');
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
}
function fmtMonthLabel(ds) {
  const d = new Date(ds + 'T00:00:00');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[d.getMonth()]} ${d.getFullYear()}`;
}
function minutesToTime(m) {
  const h = Math.floor(m/60);
  const mn = m % 60;
  const ampm = h < 12 ? 'AM' : 'PM';
  return `${(h % 12) || 12}:${String(mn).padStart(2,'0')} ${ampm}`;
}

// ── LIFETIME DATA GENERATION ──────────────────────────────────────────────────
// Runs from April 1, 2026 → today. Each new day auto-adds records. Seeded = deterministic.
function generateAllRecords() {
  const records = [];
  const start = new Date('2026-04-01T00:00:00');
  const today = new Date();
  today.setHours(23,59,59,999);
  let cur = new Date(start);
  let globalIdx = 1;

  while (cur <= today) {
    const dow = cur.getDay();
    if (dow !== 0) { // skip Sunday
      const y  = cur.getFullYear();
      const mo = String(cur.getMonth()+1).padStart(2,'0');
      const d  = String(cur.getDate()).padStart(2,'0');
      const dateStr = `${y}-${mo}-${d}`;
      const dayName = DAYS[dow];

      // Seeded RNG per day (using integer day offset from epoch)
      const seed = (cur.getTime() / 86400000) | 0;
      const rng  = seedRng(seed);

      // Shuffle products for today — simple sequential, no repeats
      const count = 15 + Math.floor(rng() * 4); // 15-18

      const pool = [...PRODUCTS];
      for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i+1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }

      // Start 9:30 AM = 570 min; end target ~5:30 PM = 1050 min
      let timeMin = 570; // 9:30 AM

      for (let i = 0; i < count; i++) {
        if (timeMin > 1050) break;

        const prevProduct = pool[i % pool.length];
        const nextProduct = pool[(i + 1) % pool.length];
        const worker    = WORKERS[Math.floor(rng() * WORKERS.length)];
        const supervisor = SUPERVISORS[Math.floor(rng() * SUPERVISORS.length)];
        const id = `PCO-${y}${mo}${d}-${String(globalIdx).padStart(4,'0')}`;

        records.push({
          id,
          srNo: i + 1,
          globalIdx,
          date: dateStr,
          displayDate: `${d}/${mo}/${y}`,
          dayName,
          monthLabel: fmtMonthLabel(dateStr),
          previousProduct: prevProduct,
          cleaningDone: 'Yes',
          nextProduct,
          time: minutesToTime(timeMin),
          timeMin,
          cleanedBy: worker,
          checkedBy: supervisor,
          isGenerated: true
        });

        globalIdx++;
        // Next changeover: +27 to +33 min (randomly seeded)
        timeMin += 27 + Math.floor(rng() * 7);
      }
    }
    cur.setDate(cur.getDate() + 1);
  }
  return records; // chronological (newest date last)
}

// ── INIT ──────────────────────────────────────────────────────────────────────
async function init() {
  updateSidebarStats({ total:0, today:0, workers:0 });
  document.getElementById('record-list').innerHTML = '<div class="loading-msg">Generating records…</div>';

  // Load cloud overrides (only user-edited/added records)
  try {
    const cloud = await loadAllEntriesFromCloud();
    cloud.forEach(r => { cloudOverrides[r.id] = r; });
  } catch(e) { updateCloudBadge(false); }

  // Generate all records (blocking but fast ~5ms)
  const generated = generateAllRecords();

  // Merge: cloud overrides replace generated records of same ID
  allRecords = generated.map(r => cloudOverrides[r.id] ? { ...r, ...cloudOverrides[r.id] } : r);

  // Also add cloud-only records (manually added by user, not in generated set)
  const genIds = new Set(generated.map(r => r.id));
  Object.values(cloudOverrides).forEach(r => {
    if (!genIds.has(r.id)) allRecords.push(r);
  });

  // Sort: newest date first, then by time within date
  allRecords.sort((a,b) => b.date.localeCompare(a.date) || (b.timeMin||0) - (a.timeMin||0));

  renderSidebarStats();
  renderSidebarDates();

  // Auto-select today (or most recent day)
  if (allRecords.length) {
    const latestDate = allRecords[0].date;
    selectDate(latestDate);
  }
}

// ── SIDEBAR STATS ─────────────────────────────────────────────────────────────
function renderSidebarStats() {
  const today = new Date().toISOString().split('T')[0];
  const todayRecs = allRecords.filter(r => r.date === today);
  const uniqueWorkers = new Set(allRecords.map(r => r.cleanedBy)).size;
  updateSidebarStats({ total: allRecords.length, today: todayRecs.length, workers: uniqueWorkers });
}

function updateSidebarStats({ total, today, workers }) {
  const el = (id, v) => { const e = document.getElementById(id); if(e) e.textContent = v; };
  el('stat-total', total || '—');
  el('stat-cleaned', today || '—');
  el('stat-workers', workers || '—');
}

// ── SIDEBAR DATE LIST ─────────────────────────────────────────────────────────
function renderSidebarDates() {
  const el = document.getElementById('record-list');
  if (!el) return;

  // Group records by date
  const dateMap = {};
  allRecords.forEach(r => {
    if (!dateMap[r.date]) dateMap[r.date] = [];
    dateMap[r.date].push(r);
  });

  // Sorted dates newest first
  const dates = Object.keys(dateMap).sort((a,b) => b.localeCompare(a));

  if (!dates.length) {
    el.innerHTML = '<div class="loading-msg" style="color:#94A3B8;text-align:center;padding:16px;font-size:12px;">No records</div>';
    return;
  }

  let lastMonth = null;
  let html = '';
  dates.forEach(dateStr => {
    const recs = dateMap[dateStr];
    const monthLbl = recs[0].monthLabel;
    const displayDate = recs[0].displayDate;
    const dayName = recs[0].dayName;

    if (monthLbl !== lastMonth) {
      html += `<div class="sidebar-month-heading">${monthLbl}</div>`;
      lastMonth = monthLbl;
    }

    const isActive = dateStr === selectedDate;
    html += `
      <div class="date-record-item ${isActive ? 'active' : ''}" onclick="selectDate('${dateStr}')">
        <div class="dri-top">
          <span class="dri-date">${displayDate}</span>
          <span class="dri-day">${dayName}</span>
          <span class="dri-count">${recs.length}</span>
        </div>
        <div class="dri-products">${esc(recs[0].previousProduct.split(' ').slice(0,2).join(' '))} → … → ${esc(recs[recs.length-1].nextProduct.split(' ').slice(0,2).join(' '))}</div>
      </div>`;
  });

  el.innerHTML = html;
}

// ── SELECT DATE → SHOW IN TABLE ───────────────────────────────────────────────
window.selectDate = function(dateStr) {
  selectedDate = dateStr;
  renderSidebarDates(); // re-render to update active class

  const dayRecs = allRecords.filter(r => r.date === dateStr)
                             .sort((a,b) => (a.timeMin||0) - (b.timeMin||0));

  // Update topbar meta
  if (dayRecs.length) {
    const r = dayRecs[0];
    const topChecker = document.getElementById('topbar-checker');
    if (topChecker) topChecker.textContent = r.checkedBy;
    const topMeta = document.getElementById('topbar-meta');
    if (topMeta) topMeta.textContent = `${r.displayDate} • ${dayRecs.length} Changeovers`;

    // Update meta cards for the day
    const el = (id,v) => { const e = document.getElementById(id); if(e) e.textContent = v; };
    el('d-id', `${r.displayDate} (${r.dayName})`);
    el('d-date', r.displayDate + ' ' + r.dayName);
    el('d-time', `${dayRecs[0].time} – ${dayRecs[dayRecs.length-1].time}`);
    el('d-cleaning', 'Yes — All');
    el('d-cleaned-by', [...new Set(dayRecs.map(x=>x.cleanedBy))].join(', '));
    el('d-checked-by', [...new Set(dayRecs.map(x=>x.checkedBy))].join(', '));
  }

  // Render table
  const tbody = document.getElementById('pco-tbody');
  if (!tbody) return;
  if (!dayRecs.length) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;padding:30px;color:#94A3B8;font-size:13px;">No records for this date.</td></tr>`;
    return;
  }

  tbody.innerHTML = dayRecs.map((r, i) => `
    <tr class="pmr-row">
      <td class="col-sr">${i+1}</td>
      <td style="font-size:12px;font-weight:600;color:#64748B;">${esc(r.displayDate)}</td>
      <td><span class="prod-pill prod-pill-prev" title="${esc(r.previousProduct)}">${esc(r.previousProduct)}</span></td>
      <td style="text-align:center;">
        <span class="cleaning-badge">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="11" height="11"><polyline points="20 6 9 17 4 12"/></svg>
          Yes
        </span>
      </td>
      <td><span class="prod-pill prod-pill-next" title="${esc(r.nextProduct)}">${esc(r.nextProduct)}</span></td>
      <td><span class="time-chip">${esc(r.time)}</span></td>
      <td><span class="worker-name">${esc(r.cleanedBy)}</span></td>
      <td><span class="worker-name" style="color:#2563EB;">${esc(r.checkedBy)}</span></td>
      <td style="text-align:center;white-space:nowrap;">
        <button onclick="openEditModal('${esc(r.id)}')" title="Edit" style="background:none;border:none;cursor:pointer;padding:4px 6px;border-radius:6px;color:#6366F1;" onmouseover="this.style.background='#EEF2FF'" onmouseout="this.style.background='none'">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
        <button onclick="deleteRecord('${esc(r.id)}')" title="Delete" style="background:none;border:none;cursor:pointer;padding:4px 6px;border-radius:6px;color:#EF4444;" onmouseover="this.style.background='#FEF2F2'" onmouseout="this.style.background='none'">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
        </button>
      </td>
    </tr>`
  ).join('');
};


// ── SEARCH ────────────────────────────────────────────────────────────────────
window.onSearchChange = function(v) {
  searchQuery = v.toLowerCase();
  const el = document.getElementById('record-list');
  if (!searchQuery) { renderSidebarDates(); return; }

  // Filter dates that have matching records
  const dateMap = {};
  allRecords.forEach(r => {
    const matches = r.previousProduct?.toLowerCase().includes(searchQuery) ||
                    r.nextProduct?.toLowerCase().includes(searchQuery) ||
                    r.cleanedBy?.toLowerCase().includes(searchQuery) ||
                    r.displayDate?.includes(searchQuery);
    if (matches) {
      if (!dateMap[r.date]) dateMap[r.date] = [];
      dateMap[r.date].push(r);
    }
  });

  const dates = Object.keys(dateMap).sort((a,b) => b.localeCompare(a));
  if (!dates.length) { el.innerHTML = '<div class="loading-msg" style="text-align:center;padding:12px;color:#94A3B8;font-size:12px;">No results</div>'; return; }

  let html = '';
  dates.forEach(dateStr => {
    const recs = dateMap[dateStr];
    const isActive = dateStr === selectedDate;
    html += `
      <div class="date-record-item ${isActive ? 'active' : ''}" onclick="selectDate('${dateStr}')">
        <div class="dri-top">
          <span class="dri-date">${recs[0].displayDate}</span>
          <span class="dri-day">${recs[0].dayName}</span>
          <span class="dri-count">${recs.length}</span>
        </div>
        <div class="dri-products">${recs.length} matching records</div>
      </div>`;
  });
  el.innerHTML = html;
};

// ── SIDEBAR / MOBILE ──────────────────────────────────────────────────────────
window.toggleSidebar = function() {
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('overlay').classList.toggle('show');
};
window.closeSidebar = function() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('overlay').classList.remove('show');
};

// ── ADD / EDIT MODAL ──────────────────────────────────────────────────────────
function populateDropdowns() {
  const g = id => document.getElementById(id);
  if (g('m-prev')) g('m-prev').innerHTML = PRODUCTS.map(p => `<option>${esc(p)}</option>`).join('');
  if (g('m-next')) g('m-next').innerHTML = PRODUCTS.map(p => `<option>${esc(p)}</option>`).join('');
  if (g('m-cleaned-by')) g('m-cleaned-by').innerHTML = WORKERS.map(w => `<option>${esc(w)}</option>`).join('');
  if (g('m-checked-by')) g('m-checked-by').innerHTML = SUPERVISORS.map(s => `<option>${esc(s)}</option>`).join('');
}

window.openAddModal = function() {
  editingId = null;
  populateDropdowns();
  const g = id => document.getElementById(id);
  if (g('modal-title')) g('modal-title').textContent = 'New Changeover Entry';
  if (g('m-date')) g('m-date').value = new Date().toISOString().split('T')[0];
  if (g('m-time')) g('m-time').value = '09:30 AM';
  document.getElementById('modal-overlay').style.display = 'flex';
};
// ── DELETE RECORD ─────────────────────────────────────────────────────────────
window.deleteRecord = function(id) {
  const rec = allRecords.find(r => r.id === id);
  if (!rec) return;
  const label = `${rec.displayDate} — ${rec.previousProduct} → ${rec.nextProduct}`;
  if (!confirm(`Delete this record?\n\n${label}\n\nThis cannot be undone.`)) return;

  // Remove from local array
  allRecords = allRecords.filter(r => r.id !== id);
  // Remove from cloud overrides if manually added
  delete cloudOverrides[id];

  // Re-render
  renderTable(selectedDate);
  renderSidebarDates();
};

window.openEditModal = function(id) {

  const rec = allRecords.find(r => r.id === id);
  if (!rec) return;
  editingId = id;
  populateDropdowns();
  const g = i => document.getElementById(i);
  if (g('modal-title')) g('modal-title').textContent = 'Edit Changeover Record';
  if (g('m-date')) g('m-date').value = rec.date;
  if (g('m-time')) g('m-time').value = rec.time;
  if (g('m-prev')) g('m-prev').value = rec.previousProduct;
  if (g('m-next')) g('m-next').value = rec.nextProduct;
  if (g('m-cleaning')) g('m-cleaning').value = rec.cleaningDone;
  if (g('m-cleaned-by')) g('m-cleaned-by').value = rec.cleanedBy;
  if (g('m-checked-by')) g('m-checked-by').value = rec.checkedBy;
  document.getElementById('modal-overlay').style.display = 'flex';
};

window.closeModal = function() {
  document.getElementById('modal-overlay').style.display = 'none';
  editingId = null;
};

window.saveEntry = async function() {
  const g = i => document.getElementById(i);
  const dateVal = g('m-date')?.value;
  if (!dateVal) { alert('Date required'); return; }

  const d = new Date(dateVal + 'T00:00:00');
  const y = d.getFullYear();
  const mo = String(d.getMonth()+1).padStart(2,'0');
  const dd = String(d.getDate()).padStart(2,'0');
  const dow = DAYS[d.getDay()];
  const id = editingId || `PCO-${y}${mo}${dd}-M${Date.now().toString().slice(-4)}`;
  const timeStr = g('m-time')?.value || '09:30 AM';

  const record = {
    id, date: dateVal,
    displayDate: `${dd}/${mo}/${y}`, dayName: dow,
    monthLabel: fmtMonthLabel(dateVal),
    previousProduct: g('m-prev')?.value || '',
    cleaningDone: g('m-cleaning')?.value || 'Yes',
    nextProduct: g('m-next')?.value || '',
    time: timeStr, timeMin: 0,
    cleanedBy: g('m-cleaned-by')?.value || '',
    checkedBy: g('m-checked-by')?.value || '',
    isGenerated: false
  };

  // Save to cloud
  await saveEntryToCloud(record);
  cloudOverrides[record.id] = record;

  // Update local records
  const idx = allRecords.findIndex(r => r.id === record.id);
  if (idx !== -1) allRecords[idx] = record;
  else {
    allRecords.push(record);
    allRecords.sort((a,b) => b.date.localeCompare(a.date) || (b.timeMin||0) - (a.timeMin||0));
  }

  closeModal();
  renderSidebarStats();
  renderSidebarDates();
  selectDate(dateVal);
};

// ── EDIT CURRENT RECORD ───────────────────────────────────────────────────────
window.editCurrentRecord = function() {
  if (selectedDate) {
    const dayRecs = allRecords.filter(r => r.date === selectedDate);
    if (dayRecs.length) openEditModal(dayRecs[0].id);
  }
};

// ── EXCEL EXPORT ──────────────────────────────────────────────────────────────
window.exportExcel = function() {
  // Export selected day or all records
  const rows = selectedDate
    ? allRecords.filter(r => r.date === selectedDate).sort((a,b) => (a.timeMin||0)-(b.timeMin||0))
    : allRecords.slice(0,500); // cap at 500 for performance

  if (!rows.length) { alert('No records to export'); return; }

  const headers = ['Sr.No','Date','Day','Previous Product','Cleaning Done','Next Product','Time','Cleaned By','Checked By'];
  let sr = 1;
  const data = [headers, ...rows.map(r => [
    sr++, r.displayDate, r.dayName,
    r.previousProduct, r.cleaningDone, r.nextProduct,
    r.time, r.cleanedBy, r.checkedBy
  ])];

  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = [6,11,6,30,14,30,11,16,16].map(w=>({wch:w}));
  const wb = XLSX.utils.book_new();
  const sheetName = selectedDate ? `PCO_${selectedDate}` : 'PCO_All';
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, `LV_Spices_ProductChangeover_${selectedDate || 'All'}.xlsx`);
};

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('modal-overlay')?.addEventListener('click', e => {
    if (e.target.id === 'modal-overlay') closeModal();
  });
  init();
});
