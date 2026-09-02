const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = Number(process.env.PORT || 10000);
const DATA_FILE = path.join(__dirname, 'db.json');
const AI_PROVIDER = (process.env.AI_PROVIDER || 'gemini').toLowerCase();

function ensureDataFile() {
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify({ projects: [], conversations: [], messages: [] }, null, 2));
  }
}

function readData() {
  ensureDataFile();
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}

function writeData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function makeId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function hasAnyAiKey() {
  return Boolean(
    process.env.GEMINI_API_KEY ||
    process.env.OPENAI_API_KEY ||
    process.env.OPENROUTER_API_KEY ||
    process.env.MISTRAL_API_KEY ||
    process.env.GROQ_API_KEY
  );
}

function getModelLabel() {
  if (process.env.GEMINI_API_KEY) return 'Gemini';
  if (process.env.OPENROUTER_API_KEY) return 'OpenRouter';
  if (process.env.OPENAI_API_KEY) return 'OpenAI';
  if (process.env.MISTRAL_API_KEY) return 'Mistral';
  if (process.env.GROQ_API_KEY) return 'Groq';
  return 'Sem provedor';
}

function buildHistoryMessages(conversationId) {
  const data = readData();
  const messages = data.messages
    .filter((m) => m.conversationId === conversationId)
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
    .slice(-12)
    .map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content }));

  return messages;
}

async function callGemini(prompt, history = []) {
  const key = String(process.env.GEMINI_API_KEY || '')
    .trim()
    .replace(/^['"]|['"]$/g, '')
    .replace(/^Bearer\s+/i, '')
    .replace(/^GEMINI_API_KEY\s*=\s*/i, '');
  if (!key) return null;

  const body = {
    contents: [
      ...history.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
      { role: 'user', parts: [{ text: prompt }] }
    ],
    generationConfig: { temperature: 0.6, maxOutputTokens: 160 }
  };

  const models = [
    process.env.GEMINI_MODEL || 'gemini-3.6-flash',
    process.env.GEMINI_FALLBACK_MODEL
  ].filter((model, index, list) => model && list.indexOf(model) === index);
  let lastError = '';

  for (const model of models) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);
      let res;
      try {
        res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
          method: 'POST',
          signal: controller.signal,
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
          body: JSON.stringify(body)
        });
      } catch (error) {
        lastError = error.name === 'AbortError' ? 'tempo limite excedido' : error.message;
        continue;
      } finally {
        clearTimeout(timeoutId);
      }

      if (res.ok) {
        const data = await res.json();
        return data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || 'Sem resposta da IA.';
      }

      lastError = await res.text();
      if (![429, 500, 503].includes(res.status)) break;
      await new Promise((resolve) => setTimeout(resolve, 800 * (attempt + 1)));
    }
  }

  throw new Error(`Gemini temporariamente indisponível: ${lastError}`);
}

async function callOpenRouter(prompt, history = []) {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) return null;

  const model = process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini';
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
      'HTTP-Referer': 'https://localhost',
      'X-Title': 'MIAR App'
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: 'Responda em português, com tom útil e objetivo.' },
        ...history,
        { role: 'user', content: prompt }
      ]
    })
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenRouter error: ${text}`);
  }

  const data = await res.json();
  return data?.choices?.[0]?.message?.content || 'Sem resposta da IA.';
}

async function callOpenAI(prompt, history = []) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;

  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: 'Responda em português, com tom profissional e objetivo.' },
        ...history,
        { role: 'user', content: prompt }
      ]
    })
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenAI error: ${text}`);
  }

  const data = await res.json();
  return data?.choices?.[0]?.message?.content || 'Sem resposta da IA.';
}

async function callMistral(prompt, history = []) {
  const key = process.env.MISTRAL_API_KEY;
  if (!key) return null;

  const model = process.env.MISTRAL_MODEL || 'mistral-small-latest';
  const res = await fetch('https://api.mistral.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: 'Responda em português, curto e claro.' },
        ...history,
        { role: 'user', content: prompt }
      ]
    })
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Mistral error: ${text}`);
  }

  const data = await res.json();
  return data?.choices?.[0]?.message?.content || 'Sem resposta da IA.';
}

async function callGroq(prompt, history = []) {
  const key = process.env.GROQ_API_KEY;
  if (!key) return null;

  const model = process.env.GROQ_MODEL || 'llama-3.1-8b-instant';
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: 'Responda em português, curto e direto.' },
        ...history,
        { role: 'user', content: prompt }
      ]
    })
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Groq error: ${text}`);
  }

  const data = await res.json();
  return data?.choices?.[0]?.message?.content || 'Sem resposta da IA.';
}

async function generateAssistantReply({ projectName, message, conversationId, language }) {
  const history = buildHistoryMessages(conversationId).slice(-8);
  const prompt = `Você é um assistente para o projeto "${projectName || 'Projeto'}". Responda de forma útil e objetiva no idioma ${language || 'português'}. Pergunta do usuário: ${message}`;

  try {
    switch (AI_PROVIDER) {
      case 'openrouter':
        return (await callOpenRouter(prompt, history)) || 'IA não configurada.';
      case 'openai':
        return (await callOpenAI(prompt, history)) || 'IA não configurada.';
      case 'mistral':
        return (await callMistral(prompt, history)) || 'IA não configurada.';
      case 'groq':
        return (await callGroq(prompt, history)) || 'IA não configurada.';
      case 'gemini':
      default:
        return (await callGemini(prompt, history)) || 'IA não configurada.';
    }
  } catch (error) {
    if (error.message.includes('temporariamente indisponível')) {
      return 'A IA está recebendo muitas solicitações neste momento. Tente enviar novamente em alguns segundos.';
    }
    return `Erro ao chamar a IA: ${error.message}`;
  }
}

app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    provider: AI_PROVIDER,
    model: getModelLabel(),
    hasApiKey: hasAnyAiKey()
  });
});

app.get('/api/projects', (req, res) => {
  const data = readData();
  res.json(data.projects || []);
});

app.post('/api/projects', (req, res) => {
  const name = String(req.body?.name || '').trim();
  if (!name) {
    return res.status(400).json({ message: 'Nome do projeto é obrigatório.' });
  }

  const data = readData();
  const project = {
    id: makeId('project'),
    name,
    createdAt: new Date().toISOString()
  };

  data.projects.push(project);
  writeData(data);
  res.status(201).json(project);
});

app.delete('/api/projects/:id', (req, res) => {
  const data = readData();
  const projectId = req.params.id;
  data.projects = data.projects.filter((p) => p.id !== projectId);
  data.conversations = data.conversations.filter((c) => c.projectId !== projectId);
  data.messages = data.messages.filter((m) => !data.conversations.some((c) => c.id === m.conversationId) || !data.conversations.some((c) => c.id === m.conversationId));

  const remainingConversationIds = new Set(data.conversations.map((c) => c.id));
  data.messages = data.messages.filter((m) => remainingConversationIds.has(m.conversationId));

  writeData(data);
  res.status(204).send();
});

app.get('/api/projects/:projectId/conversations', (req, res) => {
  const data = readData();
  const list = (data.conversations || []).filter((c) => c.projectId === req.params.projectId);
  res.json(list.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)));
});

app.post('/api/projects/:projectId/conversations', (req, res) => {
  const title = String(req.body?.title || 'Conversa 1').trim();
  const data = readData();
  const conversation = {
    id: makeId('conversation'),
    projectId: req.params.projectId,
    title: title || 'Conversa 1',
    createdAt: new Date().toISOString()
  };
  data.conversations.push(conversation);
  writeData(data);
  res.status(201).json(conversation);
});

app.get('/api/conversations/:conversationId/messages', (req, res) => {
  const data = readData();
  const list = (data.messages || []).filter((m) => m.conversationId === req.params.conversationId);
  res.json(list.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)));
});

app.post('/api/chat', async (req, res) => {
  const { conversationId, projectName, message, language } = req.body || {};

  if (!conversationId || !message || !String(message).trim()) {
    return res.status(400).json({ message: 'Mensagem e conversa são obrigatórias.' });
  }

  const data = readData();
  const userMsg = {
    id: makeId('message'),
    conversationId,
    role: 'user',
    content: String(message).trim(),
    createdAt: new Date().toISOString()
  };

  data.messages.push(userMsg);
  writeData(data);

  const assistantReply = await generateAssistantReply({
    projectName,
    message: userMsg.content,
    conversationId,
    language
  });

  const responseMsg = {
    id: makeId('message'),
    conversationId,
    role: 'assistant',
    content: assistantReply,
    createdAt: new Date().toISOString()
  };

  data.messages.push(responseMsg);
  writeData(data);

  res.json({ ok: true, message: assistantReply, role: 'assistant' });
});

app.use(express.static(__dirname));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`MIAR API rodando em http://localhost:${PORT}`);
  console.log(`Provider ativo: ${AI_PROVIDER}`);
});
