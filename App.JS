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
  renderProjectList();
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
  activeProjectLabel.textContent = project.name;
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
  if (messages.length === 0) {
    chatArea.innerHTML = '<div class="empty-state">Sem mensagens ainda. Escreva algo abaixo.</div>';
    return;
  }
  messages.forEach(m => {
    const div = document.createElement('div');
    div.className = `msg ${m.role}`;
    div.textContent = m.content;
    chatArea.appendChild(div);
  });
  chatArea.scrollTop = chatArea.scrollHeight;
}
 
function escapeHtml(s) {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
 
// caixa de texto expansível de verdade
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
    body: JSON.stringify({ conversationId: activeConversation.id, projectName: activeProject.name, message: text }),
  });
  const data = await res.json();
 
  if (!res.ok) {
    const sysDiv = document.createElement('div');
    sysDiv.className = 'msg system';
    sysDiv.textContent = data.message || 'Erro ao falar com a IA.';
    chatArea.appendChild(sysDiv);
  } else {
    await loadMessages();
  }
  sendBtn.disabled = false;
  chatArea.scrollTop = chatArea.scrollHeight;
}
 
checkHealth();
loadProjects();
 
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
 
