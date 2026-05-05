(() => {
  "use strict";

  const LAP_GOAL = 3;
  const STORAGE_PREFIX = "rehDoggGpBestLap_";
  const isMobile = matchMedia("(pointer: coarse)").matches || innerWidth < 820;

  const stages = [
    {
      name: "Tokyo Neon",
      ground: 0x151530,
      road: 0x14131c,
      edge: 0xff2eb3,
      sky: 0x07071b,
      fog: 0x171033,
      props: ["sign", "tower", "sign", "tower"],
      accent: 0x00e5ff
    },
    {
      name: "Sahara Desert",
      ground: 0xc9903b,
      road: 0x805829,
      edge: 0xffdf55,
      sky: 0xf0b45a,
      fog: 0xd99a48,
      props: ["pyramid", "rock", "dune", "rock"],
      accent: 0xff7d28
    },
    {
      name: "Alpine Snow",
      ground: 0xd8f5ff,
      road: 0x526a78,
      edge: 0x4cdcff,
      sky: 0x9bdcff,
      fog: 0xc8f0ff,
      props: ["pine", "snowbank", "ice", "pine"],
      accent: 0xffffff
    },
    {
      name: "Forest Ridge",
      ground: 0x1e7a34,
      road: 0x3b3328,
      edge: 0x82ff4e,
      sky: 0x143d27,
      fog: 0x1c5a2d,
      props: ["tree", "log", "hill", "tree"],
      accent: 0xffdf55
    },
    {
      name: "Volcano Circuit",
      ground: 0x1b1412,
      road: 0x242025,
      edge: 0xff3b24,
      sky: 0x180409,
      fog: 0x2b0710,
      props: ["lava", "fire", "rock", "lava"],
      accent: 0xff7a18
    }
  ];

  const ui = {
    loading: document.getElementById("loadingScreen"),
    menu: document.getElementById("menuScreen"),
    stageOverlay: document.getElementById("stageOverlay"),
    champion: document.getElementById("championOverlay"),
    stageButtons: document.getElementById("stageButtons"),
    startRace: document.getElementById("startRaceBtn"),
    nextStage: document.getElementById("nextStageBtn"),
    restartStage: document.getElementById("restartStageBtn"),
    stageMenu: document.getElementById("stageMenuBtn"),
    champRestart: document.getElementById("champRestartBtn"),
    champMenu: document.getElementById("champMenuBtn"),
    bestLapText: document.getElementById("bestLapText"),
    hudStage: document.getElementById("hudStage"),
    hudLap: document.getElementById("hudLap"),
    hudSpeed: document.getElementById("hudSpeed"),
    hudTimer: document.getElementById("hudTimer"),
    hudBest: document.getElementById("hudBest"),
    stageTitle: document.getElementById("stageTitle"),
    stageStats: document.getElementById("stageStats")
  };

  const keys = new Set();
  const touch = { left: false, right: false, gas: false, brake: false };
  const race = {
    stage: 0,
    running: false,
    complete: false,
    lap: 1,
    lapProgress: 0,
    totalProgress: 0,
    timer: 0,
    lapTimer: 0,
    bestLapThisRun: Infinity,
    speed: 0,
    steerVel: 0,
    drift: 0,
    audioUnlocked: false
  };

  let renderer;
  let scene;
  let camera;
  let clock;
  let car;
  let trackGroup;
  let propGroup;
  let wheelParts = [];
  let flame;
  let roadSegments = [];
  let lastSkidAt = 0;

  const audio = createAudio();

  function createAudio() {
    let ctx;
    let engineGain;
    let engineOsc;
    let engineFilter;

    function unlock() {
      if (race.audioUnlocked) return;
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      ctx = ctx || new AudioContext();
      ctx.resume();
      engineGain = engineGain || ctx.createGain();
      engineGain.gain.value = 0;
      engineFilter = engineFilter || ctx.createBiquadFilter();
      engineFilter.type = "lowpass";
      engineFilter.frequency.value = 420;
      engineOsc = engineOsc || ctx.createOscillator();
      engineOsc.type = "sawtooth";
      engineOsc.frequency.value = 72;
      engineOsc.connect(engineFilter);
      engineFilter.connect(engineGain);
      engineGain.connect(ctx.destination);
      try { engineOsc.start(); } catch (e) {}
      race.audioUnlocked = true;
    }

    function tone(freq, dur, type = "square", volume = .08, slide = 0) {
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), ctx.currentTime + dur);
      gain.gain.setValueAtTime(volume, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(.001, ctx.currentTime + dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + dur);
    }

    function noise(dur, volume = .06) {
      if (!ctx) return;
      const buffer = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.value = 900;
      gain.gain.setValueAtTime(volume, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(.001, ctx.currentTime + dur);
      src.buffer = buffer;
      src.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      src.start();
    }

    return {
      unlock,
      startRace() { tone(330, .08, "square", .08); setTimeout(() => tone(660, .12, "square", .08), 90); },
      skid() { noise(.12, .045); },
      lap() { tone(523, .08, "triangle", .08); setTimeout(() => tone(784, .1, "triangle", .08), 90); },
      complete() { tone(392, .12, "square", .08); setTimeout(() => tone(659, .15, "square", .09), 130); setTimeout(() => tone(988, .2, "square", .1), 300); },
      bump() { noise(.18, .09); tone(90, .12, "sawtooth", .07, -35); },
      updateEngine(speed, accel) {
        if (!ctx || !engineGain || !engineOsc) return;
        const target = race.running ? Math.min(.16, .025 + Math.abs(speed) * .0006 + (accel ? .04 : 0)) : 0;
        engineGain.gain.linearRampToValueAtTime(target, ctx.currentTime + .08);
        engineOsc.frequency.linearRampToValueAtTime(68 + Math.abs(speed) * .65, ctx.currentTime + .08);
        engineFilter.frequency.linearRampToValueAtTime(360 + Math.abs(speed) * 7, ctx.currentTime + .08);
      }
    };
  }

  function formatTime(seconds) {
    if (!Number.isFinite(seconds)) return "--";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const hund = Math.floor((seconds % 1) * 100);
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}.${String(hund).padStart(2, "0")}`;
  }

  function bestKey(stageIndex) {
    return `${STORAGE_PREFIX}${stageIndex}`;
  }

  function getBestLap(stageIndex) {
    return Number(localStorage.getItem(bestKey(stageIndex)) || Infinity);
  }

  function saveBestLap(stageIndex, time) {
    const old = getBestLap(stageIndex);
    if (time < old) localStorage.setItem(bestKey(stageIndex), String(time));
  }

  function makeMat(color, emissive = 0x000000, roughness = .55) {
    return new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity: emissive ? .45 : 0, roughness, metalness: .18 });
  }

  function initThree() {
    scene = new THREE.Scene();
    scene.fog = new THREE.Fog(stages[0].fog, 70, isMobile ? 260 : 360);

    camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, .1, 800);
    camera.position.set(0, 24, 34);

    renderer = new THREE.WebGLRenderer({ antialias: !isMobile, powerPreference: "high-performance" });
    renderer.setPixelRatio(isMobile ? 1 : Math.min(devicePixelRatio, 1.7));
    renderer.setSize(innerWidth, innerHeight);
    renderer.shadowMap.enabled = !isMobile;
    document.getElementById("canvasWrap").appendChild(renderer.domElement);

    clock = new THREE.Clock();

    const hemi = new THREE.HemisphereLight(0xffffff, 0x232342, 1.25);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffffff, 1.1);
    sun.position.set(20, 45, 28);
    sun.castShadow = !isMobile;
    scene.add(sun);

    trackGroup = new THREE.Group();
    propGroup = new THREE.Group();
    scene.add(trackGroup, propGroup);

    createCar();
    buildStage(0);
    addEvents();
    makeStageButtons();
    updateBestText();
    ui.loading.style.display = "none";
    requestAnimationFrame(loop);
  }

  function createCar() {
    car = new THREE.Group();
    car.position.set(0, 1.05, 0);

    const red = makeMat(0xff1f22, 0x330000, .42);
    const dark = makeMat(0x16161c, 0x000000, .35);
    const glass = new THREE.MeshStandardMaterial({ color: 0x1fdcff, emissive: 0x0d9ec8, emissiveIntensity: .45, roughness: .2, metalness: .25 });
    const white = makeMat(0xffffff, 0x111111, .35);
    const head = new THREE.MeshStandardMaterial({ color: 0xffffd8, emissive: 0xfff08a, emissiveIntensity: 1.5 });
    const brake = new THREE.MeshStandardMaterial({ color: 0xff1515, emissive: 0xff0000, emissiveIntensity: 1.4 });

    const body = new THREE.Mesh(new THREE.BoxGeometry(4.2, .75, 7), red);
    body.castShadow = !isMobile;
    body.position.y = .75;
    car.add(body);

    const nose = new THREE.Mesh(new THREE.ConeGeometry(2.15, 3.4, 4), red);
    nose.rotation.y = Math.PI / 4;
    nose.position.set(0, .78, -4.4);
    nose.scale.z = .65;
    car.add(nose);

    const cockpit = new THREE.Mesh(new THREE.BoxGeometry(2.2, .72, 2.2), glass);
    cockpit.position.set(0, 1.35, -1.1);
    car.add(cockpit);

    const wing = new THREE.Mesh(new THREE.BoxGeometry(5.4, .18, .72), dark);
    wing.position.set(0, 1.42, 3.45);
    car.add(wing);

    [-1, 1].forEach(side => {
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(.22, .08, 6.4), white);
      stripe.position.set(side * 1.32, 1.15, -.2);
      car.add(stripe);

      const headlight = new THREE.Mesh(new THREE.BoxGeometry(.62, .18, .12), head);
      headlight.position.set(side * 1.1, .9, -3.98);
      car.add(headlight);

      const brakeLight = new THREE.Mesh(new THREE.BoxGeometry(.72, .18, .14), brake);
      brakeLight.position.set(side * 1.1, .92, 3.58);
      car.add(brakeLight);

      [-2.2, 2.2].forEach(z => {
        const wheel = new THREE.Mesh(new THREE.CylinderGeometry(.55, .55, .44, 18), dark);
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(side * 2.28, .48, z);
        wheelParts.push(wheel);
        car.add(wheel);
      });
    });

    flame = new THREE.Mesh(new THREE.ConeGeometry(.55, 1.8, 14), new THREE.MeshBasicMaterial({ color: 0xff7a18, transparent: true, opacity: 0 }));
    flame.rotation.x = Math.PI / 2;
    flame.position.set(0, .68, 4.45);
    car.add(flame);

    scene.add(car);
  }

  function clearGroup(group) {
    while (group.children.length) group.remove(group.children[0]);
  }

  function buildStage(index) {
    const stage = stages[index];
    scene.background = new THREE.Color(stage.sky);
    scene.fog.color.setHex(stage.fog);
    scene.fog.near = 70;
    scene.fog.far = isMobile ? 260 : 360;
    clearGroup(trackGroup);
    clearGroup(propGroup);
    roadSegments = [];

    const ground = new THREE.Mesh(new THREE.PlaneGeometry(500, 900), makeMat(stage.ground));
    ground.rotation.x = -Math.PI / 2;
    ground.position.z = -220;
    ground.receiveShadow = !isMobile;
    trackGroup.add(ground);

    for (let i = 0; i < 22; i++) {
      const z = -i * 26;
      const segment = new THREE.Group();
      segment.position.z = z;
      segment.userData.scrollSegment = true;
      const road = new THREE.Mesh(new THREE.BoxGeometry(22, .08, 24), makeMat(stage.road));
      road.position.set(0, .02, 0);
      road.receiveShadow = !isMobile;
      segment.add(road);
      roadSegments.push(segment);

      [-1, 1].forEach(side => {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(1.1, .4, 22), makeMat(stage.edge, stage.edge));
        rail.position.set(side * 12, .25, 0);
        segment.add(rail);
      });

      const stripe = new THREE.Mesh(new THREE.BoxGeometry(.42, .1, 6), makeMat(0xffffff, stage.accent));
      stripe.position.set(0, .12, -5);
      segment.add(stripe);
      trackGroup.add(segment);
    }

    const finish = new THREE.Group();
    for (let x = -10; x <= 10; x += 2) {
      const block = new THREE.Mesh(new THREE.BoxGeometry(2, .12, 2), makeMat((x / 2) % 2 === 0 ? 0xffffff : 0x111111));
      block.position.set(x, .18, -34);
      finish.add(block);
    }
    trackGroup.add(finish);

    buildProps(stage);
  }

  function buildProps(stage) {
    const count = isMobile ? 24 : 40;
    for (let i = 0; i < count; i++) {
      const z = -20 - i * 13;
      const side = i % 2 ? 1 : -1;
      const x = side * (18 + (i % 4) * 4);
      const prop = makeProp(stage.props[i % stage.props.length], stage);
      prop.position.set(x, 0, z);
      prop.rotation.y = (i * .7) % Math.PI;
      propGroup.add(prop);
    }
  }

  function makeProp(type, stage) {
    const g = new THREE.Group();
    const accent = stage.accent;
    if (type === "sign") {
      const pole = new THREE.Mesh(new THREE.BoxGeometry(.35, 4, .35), makeMat(0x111111));
      pole.position.y = 2;
      const board = new THREE.Mesh(new THREE.BoxGeometry(4.8, 2, .25), makeMat(0x151530, accent));
      board.position.y = 4.4;
      g.add(pole, board);
    } else if (type === "tower") {
      const tower = new THREE.Mesh(new THREE.CylinderGeometry(.9, 1.2, 8, 8), makeMat(0x242448, accent));
      tower.position.y = 4;
      g.add(tower);
    } else if (type === "pyramid") {
      const pyramid = new THREE.Mesh(new THREE.ConeGeometry(3.2, 3, 4), makeMat(0xdba052));
      pyramid.position.y = 1.5;
      pyramid.rotation.y = Math.PI / 4;
      g.add(pyramid);
    } else if (type === "dune" || type === "hill" || type === "snowbank") {
      const mound = new THREE.Mesh(new THREE.SphereGeometry(3, 12, 8), makeMat(type === "snowbank" ? 0xffffff : stage.ground));
      mound.scale.y = .25;
      mound.position.y = .35;
      g.add(mound);
    } else if (type === "pine" || type === "tree") {
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(.35, .45, 2.5, 8), makeMat(0x7b4a23));
      trunk.position.y = 1.25;
      const top = new THREE.Mesh(new THREE.ConeGeometry(1.7, 4, 10), makeMat(type === "pine" ? 0x0e7d4f : 0x159342));
      top.position.y = 4;
      g.add(trunk, top);
    } else if (type === "log") {
      const log = new THREE.Mesh(new THREE.CylinderGeometry(.7, .7, 4, 10), makeMat(0x7b4a23));
      log.rotation.z = Math.PI / 2;
      log.position.y = .7;
      g.add(log);
    } else if (type === "lava" || type === "fire") {
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(1.8), makeMat(0x221719, 0xff3b24));
      rock.position.y = 1.4;
      const glow = new THREE.PointLight(0xff3b24, isMobile ? .35 : .75, 18);
      glow.position.y = 2.5;
      g.add(rock, glow);
    } else {
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(1.4), makeMat(0x6b6259));
      rock.position.y = 1.1;
      g.add(rock);
    }
    return g;
  }

  function makeStageButtons() {
    ui.stageButtons.innerHTML = "";
    stages.forEach((stage, index) => {
      const btn = document.createElement("button");
      btn.className = "stageBtn";
      btn.textContent = `${index + 1}. ${stage.name}`;
      btn.addEventListener("click", () => {
        audio.unlock();
        race.stage = index;
        buildStage(index);
        updateStageButtons();
        updateBestText();
      });
      ui.stageButtons.appendChild(btn);
    });
    updateStageButtons();
  }

  function updateStageButtons() {
    [...ui.stageButtons.children].forEach((btn, index) => btn.classList.toggle("selected", index === race.stage));
  }

  function updateBestText() {
    const best = getBestLap(race.stage);
    const text = `Best Lap: ${formatTime(best)}`;
    ui.bestLapText.textContent = text;
    ui.hudBest.textContent = formatTime(best);
  }

  function startRace(stageIndex = race.stage) {
    audio.unlock();
    audio.startRace();
    race.stage = stageIndex;
    race.running = true;
    race.complete = false;
    race.lap = 1;
    race.lapProgress = 0;
    race.totalProgress = 0;
    race.timer = 0;
    race.lapTimer = 0;
    race.bestLapThisRun = Infinity;
    race.speed = 0;
    race.steerVel = 0;
    race.drift = 0;
    car.position.set(0, 1.05, 0);
    car.rotation.set(0, 0, 0);
    buildStage(stageIndex);
    updateStageButtons();
    updateBestText();
    setOverlay(ui.menu, false);
    setOverlay(ui.stageOverlay, false);
    setOverlay(ui.champion, false);
  }

  function completeStage() {
    race.running = false;
    race.complete = true;
    audio.complete();
    ui.stageTitle.textContent = `${stages[race.stage].name} Complete`;
    ui.stageStats.textContent = `Best lap this run: ${formatTime(race.bestLapThisRun)} | Race time: ${formatTime(race.timer)}`;
    if (race.stage >= stages.length - 1) {
      setOverlay(ui.champion, true);
    } else {
      setOverlay(ui.stageOverlay, true);
    }
  }

  function setOverlay(el, active) {
    el.classList.toggle("active", active);
  }

  function addEvents() {
    addEventListener("resize", () => {
      camera.aspect = innerWidth / innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(innerWidth, innerHeight);
    });

    addEventListener("keydown", e => {
      audio.unlock();
      if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "KeyA", "KeyD", "KeyW", "KeyS", "Space"].includes(e.code)) e.preventDefault();
      keys.add(e.code);
    });
    addEventListener("keyup", e => keys.delete(e.code));
    document.addEventListener("contextmenu", e => e.preventDefault());

    document.querySelectorAll("#mobileControls button").forEach(btn => {
      const control = btn.dataset.control;
      ["pointerdown", "touchstart"].forEach(type => btn.addEventListener(type, e => {
        e.preventDefault();
        audio.unlock();
        touch[control] = true;
      }, { passive: false }));
      ["pointerup", "pointercancel", "pointerleave", "touchend", "touchcancel"].forEach(type => btn.addEventListener(type, e => {
        e.preventDefault();
        touch[control] = false;
      }, { passive: false }));
    });

    ui.startRace.addEventListener("click", () => startRace());
    ui.nextStage.addEventListener("click", () => startRace(race.stage + 1));
    ui.restartStage.addEventListener("click", () => startRace(race.stage));
    ui.stageMenu.addEventListener("click", showMenu);
    ui.champRestart.addEventListener("click", () => startRace(0));
    ui.champMenu.addEventListener("click", showMenu);
  }

  function showMenu() {
    audio.unlock();
    race.running = false;
    race.speed = 0;
    setOverlay(ui.stageOverlay, false);
    setOverlay(ui.champion, false);
    setOverlay(ui.menu, true);
    updateBestText();
  }

  function inputState() {
    return {
      gas: keys.has("ArrowUp") || keys.has("KeyW") || touch.gas,
      brake: keys.has("ArrowDown") || keys.has("KeyS") || keys.has("Space") || touch.brake,
      left: keys.has("ArrowLeft") || keys.has("KeyA") || touch.left,
      right: keys.has("ArrowRight") || keys.has("KeyD") || touch.right
    };
  }

  function updateRace(dt) {
    const input = inputState();
    const accel = input.gas ? 130 : 0;
    const brake = input.brake ? 170 : 0;
    const drag = race.speed > 0 ? 26 : 14;
    race.speed += accel * dt;
    race.speed -= brake * dt;
    race.speed -= Math.sign(race.speed) * drag * dt;
    if (Math.abs(race.speed) < 1) race.speed = 0;
    race.speed = THREE.MathUtils.clamp(race.speed, -42, 182);

    const steerInput = (input.left ? 1 : 0) - (input.right ? 1 : 0);
    const steerPower = THREE.MathUtils.clamp(Math.abs(race.speed) / 95, .2, 1.35);
    race.steerVel += steerInput * steerPower * 3.2 * dt;
    race.steerVel *= Math.pow(.14, dt);
    race.drift = THREE.MathUtils.lerp(race.drift, steerInput * Math.max(0, race.speed - 82) / 120, 5 * dt);

    car.position.x += race.steerVel * 18 * dt + race.drift * 7 * dt;
    car.position.x = THREE.MathUtils.clamp(car.position.x, -9.6, 9.6);
    car.rotation.z = THREE.MathUtils.lerp(car.rotation.z, -steerInput * .18 - race.drift * .08, 6 * dt);
    car.rotation.y = THREE.MathUtils.lerp(car.rotation.y, -race.steerVel * .35, 5 * dt);

    if (Math.abs(car.position.x) > 9.2 && race.speed > 35) {
      race.speed *= .965;
      const now = performance.now();
      if (now - lastSkidAt > 260) {
        audio.bump();
        lastSkidAt = now;
      }
    } else if (Math.abs(race.drift) > .16 && race.speed > 85) {
      const now = performance.now();
      if (now - lastSkidAt > 360) {
        audio.skid();
        lastSkidAt = now;
      }
    }

    const distance = Math.max(0, race.speed) * dt;
    race.lapProgress += distance;
    race.totalProgress += distance;
    race.timer += dt;
    race.lapTimer += dt;

    if (race.lapProgress >= 1000) {
      race.lapProgress -= 1000;
      race.bestLapThisRun = Math.min(race.bestLapThisRun, race.lapTimer);
      saveBestLap(race.stage, race.lapTimer);
      updateBestText();
      race.lapTimer = 0;
      audio.lap();
      if (race.lap >= LAP_GOAL) {
        completeStage();
      } else {
        race.lap += 1;
      }
    }

    updateWorldScroll(distance);
    updateCarEffects(input, dt);
    updateCamera(dt);
    audio.updateEngine(race.speed, input.gas);
  }

  function updateWorldScroll(distance) {
    const scroll = distance * .22;
    trackGroup.children.forEach(obj => {
      if (obj.userData.scrollSegment) {
        obj.position.z += scroll;
        if (obj.position.z > 22) obj.position.z -= 22 * 26;
      }
    });
    propGroup.children.forEach(obj => {
      obj.position.z += scroll;
      if (obj.position.z > 28) {
        obj.position.z -= 520;
        obj.position.x = (Math.random() > .5 ? 1 : -1) * (18 + Math.random() * 16);
      }
    });
  }

  function updateCarEffects(input, dt) {
    wheelParts.forEach(w => { w.rotation.x += race.speed * dt * .12; });
    flame.material.opacity = THREE.MathUtils.lerp(flame.material.opacity, input.gas && race.speed > 25 ? .82 : 0, 8 * dt);
    flame.scale.setScalar(1 + Math.random() * .35);
  }

  function updateCamera(dt) {
    const shake = Math.max(0, race.speed - 120) / 120 * (isMobile ? .16 : .28);
    const target = new THREE.Vector3(car.position.x * .48, 16 + race.speed * .015, 23 + race.speed * .025);
    camera.position.lerp(target, 1 - Math.pow(.035, dt));
    camera.position.x += (Math.random() - .5) * shake;
    camera.position.y += (Math.random() - .5) * shake;
    camera.lookAt(car.position.x * .35, 1.2, -35);
  }

  function updateHud() {
    ui.hudStage.textContent = stages[race.stage].name;
    ui.hudLap.textContent = `${race.lap} / ${LAP_GOAL}`;
    ui.hudSpeed.textContent = `${Math.round(Math.max(0, race.speed))}`;
    ui.hudTimer.textContent = formatTime(race.timer);
    ui.hudBest.textContent = formatTime(getBestLap(race.stage));
  }

  function loop() {
    const dt = Math.min(.05, clock.getDelta());
    if (race.running) updateRace(dt);
    else audio.updateEngine(0, false);
    updateHud();
    renderer.render(scene, camera);
    requestAnimationFrame(loop);
  }

  if (!window.THREE) {
    ui.loading.innerHTML = "<h1>REH DOGG GP</h1><p>Three.js failed to load. Check your internet connection for the CDN.</p>";
    return;
  }

  initThree();
})();
