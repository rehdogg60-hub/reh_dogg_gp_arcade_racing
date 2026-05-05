(() => {
  "use strict";

  const LANES = [-4, 0, 4];
  const BEST_KEY = "rehDoggGpNeonRunBestScore";
  const THEME_DISTANCE = 1000;
  const isMobile = matchMedia("(pointer: coarse)").matches || innerWidth < 820;

  const themes = [
    { name: "Tokyo Neon", sky: 0x08071b, ground: 0x101024, fog: 0x141032, edgeA: 0x00e5ff, edgeB: 0xff2eb3, prop: "tower" },
    { name: "Sahara Desert", sky: 0xf0b45a, ground: 0xc9903b, fog: 0xd99a48, edgeA: 0xffdf55, edgeB: 0xff7d28, prop: "pyramid" },
    { name: "Alpine Snow", sky: 0x9bdcff, ground: 0xd8f5ff, fog: 0xc8f0ff, edgeA: 0xffffff, edgeB: 0x4cdcff, prop: "pine" },
    { name: "Forest Ridge", sky: 0x143d27, ground: 0x1e7a34, fog: 0x1c5a2d, edgeA: 0x82ff4e, edgeB: 0xffdf55, prop: "tree" },
    { name: "Volcano Circuit", sky: 0x180409, ground: 0x1b1412, fog: 0x2b0710, edgeA: 0xff3b24, edgeB: 0xff7a18, prop: "lava" }
  ];

  const ui = {
    loading: document.getElementById("loadingScreen"),
    menu: document.getElementById("menuScreen"),
    gameOver: document.getElementById("gameOverScreen"),
    start: document.getElementById("startBtn"),
    restart: document.getElementById("restartBtn"),
    mainMenu: document.getElementById("mainMenuBtn"),
    pause: document.getElementById("pauseBtn"),
    finalStats: document.getElementById("finalStats"),
    menuBest: document.getElementById("menuBest"),
    hudTheme: document.getElementById("hudTheme"),
    hudSpeed: document.getElementById("hudSpeed"),
    hudDistance: document.getElementById("hudDistance"),
    hudScore: document.getElementById("hudScore"),
    hudBest: document.getElementById("hudBest"),
    dashSpeed: document.getElementById("dashSpeed"),
    dashDistance: document.getElementById("dashDistance"),
    dashScore: document.getElementById("dashScore"),
    dashBest: document.getElementById("dashBest"),
    raceMessage: document.getElementById("raceMessage")
  };

  const state = {
    running: false,
    paused: false,
    lane: 1,
    targetLane: 1,
    carX: 0,
    speed: 72,
    distance: 0,
    score: 0,
    best: Number(localStorage.getItem(BEST_KEY) || 0),
    themeIndex: 0,
    nextThemeDistance: THEME_DISTANCE,
    spawnTimer: 1.2,
    obstacleSpacing: 1.15,
    audioReady: false,
    lastNearMiss: 0
  };

  const keys = new Set();
  let renderer;
  let scene;
  let camera;
  let clock;
  let roadGroup;
  let obstacleGroup;
  let propGroup;
  let markerGroup;
  let cockpitLight;
  let roadSegments = [];
  let obstacles = [];
  let props = [];

  const audio = createAudio();

  function createAudio() {
    let ctx;
    let engineOsc;
    let engineGain;

    function unlock() {
      if (state.audioReady) return;
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      ctx = ctx || new AudioContext();
      ctx.resume();
      engineOsc = ctx.createOscillator();
      engineGain = ctx.createGain();
      const filter = ctx.createBiquadFilter();
      engineOsc.type = "sawtooth";
      engineOsc.frequency.value = 64;
      filter.type = "lowpass";
      filter.frequency.value = 460;
      engineGain.gain.value = 0;
      engineOsc.connect(filter);
      filter.connect(engineGain);
      engineGain.connect(ctx.destination);
      engineOsc.start();
      state.audioReady = true;
    }

    function tone(freq, dur, type = "square", vol = .08, slide = 0) {
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(35, freq + slide), ctx.currentTime + dur);
      gain.gain.setValueAtTime(vol, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(.001, ctx.currentTime + dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + dur);
    }

    function noise(dur, vol = .08) {
      if (!ctx) return;
      const buffer = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.value = 760;
      gain.gain.setValueAtTime(vol, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(.001, ctx.currentTime + dur);
      src.buffer = buffer;
      src.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      src.start();
    }

    return {
      unlock,
      start() { tone(330, .08); setTimeout(() => tone(660, .12), 90); },
      lane() { tone(520, .06, "triangle", .07, 160); },
      nearMiss() { tone(880, .06, "triangle", .055, 220); },
      crash() { noise(.28, .12); tone(82, .24, "sawtooth", .1, -40); },
      updateEngine() {
        if (!ctx || !engineGain || !engineOsc) return;
        const target = state.running && !state.paused ? Math.min(.15, .035 + state.speed * .00055) : 0;
        engineGain.gain.linearRampToValueAtTime(target, ctx.currentTime + .08);
        engineOsc.frequency.linearRampToValueAtTime(58 + state.speed * .55, ctx.currentTime + .08);
      }
    };
  }

  function init() {
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(68, innerWidth / innerHeight, .1, 520);
    renderer = new THREE.WebGLRenderer({ antialias: !isMobile, powerPreference: "high-performance" });
    renderer.setPixelRatio(isMobile ? 1 : Math.min(devicePixelRatio, 1.6));
    renderer.setSize(innerWidth, innerHeight);
    document.getElementById("canvasWrap").appendChild(renderer.domElement);
    clock = new THREE.Clock();

    const hemi = new THREE.HemisphereLight(0xffffff, 0x202040, 1.25);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffffff, .9);
    sun.position.set(0, 30, 30);
    scene.add(sun);
    cockpitLight = new THREE.PointLight(0xffffff, .85, 60);
    cockpitLight.position.set(0, 8, 5);
    scene.add(cockpitLight);

    roadGroup = new THREE.Group();
    obstacleGroup = new THREE.Group();
    propGroup = new THREE.Group();
    markerGroup = new THREE.Group();
    scene.add(roadGroup, obstacleGroup, propGroup, markerGroup);

    buildRoad();
    buildDistantProps();
    applyTheme(0, false);
    bindEvents();
    updateUi();
    ui.loading.style.display = "none";
    document.body.classList.add("cockpit-view");
    requestAnimationFrame(loop);
  }

  function mat(color, emissive = 0x000000, intensity = .25) {
    return new THREE.MeshStandardMaterial({
      color,
      emissive,
      emissiveIntensity: emissive ? intensity : 0,
      roughness: .55,
      metalness: .12
    });
  }

  function buildRoad() {
    const asphalt = mat(0x111116);
    const lineMat = mat(0xeefcff, 0x6ffaff, .55);
    const edgeCyan = mat(0x101014, 0x00e5ff, 1.2);
    const edgeMagenta = mat(0x101014, 0xff2eb3, 1.2);

    for (let i = 0; i < 24; i++) {
      const segment = new THREE.Group();
      segment.position.z = -i * 24;
      segment.userData.baseZ = segment.position.z;

      const road = new THREE.Mesh(new THREE.BoxGeometry(14, .08, 24), asphalt);
      road.position.y = 0;
      segment.add(road);

      [-2, 2].forEach(x => {
        const dash = new THREE.Mesh(new THREE.BoxGeometry(.16, .12, 7), lineMat);
        dash.position.set(x, .09, 0);
        segment.add(dash);
      });

      const leftEdge = new THREE.Mesh(new THREE.BoxGeometry(.28, .35, 24), edgeCyan);
      leftEdge.position.set(-7.35, .22, 0);
      const rightEdge = new THREE.Mesh(new THREE.BoxGeometry(.28, .35, 24), edgeMagenta);
      rightEdge.position.set(7.35, .22, 0);
      segment.add(leftEdge, rightEdge);

      roadGroup.add(segment);
      roadSegments.push(segment);
    }
  }

  function buildDistantProps() {
    for (let i = 0; i < 18; i++) {
      const prop = new THREE.Group();
      prop.userData.baseZ = -40 - i * 36;
      prop.userData.side = i % 2 ? 1 : -1;
      prop.userData.offset = 18 + (i % 3) * 6;
      propGroup.add(prop);
      props.push(prop);
    }
  }

  function rebuildProp(prop, theme, index) {
    while (prop.children.length) prop.remove(prop.children[0]);
    const accent = index % 2 ? theme.edgeA : theme.edgeB;
    if (theme.prop === "pyramid") {
      const p = new THREE.Mesh(new THREE.ConeGeometry(2.8, 3, 4), mat(0xdba052));
      p.position.y = 1.5;
      p.rotation.y = Math.PI / 4;
      prop.add(p);
    } else if (theme.prop === "pine" || theme.prop === "tree") {
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(.28, .4, 2.2, 8), mat(0x7b4a23));
      trunk.position.y = 1.1;
      const top = new THREE.Mesh(new THREE.ConeGeometry(theme.prop === "pine" ? 1.25 : 1.55, 3.3, 9), mat(theme.prop === "pine" ? 0x0e7d4f : 0x159342));
      top.position.y = 3.4;
      prop.add(trunk, top);
    } else if (theme.prop === "lava") {
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(1.4), mat(0x201517, 0xff3b24, .9));
      rock.position.y = 1.2;
      prop.add(rock);
    } else {
      const tower = new THREE.Mesh(new THREE.BoxGeometry(1.5, 6, 1.5), mat(0x151530, accent, .8));
      tower.position.y = 3;
      prop.add(tower);
    }
    prop.scale.setScalar(.82);
  }

  function applyTheme(index, announce = true) {
    state.themeIndex = index % themes.length;
    const theme = themes[state.themeIndex];
    scene.background = new THREE.Color(theme.sky);
    scene.fog = new THREE.Fog(theme.fog, 30, isMobile ? 230 : 310);
    cockpitLight.color.setHex(theme.edgeA);

    while (markerGroup.children.length) markerGroup.remove(markerGroup.children[0]);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(280, 700), mat(theme.ground));
    ground.rotation.x = -Math.PI / 2;
    ground.position.z = -260;
    ground.position.y = -.08;
    markerGroup.add(ground);

    props.forEach((p, i) => rebuildProp(p, theme, i));
    if (announce) showMessage(theme.name);
  }

  function obstacleMaterial(color, emissive) {
    return new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity: 1.1, roughness: .35, metalness: .18 });
  }

  function createObstacle(lane, z, type) {
    const group = new THREE.Group();
    group.userData.lane = lane;
    group.userData.passed = false;
    group.userData.kind = type;
    group.position.set(LANES[lane], .7, z);

    if (type === "barrel") {
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(.65, .65, 1.45, 18), obstacleMaterial(0xff314f, 0xff1744));
      barrel.position.y = .15;
      group.add(barrel);
    } else if (type === "block") {
      const block = new THREE.Mesh(new THREE.BoxGeometry(1.55, 1.1, 1.55), obstacleMaterial(0xffdf55, 0xff7d28));
      group.add(block);
    } else if (type === "sign") {
      const sign = new THREE.Mesh(new THREE.BoxGeometry(2, .85, .28), obstacleMaterial(0x292940, 0x00e5ff));
      sign.position.y = .45;
      group.add(sign);
    } else {
      const left = new THREE.Mesh(new THREE.BoxGeometry(.34, 1.6, .34), obstacleMaterial(0xff2eb3, 0xff2eb3));
      const right = left.clone();
      left.position.set(-.75, .25, 0);
      right.position.set(.75, .25, 0);
      const top = new THREE.Mesh(new THREE.BoxGeometry(1.8, .28, .28), obstacleMaterial(0x00e5ff, 0x00e5ff));
      top.position.y = 1.15;
      group.add(left, right, top);
    }

    obstacleGroup.add(group);
    obstacles.push(group);
  }

  function spawnPattern() {
    const lanes = [0, 1, 2];
    const blockedCount = Math.random() < .24 ? 2 : 1;
    const safeLane = Math.floor(Math.random() * 3);
    const blocked = lanes.filter(l => l !== safeLane).sort(() => Math.random() - .5).slice(0, blockedCount);
    const z = -130;
    const types = ["barrel", "block", "sign", "gate"];
    blocked.forEach((lane, i) => createObstacle(lane, z - i * 7, types[Math.floor(Math.random() * types.length)]));
  }

  function startGame() {
    unlockAndStartSound();
    state.running = true;
    state.paused = false;
    state.lane = 1;
    state.targetLane = 1;
    state.carX = 0;
    state.speed = 72;
    state.distance = 0;
    state.score = 0;
    state.themeIndex = 0;
    state.nextThemeDistance = THEME_DISTANCE;
    state.spawnTimer = .9;
    obstacles.forEach(o => obstacleGroup.remove(o));
    obstacles = [];
    applyTheme(0, false);
    ui.menu.classList.remove("active");
    ui.gameOver.classList.remove("active");
    ui.pause.textContent = "Pause";
    showMessage("Go!");
  }

  function gameOver() {
    state.running = false;
    audio.crash();
    state.best = Math.max(state.best, Math.floor(state.score));
    localStorage.setItem(BEST_KEY, String(state.best));
    ui.finalStats.textContent = `Score: ${Math.floor(state.score)} | Distance: ${Math.floor(state.distance)} | Best: ${state.best}`;
    ui.gameOver.classList.add("active");
    updateUi();
  }

  function togglePause() {
    if (!state.running) return;
    state.paused = !state.paused;
    ui.pause.textContent = state.paused ? "Resume" : "Pause";
    showMessage(state.paused ? "Paused" : "Run!");
  }

  function moveLane(dir) {
    if (!state.running || state.paused) return;
    const next = THREE.MathUtils.clamp(state.targetLane + dir, 0, 2);
    if (next !== state.targetLane) {
      state.targetLane = next;
      audio.lane();
    }
  }

  function update(dt) {
    if (!state.running || state.paused) {
      audio.updateEngine();
      return;
    }

    state.speed = Math.min(190, state.speed + dt * 3.6);
    const dz = state.speed * dt;
    state.distance += dz;
    state.score = state.distance + state.speed * 2;

    const targetX = LANES[state.targetLane];
    state.carX = THREE.MathUtils.lerp(state.carX, targetX, 1 - Math.pow(.001, dt));
    if (Math.abs(state.carX - targetX) < .08) {
      state.lane = state.targetLane;
      state.carX = targetX;
    }

    state.spawnTimer -= dt;
    if (state.spawnTimer <= 0) {
      spawnPattern();
      state.obstacleSpacing = Math.max(.55, 1.14 - state.distance / 9000);
      state.spawnTimer = state.obstacleSpacing + Math.random() * .32;
    }

    obstacles.forEach(ob => {
      ob.position.z += dz * .92;
      ob.rotation.y += dt * 1.6;

      if (!ob.userData.passed && ob.position.z > -1.2) {
        ob.userData.passed = true;
        if (ob.userData.lane !== state.targetLane && Math.abs(ob.userData.lane - state.targetLane) <= 1 && performance.now() - state.lastNearMiss > 500) {
          state.lastNearMiss = performance.now();
          audio.nearMiss();
          showMessage("Near Miss!");
        }
      }

      if (ob.position.z > -1.4 && ob.position.z < 2.2 && ob.userData.lane === state.targetLane) {
        gameOver();
      }
    });

    obstacles = obstacles.filter(ob => {
      if (ob.position.z > 18) {
        obstacleGroup.remove(ob);
        return false;
      }
      return true;
    });

    roadSegments.forEach(seg => {
      seg.position.z += dz * .92;
      if (seg.position.z > 20) seg.position.z -= roadSegments.length * 24;
    });

    props.forEach(prop => {
      prop.position.z += dz * .42;
      if (prop.position.z > 26) prop.position.z -= 680;
      prop.position.x = prop.userData.side * prop.userData.offset;
    });

    if (state.distance >= state.nextThemeDistance) {
      state.nextThemeDistance += THEME_DISTANCE;
      applyTheme(state.themeIndex + 1, true);
    }

    updateCamera();
    audio.updateEngine();
  }

  function updateCamera() {
    camera.position.set(state.carX * .18, 2.2, 1.4);
    camera.lookAt(state.carX * .18, 1.7, -24);
  }

  function updateUi() {
    const theme = themes[state.themeIndex];
    const score = Math.floor(state.score);
    const distance = Math.floor(state.distance);
    const speed = Math.floor(state.speed);
    ui.hudTheme.textContent = theme.name;
    ui.hudSpeed.textContent = speed;
    ui.hudDistance.textContent = distance;
    ui.hudScore.textContent = score;
    ui.hudBest.textContent = state.best;
    ui.dashSpeed.textContent = speed;
    ui.dashDistance.textContent = distance;
    ui.dashScore.textContent = score;
    ui.dashBest.textContent = state.best;
    ui.menuBest.textContent = `Best Score: ${state.best}`;
  }

  function showMessage(text) {
    ui.raceMessage.textContent = text;
    ui.raceMessage.classList.remove("show");
    void ui.raceMessage.offsetWidth;
    ui.raceMessage.classList.add("show");
  }

  function unlockAndStartSound() {
    audio.unlock();
    audio.start();
  }

  function bindEvents() {
    addEventListener("resize", () => {
      camera.aspect = innerWidth / innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(innerWidth, innerHeight);
    });

    addEventListener("keydown", e => {
      if (["ArrowLeft", "ArrowRight", "KeyA", "KeyD", "Space", "KeyP"].includes(e.code)) e.preventDefault();
      audio.unlock();
      if (keys.has(e.code)) return;
      keys.add(e.code);
      if (e.code === "ArrowLeft" || e.code === "KeyA") moveLane(-1);
      if (e.code === "ArrowRight" || e.code === "KeyD") moveLane(1);
      if (e.code === "Space" || e.code === "KeyP") togglePause();
    });

    addEventListener("keyup", e => keys.delete(e.code));
    document.addEventListener("contextmenu", e => e.preventDefault());

    document.querySelectorAll("#mobileControls button").forEach(btn => {
      const dir = btn.dataset.control === "left" ? -1 : 1;
      ["pointerdown", "touchstart"].forEach(type => btn.addEventListener(type, e => {
        e.preventDefault();
        audio.unlock();
        moveLane(dir);
      }, { passive: false }));
    });

    ui.start.addEventListener("click", startGame);
    ui.restart.addEventListener("click", startGame);
    ui.mainMenu.addEventListener("click", () => {
      audio.unlock();
      state.running = false;
      ui.gameOver.classList.remove("active");
      ui.menu.classList.add("active");
      updateUi();
    });
    ui.pause.addEventListener("click", () => {
      audio.unlock();
      togglePause();
    });
  }

  function loop() {
    const dt = Math.min(.05, clock.getDelta());
    update(dt);
    updateUi();
    renderer.render(scene, camera);
    requestAnimationFrame(loop);
  }

  if (!window.THREE) {
    ui.loading.innerHTML = "<h1>REH DOGG GP:<br>NEON RUN</h1><p>Three.js failed to load. Check your internet connection for the CDN.</p>";
    return;
  }

  init();
})();
