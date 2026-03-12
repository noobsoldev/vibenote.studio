/* ==========================================
   VIBENOTE STUDIO — CLIENT JS
   ========================================== */

// ==========================================
// TAG INPUT
// ==========================================
function initTagInput(wrapId, hiddenInputId) {
  const wrap = document.getElementById(wrapId);
  const hidden = document.getElementById(hiddenInputId);
  if (!wrap || !hidden) return;

  let tags = [];
  try { tags = JSON.parse(hidden.value || '[]'); } catch (e) { tags = []; }

  function render() {
    // Remove existing pills
    wrap.querySelectorAll('.tag-pill').forEach(el => el.remove());
    let inp = wrap.querySelector('.tag-real-input');

    tags.forEach((tag, i) => {
      const pill = document.createElement('span');
      pill.className = 'tag-pill';
      pill.innerHTML = `${tag}<button type="button" onclick="removeTagFrom('${wrapId}','${hiddenInputId}',${i})">×</button>`;
      wrap.insertBefore(pill, inp);
    });
    hidden.value = JSON.stringify(tags);
  }

  const input = wrap.querySelector('.tag-real-input');
  if (input) {
    input.addEventListener('keydown', function(e) {
      if ((e.key === 'Enter' || e.key === ',') && this.value.trim()) {
        e.preventDefault();
        tags.push(this.value.trim());
        this.value = '';
        render();
      }
      if (e.key === 'Backspace' && !this.value && tags.length) {
        tags.pop();
        render();
      }
    });
  }
  wrap.addEventListener('click', () => wrap.querySelector('.tag-real-input')?.focus());
  render();

  // Expose for remove function
  wrap._tags = tags;
  wrap._render = render;
}

function removeTagFrom(wrapId, hiddenId, idx) {
  const wrap = document.getElementById(wrapId);
  const hidden = document.getElementById(hiddenId);
  let tags = [];
  try { tags = JSON.parse(hidden.value || '[]'); } catch (e) {}
  tags.splice(idx, 1);
  hidden.value = JSON.stringify(tags);
  wrap._tags = tags;
  initTagInput(wrapId, hiddenId);
}

// ==========================================
// MULTI-STEP WIZARD
// ==========================================
let currentStep = 0;
const totalSteps = 8;
let autoSaveTimer = null;
let projectId = null;

function initWizard(pid) {
  projectId = pid;
  showStep(currentStep);
  document.querySelectorAll('.step-dot').forEach((dot, i) => {
    dot.addEventListener('click', () => {
      if (i <= currentStep) showStep(i);
    });
  });
}

function showStep(n) {
  document.querySelectorAll('.step-panel').forEach((p, i) => {
    p.classList.toggle('active', i === n);
  });
  document.querySelectorAll('.step-dot').forEach((d, i) => {
    d.classList.toggle('active', i === n);
    d.classList.toggle('done', i < n);
  });
  currentStep = n;
  const pct = (n / (totalSteps - 1)) * 100;
  const fill = document.getElementById('progressFill');
  if (fill) fill.style.width = pct + '%';
  const counter = document.getElementById('stepCounter');
  if (counter) counter.textContent = `Step ${n + 1} of ${totalSteps}`;
  const backBtn = document.getElementById('btnBack');
  const nextBtn = document.getElementById('btnNext');
  if (backBtn) backBtn.style.visibility = n === 0 ? 'hidden' : 'visible';
  if (nextBtn) {
    nextBtn.textContent = n === totalSteps - 1 ? '✦ Generate Website' : 'Continue →';
    nextBtn.className = n === totalSteps - 1 ? 'btn btn-gold btn-lg' : 'btn btn-gold';
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function nextStep() {
  if (currentStep < totalSteps - 1) {
    saveProgress();
    showStep(currentStep + 1);
  } else {
    submitForm();
  }
}

function prevStep() {
  if (currentStep > 0) showStep(currentStep - 1);
}

function scheduleAutoSave() {
  clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(saveProgress, 1500);
}

async function saveProgress() {
  if (!projectId) return;
  const formData = collectFormData();
  try {
    await fetch(`/projects/${projectId}/save-draft`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData)
    });
  } catch (e) { /* silent */ }
}

function collectFormData() {
  const data = {};
  document.querySelectorAll('[data-field]').forEach(el => {
    const key = el.dataset.field;
    if (el.type === 'hidden' && el.dataset.tags) {
      try { data[key] = JSON.parse(el.value || '[]'); } catch (e) { data[key] = []; }
    } else if (el.tagName === 'SELECT' || el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
      data[key] = el.value;
    }
  });
  // Tone
  const tone = document.querySelector('.tone-card.selected');
  if (tone) data.tone = tone.dataset.tone;
  // Sections
  data.sections = Array.from(document.querySelectorAll('.section-chip.selected')).map(c => c.dataset.section);
  return data;
}

async function submitForm() {
  await saveProgress();
  const overlay = document.getElementById('generationOverlay');
  if (overlay) overlay.classList.add('show');
  try {
    const res = await fetch(`/generate/${projectId}`, { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      window.location.href = `/generate/${data.projectId}/editor`;
    } else {
      if (overlay) overlay.classList.remove('show');
      showToast(data.error || 'Generation failed. Please try again.', 'error');
    }
  } catch (err) {
    if (overlay) overlay.classList.remove('show');
    showToast('Network error. Please try again.', 'error');
  }
}

// ==========================================
// TONE SELECTOR
// ==========================================
function selectTone(el) {
  document.querySelectorAll('.tone-card').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
  const input = document.getElementById('toneInput');
  if (input) input.value = el.dataset.tone;
}

// ==========================================
// SECTION CHIPS
// ==========================================
function toggleSection(el) {
  el.classList.toggle('selected');
  const check = el.querySelector('.chip-check');
  if (check) check.textContent = el.classList.contains('selected') ? '✓' : '';
  updateSectionsInput();
}

function updateSectionsInput() {
  const selected = Array.from(document.querySelectorAll('.section-chip.selected')).map(c => c.dataset.section);
  const inp = document.getElementById('sectionsInput');
  if (inp) inp.value = JSON.stringify(selected);
}

// ==========================================
// COLOR PICKER SYNC
// ==========================================
function syncColorPicker(colorPickerId, hexInputId) {
  const picker = document.getElementById(colorPickerId);
  const hex = document.getElementById(hexInputId);
  if (!picker || !hex) return;
  picker.addEventListener('input', () => { hex.value = picker.value; });
  hex.addEventListener('input', () => {
    if (/^#[0-9a-fA-F]{6}$/.test(hex.value)) picker.value = hex.value;
  });
}

// ==========================================
// ASSET UPLOAD PREVIEW
// ==========================================
function initAssetUpload(inputId, previewId, projectId, type) {
  const input = document.getElementById(inputId);
  const preview = document.getElementById(previewId);
  if (!input) return;

  input.addEventListener('change', async function() {
    const files = Array.from(this.files);
    if (!files.length) return;

    const formData = new FormData();
    files.forEach(f => formData.append(type === 'logo' ? 'logo' : 'assets', f));

    showToast('Uploading...', 'info');
    try {
      const res = await fetch(`/projects/${projectId}/upload-assets`, { method: 'POST', body: formData });
      const data = await res.json();
      if (data.success) {
        if (type === 'logo' && data.logo && preview) {
          preview.innerHTML = `<img src="${data.logo}" style="max-height:60px;border-radius:6px;border:1px solid var(--border)">`;
        }
        if (type === 'assets') {
          showToast(`${data.assetCount} image(s) uploaded`, 'success');
        }
      } else {
        showToast(data.error || 'Upload failed', 'error');
      }
    } catch (e) {
      showToast('Upload failed', 'error');
    }
  });
}

// ==========================================
// EDITOR CHAT
// ==========================================
let isSending = false;

function initEditor(pid) {
  const textarea = document.getElementById('chatInput');
  if (textarea) {
    textarea.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendChatMessage(pid);
      }
    });
    textarea.addEventListener('input', function() {
      this.style.height = 'auto';
      this.style.height = Math.min(this.scrollHeight, 100) + 'px';
    });
  }
  scrollChatToBottom();
}

async function sendChatMessage(pid) {
  if (isSending) return;
  const textarea = document.getElementById('chatInput');
  const msg = textarea.value.trim();
  if (!msg) return;

  isSending = true;
  const sendBtn = document.getElementById('chatSendBtn');
  if (sendBtn) sendBtn.disabled = true;
  textarea.value = '';
  textarea.style.height = 'auto';

  appendChatBubble('user', msg);
  const typingId = appendTypingIndicator();
  scrollChatToBottom();

  try {
    const res = await fetch(`/generate/${pid}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: msg })
    });
    const data = await res.json();
    removeTypingIndicator(typingId);

    if (data.success) {
      appendChatBubble('ai', data.summary || 'Updated successfully.');
      // Update iframe
      const frame = document.getElementById('previewFrame');
      if (frame) {
        const blob = new Blob([data.html], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        frame.src = url;
      }
      // Show redeploy button
      const redeployBtn = document.getElementById('redeployBtn');
      if (redeployBtn) redeployBtn.style.display = 'flex';
    } else {
      appendChatBubble('ai', '⚠️ ' + (data.error || 'Something went wrong.'));
    }
  } catch (err) {
    removeTypingIndicator(typingId);
    appendChatBubble('ai', '⚠️ Network error. Please try again.');
  }

  isSending = false;
  if (sendBtn) sendBtn.disabled = false;
  scrollChatToBottom();
}

function appendChatBubble(role, text) {
  const container = document.getElementById('chatMessages');
  if (!container) return;
  const div = document.createElement('div');
  div.className = `chat-bubble bubble-${role}`;
  if (role === 'ai') {
    div.innerHTML = `<div class="bubble-ai-label">
      <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z"/></svg>
      Claude AI
    </div>${escapeHtml(text)}`;
  } else {
    div.textContent = text;
  }
  container.appendChild(div);
}

function appendTypingIndicator() {
  const container = document.getElementById('chatMessages');
  if (!container) return null;
  const id = 'typing_' + Date.now();
  const div = document.createElement('div');
  div.id = id;
  div.className = 'chat-bubble bubble-ai';
  div.innerHTML = `<div class="bubble-ai-label">Claude AI</div><div class="typing-indicator"><span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span></div>`;
  container.appendChild(div);
  return id;
}

function removeTypingIndicator(id) {
  if (id) document.getElementById(id)?.remove();
}

function scrollChatToBottom() {
  const c = document.getElementById('chatMessages');
  if (c) setTimeout(() => { c.scrollTop = c.scrollHeight; }, 50);
}

function escapeHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ==========================================
// DEPLOY
// ==========================================
function showDeployModal() {
  document.getElementById('deployModal')?.classList.add('show');
}
function hideDeployModal() {
  document.getElementById('deployModal')?.classList.remove('show');
}

async function deployProject(pid) {
  const stepsContainer = document.getElementById('deploySteps');
  const steps = ['Connecting to server...', 'Creating directory...', 'Uploading index.html...', 'Site is Live!'];

  if (stepsContainer) {
    stepsContainer.innerHTML = steps.map((s, i) => `
      <div class="deploy-step pending" id="dstep_${i}">
        <span class="step-icon">○</span>${s}
      </div>`).join('');
  }

  // Animate steps
  let delay = 0;
  steps.forEach((_, i) => {
    setTimeout(() => {
      document.getElementById(`dstep_${i}`)?.classList.replace('pending', 'active');
      document.querySelector(`#dstep_${i} .step-icon`).textContent = '◎';
    }, delay);
    delay += 700;
  });

  try {
    const res = await fetch(`/deploy/${pid}`, { method: 'POST' });
    const data = await res.json();

    if (data.success) {
      steps.forEach((_, i) => {
        const el = document.getElementById(`dstep_${i}`);
        if (el) { el.className = 'deploy-step done'; el.querySelector('.step-icon').textContent = '✓'; }
      });
      const urlEl = document.getElementById('deployUrl');
      if (urlEl && data.deployUrl) {
        urlEl.innerHTML = `<a href="${data.deployUrl}" target="_blank" class="btn btn-ghost btn-sm" style="margin-top:10px">View Live Site →</a>`;
      }
    } else {
      const lastStep = document.querySelector('.deploy-step.active');
      if (lastStep) { lastStep.className = 'deploy-step error'; lastStep.querySelector('.step-icon').textContent = '✗'; lastStep.innerHTML += ' — ' + (data.error || 'Failed'); }
    }
  } catch (err) {
    showToast('Deployment failed: ' + err.message, 'error');
  }
}

async function downloadHtml(pid) {
  window.location.href = `/deploy/${pid}/download`;
}

// ==========================================
// REFERRAL COPY
// ==========================================
function copyReferralLink(text) {
  navigator.clipboard.writeText(text).then(() => showToast('Referral link copied!', 'success')).catch(() => {
    const el = document.createElement('textarea');
    el.value = text; document.body.appendChild(el); el.select();
    document.execCommand('copy'); document.body.removeChild(el);
    showToast('Copied!', 'success');
  });
}

// ==========================================
// TOAST
// ==========================================
function showToast(message, type = 'info') {
  const existing = document.getElementById('toastContainer');
  if (!existing) {
    const container = document.createElement('div');
    container.id = 'toastContainer';
    container.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:9999;display:flex;flex-direction:column;gap:8px;';
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  const colors = { success: 'rgba(46,204,113,0.9)', error: 'rgba(239,68,68,0.9)', info: 'rgba(201,168,76,0.9)' };
  toast.style.cssText = `background:${colors[type]||colors.info};color:#0a0a0a;font-family:Poppins,sans-serif;font-size:12px;font-weight:600;padding:10px 16px;border-radius:7px;box-shadow:0 4px 16px rgba(0,0,0,0.4);transform:translateY(20px);opacity:0;transition:all 0.25s ease;white-space:nowrap;max-width:300px;`;
  toast.textContent = message;
  document.getElementById('toastContainer').appendChild(toast);
  requestAnimationFrame(() => { toast.style.transform = 'translateY(0)'; toast.style.opacity = '1'; });
  setTimeout(() => {
    toast.style.transform = 'translateY(20px)'; toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 250);
  }, 3000);
}

// ==========================================
// ADMIN TABS
// ==========================================
function showAdminTab(tab) {
  document.querySelectorAll('.admin-tab-panel').forEach(p => p.style.display = 'none');
  document.querySelectorAll('.admin-nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('tab-' + tab)?.style.setProperty('display', 'block');
  document.querySelector(`[data-tab="${tab}"]`)?.classList.add('active');
}

// ==========================================
// PLANS / RAZORPAY
// ==========================================
function subscribePlan(planKey, planId) {
  fetch('/plans/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ plan_key: planKey })
  })
  .then(r => r.json())
  .then(data => {
    if (!data.success) { showToast(data.error || 'Failed to create subscription', 'error'); return; }
    const options = {
      key: data.keyId,
      subscription_id: data.subscriptionId,
      name: 'Vibenote.studio',
      description: planKey.charAt(0).toUpperCase() + planKey.slice(1) + ' Plan',
      handler: function(response) {
        response.plan_key = planKey;
        fetch('/plans/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(response)
        })
        .then(r => r.json())
        .then(d => {
          if (d.success) { showToast('Subscription activated!', 'success'); setTimeout(() => window.location.href = '/dashboard', 1500); }
          else showToast('Payment verification failed', 'error');
        });
      },
      theme: { color: '#c9a84c' }
    };
    const rzp = new Razorpay(options);
    rzp.open();
  })
  .catch(() => showToast('Payment system error', 'error'));
}
