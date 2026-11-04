// ===== Configuration =====
const API_BASE = window.location.origin;
const API_ENDPOINT = `${API_BASE}/api/edi/process`;
const HEALTH_ENDPOINT = `${API_BASE}/health`;

// ===== State =====
const state = {
  ediText: '',
  transactionType: '',
  file: null,
  results: null,
  isProcessing: false,
};

// ===== DOM Elements =====
const els = {
  ediInput: document.getElementById('ediInput'),
  charCount: document.getElementById('charCount'),
  transactionType: document.getElementById('transactionType'),
  processBtn: document.getElementById('processBtn'),
  uploadZone: document.getElementById('uploadZone'),
  fileInput: document.getElementById('fileInput'),
  resultsContent: document.getElementById('resultsContent'),
  navStatus: document.getElementById('navStatus'),
  statusDot: document.querySelector('#navStatus .status-dot'),
  statusText: document.querySelector('#navStatus .status-text'),
  modeBadge: document.getElementById('modeBadge'),
  toastContainer: document.getElementById('toastContainer'),
  aboutBtn: document.getElementById('aboutBtn'),
  apiDocsBtn: document.getElementById('apiDocsBtn'),
  aboutModal: document.getElementById('aboutModal'),
  apiModal: document.getElementById('apiModal'),
  aboutClose: document.getElementById('aboutClose'),
  apiClose: document.getElementById('apiClose'),
  aboutBackdrop: document.getElementById('aboutBackdrop'),
  apiBackdrop: document.getElementById('apiBackdrop'),
  sampleCards: document.querySelectorAll('.sample-card'),
  inputTabs: document.querySelectorAll('.input-tab'),
  tabContents: document.querySelectorAll('.tab-content'),
  resultTabs: document.querySelectorAll('.result-tab'),
};

// ===== Initialize =====
document.addEventListener('DOMContentLoaded', () => {
  initHealthCheck();
  initInputHandlers();
  initUploadHandlers();
  initSampleHandlers();
  initResultTabHandlers();
  initModalHandlers();
});

// ===== Health Check =====
async function initHealthCheck() {
  try {
    const res = await fetch(HEALTH_ENDPOINT);
    const data = await res.json();
    updateStatus(true, data.mode || 'unknown');
    showToast(`Backend connected - ${data.mode} mode`, 'success');
  } catch (err) {
    updateStatus(false);
    showToast('Backend not reachable. Start the server with: npm run start', 'error');
  }
}

function updateStatus(connected, mode) {
  const indicator = els.navStatus.querySelector('.status-indicator');
  if (connected) {
    indicator.classList.remove('disconnected');
    indicator.classList.add('connected');
    els.statusText.textContent = 'Connected';
  } else {
    indicator.classList.remove('connected');
    indicator.classList.add('disconnected');
    els.statusText.textContent = 'Disconnected';
  }
  if (mode) {
    els.modeBadge.textContent = `${mode} mode`;
  }
}

// ===== Input Handlers =====
function initInputHandlers() {
  els.ediInput.addEventListener('input', (e) => {
    state.ediText = e.target.value;
    els.charCount.textContent = `${e.target.value.length} characters`;
    validateForm();
  });

  els.transactionType.addEventListener('change', (e) => {
    state.transactionType = e.target.value;
  });

  els.inputTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      els.inputTabs.forEach(t => t.classList.remove('active'));
      els.tabContents.forEach(c => c.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(`tab-${tab.dataset.tab}`).classList.add('active');
    });
  });
}

function validateForm() {
  const hasText = state.ediText.trim().length > 0;
  els.processBtn.disabled = !hasText || state.isProcessing;
}

// ===== Upload Handlers =====
function initUploadHandlers() {
  els.uploadZone.addEventListener('click', () => {
    els.fileInput.click();
  });

  els.fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      state.file = file;
      const reader = new FileReader();
      reader.onload = (ev) => {
        state.ediText = ev.target.result;
        els.ediInput.value = state.ediText;
        els.charCount.textContent = `${state.ediText.length} characters`;
        validateForm();
        showToast(`File loaded: ${file.name}`, 'success');
      };
      reader.readAsText(file);
    }
  });

  ['dragenter', 'dragover'].forEach(evt => {
    els.uploadZone.addEventListener(evt, (e) => {
      e.preventDefault();
      els.uploadZone.classList.add('drag-over');
    });
  });
  ['dragleave', 'drop'].forEach(evt => {
    els.uploadZone.addEventListener(evt, (e) => {
      e.preventDefault();
      els.uploadZone.classList.remove('drag-over');
    });
  });
  els.uploadZone.addEventListener('drop', (e) => {
    const files = e.dataTransfer.files;
    if (files.length) {
      state.file = files[0];
      const reader = new FileReader();
      reader.onload = (ev) => {
        state.ediText = ev.target.result;
        els.ediInput.value = state.ediText;
        els.charCount.textContent = `${state.ediText.length} characters`;
        validateForm();
        showToast(`File loaded: ${files[0].name}`, 'success');
      };
      reader.readAsText(files[0]);
    }
  });
}

// ===== Sample Handlers =====
function initSampleHandlers() {
  const samples = {
    810: `ISA*00*          *00*            *ZZ*SENDER         *ZZ*RECEIVER     *261031*1200*^*00401*000000001*0*P*>~
GS*IN*SENDER*RECEIVER*20261031*1200*0001*X*004010~
ST*810*0001~
BIG*20261031*INV-10025**PO-50021~
N1*BT*ABC CORPORATION~
N3*123 MAIN STREET~
N4*DALLAS*TX*75001~
PER*AP*JOHN SMITH*EM*john@abc.com~
IT1*1*10*EA*150.00**VN*PROD-100~
TDS*150000~
SE*9*0001~
GE*1*0001~
IEA*1*000000001~`,
    850: `ISA*00*          *00*            *ZZ*ABC CORPORATION*ZZ*ACME SUPPLY     *261031*1200*^*00401*000000001*0*P*>~
GS*IN*ABC CORPORATION*ACME SUPPLY*20261031*1200*0001*X*004010~
ST*850*0002~
BEG*00*SA*PO-50021*20261031~
N1*BY*ABC CORPORATION~
N3*123 MAIN STREET~
N4*DALLAS*TX*75001~
N1*ST*ABC WAREHOUSE~
N3*500 INDUSTRIAL ROAD~
N4*DALLAS*TX*75002~
N1*VN*ACME SUPPLY~
PO1*1*10*EA*150.00**VN*PROD-100~
PID*F****Industrial component~
DTM*002*20261115~
CTT*1~
SE*14*0002~
GE*1*0001~
IEA*1*000000001~`,
    856: `ISA*00*          *00*            *ZZ*SENDER         *ZZ*RECEIVER     *261101*0930*^*00401*000000001*0*P*>~
GS*SH*SENDER*RECEIVER*20261101*0930*0003*X*004010~
ST*856*0003~
BSN*00*SHIP-9001*20261101*0930*0001~
HL*1**S~
TD5**2*UPSN*M*UPS GROUND~
REF*CN*1Z999AA10123456784~
DTM*011*20261101~
HL*2*1*O~
PRF*PO-50021~
HL*3*2*P~
MAN*GM*000123456789012345~
HL*4*3*I~
LIN**VN*PROD-100~
SN1**10*EA~
SE*14*0003~
GE*1*0003~
IEA*1*000000001~`,
    820: `ISA*00*          *00*            *ZZ*SENDER         *ZZ*RECEIVER     *261031*1200*^*00401*000000001*0*P*>~
GS*IN*SENDER*RECEIVER*261031*1200*0004*X*004010~
ST*820*0004~
BPR*I*150000*C*CHK************20261101~
TRN*1*TRACE-12345*ABC123~
N1*PR*ABC CORPORATION~
N1*PE*ACME SUPPLY~
RMR*IV*INV-10025*PP*150000~
SE*7*0004~
GE*1*0004~
IEA*1*000000001~`,
  };

  els.sampleCards.forEach(card => {
    card.addEventListener('click', () => {
      const type = card.dataset.sample;
      const text = samples[type];
      if (text) {
        state.ediText = text;
        els.ediInput.value = text;
        els.charCount.textContent = `${text.length} characters`;
        state.transactionType = type;
        els.transactionType.value = type;
        validateForm();
        showToast(`Loaded sample ${type} transaction`, 'info');
      }
    });
  });
}

// ===== Result Tab Handlers =====
function initResultTabHandlers() {
  els.resultTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      els.resultTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      renderResultTab(tab.dataset.result);
    });
  });
}

// ===== Process Transaction =====
els.processBtn.addEventListener('click', async () => {
  if (!state.ediText.trim() || state.isProcessing) return;

  state.isProcessing = true;
  validateForm();
  setProcessingUI(true);

  try {
    resetPipeline();

    const formData = new FormData();
    formData.append('edi', state.ediText);

    // Simulate pipeline steps visually
    updatePipelineStep('parse', 'processing');
    await new Promise(r => setTimeout(r, 400));

    updatePipelineStep('parse', 'completed');
    updatePipelineStep('validate', 'processing');
    await new Promise(r => setTimeout(r, 400));

    updatePipelineStep('validate', 'completed');
    updatePipelineStep('secure', 'processing');
    await new Promise(r => setTimeout(r, 400));

    updatePipelineStep('secure', 'completed');
    updatePipelineStep('extract', 'processing');
    await new Promise(r => setTimeout(r, 400));

    updatePipelineStep('extract', 'completed');
    updatePipelineStep('decide', 'processing');
    await new Promise(r => setTimeout(r, 400));

    const response = await fetch(API_ENDPOINT, {
      method: 'POST',
      body: formData,
    });

    const result = await response.json();

    updatePipelineStep('decide', 'completed');
    updatePipelineStep('serve', 'processing');
    await new Promise(r => setTimeout(r, 300));
    updatePipelineStep('serve', 'completed');

    state.results = result;
    state.results._httpStatus = response.status;
    renderResults(result);

    if (result.status === 'blocked_injection') {
      showToast('Transaction blocked by Injection Guard', 'error');
    } else if (result.status === 'security_check_failed') {
      showToast('Security check failed', 'error');
    } else if (result.blocked) {
      showToast('Transaction was blocked', 'error');
    } else {
      showToast('Transaction processed successfully', 'success');
    }

  } catch (err) {
    console.error(err);
    updatePipelineStep('serve', 'error');
    showToast(`Error: ${err.message}`, 'error');
  } finally {
    state.isProcessing = false;
    validateForm();
    setProcessingUI(false);
  }
});

function setProcessingUI(processing) {
  const btnText = els.processBtn.querySelector('.btn-text');
  const btnIcon = els.processBtn.querySelector('.btn-icon');
  if (processing) {
    btnIcon.innerHTML = '';
    btnIcon.appendChild(createSpinner());
    btnText.textContent = 'Processing...';
  } else {
    btnIcon.textContent = '▶';
    btnText.textContent = 'Process Transaction';
  }
}

function createSpinner() {
  const spinner = document.createElement('div');
  spinner.className = 'spinner';
  return spinner;
}

// ===== Pipeline =====
function resetPipeline() {
  ['parse', 'validate', 'secure', 'extract', 'decide', 'serve'].forEach(step => {
    const el = document.getElementById(`step-${step}`);
    el.classList.remove('active', 'completed', 'processing', 'error');
  });
}

function updatePipelineStep(step, status) {
  const el = document.getElementById(`step-${step}`);
  el.classList.remove('active', 'completed', 'processing', 'error');
  if (status === 'processing') {
    el.classList.add('processing', 'active');
  } else if (status === 'completed') {
    el.classList.remove('processing', 'active');
    el.classList.add('completed');
  } else if (status === 'error') {
    el.classList.remove('processing', 'active');
    el.classList.add('error');
  }
}
// ===== Render Results =====
function renderResults(result) {
  els.resultsContent.innerHTML = '';
  const activeTab = document.querySelector('.result-tab.active');
  const tab = activeTab ? activeTab.dataset.result : 'summary';
  renderResultTab(tab, result);
}

function renderResultTab(tab, result = state.results) {
  if (!result) return;
  els.resultsContent.innerHTML = '';
  switch (tab) {
    case 'summary': renderSummary(result); break;
    case 'structural': renderStructural(result); break;
    case 'normalized': renderNormalized(result); break;
    case 'security': renderSecurity(result); break;
    case 'clocked': renderClocked(result); break;
    case 'raw': renderRaw(result); break;
  }
}

function renderSummary(result) {
  const httpStatus = result._httpStatus || 200;
  const isBlocked = result.status === 'blocked_injection' || result.status === 'security_check_failed' || result.blocked;
  const html = `<div class="result-grid"><div class="result-card"><div class="result-card-header"><div class="result-card-icon">🆔</div><div><div class="result-card-title">Request ID</div><div class="result-card-subtitle">Unique transaction identifier</div></div></div><div class="kv-list"><div class="kv-item"><span class="kv-key">Request ID</span><span class="kv-value">${result.requestId || 'N/A'}</span></div></div></div><div class="result-card"><div class="result-card-header"><div class="result-card-icon">📋</div><div><div class="result-card-title">Transaction Type</div><div class="result-card-subtitle">X12 transaction set identifier</div></div></div><div class="kv-list"><div class="kv-item"><span class="kv-key">Type</span><span class="kv-value highlight">${result.transactionType || 'N/A'}</span></div><div class="kv-item"><span class="kv-key">HTTP Status</span><span class="kv-value">${httpStatus}</span></div></div></div><div class="result-card"><div class="result-card-header"><div class="result-card-icon">${isBlocked ? '🚫' : '✅'}</div><div><div class="result-card-title">Processing Status</div><div class="result-card-subtitle">Final pipeline outcome</div></div></div><div class="kv-list"><div class="kv-item"><span class="kv-key">Status</span><span class="kv-value highlight"><span class="status-badge ${isBlocked ? 'blocked' : 'info'}"><span class="status-dot-small"></span>${result.status.replace(/_/g, ' ').toUpperCase()}</span></span></div><div class="kv-item"><span class="kv-key">Blocked</span><span class="kv-value">${result.blocked ? 'Yes' : 'No'}</span></div></div></div><div class="result-card"><div class="result-card-header"><div class="result-card-icon">🔒</div><div><div class="result-card-title">Security</div><div class="result-card-subtitle">PII &amp; Injection Guard results</div></div></div><div class="kv-list"><div class="kv-item"><span class="kv-key">PII Protected</span><span class="kv-value">${result.security?.pii?.pii_detected ? 'Yes' : 'No'}</span></div><div class="kv-item"><span class="kv-key">Injection Flagged</span><span class="kv-value">${result.security?.injection?.flagged ? 'Yes' : 'No'}</span></div></div></div><div class="result-card"><div class="result-card-header"><div class="result-card-icon">📊</div><div><div class="result-card-title">Structural Valid</div><div class="result-card-subtitle">X12 envelope validation</div></div></div><div class="kv-list"><div class="kv-item"><span class="kv-key">Valid</span><span class="kv-value highlight"><span class="status-badge ${result.structural?.valid ? 'valid' : 'invalid'}"><span class="status-dot-small"></span>${result.structural?.valid ? 'VALID' : 'INVALID'}</span></span></div><div class="kv-item"><span class="kv-key">Issues</span><span class="kv-value">${result.structural?.issues?.length || 0}</span></div></div></div><div class="result-card"><div class="result-card-header"><div class="result-card-icon">⚡</div><div><div class="result-card-title">Clocked Services</div><div class="result-card-subtitle">Extract + Decide AI processing</div></div></div><div class="kv-list"><div class="kv-item"><span class="kv-key">Extract</span><span class="kv-value">${result.clocked?.extract ? 'Completed' : 'Pending'}</span></div><div class="kv-item"><span class="kv-key">Decide</span><span class="kv-value">${result.clocked?.decide ? 'Completed' : 'Pending'}</span></div></div></div></div><div class="result-card"><div class="result-card-header"><div class="result-card-icon">📝</div><div><div class="result-card-title">Processing Pipeline</div><div class="result-card-subtitle">End-to-end processing stages</div></div></div><div class="kv-list"><div class="kv-item"><span class="kv-key">Parse</span><span class="kv-value"><span class="status-badge valid"><span class="status-dot-small"></span>OK</span></span></div><div class="kv-item"><span class="kv-key">Validate</span><span class="kv-value"><span class="status-badge valid"><span class="status-dot-small"></span>OK</span></span></div><div class="kv-item"><span class="kv-key">PII Protection</span><span class="kv-value"><span class="status-badge valid"><span class="status-dot-small"></span>OK</span></span></div><div class="kv-item"><span class="kv-key">Injection Guard</span><span class="kv-value"><span class="status-badge ${result.security?.blocked ? 'blocked' : 'valid'}"><span class="status-dot-small"></span>${result.security?.blocked ? 'BLOCKED' : 'OK'}</span></span></div><div class="kv-item"><span class="kv-key">Extract</span><span class="kv-value"><span class="status-badge valid"><span class="status-dot-small"></span>OK</span></span></div><div class="kv-item"><span class="kv-key">Decide</span><span class="kv-value"><span class="status-badge valid"><span class="status-dot-small"></span>OK</span></span></div></div></div></div>`;
  els.resultsContent.innerHTML = html;
}
function renderStructural(result) {
  const s = result.structural || {};
  const e = s.envelope || {};
  const issues = s.issues || [];
  const html = `<div class="result-card"><div class="result-card-header"><div class="result-card-icon">🔍</div><div><div class="result-card-title">Structural Validation</div><div class="result-card-subtitle">X12 envelope and segment validation results</div></div></div><span class="status-badge ${s.valid ? 'valid' : 'invalid'}"><span class="status-dot-small"></span>${s.valid ? 'VALID' : 'INVALID'}</span><div class="kv-list"><div class="kv-item"><span class="kv-key">Valid</span><span class="kv-value highlight">${s.valid ? 'Yes' : 'No'}</span></div><div class="kv-item"><span class="kv-key">Issues</span><span class="kv-value">${issues.length}</span></div></div>${issues.length > 0 ? `<div style="margin-top: 1rem;"><div style="font-size: 0.75rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); margin-bottom: 0.5rem;">Validation Issues</div><ul style="list-style: none; padding: 0;">${issues.map(issue => `<li style="padding: 0.5rem 0; border-bottom: 1px solid rgba(255,255,255,0.03); font-size: 0.85rem; color: var(--text-secondary); font-family: var(--font-mono);">⚠ ${escapeHtml(issue)}</li>`).join('')}</ul></div>` : ''}</div><div class="result-card"><div class="result-card-header"><div class="result-card-icon">📦</div><div><div class="result-card-title">Interchange Envelope</div><div class="result-card-subtitle">ISA/GS/ST envelope information</div></div></div><div class="kv-list"><div class="kv-item"><span class="kv-key">Transaction Code</span><span class="kv-value highlight">${e.transactionCode || 'N/A'}</span></div><div class="kv-item"><span class="kv-key">Control Number</span><span class="kv-value">${e.transactionControlNumber || 'N/A'}</span></div><div class="kv-item"><span class="kv-key">Sender ID</span><span class="kv-value">${e.senderId || 'N/A'}</span></div><div class="kv-item"><span class="kv-key">Receiver ID</span><span class="kv-value">${e.receiverId || 'N/A'}</span></div><div class="kv-item"><span class="kv-key">Version</span><span class="kv-value">${e.version || 'N/A'}</span></div><div class="kv-item"><span class="kv-key">Declared Segments</span><span class="kv-value">${e.declaredSegmentCount !== null ? e.declaredSegmentCount : 'N/A'}</span></div><div class="kv-item"><span class="kv-key">Actual Segments</span><span class="kv-value">${e.actualSegmentCount !== null ? e.actualSegmentCount : 'N/A'}</span></div></div></div>`;
  els.resultsContent.innerHTML = html;
}
function renderNormalized(result) {
  const n = result.normalized || {};
  const txType = result.transactionType;
  let html = `<div class="result-card"><div class="result-card-header"><div class="result-card-icon">📄</div><div><div class="result-card-title">Normalized Transaction</div><div class="result-card-subtitle">Mapped X12 segments to structured JSON</div></div></div>`;
  if (txType === '810' && n.invoice) {
    const inv = n.invoice || {};
    const lines = n.lineItems || [];
    html += `<div class="kv-list"><div class="kv-item"><span class="kv-key">Invoice Number</span><span class="kv-value highlight">${inv.number || 'N/A'}</span></div><div class="kv-item"><span class="kv-key">Invoice Date</span><span class="kv-value">${inv.date || 'N/A'}</span></div><div class="kv-item"><span class="kv-key">PO Number</span><span class="kv-value">${inv.purchaseOrderNumber || 'N/A'}</span></div><div class="kv-item"><span class="kv-key">Bill To</span><span class="kv-value">${n.billTo?.name || 'N/A'}</span></div><div class="kv-item"><span class="kv-key">Total</span><span class="kv-value highlight">${inv.total !== undefined ? inv.total : (n.totals?.invoiceTotal || 'N/A')}</span></div></div><div style="margin-top: 1rem;"><div style="font-size: 0.75rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); margin-bottom: 0.5rem;">Line Items (${lines.length})</div><div class="json-container">${formatJsonSafe(lines)}</div></div>`;
  } else if (txType === '850' && n.purchaseOrder) {
    const po = n.purchaseOrder || {};
    const lines = n.lineItems || [];
    html += `<div class="kv-list"><div class="kv-item"><span class="kv-key">PO Number</span><span class="kv-value highlight">${po.number || 'N/A'}</span></div><div class="kv-item"><span class="kv-key">PO Date</span><span class="kv-value">${po.date || 'N/A'}</span></div><div class="kv-item"><span class="kv-key">Buyer</span><span class="kv-value">${n.buyer?.name || 'N/A'}</span></div><div class="kv-item"><span class="kv-key">Vendor</span><span class="kv-value">${n.vendor?.name || 'N/A'}</span></div></div><div style="margin-top: 1rem;"><div style="font-size: 0.75rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); margin-bottom: 0.5rem;">Line Items (${lines.length})</div><div class="json-container">${formatJsonSafe(lines)}</div></div>`;
  } else if (txType === '856' && n.shipNotice) {
    const sn = n.shipNotice || {};
    html += `<div class="kv-list"><div class="kv-item"><span class="kv-key">Shipment ID</span><span class="kv-value highlight">${sn.shipmentId || 'N/A'}</span></div><div class="kv-item"><span class="kv-key">Shipment Date</span><span class="kv-value">${sn.date || 'N/A'}</span></div><div class="kv-item"><span class="kv-key">Carrier</span><span class="kv-value">${sn.details?.carrier?.transportationMethod || 'N/A'}</span></div><div class="kv-item"><span class="kv-key">Tracking</span><span class="kv-value">${(sn.details?.references || []).find(r => r.qualifier === 'CN')?.value || 'N/A'}</span></div></div>`;
  } else if (txType === '820' && n.payment) {
    const pay = n.payment || {};
    html += `<div class="kv-list"><div class="kv-item"><span class="kv-key">Payment Amount</span><span class="kv-value highlight">${pay.amount || 'N/A'}</span></div><div class="kv-item"><span class="kv-key">Payment Date</span><span class="kv-value">${pay.date || 'N/A'}</span></div><div class="kv-item"><span class="kv-key">Payer</span><span class="kv-value">${n.payer?.name || 'N/A'}</span></div><div class="kv-item"><span class="kv-key">Payee</span><span class="kv-value">${n.payee?.name || 'N/A'}</span></div></div>`;
  } else if (Object.keys(n).length > 0) {
    html += `<div class="json-container">${formatJsonSafe(n)}</div>`;
  } else {
    html += `<div class="empty-state" style="height: auto; padding: 2rem;"><div class="empty-icon">📭</div><h3>No normalized data</h3><p>No normalized transaction data available</p></div>`;
  }
  html += `</div>`;
  els.resultsContent.innerHTML = html;
}
function renderSecurity(result) {
  const s = result.security || {};
  const pii = s.pii || {};
  const injection = s.injection || {};
  const html = `<div class="result-card"><div class="result-card-header"><div class="result-card-icon">🔒</div><div><div class="result-card-title">Security Overview</div><div class="result-card-subtitle">PII Protection and Injection Guard results</div></div></div><span class="status-badge ${s.blocked ? 'blocked' : 'valid'}"><span class="status-dot-small"></span>${s.blocked ? 'BLOCKED' : 'SECURE'}</span><div class="kv-list"><div class="kv-item"><span class="kv-key">Blocked</span><span class="kv-value highlight">${s.blocked ? 'Yes' : 'No'}</span></div><div class="kv-item"><span class="kv-key">Blocked At</span><span class="kv-value">${s.blockedAt || 'N/A'}</span></div><div class="kv-item"><span class="kv-key">Block Reason</span><span class="kv-value">${s.blockedReason || 'N/A'}</span></div>${s.reason ? `<div class="kv-item"><span class="kv-key">Reason</span><span class="kv-value">${escapeHtml(s.reason)}</span></div>` : ''}</div></div><div class="result-card"><div class="result-card-header"><div class="result-card-icon">🕵️</div><div><div class="result-card-title">PII Protection</div><div class="result-card-subtitle">Personally Identifiable Information detection</div></div></div><div class="json-container">${formatJsonSafe(pii)}</div></div><div class="result-card"><div class="result-card-header"><div class="result-card-icon">🛡️</div><div><div class="result-card-title">Injection Guard</div><div class="result-card-subtitle">Prompt injection detection results</div></div></div><div class="json-container">${formatJsonSafe(injection)}</div></div>`;
  els.resultsContent.innerHTML = html;
}

function renderClocked(result) {
  const c = result.clocked || {};
  const extract = c.extract || {};
  const decide = c.decide || {};
  const html = `<div class="result-card"><div class="result-card-header"><div class="result-card-icon">⚡</div><div><div class="result-card-title">Clocked Extract</div><div class="result-card-subtitle">Structured field extraction results</div></div></div><div class="json-container">${formatJsonSafe(extract)}</div></div><div class="result-card"><div class="result-card-header"><div class="result-card-icon">🧠</div><div><div class="result-card-title">Clocked Decide</div><div class="result-card-subtitle">Processing readiness assessment</div></div></div><div class="json-container">${formatJsonSafe(decide)}</div></div>`;
  els.resultsContent.innerHTML = html;
}

function renderRaw(result) {
  const html = `<div class="result-card"><div class="result-card-header"><div class="result-card-icon">📋</div><div><div class="result-card-title">Raw API Response</div><div class="result-card-subtitle">Complete JSON response from the EDI engine</div></div></div><div class="json-container">${formatJsonSafe(result)}</div></div>`;
  els.resultsContent.innerHTML = html;
}
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatJsonSafe(obj) {
  if (obj === null || obj === undefined) return '<span class="json-null">null</span>';
  if (typeof obj === 'string') return `<span class="json-string">"${escapeHtml(obj)}"</span>`;
  if (typeof obj === 'number') return `<span class="json-number">${obj}</span>`;
  if (typeof obj === 'boolean') return `<span class="json-boolean">${obj}</span>`;

  const json = JSON.stringify(obj, null, 2);
  const escaped = json
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  const highlighted = escaped
    .replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?)/g, (match) => {
      if (match.trim().endsWith(':')) {
        return `<span class="json-key">${match.slice(0, -1).trim()}</span>: `;
      }
      return `<span class="json-string">${match}</span>`;
    })
    .replace(/\b(\d+)\b/g, '<span class="json-number">$1</span>')
    .replace(/\b(true|false)\b/g, '<span class="json-boolean">$1</span>')
    .replace(/\b(null)\b/g, '<span class="json-null">$1</span>')
    .replace(/([\[\]{},:])/g, '<span class="json-punctuation">$1</span>');

  return `<pre style="margin:0; line-height:1.5">${highlighted}</pre>`;
}

function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<div class="toast-icon">${type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️'}</div><div class="toast-message">${escapeHtml(message)}</div>`;
  els.toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// ===== Modal Handlers =====
function initModalHandlers() {
  els.aboutBtn.addEventListener('click', () => openModal(els.aboutModal));
  els.apiDocsBtn.addEventListener('click', () => openModal(els.apiModal));

  els.aboutClose.addEventListener('click', () => closeModal(els.aboutModal));
  els.apiClose.addEventListener('click', () => closeModal(els.apiModal));

  els.aboutBackdrop.addEventListener('click', () => closeModal(els.aboutModal));
  els.apiBackdrop.addEventListener('click', () => closeModal(els.apiModal));

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (els.aboutModal.getAttribute('aria-hidden') === 'false') {
        closeModal(els.aboutModal);
      }
      if (els.apiModal.getAttribute('aria-hidden') === 'false') {
        closeModal(els.apiModal);
      }
    }
  });
}

function openModal(modal) {
  if (!modal) return;
  modal.setAttribute('aria-hidden', 'false');
  modal.removeAttribute('inert');
  document.body.style.overflow = 'hidden';
}

function closeModal(modal) {
  if (!modal) return;
  modal.setAttribute('aria-hidden', 'true');
  modal.setAttribute('inert', '');
  document.body.style.overflow = '';
}