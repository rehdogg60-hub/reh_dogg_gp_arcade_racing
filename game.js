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
      accent: 0x00e5ff,
      length: 5200,
      checkpoints: [1150, 2450, 3700, 4700],
      tunnels: [[900, 1320]],
      features: ["glowing tunnel", "neon bridge", "sharp city turns"],
      signs: ["REH DOGG GP", "BOOST", "RDG+", "FINAL LAP"]
    },
    {
      name: "Sahara Desert",
      ground: 0xc9903b,
      road: 0x805829,
      edge: 0xffdf55,
      sky: 0xf0b45a,
      fog: 0xd99a48,
      props: ["pyramid", "rock", "dune", "rock"],
      accent: 0xff7d28,
      length: 5600,
      checkpoints: [1200, 2600, 4000, 5050],
      tunnels: [[1850, 2220]],
      features: ["sand canyon", "rock arches", "pyramid landmarks"],
      signs: ["REH DOGG GP", "BOOST", "RDG+", "FINAL LAP"]
    },
    {
      name: "Alpine Snow",
      ground: 0xd8f5ff,
      road: 0x526a78,
      edge: 0x4cdcff,
      sky: 0x9bdcff,
      fog: 0xc8f0ff,
      props: ["pine", "snowbank", "ice", "pine"],
      accent: 0xffffff,
      length: 5400,
      checkpoints: [1080, 2500, 3820, 4900],
      tunnels: [[3050, 3430]],
      features: ["icy tunnel", "snowbank turns", "mountain walls"],
      signs: ["REH DOGG GP", "BOOST", "RDG+", "FINAL LAP"]
    },
    {
      name: "Forest Ridge",
      ground: 0x1e7a34,
      road: 0x3b3328,
      edge: 0x82ff4e,
      sky: 0x143d27,
      fog: 0x1c5a2d,
      props: ["tree", "log", "hill", "tree"],
      accent: 0xffdf55,
      length: 5550,
      checkpoints: [1200, 2500, 3900, 5050],
      tunnels: [[2150, 2480]],
      features: ["tree-lined curves", "wooden bridge", "dirt sections"],
      signs: ["REH DOGG GP", "BOOST", "RDG+", "FINAL LAP"]
    },
    {
      name: "Volcano Circuit",
      ground: 0x1b1412,
      road: 0x242025,
      edge: 0xff3b24,
      sky: 0x180409,
      fog: 0x2b0710,
      props: ["lava", "fire", "rock", "lava"],
      accent: 0xff7a18,
      length: 5900,
      checkpoints: [1300, 2800, 4250, 5400],
      tunnels: [[3550, 3970]],
      features: ["lava tunnel", "glowing cracks", "dangerous narrow bends"],
      signs: ["REH DOGG GP", "BOOST", "RDG+", "FINAL LAP"]
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
    checkpointText: document.getElementById("checkpointText"),
    progressFill: document.getElementById("progressFill"),
    raceMessage: document.getElementById("raceMessage"),
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
    checkpointIndex: 0,
    totalProgress: 0,
    timer: 0,
    lapTimer: 0,
    bestLapThisRun: Infinity,
    speed: 0,
    lateral: 0,
    steerVel: 0,
    drift: 0,
    inTunnel: false,
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
  let featureObjects = [];
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

  function routeCenterAt(stage, distance) {
    const t = ((distance % stage.length) + stage.length) % stage.length;
    const n = t / stage.length;
    const base =
      Math.sin(n * Math.PI * 2) * 18 +
      Math.sin(n * Math.PI * 6 + .8) * 8 +
      Math.sin(n * Math.PI * 12 + 1.6) * 3.5;
    const sharp = Math.sin(n * Math.PI * 10) > .72 ? Math.sin(n * Math.PI * 20) * 8 : 0;
    return THREE.MathUtils.clamp(base + sharp, -28, 28);
  }

  function routeWidthAt(stage, distance) {
    const inNarrow = stage.name === "Volcano Circuit" && isInTunnel(stage, distance);
    return inNarrow ? 16 : 22;
  }

  function isInTunnel(stage, distance) {
    const d = ((distance % stage.length) + stage.length) % stage.length;
    return stage.tunnels.some(([start, end]) => d >= start && d <= end);
  }

  function showRaceMessage(text) {
    ui.raceMessage.textContent = text;
    ui.raceMessage.classList.remove("show");
    void ui.raceMessage.offsetWidth;
    ui.raceMessage.classList.add("show");
  }

  function makeTextSign(text, color = "#ffdf55") {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 160;
    const c = canvas.getContext("2d");
    c.fillStyle = "rgba(4,4,12,.78)";
    c.fillRect(0, 0, canvas.width, canvas.height);
    c.strokeStyle = color;
    c.lineWidth = 10;
    c.strokeRect(10, 10, canvas.width - 20, canvas.height - 20);
    c.fillStyle = color;
    c.font = "900 54px Arial";
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.shadowColor = color;
    c.shadowBlur = 18;
    c.fillText(text, canvas.width / 2, canvas.height / 2);
    const texture = new THREE.CanvasTexture(canvas);
    const mat = new THREE.MeshBasicMaterial({ map: texture, transparent: true });
    return new THREE.Mesh(new THREE.PlaneGeometry(8, 2.5), mat);
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
    const gold = makeMat(0xffc93a, 0x332000, .32);
    const cyan = new THREE.MeshStandardMaterial({ color: 0x30f4ff, emissive: 0x00d8ff, emissiveIntensity: 1.05, roughness: .25, metalness: .2 });
    const glass = new THREE.MeshStandardMaterial({ color: 0x1fdcff, emissive: 0x0d9ec8, emissiveIntensity: .45, roughness: .2, metalness: .25 });
    const white = makeMat(0xffffff, 0x111111, .35);
    const head = new THREE.MeshStandardMaterial({ color: 0xffffd8, emissive: 0xfff08a, emissiveIntensity: 1.5 });
    const brake = new THREE.MeshStandardMaterial({ color: 0xff1515, emissive: 0xff0000, emissiveIntensity: 1.4 });

    const body = new THREE.Mesh(new THREE.BoxGeometry(4.7, .7, 6.8), red);
    body.castShadow = !isMobile;
    body.position.y = .72;
    body.scale.set(1, .88, 1);
    car.add(body);

    const nose = new THREE.Mesh(new THREE.ConeGeometry(2.35, 3.7, 4), red);
    nose.rotation.y = Math.PI / 4;
    nose.position.set(0, .78, -4.55);
    nose.scale.z = .65;
    car.add(nose);

    const hoodLogo = makeTextSign("RDGP", "#ffdf55");
    hoodLogo.scale.set(.18, .18, .18);
    hoodLogo.rotation.x = -Math.PI / 2;
    hoodLogo.position.set(0, 1.11, -2.35);
    car.add(hoodLogo);

    const cockpit = new THREE.Mesh(new THREE.BoxGeometry(2.15, .7, 2.05), glass);
    cockpit.position.set(0, 1.32, -1.08);
    car.add(cockpit);

    const wing = new THREE.Mesh(new THREE.BoxGeometry(5.8, .2, .78), dark);
    wing.position.set(0, 1.48, 3.45);
    car.add(wing);
    const wingGold = new THREE.Mesh(new THREE.BoxGeometry(5.2, .08, .18), gold);
    wingGold.position.set(0, 1.64, 3.22);
    car.add(wingGold);

    [-1, 1].forEach(side => {
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(.22, .08, 6.4), white);
      stripe.position.set(side * 1.32, 1.15, -.2);
      car.add(stripe);

      const neonStripe = new THREE.Mesh(new THREE.BoxGeometry(.16, .1, 5.4), cyan);
      neonStripe.position.set(side * 1.72, 1.08, -.15);
      car.add(neonStripe);

      const goldSkirt = new THREE.Mesh(new THREE.BoxGeometry(.22, .22, 5.8), gold);
      goldSkirt.position.set(side * 2.38, .66, .05);
      car.add(goldSkirt);

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
    featureObjects = [];

    const ground = new THREE.Mesh(new THREE.PlaneGeometry(520, 1200), makeMat(stage.ground));
    ground.rotation.x = -Math.PI / 2;
    ground.position.z = -300;
    ground.receiveShadow = !isMobile;
    trackGroup.add(ground);

    const segmentCount = isMobile ? 34 : 48;
    for (let i = 0; i < segmentCount; i++) {
      const segment = new THREE.Group();
      segment.userData.scrollSegment = true;
      segment.userData.distance = i * 55;
      const road = new THREE.Mesh(new THREE.BoxGeometry(22, .08, 52), makeMat(stage.road));
      road.position.set(0, .02, 0);
      road.receiveShadow = !isMobile;
      segment.add(road);
      roadSegments.push(segment);

      [-1, 1].forEach(side => {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(1.1, .4, 50), makeMat(stage.edge, stage.edge));
        rail.position.set(side * 12, .25, 0);
        segment.add(rail);
      });

      const stripe = new THREE.Mesh(new THREE.BoxGeometry(.42, .1, 20), makeMat(0xffffff, stage.accent));
      stripe.position.set(0, .12, 0);
      segment.add(stripe);
      trackGroup.add(segment);
    }

    buildRouteFeatures(stage);
    buildProps(stage);
    updateWorldScroll(0);
  }

  function buildProps(stage) {
    const count = isMobile ? 38 : 68;
    for (let i = 0; i < count; i++) {
      const distance = i * (stage.length / count);
      const side = i % 2 ? 1 : -1;
      const prop = makeProp(stage.props[i % stage.props.length], stage);
      prop.userData.distance = distance;
      prop.userData.side = side;
      prop.userData.roadsideOffset = 18 + (i % 4) * 4;
      prop.rotation.y = (i * .7) % Math.PI;
      propGroup.add(prop);
    }
  }

  function buildRouteFeatures(stage) {
    const finish = createGate(stage, "FINISH", 0xffffff, true);
    finish.userData.distance = 0;
    finish.userData.routeFeature = true;
    trackGroup.add(finish);
    featureObjects.push(finish);

    stage.checkpoints.forEach((distance, index) => {
      const gate = createGate(stage, `CP ${index + 1}`, stage.accent, false);
      gate.userData.distance = distance;
      gate.userData.routeFeature = true;
      trackGroup.add(gate);
      featureObjects.push(gate);
    });

    stage.tunnels.forEach(([start, end]) => {
      for (let d = start; d <= end; d += 70) {
        const arch = createTunnelArch(stage);
        arch.userData.distance = d;
        arch.userData.routeFeature = true;
        trackGroup.add(arch);
        featureObjects.push(arch);
      }
      const sign = makeTextSign(stage.signs[0], "#ffdf55");
      sign.userData.distance = start + 70;
      sign.userData.routeFeature = true;
      sign.position.y = 6.4;
      trackGroup.add(sign);
      featureObjects.push(sign);
    });

    stage.signs.slice(1).forEach((text, index) => {
      const sign = makeTextSign(text, index === 1 ? "#00e5ff" : "#ffdf55");
      sign.userData.distance = stage.length * (.28 + index * .18);
      sign.userData.routeFeature = true;
      sign.position.y = 7;
      trackGroup.add(sign);
      featureObjects.push(sign);
    });
  }

  function createGate(stage, label, color, checker) {
    const g = new THREE.Group();
    const mat = makeMat(color, color);
    [-1, 1].forEach(side => {
      const post = new THREE.Mesh(new THREE.BoxGeometry(.7, 7, .7), mat);
      post.position.set(side * 11.2, 3.5, 0);
      g.add(post);
    });
    const top = new THREE.Mesh(new THREE.BoxGeometry(22.6, .7, .7), mat);
    top.position.y = 7;
    g.add(top);
    const sign = makeTextSign(label, checker ? "#ffffff" : "#ffdf55");
    sign.position.y = 8.2;
    g.add(sign);
    if (checker) {
      for (let x = -10; x <= 10; x += 2) {
        const block = new THREE.Mesh(new THREE.BoxGeometry(2, .12, 2), makeMat((x / 2) % 2 === 0 ? 0xffffff : 0x111111));
        block.position.set(x, .22, 0);
        g.add(block);
      }
    }
    return g;
  }

  function createTunnelArch(stage) {
    const g = new THREE.Group();
    const mat = makeMat(0x111019, stage.accent);
    [-1, 1].forEach(side => {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(1.8, 7, 5), mat);
      wall.position.set(side * 12, 3.5, 0);
      g.add(wall);
    });
    const roof = new THREE.Mesh(new THREE.BoxGeometry(24, 1.4, 5), mat);
    roof.position.y = 7.1;
    g.add(roof);
    const light = new THREE.PointLight(stage.accent, isMobile ? .45 : .85, 28);
    light.position.set(0, 5, 0);
    g.add(light);
    return g;
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
        race.lapProgress = 0;
        race.checkpointIndex = 0;
        race.lateral = 0;
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
    race.checkpointIndex = 0;
    race.totalProgress = 0;
    race.timer = 0;
    race.lapTimer = 0;
    race.bestLapThisRun = Infinity;
    race.speed = 0;
    race.lateral = 0;
    race.steerVel = 0;
    race.drift = 0;
    race.inTunnel = false;
    car.position.set(routeCenterAt(stages[stageIndex], 0), 1.05, 0);
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

    const stage = stages[race.stage];
    const roadHalf = routeWidthAt(stage, race.lapProgress) / 2 - 1.1;
    race.lateral += race.steerVel * 18 * dt + race.drift * 7 * dt;
    race.lateral = THREE.MathUtils.clamp(race.lateral, -roadHalf, roadHalf);
    car.position.x = routeCenterAt(stage, race.lapProgress) + race.lateral;
    car.rotation.z = THREE.MathUtils.lerp(car.rotation.z, -steerInput * .18 - race.drift * .08, 6 * dt);
    car.rotation.y = THREE.MathUtils.lerp(car.rotation.y, -race.steerVel * .35, 5 * dt);

    if (Math.abs(race.lateral) > roadHalf - .45 && race.speed > 35) {
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

    const tunnelNow = isInTunnel(stage, race.lapProgress);
    if (tunnelNow && !race.inTunnel) showRaceMessage(stage.features.find(f => f.includes("tunnel")) || "Tunnel");
    race.inTunnel = tunnelNow;

    while (race.checkpointIndex < stage.checkpoints.length && race.lapProgress >= stage.checkpoints[race.checkpointIndex]) {
      race.checkpointIndex += 1;
      audio.lap();
      showRaceMessage(`Checkpoint ${race.checkpointIndex} / ${stage.checkpoints.length}`);
    }

    if (race.lapProgress >= stage.length) {
      race.lapProgress -= stage.length;
      if (race.checkpointIndex >= stage.checkpoints.length) {
        race.bestLapThisRun = Math.min(race.bestLapThisRun, race.lapTimer);
        saveBestLap(race.stage, race.lapTimer);
        updateBestText();
        race.lapTimer = 0;
        race.checkpointIndex = 0;
        audio.lap();
        if (race.lap >= LAP_GOAL) {
          completeStage();
        } else {
          race.lap += 1;
          showRaceMessage(race.lap === LAP_GOAL ? "Final Lap" : `Lap ${race.lap}`);
        }
      } else {
        race.lapProgress = stage.length - 80;
        race.speed *= .55;
        audio.bump();
        showRaceMessage("Hit Checkpoints!");
      }
    }

    updateWorldScroll(distance);
    updateCarEffects(input, dt);
    updateCamera(dt);
    audio.updateEngine(race.speed, input.gas);
  }

  function updateWorldScroll(distance) {
    const stage = stages[race.stage];
    const visibleScale = .16;
    roadSegments.forEach(segment => {
      const routeDistance = (race.lapProgress + segment.userData.distance) % stage.length;
      const ahead = segment.userData.distance;
      const center = routeCenterAt(stage, routeDistance);
      const nextCenter = routeCenterAt(stage, routeDistance + 85);
      const width = routeWidthAt(stage, routeDistance);
      segment.position.set(center, 0, -ahead * visibleScale);
      segment.rotation.y = THREE.MathUtils.clamp((nextCenter - center) * .018, -.42, .42);
      segment.scale.x = width / 22;
      const inTunnel = isInTunnel(stage, routeDistance);
      segment.children.forEach(child => {
        if (child.material && child.material.emissive) child.material.emissiveIntensity = inTunnel ? .85 : .45;
      });
    });

    propGroup.children.forEach(obj => {
      const routeDistance = (race.lapProgress + obj.userData.distance) % stage.length;
      const rel = ((obj.userData.distance - race.lapProgress + stage.length) % stage.length);
      obj.position.z = -rel * visibleScale;
      obj.position.x = routeCenterAt(stage, routeDistance) + obj.userData.side * obj.userData.roadsideOffset;
      obj.visible = rel < 620;
    });

    featureObjects.forEach(obj => {
      const routeDistance = (race.lapProgress + obj.userData.distance) % stage.length;
      const rel = ((obj.userData.distance - race.lapProgress + stage.length) % stage.length);
      obj.position.z = -rel * visibleScale;
      obj.position.x = routeCenterAt(stage, routeDistance);
      obj.rotation.y = THREE.MathUtils.clamp((routeCenterAt(stage, routeDistance + 80) - routeCenterAt(stage, routeDistance)) * .018, -.42, .42);
      obj.visible = rel < 650 || rel > stage.length - 80;
    });

    const tunnel = isInTunnel(stage, race.lapProgress);
    scene.fog.near = tunnel ? 18 : 70;
    scene.fog.far = tunnel ? (isMobile ? 130 : 170) : (isMobile ? 260 : 360);
  }

  function updateCarEffects(input, dt) {
    wheelParts.forEach(w => { w.rotation.x += race.speed * dt * .12; });
    flame.material.opacity = THREE.MathUtils.lerp(flame.material.opacity, input.gas && race.speed > 25 ? .82 : 0, 8 * dt);
    flame.scale.setScalar(1 + Math.random() * .35);
  }

  function updateCamera(dt) {
    const stage = stages[race.stage];
    const tunnel = isInTunnel(stage, race.lapProgress);
    const shake = Math.max(0, race.speed - 120) / 120 * (isMobile ? .16 : .28);
    const aheadCenter = routeCenterAt(stage, race.lapProgress + 260);
    const target = new THREE.Vector3(
      THREE.MathUtils.lerp(car.position.x, aheadCenter, .32),
      (tunnel ? 9.5 : 16) + race.speed * (tunnel ? .007 : .015),
      (tunnel ? 15 : 23) + race.speed * (tunnel ? .012 : .025)
    );
    camera.position.lerp(target, 1 - Math.pow(.035, dt));
    camera.position.x += (Math.random() - .5) * shake;
    camera.position.y += (Math.random() - .5) * shake;
    camera.lookAt(aheadCenter, tunnel ? 1.6 : 1.2, -42);
  }

  function updateHud() {
    const stage = stages[race.stage];
    ui.hudStage.textContent = stages[race.stage].name;
    ui.hudLap.textContent = `${race.lap} / ${LAP_GOAL}`;
    ui.hudSpeed.textContent = `${Math.round(Math.max(0, race.speed))}`;
    ui.hudTimer.textContent = formatTime(race.timer);
    ui.hudBest.textContent = formatTime(getBestLap(race.stage));
    ui.checkpointText.textContent = `Checkpoint ${race.checkpointIndex} / ${stage.checkpoints.length}`;
    ui.progressFill.style.width = `${THREE.MathUtils.clamp(race.lapProgress / stage.length * 100, 0, 100)}%`;
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
