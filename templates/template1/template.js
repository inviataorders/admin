    const body = document.body;
    const landing = document.getElementById('landing');
    const invitation = document.getElementById('invitation');
    const openEnvelope = document.getElementById('openEnvelope');
    const bgMusic = document.getElementById('bgMusic');
    const fallingLayer = document.getElementById('fallingLayer');
    const confetti = document.getElementById('confetti');
    const countdownWrap = document.getElementById('countdownWrap');
    const countdownEl = document.getElementById('countdown');
    let invitationOpened = false;
    let countdownStarted = false;
    let countdownInterval = null;

    function createFallingElements() {
      if (fallingLayer.children.length) return;
      const types = ['petal','leaf','flower'];
      const total = 26;
      for (let i = 0; i < total; i++) {
        const el = document.createElement('span');
        const type = types[Math.floor(Math.random() * types.length)];
        el.className = type;
        el.style.left = Math.random() * 100 + 'vw';
        el.style.animationDuration = (8 + Math.random() * 8) + 's,' + (3 + Math.random() * 2.5) + 's';
        el.style.animationDelay = (-Math.random() * 12) + 's,' + (-Math.random() * 3) + 's';
        el.style.transform = `scale(${0.7 + Math.random() * 0.75}) rotate(${Math.random()*360}deg)`;
        fallingLayer.appendChild(el);
      }
    }

    function startInvitation() {
      if (invitationOpened) return;
      invitationOpened = true;
      body.classList.remove('locked');
      body.classList.add('opened');
      landing.classList.add('hidden');
      invitation.classList.add('active');
      fallingLayer.classList.add('active');
      createFallingElements();
      bgMusic.currentTime = 0;
      bgMusic.play().catch(() => {});
      setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 50);
    }

    openEnvelope.addEventListener('click', startInvitation);

    function stopMusic() {
      bgMusic.pause();
      bgMusic.currentTime = 0;
    }
    window.addEventListener('pagehide', stopMusic);
    window.addEventListener('beforeunload', stopMusic);
    window.addEventListener('popstate', stopMusic);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) bgMusic.pause();
      else if (invitationOpened) bgMusic.play().catch(() => {});
    });

    const scratchCard = document.getElementById('scratchCard');
    const canvas = document.getElementById('scratchCanvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const overlay = document.getElementById('scratchOverlay');
    let drawing = false;
    let scratchDone = false;

    function resizeCanvas() {
      const rect = scratchCard.getBoundingClientRect();
      const dpr = Math.max(window.devicePixelRatio || 1, 1);
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = rect.width + 'px';
      canvas.style.height = rect.height + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.globalCompositeOperation = 'source-over';
      const grad = ctx.createLinearGradient(0, 0, rect.width, rect.height);
      grad.addColorStop(0, '#d7ba77');
      grad.addColorStop(0.55, '#b48831');
      grad.addColorStop(1, '#f2dc9f');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, rect.width, rect.height);
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      for (let i = 0; i < 14; i++) {
        ctx.beginPath();
        ctx.arc(Math.random()*rect.width, Math.random()*rect.height, 10 + Math.random()*28, 0, Math.PI*2);
        ctx.fill();
      }
      ctx.globalCompositeOperation = 'destination-out';
    }

    function pointFromEvent(e) {
      const rect = canvas.getBoundingClientRect();
      const touch = e.touches ? e.touches[0] : e;
      return { x: touch.clientX - rect.left, y: touch.clientY - rect.top };
    }

    function scratchAt(x, y) {
      ctx.beginPath();
      ctx.arc(x, y, 34, 0, Math.PI * 2);
      ctx.fill();
    }

    function checkScratchProgress() {
      const sampleCanvas = document.createElement('canvas');
      sampleCanvas.width = 40;
      sampleCanvas.height = 24;
      const sctx = sampleCanvas.getContext('2d');
      sctx.drawImage(canvas, 0, 0, sampleCanvas.width, sampleCanvas.height);
      const data = sctx.getImageData(0, 0, sampleCanvas.width, sampleCanvas.height).data;
      let transparent = 0;
      for (let i = 3; i < data.length; i += 4) {
        if (data[i] < 70) transparent++;
      }
      const ratio = transparent / (sampleCanvas.width * sampleCanvas.height);
      if (ratio > 0.24) revealScratch();
    }

    function burstConfetti() {
      const colors = ['#d7ba77','#b48831','#f8d7e4','#ffd76f','#8caf7c','#ffffff'];
      const total = 90;
      for (let i = 0; i < total; i++) {
        const piece = document.createElement('span');
        piece.className = 'confetti-piece';
        piece.style.background = colors[Math.floor(Math.random()*colors.length)];
        piece.style.left = '50%';
        piece.style.top = '34%';
        piece.style.borderRadius = Math.random() > 0.5 ? '2px' : '50%';
        piece.style.setProperty('--x', (Math.random() * 360 - 180) + 'px');
        piece.style.setProperty('--y', (Math.random() * 280 - 40) + 'px');
        piece.style.setProperty('--r', (Math.random() * 900 - 450) + 'deg');
        piece.style.width = (6 + Math.random() * 8) + 'px';
        piece.style.height = (10 + Math.random() * 10) + 'px';
        confetti.appendChild(piece);
        setTimeout(() => piece.remove(), 1900);
      }
    }

    function startCountdown() {
      if (countdownStarted) return;
      countdownStarted = true;
      countdownWrap.classList.add('revealed');
      // COUNTDOWN LOGIC: target date is read directly from the data-target
      // attribute on the "Save the date" element (#scratchCard .date), so the
      // countdown always matches the displayed Save the Date. Do NOT hardcode
      // a separate date here, and do NOT modify the math/algorithm below.
      const target = new Date(document.querySelector('#scratchCard .date').dataset.target);
      function updateCountdown() {
        const now = new Date();
        let diff = target - now;
        if (diff < 0) diff = 0;
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
        const minutes = Math.floor((diff / (1000 * 60)) % 60);
        const seconds = Math.floor((diff / 1000) % 60);
        countdownEl.innerHTML = `
          <div class="time-box"><span class="num">${days}</span><span class="label">Days</span></div>
          <div class="time-box"><span class="num">${hours}</span><span class="label">Hours</span></div>
          <div class="time-box"><span class="num">${minutes}</span><span class="label">Minutes</span></div>
          <div class="time-box"><span class="num">${seconds}</span><span class="label">Seconds</span></div>
        `;
      }
      updateCountdown();
      countdownInterval = setInterval(updateCountdown, 1000);
    }

    function revealScratch() {
      if (scratchDone) return;
      scratchDone = true;
      overlay.style.transition = 'opacity .55s ease';
      overlay.style.opacity = '0';
      setTimeout(() => { overlay.style.display = 'none'; }, 580);
      burstConfetti();
      startCountdown();
    }

    let lastPoint = null;

    function scratchLine(from, to) {
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const distance = Math.hypot(dx, dy);
      const steps = Math.max(1, Math.ceil(distance / 10));
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        scratchAt(from.x + dx * t, from.y + dy * t);
      }
    }

    function onStart(e) {
      if (scratchDone) return;
      drawing = true;
      const p = pointFromEvent(e);
      lastPoint = p;
      scratchAt(p.x, p.y);
      checkScratchProgress();
      e.preventDefault();
    }
    function onMove(e) {
      if (!drawing || scratchDone) return;
      const p = pointFromEvent(e);
      if (lastPoint) scratchLine(lastPoint, p);
      else scratchAt(p.x, p.y);
      lastPoint = p;
      checkScratchProgress();
      e.preventDefault();
    }
    function onEnd() { drawing = false; lastPoint = null; }

    canvas.addEventListener('mousedown', onStart);
    canvas.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onEnd);
    canvas.addEventListener('touchstart', onStart, { passive: false });
    canvas.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onEnd);
    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();

    const reveals = document.querySelectorAll('.reveal-up');
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) entry.target.classList.add('show');
      });
    }, { threshold: 0.12 });
    reveals.forEach(el => observer.observe(el));
  
