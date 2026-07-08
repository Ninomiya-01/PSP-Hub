require('dotenv').config({ path: __dirname + '/.env' });
const express = require('express');
const cors = require('cors');
const jimp = require('jimp');
const path = require('path');
const fs = require('fs');

const app = express();
const port = 3050;

app.use(cors());
app.use(express.json());

// Estado atual da música (enviado pelo browser via userscript)
let currentTrack = {
  title: 'Aguardando YouTube Music...',
  artist: '',
  album: '',
  progress_ms: 0,
  duration_ms: 0,
  is_playing: false,
  volume: 100,
  cover_url: ''
};

let cachedCoverBuffer = null;
let cachedCoverUrl = '';

// Fila de comandos pendentes para o browser
let pendingCommand = null;

// ─────────────────────────────────────────────
//  Endpoint: Browser -> Servidor (atualizar estado)
// ─────────────────────────────────────────────
app.post('/update', (req, res) => {
  const data = req.body;

  if (data.cover_url && data.cover_url !== cachedCoverUrl) {
    cachedCoverUrl = data.cover_url;
    cachedCoverBuffer = null; // invalida cache da capa
  }

  currentTrack = {
    title: data.title || 'Sem título',
    artist: data.artist || '',
    album: data.album || '',
    progress_ms: data.progress_ms || 0,
    duration_ms: data.duration_ms || 0,
    is_playing: data.is_playing || false,
    volume: data.volume !== undefined ? data.volume : 100,
    cover_url: data.cover_url || ''
  };

  res.json({ ok: true });
});

// ─────────────────────────────────────────────
//  Endpoint: PSP -> Servidor (buscar status)
// ─────────────────────────────────────────────
app.get('/status', (req, res) => {
  res.json(currentTrack);
});

// Endpoint simplificado para o PSP (texto puro separado por |)
app.get('/status_text', (req, res) => {
  const isPlaying = currentTrack.is_playing ? 1 : 0;
  res.send(`${currentTrack.title}|${currentTrack.artist}|${isPlaying}|${currentTrack.progress_ms}|${currentTrack.duration_ms}`);
});

// ─────────────────────────────────────────────
//  Endpoint: PSP -> Servidor (buscar capa do álbum)
// ─────────────────────────────────────────────
app.get('/cover', async (req, res) => {
  if (!cachedCoverUrl) {
    return res.status(404).send('Sem capa');
  }

  if (cachedCoverBuffer) {
    res.set('Content-Type', 'image/jpeg');
    return res.send(cachedCoverBuffer);
  }

  try {
    const image = await jimp.read(cachedCoverUrl);
    image.resize(128, 128);
    cachedCoverBuffer = await image.getBufferAsync(jimp.MIME_JPEG);
    res.set('Content-Type', 'image/jpeg');
    res.send(cachedCoverBuffer);
  } catch (err) {
    console.error('Erro ao processar capa:', err.message);
    res.status(500).send('Erro ao processar capa');
  }
});

// ─────────────────────────────────────────────
//  Endpoint: Userscript busca comandos (polling)
// ─────────────────────────────────────────────
app.get('/command', (req, res) => {
  if (pendingCommand) {
    const cmd = pendingCommand;
    pendingCommand = null; // consome o comando
    res.json({ command: cmd });
  } else {
    res.json({ command: null });
  }
});

// Função que enfileira um comando para o browser
function sendCommand(command) {
  pendingCommand = command;
  console.log(`Comando enfileirado: ${command}`);
}

// ─────────────────────────────────────────────
//  Endpoints de controle (acionados pelo PSP)
// ─────────────────────────────────────────────
app.get('/play',   (req, res) => { sendCommand('play');   res.send('OK'); });
app.get('/pause',  (req, res) => { sendCommand('pause');  res.send('OK'); });
app.get('/next',   (req, res) => { sendCommand('next');   res.send('OK'); });

app.get('/prev',   (req, res) => { sendCommand('prev');   res.send('OK'); });
app.get('/vol_up', (req, res) => { sendCommand('vol_up'); res.send('OK'); });
app.get('/vol_dn', (req, res) => { sendCommand('vol_dn'); res.send('OK'); });

// ─────────────────────────────────────────────
//  Inicializa o servidor
// ─────────────────────────────────────────────
const os = require('os');
function getLocalIp() {
  const nets = os.networkInterfaces();
  let fallback = '127.0.0.1';
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        if (net.address.startsWith('192.168.') || net.address.startsWith('10.')) {
          return net.address;
        }
        if (fallback === '127.0.0.1') fallback = net.address;
      }
    }
  }
  return fallback;
}

app.listen(port, '0.0.0.0', () => {
  const ip = getLocalIp();
  console.log('=== Servidor PSP Remote (YouTube Music) ===');
  console.log(`Rodando localmente em http://127.0.0.1:${port}`);
  console.log(`IP PARA O PSP CONECTAR: ${ip}`);
});
