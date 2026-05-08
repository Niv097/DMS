// ===== DMS — app.js =====

// ---- MOCK DATA ----
const MOCK_USERS = [
  { id: 1, name: 'Rajesh Kumar Singh CM DVAS of AAO II', email: 'cmsbd2.aao@sbi.co.in', phone: '9726458673', role: 'CM DVAS' },
  { id: 2, name: 'Kuldeep Kumar Garg Regional Manager AAO 2', email: 'agm2.aao@sbi.co.in', phone: '9816450677', role: 'Regional Manager' },
  { id: 3, name: 'Diwakar Mishra CM Operations AAO', email: 'cmops.aao@sbi.co.in', phone: '9512340000', role: 'CM Operations' },
  { id: 4, name: 'Pankaj Kumar Jalan AGM Deposit & VAS', email: 'agmvas.aao@sbi.co.in', phone: '9988776655', role: 'AGM Deposit' },
  { id: 5, name: 'Govind Prasad Sinha DGM (B&O) Ahmedabad', email: 'dgmbo.aao@sbi.co.in', phone: '9468242777', role: 'DGM B&O' },
  { id: 6, name: 'Sreeja Choudhary AGM', email: 'sreeja.choudhery@sbi.co.in', phone: '9726458673', role: 'AGM' },
  { id: 7, name: 'Vijay Kumar Manager', email: 'vjay.kumar14@sbi.co.in', phone: '9816450677', role: 'Manager' },
  { id: 8, name: 'AGM Transaction Banking Hub AAO', email: 'tbhahm.lhognr@sbi.co.in', phone: '9123456789', role: 'AGM TB Hub' },
];

// State for recommenders & approver
let recommenders = [];
let approver = null;
let mainFiles = [];
let annexureFiles = [];

function ensureUiOverlay() {
  let overlay = document.getElementById('dms-ui-overlay');
  if (overlay) return overlay;

  overlay = document.createElement('div');
  overlay.id = 'dms-ui-overlay';
  overlay.style.position = 'fixed';
  overlay.style.inset = '0';
  overlay.style.display = 'none';
  overlay.style.alignItems = 'center';
  overlay.style.justifyContent = 'center';
  overlay.style.background = 'rgba(15, 23, 42, 0.32)';
  overlay.style.zIndex = '9999';
  overlay.innerHTML = `
    <div style="width:min(440px, calc(100vw - 32px)); background:#fff; border:1px solid #dbe3ef; border-radius:16px; box-shadow:0 24px 64px rgba(15,23,42,.18); overflow:hidden;">
      <div id="dms-ui-title" style="padding:14px 18px; background:#1d4f91; color:#fff; font-weight:700; letter-spacing:.02em;">Message</div>
      <div style="padding:18px;">
        <div id="dms-ui-message" style="color:#334155; line-height:1.6; margin-bottom:18px;"></div>
        <div id="dms-ui-actions" style="display:flex; gap:10px; justify-content:flex-end;"></div>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  return overlay;
}

function closeUiOverlay() {
  const overlay = document.getElementById('dms-ui-overlay');
  if (overlay) overlay.style.display = 'none';
}

function showNotice(message, title = 'Message') {
  const overlay = ensureUiOverlay();
  overlay.querySelector('#dms-ui-title').textContent = title;
  overlay.querySelector('#dms-ui-message').textContent = message;
  overlay.querySelector('#dms-ui-actions').innerHTML = `
    <button type="button" id="dms-ui-ok" class="btn btn-primary">OK</button>
  `;
  overlay.style.display = 'flex';
  overlay.querySelector('#dms-ui-ok').onclick = () => closeUiOverlay();
}

function showConfirm(message, onConfirm, title = 'Please Confirm') {
  const overlay = ensureUiOverlay();
  overlay.querySelector('#dms-ui-title').textContent = title;
  overlay.querySelector('#dms-ui-message').textContent = message;
  overlay.querySelector('#dms-ui-actions').innerHTML = `
    <button type="button" id="dms-ui-cancel" class="btn btn-outline">Cancel</button>
    <button type="button" id="dms-ui-confirm" class="btn btn-primary">Confirm</button>
  `;
  overlay.style.display = 'flex';
  overlay.querySelector('#dms-ui-cancel').onclick = () => closeUiOverlay();
  overlay.querySelector('#dms-ui-confirm').onclick = () => {
    closeUiOverlay();
    if (typeof onConfirm === 'function') onConfirm();
  };
}

// ---- RECOMMENDER SEARCH ----
function searchRecommender() {
  const q = (document.getElementById('rec-search')?.value || '').toLowerCase();
  const results = MOCK_USERS.filter(u =>
    u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
  );
  const tbody = document.getElementById('rec-results-body');
  const container = document.getElementById('rec-results');
  if (!tbody || !container) return;
  if (!q) { container.style.display = 'none'; return; }
  container.style.display = 'block';
  tbody.innerHTML = results.length ? results.map(u => `
    <tr>
      <td>${u.name}</td>
      <td class="text-mono">${u.email}</td>
      <td>${u.phone}</td>
      <td><button class="btn btn-primary btn-sm" onclick="addRecommender(${u.id})">+ Add</button></td>
    </tr>`).join('') :
    '<tr><td colspan="4" style="text-align:center;color:var(--gray-400);padding:12px">No users found</td></tr>';
}

function addRecommender(id) {
  const user = MOCK_USERS.find(u => u.id === id);
  if (!user) return;
  if (recommenders.find(r => r.id === id)) { showNotice('User already added as recommender.'); return; }
  recommenders.push(user);
  renderRecommenders();
  document.getElementById('rec-results').style.display = 'none';
  document.getElementById('rec-search').value = '';
}

function removeRecommender(id) {
  recommenders = recommenders.filter(r => r.id !== id);
  renderRecommenders();
}

function renderRecommenders() {
  const tbody = document.getElementById('rec-tbody');
  const empty = document.getElementById('rec-empty');
  if (!tbody) return;
  if (recommenders.length === 0) {
    tbody.innerHTML = '<tr id="rec-empty"><td colspan="5" style="text-align:center;color:var(--gray-400);padding:16px">No recommenders added yet.</td></tr>';
    return;
  }
  tbody.innerHTML = recommenders.map((u, i) => `
    <tr>
      <td><span class="badge badge-blue">${i + 1}</span></td>
      <td>${u.name}</td>
      <td class="text-mono">${u.email}</td>
      <td>${u.phone}</td>
      <td><button class="btn btn-delete" onclick="removeRecommender(${u.id})">✕ Remove</button></td>
    </tr>`).join('');
}

// ---- APPROVER SEARCH ----
function searchApprover() {
  const q = (document.getElementById('apr-search')?.value || '').toLowerCase();
  const results = MOCK_USERS.filter(u =>
    u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
  );
  const tbody = document.getElementById('apr-results-body');
  const container = document.getElementById('apr-results');
  if (!tbody || !container) return;
  if (!q) { container.style.display = 'none'; return; }
  container.style.display = 'block';
  tbody.innerHTML = results.length ? results.map(u => `
    <tr>
      <td>${u.name}</td>
      <td class="text-mono">${u.email}</td>
      <td>${u.phone}</td>
      <td><button class="btn btn-primary btn-sm" onclick="setApprover(${u.id})">+ Select</button></td>
    </tr>`).join('') :
    '<tr><td colspan="4" style="text-align:center;color:var(--gray-400);padding:12px">No users found</td></tr>';
}

function setApprover(id) {
  const user = MOCK_USERS.find(u => u.id === id);
  if (!user) return;
  approver = user;
  renderApprover();
  document.getElementById('apr-results').style.display = 'none';
  document.getElementById('apr-search').value = '';
}

function removeApprover() {
  approver = null;
  renderApprover();
}

function renderApprover() {
  const tbody = document.getElementById('apr-tbody');
  if (!tbody) return;
  if (!approver) {
    tbody.innerHTML = '<tr id="apr-empty"><td colspan="5" style="text-align:center;color:var(--gray-400);padding:16px">No approver added yet.</td></tr>';
    return;
  }
  tbody.innerHTML = `
    <tr>
      <td>1</td>
      <td>${approver.name}</td>
      <td class="text-mono">${approver.email}</td>
      <td>${approver.phone}</td>
      <td><button class="btn btn-delete" onclick="removeApprover()">✕ Remove</button></td>
    </tr>`;
}

// ---- FILE HANDLING ----
function handleMainFile(input) {
  const files = Array.from(input.files);
  mainFiles = files;
  renderFileTable('main-files', mainFiles, 'Main Attachment');
}

function handleAnnexure(input) {
  const files = Array.from(input.files);
  annexureFiles = [...annexureFiles, ...files];
  renderFileTable('ann-files', annexureFiles, 'Annexure');
}

function renderFileTable(tbodyId, files, type) {
  const tbody = document.getElementById(tbodyId);
  if (!tbody) return;
  if (files.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--gray-400);padding:12px">No file uploaded</td></tr>';
    return;
  }
  tbody.innerHTML = files.map((f, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${f.name}</td>
      <td>${(f.size / 1048576).toFixed(2)}</td>
      <td><span class="badge badge-gray">${type}</span></td>
      <td><button class="btn btn-delete" onclick="removeFile('${tbodyId}', ${i})">✕</button></td>
    </tr>`).join('');
}

// ---- SUBMIT ----
function submitNote() {
  const subject = document.querySelector('input[name=subject]')?.value;
  if (!subject) { showNotice('Please enter a Subject for the note.'); return; }
  if (recommenders.length === 0) { showNotice('Please add at least one Recommender.'); return; }
  if (!approver) { showNotice('Please select an Approver.'); return; }
  if (mainFiles.length === 0) { showNotice('Please upload the Main Note PDF.'); return; }
  showConfirm(`Submit note "${subject}" with ${recommenders.length} recommender(s)?`, () => {
    showNotice('Note submitted successfully! You will receive email notifications as it moves through stages.', 'Submission Completed');
    setTimeout(() => { location.hash = '#/'; }, 350);
  });
}

// ---- FILTERS ----
function clearFilters() {
  document.querySelectorAll('.filter-bar input, .filter-bar select').forEach(el => {
    if (el.tagName === 'SELECT') el.selectedIndex = 0;
    else el.value = '';
  });
}

// ---- DRAG & DROP ----
function initDropZones() {
  const zones = [
    { zoneId: 'main-drop', inputId: 'main-file-input' },
    { zoneId: 'ann-drop', inputId: 'ann-file-input' },
  ];
  zones.forEach(({ zoneId, inputId }) => {
    const zone = document.getElementById(zoneId);
    if (!zone) return;
    zone.addEventListener('dragover', e => { e.preventDefault(); zone.style.borderColor = 'var(--blue-primary)'; zone.style.background = 'var(--blue-pale)'; });
    zone.addEventListener('dragleave', () => { zone.style.borderColor = ''; zone.style.background = ''; });
    zone.addEventListener('drop', e => {
      e.preventDefault();
      zone.style.borderColor = '';
      zone.style.background = '';
      const input = document.getElementById(inputId);
      if (!input) return;
      const dt = new DataTransfer();
      Array.from(e.dataTransfer.files).forEach(f => dt.items.add(f));
      input.files = dt.files;
      input.dispatchEvent(new Event('change'));
    });
  });
}

// ---- PAGE SPECIFIC INIT ----
function initPage(page) {
    if (page === 'submit') {
        const nfiRadio = document.getElementById('nfi_radio');
        if (nfiRadio) {
            nfiRadio.addEventListener('change', function() {
                document.getElementById('nfi-hint').style.display = this.checked ? 'block' : 'none';
                document.getElementById('recommender-section').style.opacity = this.checked ? '0.4' : '1';
                document.getElementById('approver-section').style.opacity = this.checked ? '0.4' : '1';
            });
        }
        document.querySelectorAll('input[name=note_type]:not(#nfi_radio)').forEach(r => {
            r.addEventListener('change', function() {
                document.getElementById('nfi-hint').style.display = 'none';
                document.getElementById('recommender-section').style.opacity = '1';
                document.getElementById('approver-section').style.opacity = '1';
            });
        });
        
        // init search listeners for submit
        const recSearch = document.getElementById('rec-search');
        if (recSearch) recSearch.addEventListener('keydown', e => { if (e.key === 'Enter') searchRecommender(); });
        const aprSearch = document.getElementById('apr-search');
        if (aprSearch) aprSearch.addEventListener('keydown', e => { if (e.key === 'Enter') searchApprover(); });
        
        initDropZones();
    }
    
    if (page === 'review') {
        // any specific review init logic
    }
}

// Review page functions
function showReturnModal() {
  document.getElementById('return-modal').style.display = 'flex';
}
function closeReturnModal(e) {
  if (e.target === document.getElementById('return-modal'))
    document.getElementById('return-modal').style.display = 'none';
}
function submitReturn() {
  showNotice('Note returned successfully!', 'Returned');
  setTimeout(() => { location.hash = '#/'; }, 350);
}
function recommend() {
  showConfirm('Recommend this note and forward it to Stage 2?', () => {
    showNotice('Recommended! Note forwarded to next recommender.', 'Recommendation Completed');
    setTimeout(() => { location.hash = '#/'; }, 350);
  }, 'Confirm Recommendation');
}

// ---- INIT ----
document.addEventListener('DOMContentLoaded', () => {
  // Global init if any
});

