// ==UserScript==
// @name         PSP Remote - YouTube Music Bridge
// @namespace    http://tampermonkey.net/
// @version      1.1
// @description  Envia informações do YouTube Music para o servidor local do PSP Remote
// @author       PSP Remote
// @match        https://music.youtube.com/*
// @grant        GM_xmlhttpRequest
// @connect      127.0.0.1
// ==/UserScript==

(function () {
  'use strict';

  const SERVER = 'http://127.0.0.1:3050';

  // ─────────────────────────────────────────────
  //  Lê o estado atual do YouTube Music
  // ─────────────────────────────────────────────
  function getPlayerState() {
    try {
      const titleEl = document.querySelector('yt-formatted-string.title.ytmusic-player-bar');
      const title = titleEl ? titleEl.textContent.trim() : '';

      const bylineEl = document.querySelector('yt-formatted-string.byline.ytmusic-player-bar');
      const bylineText = bylineEl ? bylineEl.textContent : '';
      const parts = bylineText.split('•');
      const artist = parts[0] ? parts[0].trim() : '';
      const album  = parts[1] ? parts[1].trim() : '';

      const thumbEl = document.querySelector('img#thumbnail.ytmusic-player-bar') ||
                      document.querySelector('.ytmusic-player-bar img#thumbnail') ||
                      document.querySelector('#song-image img');
      let cover_url = thumbEl ? thumbEl.src : '';
      if (cover_url && cover_url.includes('=w')) {
        cover_url = cover_url.replace(/=w\d+-h\d+[^&]*/, '=w226-h226');
      }

      // Tempo via elemento de texto
      const timeEl = document.querySelector('.time-info.ytmusic-player-bar');
      let progress_ms = 0, duration_ms = 0;
      if (timeEl) {
        const times = timeEl.textContent.trim().split('/').map(t => t.trim());
        if (times.length === 2) {
          progress_ms = parseTime(times[0]) * 1000;
          duration_ms = parseTime(times[1]) * 1000;
        }
      }

      // Play/Pause
      const playBtn = document.querySelector('.play-pause-button.ytmusic-player-bar');
      const titleAttr = playBtn ? playBtn.getAttribute('title') : '';
      const is_playing = titleAttr === 'Pausar' || titleAttr === 'Pause';

      return { title, artist, album, cover_url, progress_ms, duration_ms, is_playing, volume: 100 };
    } catch (e) {
      console.error('[PSP Remote] Erro ao ler estado:', e);
      return null;
    }
  }

  function parseTime(str) {
    const p = str.split(':').map(Number);
    if (p.length === 2) return p[0] * 60 + p[1];
    if (p.length === 3) return p[0] * 3600 + p[1] * 60 + p[2];
    return 0;
  }

  // ─────────────────────────────────────────────
  //  Envia estado para o servidor
  // ─────────────────────────────────────────────
  function sendState(state) {
    GM_xmlhttpRequest({
      method: 'POST',
      url: `${SERVER}/update`,
      headers: { 'Content-Type': 'application/json' },
      data: JSON.stringify(state),
      onload: () => {},
      onerror: () => {}
    });
  }

  // ─────────────────────────────────────────────
  //  Busca comandos pendentes do servidor (polling)
  // ─────────────────────────────────────────────
  function pollCommands() {
    GM_xmlhttpRequest({
      method: 'GET',
      url: `${SERVER}/command`,
      onload: (res) => {
        try {
          const data = JSON.parse(res.responseText);
          if (data.command) executeCommand(data.command);
        } catch (e) {}
      },
      onerror: () => {}
    });
  }

  // ─────────────────────────────────────────────
  //  Executa comandos recebidos do PSP
  // ─────────────────────────────────────────────
  function executeCommand(command) {
    console.log('[PSP Remote] Executando comando:', command);
    const playBtn = document.querySelector('.play-pause-button.ytmusic-player-bar');
    const nextBtn = document.querySelector('.next-button.ytmusic-player-bar');
    const prevBtn = document.querySelector('.previous-button.ytmusic-player-bar');

    switch (command) {
      case 'play':
      case 'pause': if (playBtn) playBtn.click(); break;
      case 'next':  if (nextBtn) nextBtn.click();  break;
      case 'prev':  if (prevBtn) prevBtn.click();  break;
      case 'vol_up':
      case 'vol_dn': {
        const vol = document.querySelector('#volume-slider');
        if (vol) {
          vol.value = Math.min(100, Math.max(0, parseInt(vol.value || 100) + (command === 'vol_up' ? 10 : -10)));
          vol.dispatchEvent(new Event('change'));
        }
        break;
      }
    }
  }

  // ─────────────────────────────────────────────
  //  Loop principal
  // ─────────────────────────────────────────────
  function start() {
    console.log('[PSP Remote] Bridge v1.1 iniciada!');
    setInterval(() => {
      const state = getPlayerState();
      if (state) sendState(state);
    }, 1000);

    setInterval(pollCommands, 500);
  }

  // Aguarda o player carregar
  setTimeout(start, 3000);

})();
