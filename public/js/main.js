/* ==========================================
   VIBENOTE STUDIO - CLIENT JS
   ========================================== */

function initTagInput(wrapId, hiddenInputId) {
  const wrap = document.getElementById(wrapId);
  const hidden = document.getElementById(hiddenInputId);
  if (!wrap || !hidden) return;

  let tags = [];
  try { tags = JSON.parse(hidden.value || '[]'); } catch (e) { tags = []; }

  function render() {
    wrap.querySelectorAll('.tag-pill').forEach(el => el.remove());
    const input = wrap.querySelector('.tag-real-input');

    tags.forEach((tag, i) => {
      const pill = document.createElement('span');
      pill.className = 'tag-pill';
      pill.innerHTML = `${tag}<button type="button" onclick="removeTagFrom('${wrapId}','${hiddenInputId}',${i})">x</button>`;
      wrap.insertBefore(pill, input);
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
  wrap._tags = tags;
}

function removeTagFrom(wrapId, hiddenId, idx) {
  const wrap = document.getElementById(wrapId);
  const hidden = document.getElementById(hiddenId);
  let tags = [];
  try { tags = JSON.parse(hidden.value || '[]'); } catch (e) { tags = []; }
  tags.splice(idx, 1);
  hidden.value = JSON.stringify(tags);
  wrap._tags = tags;
  initTagInput(wrapId, hiddenId);
}

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
  document.querySelectorAll('.step-panel').forEach((panel, i) => {
    panel.classList.toggle('active', i === n);
  });

  document.querySelectorAll('.step-dot').forEach((dot, i) => {
    dot.classList.toggle('active', i === n);
    dot.classList.toggle('done', i < n);
  });

  currentStep = n;
  const pct = (n / (totalSteps - 1)) * 100;
  const fill = document.getElementById('progressFill');
  if (fill) fill.style.width = pct + '%';

  const counter = document.getElementById('stepCounter');
  if (counter) counter.textContent = `Step ${n + 1} of ${totalSteps}`;

  const backBtn = document.getElementById('btnBack');
  if (backBtn) backBtn.style.visibility = n === 0 ? 'hidden' : 'visible';

  const nextBtn = document.getElementById('btnNext');
  if (nextBtn) {
    nextBtn.textContent = n === totalSteps - 1 ? 'Create & Save Brief' : 'Continue';
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
  } catch (e) {
    return null;
  }
}

function collectFormData() {
  const data = {};

  document.querySelectorAll('[data-field]').forEach(el => {
    const key = el.dataset.field;
    if (el.type === 'hidden' && el.dataset.tags) {
      try { data[key] = JSON.parse(el.value || '[]'); } catch (e) { data[key] = []; }
    } else {
      data[key] = el.value;
    }
  });

  const tone = document.querySelector('.tone-card.selected');
  if (tone) data.tone = tone.dataset.tone;

  data.sections = Array.from(document.querySelectorAll('.section-chip.selected')).map(el => el.dataset.section);
  return data;
}

function selectTone(el) {
  document.querySelectorAll('.tone-card').forEach(card => card.classList.remove('selected'));
  el.classList.add('selected');
  const input = document.getElementById('toneInput');
  if (input) input.value = el.dataset.tone;
}

function toggleSection(el) {
  el.classList.toggle('selected');
  const check = el.querySelector('.chip-check');
  if (check) check.textContent = el.classList.contains('selected') ? 'OK' : '';
  updateSectionsInput();
}

function updateSectionsInput() {
  const selected = Array.from(document.querySelectorAll('.section-chip.selected')).map(el => el.dataset.section);
  const input = document.getElementById('sectionsInput');
  if (input) input.value = JSON.stringify(selected);
}

function syncColorPicker(colorPickerId, hexInputId) {
  const picker = document.getElementById(colorPickerId);
  const hex = document.getElementById(hexInputId);
  if (!picker || !hex) return;

  picker.addEventListener('input', () => { hex.value = picker.value; });
  hex.addEventListener('input', () => {
    if (/^#[0-9a-fA-F]{6}$/.test(hex.value)) picker.value = hex.value;
  });
}

function initAssetUpload(inputId, previewId, pid, type) {
  const input = document.getElementById(inputId);
  const preview = document.getElementById(previewId);
  if (!input) return;

  input.addEventListener('change', async function() {
    const files = Array.from(this.files);
    if (!files.length) return;

    const formData = new FormData();
    files.forEach(file => formData.append(type === 'logo' ? 'logo' : 'assets', file));

    showToast('Uploading...', 'info');

    try {
      const query = type === 'logo' ? '?type=logo' : '';
      const res = await fetch(`/projects/${pid}/upload${query}`, { method: 'POST', body: formData });
      const data = await res.json();

      if (data.success) {
        if (type === 'logo' && preview) {
          const first = files[0];
          const reader = new FileReader();
          reader.onload = () => {
            preview.innerHTML = `<img src="${reader.result}" style="max-height:60px;border-radius:6px;border:1px solid var(--border)">`;
          };
          reader.readAsDataURL(first);
        }

        if (type === 'assets') {
          showToast(`${data.assetCount} image(s) uploaded`, 'success');
        } else {
          showToast('Logo uploaded', 'success');
        }
      } else {
        showToast(data.error || 'Upload failed', 'error');
      }
    } catch (e) {
      showToast('Upload failed', 'error');
    }
  });
}

let isSending = false;

function initEditor() {
  const textarea = document.getElementById('chatInput');
  const sendBtn = document.getElementById('chatSendBtn');

  if (sendBtn && !sendBtn.innerHTML.trim()) {
    sendBtn.innerHTML = '<span style="font-size:14px;font-weight:700;line-height:1">+</span>';
  }

  if (textarea) {
    textarea.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const pid = textarea.getAttribute('data-project-id');
        if (pid) sendChatMessage(pid);
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
  const msg = textarea?.value.trim();
  if (!msg || !textarea) return;

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
      appendChatBubble('ai', data.summary || 'Client website updated.');
      const frame = document.getElementById('previewFrame');
      if (frame) {
        const blob = new Blob([data.html], { type: 'text/html' });
        frame.src = URL.createObjectURL(blob);
      }
      const redeployBtn = document.getElementById('redeployBtn');
      if (redeployBtn) redeployBtn.style.display = 'flex';
    } else {
      appendChatBubble('ai', '[!] ' + (data.error || 'Something went wrong.'));
    }
  } catch (err) {
    removeTypingIndicator(typingId);
    appendChatBubble('ai', '[!] Network error. Please try again.');
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
    div.innerHTML = `<div class="bubble-ai-label">VibeNote AI</div>${escapeHtml(text)}`;
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
  div.innerHTML = '<div class="bubble-ai-label">VibeNote AI</div><div class="typing-indicator"><span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span></div>';
  container.appendChild(div);
  return id;
}

function removeTypingIndicator(id) {
  if (id) document.getElementById(id)?.remove();
}

function scrollChatToBottom() {
  const container = document.getElementById('chatMessages');
  if (container) {
    setTimeout(() => { container.scrollTop = container.scrollHeight; }, 50);
  }
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function showDeployModal() {
  document.getElementById('deployModal')?.classList.add('show');
}

function hideDeployModal() {
  document.getElementById('deployModal')?.classList.remove('show');
}

async function deployProject(pid) {
  const stepsContainer = document.getElementById('deploySteps');
  const provider = document.getElementById('deployProvider')?.value || 'sftp';

  if (provider === 'export_html') {
    downloadHtml(pid);
    hideDeployModal();
    return;
  }

  const steps = [
    'Preparing static site bundle...',
    'Connecting to deploy target...',
    'Uploading files...',
    'Returning live URL...'
  ];

  if (stepsContainer) {
    stepsContainer.innerHTML = steps.map((step, i) => `
      <div class="deploy-step pending" id="dstep_${i}">
        <span class="step-icon">o</span>${step}
      </div>`).join('');
  }

  let delay = 0;
  steps.forEach((_, i) => {
    setTimeout(() => {
      const row = document.getElementById(`dstep_${i}`);
      const icon = row?.querySelector('.step-icon');
      row?.classList.replace('pending', 'active');
      if (icon) icon.textContent = '...';
    }, delay);
    delay += 700;
  });

  try {
    const res = await fetch(`/deploy/${pid}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider })
    });
    const data = await res.json();

    if (data.success) {
      if (data.exportUrl) {
        window.location.href = data.exportUrl;
        hideDeployModal();
        return;
      }

      steps.forEach((_, i) => {
        const row = document.getElementById(`dstep_${i}`);
        const icon = row?.querySelector('.step-icon');
        if (row) row.className = 'deploy-step done';
        if (icon) icon.textContent = 'OK';
      });

      const urlEl = document.getElementById('deployUrl');
      if (urlEl && data.deployUrl) {
        urlEl.innerHTML = `
          <div style="margin-top:10px;font-size:12px;color:var(--text-dim)">
            ${data.providerLabel || 'Deploy target'} is live
          </div>
          <a href="${data.deployUrl}" target="_blank" class="btn btn-ghost btn-sm" style="margin-top:10px">View Live Site</a>`;
      }
    } else {
      const lastStep = document.querySelector('.deploy-step.active') || document.querySelector('.deploy-step.pending');
      if (lastStep) {
        lastStep.className = 'deploy-step error';
        const icon = lastStep.querySelector('.step-icon');
        if (icon) icon.textContent = 'X';
        lastStep.innerHTML += ' - ' + (data.error || 'Failed');
      }
      showToast(data.error || 'Deploy failed', 'error');
    }
  } catch (err) {
    showToast('Deployment failed: ' + err.message, 'error');
  }
}

function downloadHtml(pid) {
  window.location.href = `/deploy/${pid}/download`;
}

function copyReferralLink(text) {
  navigator.clipboard.writeText(text).then(() => {
    showToast('Referral link copied!', 'success');
  }).catch(() => {
    const el = document.createElement('textarea');
    el.value = text;
    document.body.appendChild(el);
    el.select();
    document.execCommand('copy');
    document.body.removeChild(el);
    showToast('Copied!', 'success');
  });
}

function showToast(message, type = 'info') {
  if (!document.getElementById('toastContainer')) {
    const container = document.createElement('div');
    container.id = 'toastContainer';
    container.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:9999;display:flex;flex-direction:column;gap:8px;';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  const colors = {
    success: 'rgba(46,204,113,0.9)',
    error: 'rgba(239,68,68,0.9)',
    info: 'rgba(201,168,76,0.9)'
  };

  toast.style.cssText = `background:${colors[type] || colors.info};color:#0a0a0a;font-family:Poppins,sans-serif;font-size:12px;font-weight:600;padding:10px 16px;border-radius:7px;box-shadow:0 4px 16px rgba(0,0,0,0.4);transform:translateY(20px);opacity:0;transition:all 0.25s ease;white-space:nowrap;max-width:300px;`;
  toast.textContent = message;
  document.getElementById('toastContainer').appendChild(toast);

  requestAnimationFrame(() => {
    toast.style.transform = 'translateY(0)';
    toast.style.opacity = '1';
  });

  setTimeout(() => {
    toast.style.transform = 'translateY(20px)';
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 250);
  }, 3000);
}

function showAdminTab(tab) {
  document.querySelectorAll('.admin-tab-panel').forEach(panel => panel.style.display = 'none');
  document.querySelectorAll('.admin-nav-item').forEach(item => item.classList.remove('active'));
  document.getElementById('tab-' + tab)?.style.setProperty('display', 'block');
  document.querySelector(`[data-tab="${tab}"]`)?.classList.add('active');
}

function subscribePlan(planKey) {
  fetch('/plans/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ plan_key: planKey })
  })
    .then(r => r.json())
    .then(data => {
      if (!data.success) {
        showToast(data.error || 'Failed to create subscription', 'error');
        return;
      }

      const options = {
        key: data.keyId,
        subscription_id: data.subscriptionId,
        name: 'VibeNote.studio',
        description: 'Agency pricing plan',
        handler(response) {
          response.plan_key = planKey;
          fetch('/plans/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(response)
          })
            .then(r => r.json())
            .then(result => {
              if (result.success) {
                showToast('Subscription activated!', 'success');
                setTimeout(() => { window.location.href = '/dashboard'; }, 1500);
              } else {
                showToast('Payment verification failed', 'error');
              }
            });
        },
        theme: { color: '#c9a84c' }
      };

      const rzp = new Razorpay(options);
      rzp.open();
    })
    .catch(() => showToast('Payment system error', 'error'));
}

async function submitForm() {
  await saveProgress();
  const overlay = document.getElementById('generationOverlay');
  const overlayText = document.getElementById('overlayText');
  const overlaySub = document.getElementById('overlaySub');

  if (overlay) overlay.classList.add('show');
  if (overlayText) overlayText.textContent = 'Saving client brief...';
  if (overlaySub) overlaySub.textContent = 'This only takes a second.';

  try {
    const res = await fetch(`/projects/${projectId}/save-brief`, { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      if (overlayText) overlayText.textContent = 'Brief saved!';
      if (overlaySub) overlaySub.textContent = 'Redirecting to Client Briefs...';
      setTimeout(() => { window.location.href = '/briefs'; }, 800);
    } else {
      if (overlay) overlay.classList.remove('show');
      showToast(data.error || 'Failed to save brief. Please try again.', 'error');
    }
  } catch (err) {
    if (overlay) overlay.classList.remove('show');
    showToast('Network error. Please try again.', 'error');
  }
}
