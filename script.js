(function () {
  'use strict';

  /* ============================================================
     AUDIO SOURCE — edit this once you have your link/file
     ============================================================
     Easiest & most reliable: drop the audio file (e.g. voice-note.mp3)
     right next to index.html, then set:
       const AUDIO_SRC = 'voice-note.mp3';

     If you want to use Google Drive instead, a normal "share" link
     will NOT play directly. Convert it first:
       1. Get the file ID from the share link:
          https://drive.google.com/file/d/FILE_ID/view
       2. Use this format as AUDIO_SRC:
          https://drive.google.com/uc?export=download&id=FILE_ID
       3. Make sure sharing is set to "Anyone with the link".
     Drive can be flaky with embedding/CORS — local file is safer.
  */
  const AUDIO_SRC = 'voice-note.mp3'; // <-- replace with your file/link

  /* ============================================================
     Element refs
     ============================================================ */
  const heartsLayer = document.getElementById('heartsLayer');
  const burstLayer = document.getElementById('burstLayer');

  const askCard = document.getElementById('askCard');
  const reasonCard = document.getElementById('reasonCard');
  const giftCard = document.getElementById('giftCard');
  const finalCard = document.getElementById('finalCard');

  const mainEmoji = document.getElementById('mainEmoji');
  const mainQuestion = document.getElementById('mainQuestion');
  const mainSubtitle = document.getElementById('mainSubtitle');

  const yesBtn = document.getElementById('yesBtn');
  const noBtn = document.getElementById('noBtn');

  const reasonForm = document.getElementById('reasonForm');
  const reasonInput = document.getElementById('reasonInput');

  const giftOpenBtn = document.getElementById('giftOpenBtn');
  const sorryBtn = document.getElementById('sorryBtn');
  const giftHint = document.getElementById('giftHint');

  const echoedReason = document.getElementById('echoedReason');
  const voiceNote = document.getElementById('voiceNote');
  const replayBtn = document.getElementById('replayBtn');

  /* ============================================================
     Config
     ============================================================ */
  const PADDING = 22;
  const MOVE_COOLDOWN_MS = 260;
  const PROXIMITY_RADIUS = 110;
  const MIN_ESCAPE_FRACTION = 0.32;

  const NO_BUTTON_TEXTS = [
    'No 😢',
    'Try again 🥺',
    "Nuh-uh 😭",
    'Not happening 😤',
    "You can't say that 🙅‍♀️",
    "I won't let you 😭",
    'Give up? 😂',
    'Almost, but no 🏃',
    "You can't catch me 😏",
    'Say YES already ❤️'
  ];

  const GIFT_BUTTON_TEXTS = [
    '🎁 Click to open',
    'Almost... 👀',
    'So close! 😏',
    'Nice try 🏃',
    "You can't catch it 😆",
    'Just click Sorry 👉'
  ];

  let successShown = false;

  /* ============================================================
     Floating background hearts
     ============================================================ */
  const HEART_GLYPHS = ['❤️', '💕', '💖', '💗', '💓', '🩷'];

  function spawnFloatingHeart() {
    const heart = document.createElement('span');
    heart.className = 'floating-heart';
    heart.textContent = HEART_GLYPHS[Math.floor(Math.random() * HEART_GLYPHS.length)];

    const size = 14 + Math.random() * 22;
    const startLeft = Math.random() * 100;
    const duration = 7 + Math.random() * 6;
    const drift = (Math.random() * 120 - 60) + 'px';

    heart.style.left = startLeft + 'vw';
    heart.style.fontSize = size + 'px';
    heart.style.setProperty('--drift', drift);
    heart.style.animationDuration = duration + 's';

    heartsLayer.appendChild(heart);
    window.setTimeout(() => heart.remove(), (duration + 0.5) * 1000);
  }

  for (let i = 0; i < 6; i++) {
    window.setTimeout(spawnFloatingHeart, i * 350);
  }
  window.setInterval(spawnFloatingHeart, 900);

  /* ============================================================
     Reusable evasive-button engine
     ============================================================ */

  function clamp(value, min, max) {
    if (max < min) return min;
    return Math.min(Math.max(value, min), max);
  }

  function computeSafePosition(pointerX, pointerY, btnW, btnH) {
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    const minLeft = PADDING;
    const minTop = PADDING;
    const maxLeft = Math.max(minLeft, vw - btnW - PADDING);
    const maxTop = Math.max(minTop, vh - btnH - PADDING);

    const minDistance = Math.min(vw, vh) * MIN_ESCAPE_FRACTION;

    let best = null;
    let bestDist = -1;
    const candidates = [];

    for (let i = 0; i < 24; i++) {
      const left = minLeft + Math.random() * (maxLeft - minLeft);
      const top = minTop + Math.random() * (maxTop - minTop);
      candidates.push({ left, top });
    }

    for (const c of candidates) {
      const cx = c.left + btnW / 2;
      const cy = c.top + btnH / 2;
      const d = Math.hypot(cx - pointerX, cy - pointerY);

      if (d >= minDistance) {
        best = c;
        bestDist = d;
        break;
      }
      if (d > bestDist) {
        bestDist = d;
        best = c;
      }
    }

    if (!best) {
      best = {
        left: pointerX < vw / 2 ? maxLeft : minLeft,
        top: pointerY < vh / 2 ? maxTop : minTop
      };
    }

    return {
      left: clamp(best.left, minLeft, maxLeft),
      top: clamp(best.top, minTop, maxTop)
    };
  }

  const evasiveInstances = [];

  function createEvasiveButton(button, texts, onAttempt) {
    let attempts = 0;
    let isEscaping = false;
    let lastMoveTime = 0;
    let spacerEl = null;

    function enterEscapeMode() {
      if (isEscaping) return;
      const rect = button.getBoundingClientRect();

      spacerEl = document.createElement('span');
      spacerEl.className = 'evasive-spacer';
      spacerEl.setAttribute('aria-hidden', 'true');
      button.insertAdjacentElement('afterend', spacerEl);

      button.style.left = rect.left + 'px';
      button.style.top = rect.top + 'px';
      button.style.width = rect.width + 'px';
      button.classList.add('escaping');

      isEscaping = true;
    }

    function updateText() {
      const idx = Math.min(attempts - 1, texts.length - 1);
      if (idx >= 0) button.textContent = texts[idx];
    }

    function clampToViewport() {
      if (!isEscaping) return;
      const rect = button.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      const minLeft = PADDING;
      const minTop = PADDING;
      const maxLeft = Math.max(minLeft, vw - rect.width - PADDING);
      const maxTop = Math.max(minTop, vh - rect.height - PADDING);

      button.style.left = clamp(rect.left, minLeft, maxLeft) + 'px';
      button.style.top = clamp(rect.top, minTop, maxTop) + 'px';
    }

    function moveButton(pointerX, pointerY) {
      if (successShown) return;
      const now = Date.now();
      if (now - lastMoveTime < MOVE_COOLDOWN_MS) return;
      lastMoveTime = now;

      if (!isEscaping) enterEscapeMode();

      attempts += 1;
      updateText();
      if (onAttempt) onAttempt(attempts);

      button.style.width = 'auto';
      const rect = button.getBoundingClientRect();
      const btnW = rect.width;
      const btnH = rect.height;
      button.style.width = btnW + 'px';

      const { left, top } = computeSafePosition(pointerX, pointerY, btnW, btnH);
      button.style.left = left + 'px';
      button.style.top = top + 'px';
    }

    function handleProximity(e) {
      if (button.closest('[hidden]')) return;
      const rect = button.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dist = Math.hypot(e.clientX - cx, e.clientY - cy);
      if (dist < PROXIMITY_RADIUS) moveButton(e.clientX, e.clientY);
    }

    function handlePointerDown(e) {
      if (button.closest('[hidden]')) return;
      e.preventDefault();
      const x = e.clientX || window.innerWidth / 2;
      const y = e.clientY || window.innerHeight / 2;
      moveButton(x, y);
    }

    function handleClick(e) {
      e.preventDefault();
      if (button.closest('[hidden]')) return;
      const rect = button.getBoundingClientRect();
      moveButton(rect.left + rect.width / 2, rect.top + rect.height / 2);
    }

    function handleKeydown(e) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
        e.preventDefault();
        const rect = button.getBoundingClientRect();
        moveButton(rect.left + rect.width / 2, rect.top + rect.height / 2);
        button.focus();
      }
    }

    document.addEventListener('mousemove', handleProximity, { passive: true });
    button.addEventListener('pointerdown', handlePointerDown, { passive: false });
    button.addEventListener('click', handleClick);
    button.addEventListener('keydown', handleKeydown);

    const instance = { clampToViewport, getAttempts: () => attempts };
    evasiveInstances.push(instance);
    return instance;
  }

  window.addEventListener('resize', () => {
    evasiveInstances.forEach((inst) => inst.clampToViewport());
  });
  window.addEventListener('orientationchange', () => {
    window.setTimeout(() => {
      evasiveInstances.forEach((inst) => inst.clampToViewport());
    }, 200);
  });

  /* ============================================================
     Stage 1 — Ask ("Do you hate me?")
     ============================================================ */

  function updateMainMessage(attempts) {
    if (attempts >= 9) {
      mainEmoji.textContent = '😏';
      mainQuestion.textContent = 'You know the answer already.';
      mainSubtitle.textContent = "There's only one right answer ❤️";
    } else if (attempts >= 6) {
      mainEmoji.textContent = '😭';
      mainQuestion.textContent = 'Please just say yes 😭';
      mainSubtitle.textContent = "I'm getting worried now...";
    } else if (attempts >= 3) {
      mainEmoji.textContent = '🥺';
      mainQuestion.textContent = 'Are you seriously trying to say no?';
      mainSubtitle.textContent = "I won't accept that... 👀";
    }
  }

  createEvasiveButton(noBtn, NO_BUTTON_TEXTS, updateMainMessage);

  function goToStage(hideEl, showEl) {
    hideEl.hidden = true;
    showEl.hidden = false;
  }

  yesBtn.addEventListener('click', () => {
    goToStage(askCard, reasonCard);
    window.setTimeout(() => reasonInput.focus(), 300);
  });

  /* ============================================================
     Stage 2 — Reason form
     ============================================================ */

  let capturedReason = '';

  reasonForm.addEventListener('submit', (e) => {
    e.preventDefault();
    capturedReason = reasonInput.value.trim();
    goToStage(reasonCard, giftCard);
  });

  /* ============================================================
     Stage 3 — Gift (evasive open button + Sorry button)
     ============================================================ */

  createEvasiveButton(giftOpenBtn, GIFT_BUTTON_TEXTS, (attempts) => {
    if (attempts >= 2 && giftHint.hidden) {
      giftHint.hidden = false;
    }
  });

    sorryBtn.addEventListener('click', () => {
    goToStage(giftCard, finalCard);

    if (capturedReason) {
        echoedReason.textContent =
        `You said: "${capturedReason}" — Hope so tu muzhe maaf kardegi🥺❤️`;
    } else {
        echoedReason.textContent =
        'Whatever it was, I forgive you either way ❤️';
    }

    // Load the audio, but DO NOT play it yet.
    if (AUDIO_SRC) {
        voiceNote.src = AUDIO_SRC;
        voiceNote.load();
    }

    launchBurst();
    window.setTimeout(launchBurst, 350);
    window.setTimeout(launchBurst, 750);

    successShown = true;
    });

  replayBtn.addEventListener('click', () => {
    if (!voiceNote.src) return;
    voiceNote.currentTime = 0;
    voiceNote.play().catch((error) => {
    console.warn('Audio playback failed:', error);
  });
});
  /* ============================================================
     Confetti / heart burst
     ============================================================ */

  const BURST_GLYPHS = ['❤️', '💖', '🎉', '💕', '✨', '💗'];

  function launchBurst() {
    const count = 26;
    for (let i = 0; i < count; i++) {
      const piece = document.createElement('span');
      piece.className = 'burst-piece';
      piece.textContent = BURST_GLYPHS[Math.floor(Math.random() * BURST_GLYPHS.length)];

      const angle = Math.random() * Math.PI * 2;
      const distance = 120 + Math.random() * 260;
      const tx = Math.cos(angle) * distance;
      const ty = Math.sin(angle) * distance - 60;

      piece.style.setProperty('--tx', tx + 'px');
      piece.style.setProperty('--ty', ty + 'px');
      piece.style.setProperty('--rot', (Math.random() * 360 - 180) + 'deg');
      piece.style.left = (40 + Math.random() * 20) + '%';
      piece.style.top = (35 + Math.random() * 20) + '%';
      piece.style.animationDelay = (Math.random() * 0.15) + 's';

      burstLayer.appendChild(piece);
      window.setTimeout(() => piece.remove(), 1900);
    }
  }
})();