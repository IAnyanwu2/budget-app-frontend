const express = require('express');
const fetch = global.fetch || require('node-fetch');
const app = express();
const PORT = process.env.OLLAMA_PROXY_PORT || 5232;

app.use(express.json({ limit: '2mb' }));
app.use((req, res, next) => {
  // Allow local dev origins
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  // Allow Authorization header and common request headers for preflight
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept, X-Requested-With');
  res.setHeader('Access-Control-Max-Age', '600');
  if (req.method === 'OPTIONS') {
    // Respond to preflight with the same CORS headers
    return res.sendStatus(200);
  }
  next();
});

app.post('/api/ai-insights', async (req, res) => {
  try {
    console.log('[proxy] /api/ai-insights POST received, headers:', req.headers['content-type']);
    console.log('[proxy] request body keys:', Object.keys(req.body || {}));
    // Forward request body to local Ollama generate endpoint
    const ollamaUrl = process.env.OLLAMA_URL || 'http://localhost:11434/api/generate';
    const body = req.body;

    const resp = await fetch(ollamaUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      // no redirect
    });

    const json = await resp.json();
    console.log('[proxy] proxied response status:', resp.status);
    // Return Ollama's JSON response directly
    res.status(resp.status).json(json);
  } catch (err) {
    console.error('Proxy error:', err);
    res.status(500).json({ error: 'Proxy failed', detail: String(err) });
  }
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', proxiedTo: process.env.OLLAMA_URL || 'http://localhost:11434/api/generate' });
});

app.listen(PORT, () => {
  console.log(`Ollama proxy listening on http://localhost:${PORT}`);
});
