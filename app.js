// MIAR APPS - lógica real do front-end. Toda chamada abaixo bate no backend de verdade
// (server.js), que lê e grava em db.json. Nada aqui é mockado.

const API = '';
let projects = [];
let activeProject = null;
let activeConversation = null;

const menuBtn = document.getElementById('menuBtn');
const overlay = document.getElementById('overlay');
const drawer = document.getElementById('drawer');
const projectList = document.getElementById('projectList');
const newProjectBtn = document.getElementById('newProjectBtn');
const activeProjectLabel = document.getElementById('activeProjectLabel');
const chatArea = document.getElementById('chatArea');
const msgInput = document.getElementById('msgInput');
const sendBtn = document.getElementById('sendBtn');
const apiWarning = document.getElementById('apiWarning');
const languageSelect = document.getElementById('languageSelect');
const settingsBtn = document.getElementById('settingsBtn');
const settingsPanel = document.getElementById('settingsPanel');
const themeSelect = document.getElementById('themeSelect');
const autoSpeak = document.getElementById('autoSpeak');
const fileInput = document.getElementById('fileInput');
const micBtn = document.getElementById('micBtn');
const speakBtn = document.getElementById('speakBtn');
const voiceStatus = document.getElementById('voiceStatus');
let lastAssistantText = '';

const languageNames = { 'pt-BR': 'português', en: 'inglês', fr: 'francês', es: 'espanhol', no: 'norueguês' };

languageSelect.value = localStorage.getItem('miar-language') || 'pt-BR';
themeSelect.value = localStorage.getItem('miar-theme') || 'system';
autoSpeak.checked = localStorage.getItem('miar-auto-speak') === 'true';

function applyTheme(theme) {
  const dark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.body.classList.toggle('dark-theme', dark);
}

applyTheme(themeSelect.value);
settingsBtn.addEventListener('click', () => settingsPanel.classList.toggle('open'));
themeSelect.addEventListener('change', () => {
  localStorage.setItem('miar-theme', themeSelect.value);
  applyTheme(themeSelect.value);
});
autoSpeak.addEventListener('change', () => localStorage.setItem('miar-auto-speak', autoSpeak.checked));
languageSelect.addEventListener('change', () => localStorage.setItem('miar-language', languageSelect.value));

function openDrawer() { overlay.classList.add('open'); drawer.classList.add('open'); }
function closeDrawer() { overlay.classList.remove('open'); drawer.classList.remove('open'); }
menuBtn.addEventListener('click', openDrawer);
overlay.addEventListener('click', closeDrawer);

async function checkHealth() {
  const res = await fetch(`${API}/api/health`);
  const data = await res.json();
  apiWarning.style.display = data.hasApiKey ? 'none' : 'block';
}

async function loadProjects() {
  const res = await fetch(`${API}/api/projects`);
  projects = await res.json();

  if (!projects.length) {
    try {
      const createRes = await fetch(`${API}/api/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Para você' })
      });
      if (createRes.ok) {
        const created = await createRes.json();
        projects = [created];
      }
    } catch (error) {
      console.warn('Não foi possível criar projeto inicial:', error);
    }
  }

  renderProjectList();
  if (!activeProject && projects[0]) {
    selectProject(projects[0]);
  }
}

function renderProjectList() {
  projectList.innerHTML = '';
  projects.forEach(p => {
    const li = document.createElement('li');
    li.className = p.id === activeProject?.id ? 'active' : '';
    li.innerHTML = `<span>${escapeHtml(p.name)}</span><span class="del" data-id="${p.id}">✕</span>`;
    li.addEventListener('click', (e) => {
      if (e.target.classList.contains('del')) return;
      selectProject(p);
      closeDrawer();
    });
    li.querySelector('.del').addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!confirm(`Excluir o projeto "${p.name}" e todas as conversas dele?`)) return;
      await fetch(`${API}/api/projects/${p.id}`, { method: 'DELETE' });
      if (activeProject?.id === p.id) { activeProject = null; activeConversation = null; renderChat([]); }
      loadProjects();
    });
    projectList.appendChild(li);
  });
}

newProjectBtn.addEventListener('click', async () => {
  const name = prompt('Nome do novo projeto:');
  if (!name || !name.trim()) return;
  const res = await fetch(`${API}/api/projects`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }),
  });
  const project = await res.json();
  await loadProjects();
  selectProject(project);
  closeDrawer();
});

async function selectProject(project) {
  activeProject = project;
  activeProjectLabel.textContent = 'Minha conversa';
  renderProjectList();

  const res = await fetch(`${API}/api/projects/${project.id}/conversations`);
  let conversations = await res.json();

  if (conversations.length === 0) {
    const createRes = await fetch(`${API}/api/projects/${project.id}/conversations`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'Conversa 1' }),
    });
    activeConversation = await createRes.json();
  } else {
    activeConversation = conversations[conversations.length - 1];
  }

  msgInput.disabled = false;
  sendBtn.disabled = false;
  await loadMessages();
}

async function loadMessages() {
  if (!activeConversation) return;
  const res = await fetch(`${API}/api/conversations/${activeConversation.id}/messages`);
  const messages = await res.json();
  renderChat(messages);
}

function renderChat(messages) {
  chatArea.innerHTML = '';

  const rose = document.createElement('div');
  rose.className = 'rose-watermark';
  rose.textContent = '✿';
  chatArea.appendChild(rose);

  const shell = document.createElement('div');
  shell.className = 'gift-shell';

  const welcomeCard = document.createElement('div');
  welcomeCard.className = 'welcome-card';
  welcomeCard.innerHTML = `
    <h2>Para você</h2>
    <p>Um espaço leve, bonito e íntimo para conversar com alguém especial.</p>
  `;
  shell.appendChild(welcomeCard);

  if (messages.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'Escreva algo abaixo e veja a conversa começar.';
    shell.appendChild(empty);
  } else {
    messages.forEach(m => {
      const div = document.createElement('div');
      div.className = `msg ${m.role}`;
      div.textContent = m.content;
      shell.appendChild(div);
    });
  }

  chatArea.appendChild(shell);
  chatArea.scrollTop = chatArea.scrollHeight;
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

msgInput.addEventListener('input', () => {
  msgInput.style.height = 'auto';
  msgInput.style.height = Math.min(msgInput.scrollHeight, 140) + 'px';
});

msgInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});
sendBtn.addEventListener('click', sendMessage);

fileInput.addEventListener('change', () => {
  const file = fileInput.files[0];
  if (!file) return;
  msgInput.value = `${msgInput.value}${msgInput.value ? '\n' : ''}[Anexo: ${file.name}]`;
  msgInput.dispatchEvent(new Event('input'));
  fileInput.value = '';
  msgInput.focus();
});

function speak(text) {
  if (!text || !('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = languageSelect.value;
  window.speechSynthesis.speak(utterance);
}

speakBtn.addEventListener('click', () => speak(lastAssistantText));

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
if (SpeechRecognition) {
  const recognition = new SpeechRecognition();
  recognition.interimResults = false;
  recognition.continuous = false;
  micBtn.addEventListener('click', () => {
    recognition.lang = languageSelect.value;
    voiceStatus.textContent = 'Ouvindo...';
    voiceStatus.classList.add('active');
    recognition.start();
  });
  recognition.addEventListener('result', (event) => {
    msgInput.value = `${msgInput.value}${msgInput.value ? ' ' : ''}${event.results[0][0].transcript}`;
    msgInput.dispatchEvent(new Event('input'));
    msgInput.focus();
  });
  recognition.addEventListener('end', () => voiceStatus.classList.remove('active'));
  recognition.addEventListener('error', () => voiceStatus.classList.remove('active'));
} else {
  micBtn.addEventListener('click', () => {
    voiceStatus.textContent = 'Microfone não disponível neste navegador.';
    voiceStatus.classList.add('active');
    setTimeout(() => voiceStatus.classList.remove('active'), 2500);
  });
}

async function sendMessage() {
  const text = msgInput.value.trim();
  if (!text || !activeConversation) return;
  msgInput.value = '';
  msgInput.style.height = 'auto';
  sendBtn.disabled = true;

  await loadMessages();
  const userDiv = document.createElement('div');
  userDiv.className = 'msg user';
  userDiv.textContent = text;
  document.querySelector('.empty-state')?.remove();
  chatArea.appendChild(userDiv);
  chatArea.scrollTop = chatArea.scrollHeight;

  const res = await fetch(`${API}/api/chat`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      conversationId: activeConversation.id,
      projectName: activeProject.name,
      message: text,
      language: languageNames[languageSelect.value]
    }),
  });
  const data = await res.json();

  if (!res.ok) {
    const sysDiv = document.createElement('div');
    sysDiv.className = 'msg system';
    sysDiv.textContent = data.message || 'Erro ao falar com a IA.';
    chatArea.appendChild(sysDiv);
  } else {
    lastAssistantText = data.message || '';
    await loadMessages();
    if (autoSpeak.checked) speak(lastAssistantText);
  }
  sendBtn.disabled = false;
  chatArea.scrollTop = chatArea.scrollHeight;
}

checkHealth();
loadProjects();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
