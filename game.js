/* ==========================================================
   MINI TYCOON RUSH
   Self-contained game logic. No external libraries.
   Systems: GameState, SaveManager, LevelManager, EconomyManager,
   FactoryManager, UIManager, AnimationManager, AudioManager,
   VIPManager, EventManager, Game (orchestrator)
   ========================================================== */
(function () {
  "use strict";

  /* ---------------------------------------------------------
     LEVEL DEFINITIONS
     Each level: id, name, objective (type/target), reward,
     and the factory "stage" (visual set) it unlocks.
  --------------------------------------------------------- */
  const LEVELS = [
    { id: 1,  name: "Small Shop",          objective: { type: "produce", target: 5 },   reward: 150,  stage: "shop" },
    { id: 2,  name: "Local Store",         objective: { type: "sell",    target: 10 },  reward: 250,  stage: "store" },
    { id: 3,  name: "Growing Business",    objective: { type: "cash",    target: 500 }, reward: 200,  stage: "workshop" },
    { id: 4,  name: "Workshop",            objective: { type: "upgrade", target: 1 },   reward: 250,  stage: "workshopPlus" },
    { id: 5,  name: "Small Factory",       objective: { type: "produce", target: 25 },  reward: 400,  stage: "smallFactory" },
    { id: 6,  name: "Busy Factory",        objective: { type: "cash",    target: 2000 },reward: 500,  stage: "bigFactory" },
    { id: 7,  name: "Industrial Plant",    objective: { type: "sell",    target: 40 },  reward: 600,  stage: "industrial" },
    { id: 8,  name: "Mega Production",     objective: { type: "upgrade", target: 6 },   reward: 800,  stage: "mega" },
    { id: 9,  name: "Global Business",     objective: { type: "cash",    target: 5000 },reward: 1000, stage: "global" },
    { id: 10, name: "Tycoon Empire",       objective: { type: "upgrade", target: 9 },   reward: 2000, stage: "empire" }
  ];

  // Emoji "building kits" per stage — procedural, no external art assets.
  const STAGE_ART = {
    shop:          { buildings: ["🏠"],                 machines: ["⚙️"] },
    store:         { buildings: ["🏬"],                 machines: ["⚙️","⚙️"] },
    workshop:      { buildings: ["🏚️","🏬"],            machines: ["⚙️","🔧"] },
    workshopPlus:  { buildings: ["🏭"],                 machines: ["⚙️","🔧","⚙️"] },
    smallFactory:  { buildings: ["🏭"],                 machines: ["⚙️","🔧","⚙️","🛠️"] },
    bigFactory:    { buildings: ["🏭","🏢"],             machines: ["⚙️","🔧","⚙️","🛠️","⚙️"] },
    industrial:    { buildings: ["🏭","🏢","🏗️"],        machines: ["⚙️","🔧","⚙️","🛠️","⚙️","🔧"] },
    mega:          { buildings: ["🏭","🏢","🏗️"],        machines: ["⚙️","🔧","⚙️","🛠️","⚙️","🔧","⚙️"] },
    global:        { buildings: ["🏭","🏢","🌆"],        machines: ["⚙️","🔧","⚙️","🛠️","⚙️","🔧","⚙️","🛠️"] },
    empire:        { buildings: ["🏭","🏢","🌆","🚀"],   machines: ["⚙️","🔧","⚙️","🛠️","⚙️","🔧","⚙️","🛠️","⚙️"] }
  };

  // Upgrade economics — index = number of upgrades already owned.
  const UPGRADE_COST   = [150, 300, 450, 600, 750, 950, 1150, 1400, 1650, 2000];
  const PRODUCE_AMOUNT = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];      // stock gained per PRODUCE tap
  const SELL_PRICE     = [100, 125, 150, 175, 200, 225, 250, 275, 300, 325]; // $ per unit

  const RANDOM_EVENTS = [
    { icon: "🔥", name: "Customer Rush",     detail: "Sell prices +50% for a short time.", type: "sellBoost",   mult: 1.5, duration: 15000 },
    { icon: "📦", name: "Supplier Discount", detail: "Upgrade costs -30% for a short time.", type: "cheapUpgrade", mult: 0.7, duration: 15000 },
    { icon: "💎", name: "VIP Order",         detail: "A bulk buyer pays instant cash.", type: "instantCash", amount: 300 },
    { icon: "⚡", name: "Production Boost",  detail: "Produce output +100% for a short time.", type: "prodBoost", mult: 2, duration: 15000 },
    { icon: "🛒", name: "Mega Sale",         detail: "Sell prices +25% for a short time.", type: "sellBoost", mult: 1.25, duration: 15000 }
  ];

  /* ---------------------------------------------------------
     SaveManager — isolated persistence layer.
     Swap the two methods below to target a different storage
     backend later (e.g. a Playables-provided save API) without
     touching any other system.
  --------------------------------------------------------- */
  const SaveManager = {
    KEY: "miniTycoonRush.save.v1",
    save(state) {
      try {
        localStorage.setItem(this.KEY, JSON.stringify(state));
        return true;
      } catch (e) { return false; }
    },
    load() {
      try {
        const raw = localStorage.getItem(this.KEY);
        return raw ? JSON.parse(raw) : null;
      } catch (e) { return null; }
    },
    clear() {
      try { localStorage.removeItem(this.KEY); } catch (e) {}
    }
  };

  /* ---------------------------------------------------------
     GameState — the single source of truth for numbers.
     Every mutation goes through here so validation always runs.
  --------------------------------------------------------- */
  const GameState = {
    cash: 100,
    stock: 0,
    upgrades: 0,
    levelIndex: 0,          // 0-based index into LEVELS
    progress: 0,             // progress toward current objective
    totalProduced: 0,
    totalSold: 0,
    vipUnlocked: false,
    soundOn: true,

    reset() {
      this.cash = 100;
      this.stock = 0;
      this.upgrades = 0;
      this.levelIndex = 0;
      this.progress = 0;
      this.totalProduced = 0;
      this.totalSold = 0;
      this.vipUnlocked = false;
      // soundOn intentionally preserved across restarts
    },

    sanitize() {
      // Never allow NaN / Infinity / negative values to leak into the UI.
      const clean = (v, fallback) => (Number.isFinite(v) && v >= 0 ? v : fallback);
      this.cash = clean(this.cash, 0);
      this.stock = clean(this.stock, 0);
      this.upgrades = clean(this.upgrades, 0);
      this.progress = clean(this.progress, 0);
      this.totalProduced = clean(this.totalProduced, 0);
      this.totalSold = clean(this.totalSold, 0);
    },

    serialize() {
      return {
        cash: this.cash, stock: this.stock, upgrades: this.upgrades,
        levelIndex: this.levelIndex, progress: this.progress,
        totalProduced: this.totalProduced, totalSold: this.totalSold,
        vipUnlocked: this.vipUnlocked, soundOn: this.soundOn
      };
    },
    restore(data) {
      if (!data) return;
      Object.assign(this, data);
      this.sanitize();
    }
  };

  /* ---------------------------------------------------------
     AudioManager — lightweight WebAudio synth beeps.
     Avoids shipping binary mp3 assets; degrades silently if
     WebAudio is unavailable so the game never breaks.
  --------------------------------------------------------- */
  const AudioManager = {
    ctx: null,
    ensureCtx() {
      if (this.ctx) return this.ctx;
      try {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        this.ctx = Ctx ? new Ctx() : null;
      } catch (e) { this.ctx = null; }
      return this.ctx;
    },
    tone(freq, dur, type, gainPeak) {
      if (!GameState.soundOn) return;
      const ctx = this.ensureCtx();
      if (!ctx) return;
      try {
        if (ctx.state === "suspended") ctx.resume();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = type || "sine";
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(gainPeak || 0.15, ctx.currentTime + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
        osc.connect(gain).connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + dur + 0.02);
      } catch (e) { /* fail silently — sound is never required */ }
    },
    click()      { this.tone(320, 0.08, "square", 0.08); },
    produce()    { this.tone(440, 0.12, "triangle", 0.12); },
    sell()       { this.tone(660, 0.15, "sine", 0.14); },
    upgrade()    { this.tone(220, 0.05, "sawtooth", 0.1); this.tone(440, 0.18, "sawtooth", 0.1); },
    levelUp()    { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.tone(f, 0.2, "triangle", 0.13), i * 90)); },
    error()      { this.tone(140, 0.15, "square", 0.1); },
    vip()        { [660, 880, 1108].forEach((f, i) => setTimeout(() => this.tone(f, 0.18, "sine", 0.13), i * 80)); },
    celebration(){ [523, 659, 784, 1046, 1318].forEach((f, i) => setTimeout(() => this.tone(f, 0.25, "triangle", 0.15), i * 110)); }
  };

  /* ---------------------------------------------------------
     FactoryManager — builds the procedural factory visual.
  --------------------------------------------------------- */
  const FactoryManager = {
    render() {
      const scene = document.getElementById("factoryScene");
      if (!scene) return;
      scene.innerHTML = "";
      scene.classList.toggle("vip-glow", GameState.vipUnlocked);

      const ground = document.createElement("div");
      ground.className = "f-ground";
      scene.appendChild(ground);

      const level = LEVELS[GameState.levelIndex];
      const art = STAGE_ART[level.stage];
      const isVip = GameState.vipUnlocked;

      // Buildings (back row)
      art.buildings.forEach((emoji, i) => {
        const b = document.createElement("div");
        b.className = "f-building";
        const h = 60 + i * 14 + (isVip ? 8 : 0);
        b.style.width = "58px";
        b.style.height = h + "px";
        b.style.background = isVip
          ? "linear-gradient(180deg, #7a5a1e, #3a2c0f)"
          : "linear-gradient(180deg, #35507a, #1c2c47)";
        b.style.marginBottom = "34px";
        b.style.animationDelay = (i * 0.08) + "s";
        b.textContent = emoji;
        // a couple of glowing windows for flavor
        for (let w = 0; w < 2; w++) {
          const win = document.createElement("span");
          win.className = "win";
          win.style.left = (10 + w * 20) + "px";
          win.style.top = (14 + w * 10) + "px";
          b.appendChild(win);
        }
        scene.appendChild(b);
      });

      // Machines (front row, react to PRODUCE taps)
      art.machines.forEach((emoji, i) => {
        const m = document.createElement("div");
        m.className = "f-machine";
        m.dataset.machine = "1";
        m.style.marginBottom = "34px";
        m.textContent = emoji;
        scene.appendChild(m);
      });
    },
    pulseMachines() {
      document.querySelectorAll(".f-machine").forEach((m, i) => {
        setTimeout(() => {
          m.classList.add("active");
          setTimeout(() => m.classList.remove("active"), 500);
        }, i * 60);
      });
    }
  };

  /* ---------------------------------------------------------
     AnimationManager — floating numbers + particle bursts.
  --------------------------------------------------------- */
  const AnimationManager = {
    layer() { return document.getElementById("fxLayer"); },

    floatText(text, cls) {
      const layer = this.layer();
      if (!layer) return;
      const el = document.createElement("div");
      el.className = "floater " + cls;
      el.textContent = text;
      el.style.left = (40 + Math.random() * 50) + "%";
      el.style.top = (35 + Math.random() * 20) + "%";
      layer.appendChild(el);
      setTimeout(() => el.remove(), 950);
    },

    burst(color, count) {
      const layer = this.layer();
      if (!layer) return;
      const originX = 50 + (Math.random() * 20 - 10);
      const originY = 55;
      for (let i = 0; i < count; i++) {
        const p = document.createElement("div");
        p.className = "particle";
        const size = 5 + Math.random() * 5;
        p.style.width = size + "px";
        p.style.height = size + "px";
        p.style.background = color;
        p.style.left = originX + "%";
        p.style.top = originY + "%";
        const angle = Math.random() * Math.PI * 2;
        const dist = 30 + Math.random() * 40;
        p.style.setProperty("--fly-to", `translate(${Math.cos(angle) * dist}px, ${Math.sin(angle) * dist - 20}px)`);
        layer.appendChild(p);
        setTimeout(() => p.remove(), 720);
      }
    },

    pulseCard(id) {
      const card = document.getElementById(id);
      if (!card) return;
      const parent = card.closest(".res-card");
      if (!parent) return;
      parent.classList.add("pulse");
      setTimeout(() => parent.classList.remove("pulse"), 180);
    }
  };

  /* ---------------------------------------------------------
     EventManager — optional random positive events.
  --------------------------------------------------------- */
  const EventManager = {
    active: null,          // { type, mult, expiresAt }
    timer: null,

    maybeTrigger() {
      // ~18% chance per successful action, and never stack events.
      if (this.active) return;
      if (Math.random() > 0.18) return;
      const def = RANDOM_EVENTS[Math.floor(Math.random() * RANDOM_EVENTS.length)];
      this.trigger(def);
    },

    trigger(def) {
      UIManager.showEventBanner(`${def.icon} ${def.name} — ${def.detail}`);
      if (def.type === "instantCash") {
        GameState.cash += def.amount;
        AnimationManager.floatText("+$" + def.amount, "cash");
        UIManager.refreshAll();
        UIManager.hideEventBannerSoon(2200);
        return;
      }
      this.active = { type: def.type, mult: def.mult };
      clearTimeout(this.timer);
      this.timer = setTimeout(() => {
        this.active = null;
        UIManager.hideEventBanner();
      }, def.duration);
    },

    sellMultiplier() {
      return this.active && this.active.type === "sellBoost" ? this.active.mult : 1;
    },
    prodMultiplier() {
      return this.active && this.active.type === "prodBoost" ? this.active.mult : 1;
    },
    upgradeMultiplier() {
      return this.active && this.active.type === "cheapUpgrade" ? this.active.mult : 1;
    }
  };

  /* ---------------------------------------------------------
     EconomyManager — produce / sell / upgrade actions.
  --------------------------------------------------------- */
  const EconomyManager = {
    produce() {
      const base = PRODUCE_AMOUNT[Math.min(GameState.upgrades, PRODUCE_AMOUNT.length - 1)];
      const amount = Math.max(1, Math.round(base * EventManager.prodMultiplier()));
      GameState.stock += amount;
      GameState.totalProduced += amount;
      GameState.sanitize();

      FactoryManager.pulseMachines();
      AnimationManager.floatText("+" + amount, "stock");
      AnimationManager.pulseCard("stockValue");
      AudioManager.produce();

      LevelManager.checkObjective();
      EventManager.maybeTrigger();
      UIManager.refreshAll();
      SaveManager.save(GameState.serialize());
    },

    sell() {
      if (GameState.stock <= 0) {
        UIManager.toast("NO STOCK");
        AudioManager.error();
        return;
      }
      const price = SELL_PRICE[Math.min(GameState.upgrades, SELL_PRICE.length - 1)];
      const mult = EventManager.sellMultiplier();
      const unitPrice = Math.round(price * mult);
      const earned = GameState.stock * unitPrice;

      GameState.cash += earned;
      GameState.totalSold += GameState.stock;
      GameState.stock = 0;
      GameState.sanitize();

      AnimationManager.burst(getComputedStyle(document.documentElement).getPropertyValue("--amber").trim() || "#F5A83C", 8);
      AnimationManager.floatText("+$" + earned, "cash");
      AnimationManager.pulseCard("cashValue");
      AudioManager.sell();

      LevelManager.checkObjective();
      EventManager.maybeTrigger();
      UIManager.refreshAll();
      SaveManager.save(GameState.serialize());
    },

    upgrade() {
      const idx = Math.min(GameState.upgrades, UPGRADE_COST.length - 1);
      const baseCost = UPGRADE_COST[idx];
      const cost = Math.max(1, Math.round(baseCost * EventManager.upgradeMultiplier()));

      if (GameState.cash < cost) {
        UIManager.toast("NOT ENOUGH CASH");
        AudioManager.error();
        return;
      }
      GameState.cash -= cost;
      GameState.upgrades = Math.min(GameState.upgrades + 1, UPGRADE_COST.length);
      GameState.sanitize();

      FactoryManager.render();
      AnimationManager.burst("#8FB8FF", 10);
      AudioManager.upgrade();
      UIManager.toast("UPGRADE COMPLETE");

      LevelManager.checkObjective();
      UIManager.refreshAll();
      SaveManager.save(GameState.serialize());
    }
  };

  /* ---------------------------------------------------------
     LevelManager — objectives, level completion, transitions.
  --------------------------------------------------------- */
  const LevelManager = {
    current() { return LEVELS[GameState.levelIndex]; },

    objectiveValue() {
      const obj = this.current().objective;
      switch (obj.type) {
        case "produce": return GameState.totalProduced - this.baseline.produce;
        case "sell":    return GameState.totalSold - this.baseline.sell;
        case "cash":    return GameState.cash;
        case "upgrade": return GameState.upgrades;
        default: return 0;
      }
    },

    // Baselines let "produce 25" / "sell 40" objectives count only
    // progress made *since this level started*, not lifetime totals.
    baseline: { produce: 0, sell: 0 },
    resetBaseline() {
      this.baseline.produce = GameState.totalProduced;
      this.baseline.sell = GameState.totalSold;
    },

    checkObjective() {
      const obj = this.current().objective;
      const value = Math.min(this.objectiveValue(), obj.target);
      GameState.progress = value;
      if (value >= obj.target) this.completeLevel();
      else UIManager.updateObjective();
    },

    completeLevel() {
      const level = this.current();
      GameState.cash += level.reward;
      GameState.sanitize();
      AudioManager.levelUp();
      UIManager.updateObjective();
      UIManager.refreshAll();
      UIManager.showLevelComplete(level);
      SaveManager.save(GameState.serialize());
    },

    nextLevel() {
      if (GameState.levelIndex >= LEVELS.length - 1) {
        Game.finish();
        return;
      }
      GameState.levelIndex += 1;
      GameState.progress = 0;
      this.resetBaseline();
      FactoryManager.render();
      UIManager.hideLevelComplete();
      UIManager.refreshAll();
      UIManager.maybeShowVipCard();
      SaveManager.save(GameState.serialize());
    }
  };

  /* ---------------------------------------------------------
     VIPManager — optional share-to-unlock cosmetic layer.
     Never gates core progression.
  --------------------------------------------------------- */
  const VIPManager = {
    async share() {
      const shareData = {
        title: "Mini Tycoon Rush",
        text: "I'm building a business empire in Mini Tycoon Rush — come play!",
        url: window.location.href
      };
      try {
        if (navigator.share) {
          await navigator.share(shareData);
          this.unlock();
        } else {
          // Graceful fallback: copy a shareable line to the clipboard.
          const line = shareData.text + " " + shareData.url;
          if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(line);
            UIManager.toast("Share link copied!");
          } else {
            UIManager.toast("Sharing not available here");
          }
          this.unlock();
        }
      } catch (e) {
        // User cancelled the share sheet — not an error, just no-op.
      }
    },
    unlock() {
      if (GameState.vipUnlocked) return;
      GameState.vipUnlocked = true;
      AudioManager.vip();
      UIManager.toast("👑 VIP UNLOCKED");
      FactoryManager.render();
      UIManager.maybeShowVipCard();
      SaveManager.save(GameState.serialize());
    }
  };

  /* ---------------------------------------------------------
     UIManager — all DOM reads/writes live here.
  --------------------------------------------------------- */
  const UIManager = {
    els: {},
    cacheEls() {
      const ids = [
        "levelTag","cashValue","stockValue","upgradesValue","objectiveText",
        "objectiveCount","objectiveFill","produceBtn","sellBtn","upgradeBtn",
        "upgradeCost","toast","eventBanner","vipCard","vipShareBtn","soundBtn",
        "levelCompleteOverlay","levelCompleteName","rewardAmount","nextLevelBtn",
        "finalOverlay","finalCash","finalTitle","playAgainBtn","shareResultBtn"
      ];
      ids.forEach(id => this.els[id] = document.getElementById(id));
    },

    refreshAll() {
      this.els.cashValue.textContent = "$" + Math.round(GameState.cash).toLocaleString();
      this.els.stockValue.textContent = Math.round(GameState.stock).toLocaleString();
      this.els.upgradesValue.textContent = GameState.upgrades;

      const level = LevelManager.current();
      this.els.levelTag.textContent = `Level ${level.id} / ${LEVELS.length} · ${level.name}`;

      const upgIdx = Math.min(GameState.upgrades, UPGRADE_COST.length - 1);
      const maxedOut = GameState.upgrades >= UPGRADE_COST.length;
      this.els.upgradeCost.textContent = maxedOut ? "MAX" : "$" + UPGRADE_COST[upgIdx].toLocaleString();
      this.els.upgradeBtn.disabled = maxedOut;
      this.els.sellBtn.disabled = GameState.stock <= 0;

      this.updateObjective();
    },

    updateObjective() {
      const level = LevelManager.current();
      const obj = level.objective;
      const labels = {
        produce: `Produce ${obj.target} products`,
        sell: `Sell ${obj.target} products`,
        cash: `Reach $${obj.target.toLocaleString()} cash`,
        upgrade: `Complete ${obj.target} upgrade${obj.target > 1 ? "s" : ""}`
      };
      this.els.objectiveText.textContent = labels[obj.type];
      const shown = obj.type === "cash" ? Math.min(Math.round(GameState.cash), obj.target) : Math.round(GameState.progress);
      this.els.objectiveCount.textContent = `${shown} / ${obj.target}`;
      const pct = Math.min(100, (shown / obj.target) * 100);
      this.els.objectiveFill.style.width = pct + "%";
    },

    toast(msg) {
      const el = this.els.toast;
      el.textContent = msg;
      el.hidden = false;
      clearTimeout(this._toastTimer);
      this._toastTimer = setTimeout(() => { el.hidden = true; }, 1600);
    },

    showEventBanner(text) {
      const el = this.els.eventBanner;
      el.textContent = text;
      el.hidden = false;
    },
    hideEventBanner() { this.els.eventBanner.hidden = true; },
    hideEventBannerSoon(ms) { setTimeout(() => this.hideEventBanner(), ms); },

    maybeShowVipCard() {
      this.els.vipCard.hidden = GameState.vipUnlocked || GameState.levelIndex < 1;
    },

    showLevelComplete(level) {
      this.els.levelCompleteName.textContent = `${level.name} cleared`;
      this.els.rewardAmount.textContent = "+$" + level.reward.toLocaleString();
      this.els.levelCompleteOverlay.hidden = false;
    },
    hideLevelComplete() { this.els.levelCompleteOverlay.hidden = true; },

    showFinal() {
      this.els.finalCash.textContent = "$" + Math.round(GameState.cash).toLocaleString();
      this.els.finalTitle.textContent = GameState.vipUnlocked ? "👑 VIP TYCOON" : "FACTORY TYCOON";
      this.els.finalOverlay.hidden = false;
      Confetti.start(document.getElementById("confettiCanvas"));
      AudioManager.celebration();
    },
    hideFinal() {
      this.els.finalOverlay.hidden = true;
      Confetti.stop();
    },

    setSoundIcon() {
      this.els.soundBtn.textContent = GameState.soundOn ? "🔊" : "🔇";
      this.els.soundBtn.setAttribute("aria-pressed", String(GameState.soundOn));
    }
  };

  /* ---------------------------------------------------------
     Confetti — tiny canvas particle burst for the final screen.
  --------------------------------------------------------- */
  const Confetti = {
    raf: null,
    particles: [],
    start(canvas) {
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      const resize = () => {
        canvas.width = canvas.clientWidth;
        canvas.height = canvas.clientHeight;
      };
      resize();
      const colors = ["#F5A83C", "#3ECF8E", "#8FB8FF", "#FF6B6B", "#FFD966"];
      this.particles = Array.from({ length: 90 }, () => ({
        x: Math.random() * canvas.width,
        y: -20 - Math.random() * canvas.height,
        r: 3 + Math.random() * 4,
        c: colors[Math.floor(Math.random() * colors.length)],
        vy: 2 + Math.random() * 3,
        vx: (Math.random() - 0.5) * 2,
        rot: Math.random() * 360,
        vr: (Math.random() - 0.5) * 10
      }));
      let frame = 0;
      const maxFrames = 260;
      const loop = () => {
        frame++;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        this.particles.forEach(p => {
          p.x += p.vx; p.y += p.vy; p.rot += p.vr;
          if (p.y > canvas.height + 20) p.y = -10;
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate((p.rot * Math.PI) / 180);
          ctx.fillStyle = p.c;
          ctx.fillRect(-p.r, -p.r, p.r * 2, p.r * 2);
          ctx.restore();
        });
        if (frame < maxFrames) this.raf = requestAnimationFrame(loop);
        else ctx.clearRect(0, 0, canvas.width, canvas.height);
      };
      this.stop();
      this.raf = requestAnimationFrame(loop);
    },
    stop() {
      if (this.raf) cancelAnimationFrame(this.raf);
      this.raf = null;
    }
  };

  /* ---------------------------------------------------------
     Game — orchestrator: wiring, boot, reset, finish.
  --------------------------------------------------------- */
  const Game = {
    start() {
      UIManager.cacheEls();

      const saved = SaveManager.load();
      if (saved) {
        GameState.restore(saved);
        GameState.levelIndex = Math.min(GameState.levelIndex, LEVELS.length - 1);
      }
      LevelManager.resetBaseline();

      this.bindEvents();
      FactoryManager.render();
      UIManager.setSoundIcon();
      UIManager.refreshAll();
      UIManager.maybeShowVipCard();
    },

    bindEvents() {
      const { produceBtn, sellBtn, upgradeBtn, soundBtn, nextLevelBtn,
              vipShareBtn, playAgainBtn, shareResultBtn } = UIManager.els;

      produceBtn.addEventListener("click", () => { AudioManager.click(); EconomyManager.produce(); });
      sellBtn.addEventListener("click", () => { AudioManager.click(); EconomyManager.sell(); });
      upgradeBtn.addEventListener("click", () => { AudioManager.click(); EconomyManager.upgrade(); });

      soundBtn.addEventListener("click", () => {
        GameState.soundOn = !GameState.soundOn;
        UIManager.setSoundIcon();
        SaveManager.save(GameState.serialize());
        if (GameState.soundOn) AudioManager.click();
      });

      nextLevelBtn.addEventListener("click", () => LevelManager.nextLevel());
      vipShareBtn.addEventListener("click", () => VIPManager.share());
      playAgainBtn.addEventListener("click", () => this.reset());
      shareResultBtn.addEventListener("click", () => VIPManager.share());

      // Keyboard support: Enter/Space activate the focused primary actions.
      [produceBtn, sellBtn, upgradeBtn, nextLevelBtn, vipShareBtn, playAgainBtn, shareResultBtn, soundBtn]
        .forEach(btn => btn.addEventListener("keyup", e => {
          if (e.key === "Enter" || e.key === " ") btn.click();
        }));
    },

    finish() {
      UIManager.hideLevelComplete();
      UIManager.showFinal();
      SaveManager.save(GameState.serialize());
    },

    reset() {
      UIManager.hideFinal();
      UIManager.hideLevelComplete();
      GameState.reset();
      LevelManager.resetBaseline();
      EventManager.active = null;
      UIManager.hideEventBanner();
      FactoryManager.render();
      UIManager.refreshAll();
      UIManager.maybeShowVipCard();
      SaveManager.save(GameState.serialize());
    }
  };

  document.addEventListener("DOMContentLoaded", () => Game.start());
})();
