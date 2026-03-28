// server.js — Vana data infographic server
// Reads data live from ~/.vana/results/ on each request — always fresh.

import { createServer } from 'http';
import { readFileSync, existsSync, statSync } from 'fs';
import { join, extname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = join(fileURLToPath(import.meta.url), '..');
const PORT = process.env.PORT || 3000;
// In Docker: mounted at /data/vana. Locally: ~/.vana/results
const VANA_DIR = process.env.VANA_DIR || (existsSync('/data/vana') ? '/data/vana' : join(process.env.HOME || '/root', '.vana', 'results'));

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
};

function loadJSON(name) {
  const path = join(VANA_DIR, name);
  if (!existsSync(path)) return {};
  return JSON.parse(readFileSync(path, 'utf-8'));
}

function processData() {
  const now = new Date();
  const d1 = new Date(now - 24 * 60 * 60 * 1000);
  const d7 = new Date(now - 7 * 24 * 60 * 60 * 1000);

  // ChatGPT
  const cg = loadJSON('chatgpt.json');
  const convos = cg?.['chatgpt.conversations']?.conversations || [];
  const memories = cg?.['chatgpt.memories']?.memories || [];

  const models = {};
  const topics24h = [], topics7d = [];
  const hoursCT = {};
  let totalMsgs = 0, withMsgs = 0;
  const recentConvos = [];
  const themes = {
    'Baby & Parenting': ['baby','nursery','diaper','sleep sack','parenting','pregnancy','trimester','lullaby','rhyme','white noise','hsv','sour-smell','infant'],
    'AI & Engineering': ['ai ','goodhart','verifiab','autoresearch','litellm','static analysis','neko','webrtc','plaid','kwin','wayland','exploit','tool','mcp','agent','claude','codex','openai','gpt'],
    'Geopolitics': ['iran','ukraine','war','olympics','tariff','sanction'],
    'Health & Wellness': ['nutrition','cramping','copper','ectopic','pain','schizophrenia','bowen'],
    'Daily Life': ['milkbone','dog','orange powder','easter','trailer','interest rate','cheapest','country artist','stripe','tax'],
    'Crypto / Web3': ['vana','crypto','blockchain','wallet','dao'],
  };
  const themeCounts = {};
  const themedTitles = {};

  for (const c of convos) {
    const mc = c.message_count || (c.messages || []).length;
    if (mc > 0) { withMsgs++; totalMsgs += mc; }
    for (const m of (c.messages || [])) {
      if (m.model) models[m.model] = (models[m.model] || 0) + 1;
    }
    let created;
    try { created = new Date(c.create_time); } catch { continue; }
    if (isNaN(created)) continue;

    const title = c.title || 'Untitled';
    if (created >= d1) topics24h.push(title);
    if (created >= d7) {
      topics7d.push(title);
      recentConvos.push({ title, created: c.create_time, messageCount: mc });
      // Hour in CT (UTC-5)
      const hCT = (created.getUTCHours() - 5 + 24) % 24;
      hoursCT[hCT] = (hoursCT[hCT] || 0) + 1;
      // Theme
      const tl = title.toLowerCase();
      let matched = false;
      for (const [theme, kws] of Object.entries(themes)) {
        if (kws.some(k => tl.includes(k))) {
          themeCounts[theme] = (themeCounts[theme] || 0) + 1;
          if (!themedTitles[theme]) themedTitles[theme] = [];
          themedTitles[theme].push(title);
          matched = true;
          break;
        }
      }
      if (!matched) themeCounts['Other'] = (themeCounts['Other'] || 0) + 1;
    }
  }

  const nightConvos = Object.entries(hoursCT).filter(([h]) => +h >= 22 || +h < 6).reduce((a, [, v]) => a + v, 0);
  const dayConvos = Object.entries(hoursCT).filter(([h]) => +h >= 6 && +h < 22).reduce((a, [, v]) => a + v, 0);
  const sortedHours = Object.entries(hoursCT).sort((a, b) => b[1] - a[1]);
  const peakHour = sortedHours[0] ? +sortedHours[0][0] : 0;

  // Deep details — specific moments that make this personal
  const deepDetails = [];
  for (const cv of recentConvos) {
    const convo = convos.find(c => c.title === cv.title);
    if (!convo || !convo.messages || convo.messages.length === 0) continue;
    const userMsgs = convo.messages.filter(m => m.role === 'user');
    if (userMsgs.length === 0) continue;
    const firstQ = userMsgs[0].content;
    if (!firstQ || firstQ.length < 10) continue;
    // Get the hour in CT
    let hourCT = null;
    try {
      const created = new Date(convo.create_time);
      hourCT = (created.getUTCHours() - 5 + 24) % 24;
    } catch {}
    deepDetails.push({
      title: cv.title,
      firstQuestion: firstQ.slice(0, 200),
      hour: hourCT,
      model: convo.messages.find(m => m.model)?.model || null,
      messageCount: cv.messageCount,
    });
  }
  // Pick the most emotionally interesting ones
  const lateNightDetails = deepDetails.filter(d => d.hour !== null && (d.hour >= 22 || d.hour < 6));
  const deepestConvo = deepDetails.sort((a, b) => b.messageCount - a.messageCount)[0] || null;

  // GitHub
  const gh = loadJSON('github.json');
  const repos = gh?.repositories || [];
  const ghProfile = gh?.profile || {};
  const langs = {};
  const active7d = [];
  for (const r of repos) {
    if (r.language) langs[r.language] = (langs[r.language] || 0) + 1;
    try {
      if (new Date(r.updatedAt) >= d7) active7d.push({ name: r.name, language: r.language, description: r.description });
    } catch {}
  }
  const aiRepos = repos.filter(r => /ai|agent|claude|monitor|llm|eliza/i.test(r.description || '')).map(r => r.name);

  // YouTube
  const yt = loadJSON('youtube.json');
  const ytProfile = yt?.['youtube.profile'] || {};
  const ytSubs = yt?.['youtube.subscriptions']?.subscriptions || [];
  const ytPlaylists = yt?.['youtube.playlists']?.playlists || [];
  const ytLikes = yt?.['youtube.likes']?.likedVideos || [];
  const ytPlaylistItems = yt?.['youtube.playlistItems']?.playlists || [];
  const artists = {};
  for (const pl of ytPlaylistItems) {
    for (const item of (pl.items || [])) {
      const ch = item.channelTitle;
      if (ch) artists[ch] = (artists[ch] || 0) + 1;
    }
  }

  // LinkedIn
  const li = loadJSON('linkedin.json');
  const liProfile = li?.['linkedin.profile'] || {};
  const liSkills = (li?.['linkedin.skills']?.skills || []).map(s => s.name);
  const liConns = li?.['linkedin.connections']?.connections || [];

  // Uber
  const ub = loadJSON('uber.json');
  const trips = ub?.['uber.trips']?.trips || [];
  const receipts = ub?.['uber.receipts']?.receipts || [];
  let uberSpend = 0;
  for (const r of receipts) {
    try { uberSpend += parseFloat((r.fare || '0').replace(/[^0-9.]/g, '')); } catch {}
  }

  // Cross-references & insights
  const insights = [];

  // 1. Theme dominance
  const topTheme = Object.entries(themeCounts).sort((a, b) => b[1] - a[1])[0];
  if (topTheme) {
    const pct = Math.round(topTheme[1] / topics7d.length * 100);
    insights.push({
      type: 'theme',
      title: `${pct}% ${topTheme[0]}`,
      body: `${topTheme[1]} of your ${topics7d.length} conversations this week were about ${topTheme[0].toLowerCase()}. ${topTheme[0] === 'Baby & Parenting' ? 'Alex is 3 months old — the data shows it.' : ''}`,
      examples: (themedTitles[topTheme[0]] || []).slice(0, 3),
    });
  }

  // 2. Night owl vs early bird
  if (topics7d.length > 5) {
    const formatHour = h => `${h === 0 ? 12 : h > 12 ? h - 12 : h}${h < 12 ? 'am' : 'pm'}`;
    insights.push({
      type: 'schedule',
      title: `Peak: ${formatHour(peakHour)} CT`,
      body: nightConvos > dayConvos * 0.4
        ? `${nightConvos} late-night conversations vs ${dayConvos} daytime. The baby isn't the only one up at night.`
        : `${dayConvos} daytime vs ${nightConvos} after-hours. Mostly a daytime thinker this week.`,
    });
  }

  // 3. LinkedIn vs reality
  if (liProfile.headline && topics7d.length > 5) {
    const aiCount = themeCounts['AI & Engineering'] || 0;
    const babyCount = themeCounts['Baby & Parenting'] || 0;
    insights.push({
      type: 'identity',
      title: 'LinkedIn vs Reality',
      body: `LinkedIn says "${liProfile.headline}." ChatGPT says ${babyCount > aiCount ? `you spend more time on parenting (${babyCount}) than AI (${aiCount})` : `AI engineering (${aiCount}) edges out parenting (${babyCount})`}. Both are true.`,
    });
  }

  // 4. Music taste from YouTube
  const topArtists = Object.entries(artists).sort((a, b) => b[1] - a[1]).slice(0, 5);
  if (topArtists.length > 2) {
    const hasCalvin = topArtists.some(([a]) => a.includes('Calvin'));
    const hasSacred = topArtists.some(([a]) => /sagrada|mantra|ayahuasca|sacred/i.test(a));
    insights.push({
      type: 'music',
      title: 'Musical identity',
      body: hasCalvin && hasSacred
        ? `Calvin Harris AND ayahuasca ceremony music. EDM festival energy meets plant medicine ceremonies — in the same playlist library.`
        : `Top artists: ${topArtists.slice(0, 3).map(([a]) => a).join(', ')}. ${topArtists.length > 3 ? `Plus ${topArtists.length - 3} more in heavy rotation.` : ''}`,
      artists: topArtists.map(([a, n]) => ({ name: a, count: n })),
    });
  }

  // 5. AI ecosystem
  if (aiRepos.length > 0 && Object.keys(models).length > 0) {
    insights.push({
      type: 'ai-ecosystem',
      title: `${Object.keys(models).length} models × ${aiRepos.length} AI repos`,
      body: `You use ${Object.keys(models).join(', ')} via ChatGPT, and build AI tools yourself: ${aiRepos.slice(0, 3).join(', ')}${aiRepos.length > 3 ? ` (+${aiRepos.length - 3} more)` : ''}. Consumer and builder.`,
    });
  }

  // 6. Memory reveals
  const memoryHighlights = [];
  for (const m of memories) {
    const c = m.content || '';
    if (c.includes('Alex')) memoryHighlights.push('ChatGPT knows Alex was born 12/17/2025');
    if (c.includes('Simon') && c.includes('assistant')) memoryHighlights.push('Building a family AI assistant named Simon');
    if (c.includes('Vana')) memoryHighlights.push('Working on Vana protocol — encryption + crypto wallets');
    if (c.includes('hiring')) memoryHighlights.push('Hiring manager for software engineering');
  }
  if (memoryHighlights.length > 0) {
    insights.push({
      type: 'memory',
      title: `${memories.length} memories stored`,
      body: `ChatGPT remembers: ${memoryHighlights.slice(0, 3).join('; ')}.`,
    });
  }

  // 7. Baby songs cross-reference
  const babySongConvos = convos.filter(c => /baby song|lullaby|nursery rhyme|suno|udio/i.test(c.title || ''));
  if (babySongConvos.length > 0 && topArtists.length > 0) {
    insights.push({
      type: 'crossref',
      title: 'Making music for Alex',
      body: `${babySongConvos.length} ChatGPT conversations about AI-generated baby songs. Meanwhile your YouTube has ${Object.keys(artists).length} artists across ${ytPlaylistItems.reduce((a, p) => a + (p.items || []).length, 0)} tracks. The dad who builds AI tools is using AI to write lullabies.`,
    });
  }

  return {
    generated: now.toISOString(),
    chatgpt: {
      total: convos.length, withMessages: withMsgs, totalMessages: totalMsgs,
      last24h: topics24h.length, last7d: topics7d.length,
      topics24h, topics7d: topics7d.slice(0, 30),
      models, hoursCT, peakHour, nightConvos, dayConvos,
      themeCounts, themedTitles: Object.fromEntries(Object.entries(themedTitles).map(([k, v]) => [k, v.slice(0, 5)])),
      memories: memories.length,
      recentConvos: recentConvos.sort((a, b) => b.created.localeCompare(a.created)).slice(0, 15),
      deepDetails: deepDetails.slice(0, 8),
      lateNightDetails: lateNightDetails.slice(0, 3),
      deepestConvo,
    },
    github: {
      profile: { username: ghProfile.username, fullName: ghProfile.fullName, followers: ghProfile.followers, repoCount: ghProfile.repositoryCount },
      languages: langs, active7d, totalRepos: repos.length,
      publicRepos: repos.filter(r => r.visibility === 'Public').length,
      aiRepos,
    },
    youtube: {
      profile: { handle: ytProfile.handle, joined: ytProfile.joinedDate },
      subscriptions: ytSubs.length, playlists: ytPlaylists.map(p => ({ title: p.title, count: p.itemCount })),
      likedVideos: ytLikes.length, topArtists: Object.fromEntries(Object.entries(artists).sort((a, b) => b[1] - a[1]).slice(0, 10)),
      totalTracks: ytPlaylistItems.reduce((a, p) => a + (p.items || []).length, 0),
    },
    linkedin: {
      profile: { fullName: liProfile.fullName, headline: liProfile.headline, location: liProfile.location },
      skills: liSkills, totalConnections: liConns.length,
    },
    uber: { totalTrips: trips.length, totalSpent: Math.round(uberSpend * 100) / 100 },
    insights,
  };
}

const server = createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (url.pathname === '/api/data') {
    try {
      const data = processData();
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' });
      res.end(JSON.stringify(data));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  if (url.pathname === '/health') {
    res.writeHead(200); res.end('ok'); return;
  }

  // Serve static files
  let filePath = join(__dirname, 'public', url.pathname === '/' ? 'index.html' : url.pathname);
  try {
    const stat = statSync(filePath);
    if (stat.isFile()) {
      const ext = extname(filePath);
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
      res.end(readFileSync(filePath));
      return;
    }
  } catch {}

  res.writeHead(404); res.end('not found');
});

server.listen(PORT, () => console.log(`Vana infographic on :${PORT}`));
