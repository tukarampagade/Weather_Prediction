/* =========================================================================
   WEATHER PREDICTION NEURAL NETWORK — presentation logic
   Sections: state, navigation, reveal system, per-slide effects,
   Three.js scenes (ambient / hero net / architecture net), bootstrap.
   ========================================================================= */
(function(){
  'use strict';

  /* ---------------------------------------------------------------------
     STATE
  --------------------------------------------------------------------- */
  var totalSlides = 6;
  var current = 1;
  var animating = false;
  var slideEls = Array.prototype.slice.call(document.querySelectorAll('.slide'));
  var slideNames = ['TITLE','THE PROBLEM','WORKFLOW','NEURAL NETWORK','PREDICTION','CONCLUSION'];

  var pointer = { x: 0, y: 0 };
  var smoothPointer = { x: 0, y: 0 };
  var mouseX = window.innerWidth / 2, mouseY = window.innerHeight / 2;
  var cgX = mouseX, cgY = mouseY;

  var bgScene, heroScene, mainScene;

  /* ---------------------------------------------------------------------
     NAVIGATION / SLIDE TRANSITIONS
  --------------------------------------------------------------------- */
  function buildNavDots(){
    var container = document.getElementById('nav-dots');
    for (var i = 1; i <= totalSlides; i++){
      (function(idx){
        var b = document.createElement('button');
        b.className = 'nav-dot' + (idx === 1 ? ' is-active' : '');
        b.type = 'button';
        b.setAttribute('aria-label', 'Go to slide ' + idx + ': ' + slideNames[idx-1]);
        b.addEventListener('click', function(){
          setSlide(idx, idx > current ? 1 : -1);
        });
        container.appendChild(b);
      })(i);
    }
  }

  function updateNav(){
    document.getElementById('counter-current').textContent = pad(current);
    document.getElementById('counter-total').textContent = pad(totalSlides);
    var dots = document.querySelectorAll('.nav-dot');
    for (var i = 0; i < dots.length; i++) dots[i].classList.toggle('is-active', i === current - 1);
    document.getElementById('prev-btn').disabled = current === 1;
    document.getElementById('next-btn').disabled = current === totalSlides;
  }

  function updateHud(){
    var el = document.getElementById('hud-slide-name');
    if (el) el.textContent = pad(current) + ' \u00B7 ' + slideNames[current - 1];
    document.body.setAttribute('data-active-slide', String(current));
  }

  function pad(n){ return n < 10 ? '0' + n : String(n); }

  function setSlide(targetIndex, dir){
    if (animating || targetIndex < 1 || targetIndex > totalSlides || targetIndex === current) return;
    animating = true;

    var outgoing = slideEls[current - 1];
    var incoming = slideEls[targetIndex - 1];
    var leavingIndex = current;

    incoming.classList.add('no-anim');
    incoming.classList.remove('pos-left', 'pos-right', 'is-current');
    incoming.classList.add(dir === 1 ? 'pos-right' : 'pos-left');
    void incoming.offsetWidth; /* force reflow so the jump above isn't animated */
    incoming.classList.remove('no-anim');

    requestAnimationFrame(function(){
      outgoing.classList.remove('is-current');
      outgoing.classList.add(dir === 1 ? 'pos-left' : 'pos-right');
      incoming.classList.remove('pos-left', 'pos-right');
      incoming.classList.add('is-current');
    });

    deactivateReveals(outgoing);
    stopSlideEffects(leavingIndex);

    current = targetIndex;
    updateNav();
    updateHud();

    setTimeout(function(){
      outgoing.classList.remove('pos-left', 'pos-right');
      animating = false;
    }, 820);

    setTimeout(function(){
      activateReveals(incoming);
      startSlideEffects(current);
    }, 70);
  }

  /* ---------------------------------------------------------------------
     REVEAL-ON-ENTER
  --------------------------------------------------------------------- */
  function activateReveals(slideEl){
    var els = slideEl.querySelectorAll('[data-reveal]');
    for (var i = 0; i < els.length; i++){
      (function(el){
        var order = parseFloat(el.getAttribute('data-reveal')) || 0;
        setTimeout(function(){ el.classList.add('is-visible'); }, 110 + order * 140);
      })(els[i]);
    }
  }
  function deactivateReveals(slideEl){
    var els = slideEl.querySelectorAll('[data-reveal]');
    for (var i = 0; i < els.length; i++) els[i].classList.remove('is-visible');
  }

  /* ---------------------------------------------------------------------
     PER-SLIDE EFFECTS
  --------------------------------------------------------------------- */
  function startSlideEffects(n){
    if (n === 2) startMiniFlow();
    if (n === 3) setTimeout(startPipeline, 260);
    if (n === 5) setTimeout(runPredict, 260);
  }
  function stopSlideEffects(n){
    if (n === 2) stopMiniFlow();
    if (n === 3) stopPipeline();
    if (n === 5) resetPredict();
  }

  /* ---- Slide 2: mini flow sweep ---- */
  var miniFlowInterval = null, miniFlowIdx = 0;
  function startMiniFlow(){
    var steps = document.querySelectorAll('.mini-flow-step');
    if (!steps.length) return;
    miniFlowIdx = 0;
    clearInterval(miniFlowInterval);
    miniFlowInterval = setInterval(function(){
      for (var i = 0; i < steps.length; i++) steps[i].classList.remove('is-lit');
      steps[miniFlowIdx].classList.add('is-lit');
      miniFlowIdx = (miniFlowIdx + 1) % steps.length;
    }, 1150);
  }
  function stopMiniFlow(){ clearInterval(miniFlowInterval); }

  function initOrbitSpokes(){
    var orbit = document.querySelector('.orbit');
    if (!orbit) return;
    var angles = [-90, -22, 52, 128, 202];
    angles.forEach(function(a){
      var el = document.createElement('div');
      el.className = 'spoke';
      el.style.transform = 'rotate(' + a + 'deg)';
      orbit.insertBefore(el, orbit.firstChild);
    });
  }

  /* ---- Slide 3: pipeline demo ---- */
  var pipelineInterval = null, pipelineIdx = 0;
  function startPipeline(){
    var stages = Array.prototype.slice.call(document.querySelectorAll('.stage'));
    var segs = Array.prototype.slice.call(document.querySelectorAll('.pipe-seg'));
    var dot = document.getElementById('data-particle');
    var track = document.getElementById('pipeline-track');
    if (!stages.length || !dot || !track) return;
    pipelineIdx = 0;
    clearInterval(pipelineInterval);

    function step(){
      stages.forEach(function(s, i){
        s.classList.toggle('is-active', i === pipelineIdx);
        s.classList.toggle('is-passed', i < pipelineIdx);
      });
      segs.forEach(function(seg, i){ seg.classList.toggle('is-lit', i < pipelineIdx); });
      var trackRect = track.getBoundingClientRect();
      var stageRect = stages[pipelineIdx].getBoundingClientRect();
      dot.style.left = (stageRect.left - trackRect.left + stageRect.width / 2 + track.scrollLeft) + 'px';
      pipelineIdx = (pipelineIdx + 1) % stages.length;
    }
    step();
    pipelineInterval = setInterval(step, 1550);
  }
  function stopPipeline(){
    clearInterval(pipelineInterval);
    document.querySelectorAll('.stage').forEach(function(s){ s.classList.remove('is-active', 'is-passed'); });
    document.querySelectorAll('.pipe-seg').forEach(function(s){ s.classList.remove('is-lit'); });
  }

  /* ---- Slide 5: demo prediction sequence ---- */
  var predictTimeouts = [];
  function resetPredict(){
    predictTimeouts.forEach(clearTimeout);
    predictTimeouts = [];
    var statusText = document.getElementById('process-status-text');
    var status = document.getElementById('process-status');
    var panel = document.getElementById('result-panel');
    var gaugeFill = document.getElementById('gauge-fill');
    var gaugeNum = document.getElementById('gauge-number');
    if (statusText) statusText.textContent = 'ANALYSING';
    if (status) { status.classList.remove('is-fading'); status.style.opacity = ''; }
    if (panel) panel.classList.remove('is-visible');
    if (gaugeFill) gaugeFill.style.strokeDashoffset = '540';
    if (gaugeNum) gaugeNum.textContent = '0';
  }
  function runPredict(){
    resetPredict();
    var statusText = document.getElementById('process-status-text');
    var status = document.getElementById('process-status');
    var panel = document.getElementById('result-panel');
    var gaugeFill = document.getElementById('gauge-fill');
    var gaugeNum = document.getElementById('gauge-number');
    var seq = ['ANALYSING', 'NEURAL NETWORK', 'CALCULATING PROBABILITY'];
    var delay = 550;

    seq.forEach(function(label, i){
      if (i === 0) return; /* already showing */
      predictTimeouts.push(setTimeout(function(){
        status.classList.add('is-fading');
        predictTimeouts.push(setTimeout(function(){
          statusText.textContent = label;
          status.classList.remove('is-fading');
        }, 260));
      }, delay));
      delay += 1150;
    });

    predictTimeouts.push(setTimeout(function(){
      status.classList.add('is-fading');
      panel.classList.add('is-visible');
      gaugeFill.style.strokeDashoffset = String(540 * (1 - 0.78));
      animateCount(gaugeNum, 78, 1100);
    }, delay + 350));
  }
  function animateCount(el, target, duration){
    var start = performance.now();
    function tick(now){
      var p = Math.min((now - start) / duration, 1);
      var eased = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(eased * target);
      if (p < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  /* ---------------------------------------------------------------------
     INPUT HANDLING
  --------------------------------------------------------------------- */
  function attachInputHandlers(){
    document.getElementById('prev-btn').addEventListener('click', function(){ setSlide(current - 1, -1); });
    document.getElementById('next-btn').addEventListener('click', function(){ setSlide(current + 1, 1); });
    document.getElementById('start-btn').addEventListener('click', function(){ setSlide(2, 1); });
    document.getElementById('restart-btn').addEventListener('click', function(){ setSlide(1, -1); });
    document.getElementById('fullscreen-btn').addEventListener('click', toggleFullscreen);

    window.addEventListener('keydown', function(e){
      if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' '){
        e.preventDefault(); setSlide(current + 1, 1);
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp'){
        e.preventDefault(); setSlide(current - 1, -1);
      }
    });

    var wheelLock = false;
    window.addEventListener('wheel', function(e){
      if (wheelLock) return;
      if (Math.abs(e.deltaY) < 26) return;
      wheelLock = true;
      if (e.deltaY > 0) setSlide(current + 1, 1); else setSlide(current - 1, -1);
      setTimeout(function(){ wheelLock = false; }, 950);
    }, { passive: true });

    var touchStartX = 0, touchStartY = 0, skipSwipe = false;
    window.addEventListener('touchstart', function(e){
      var t = e.touches[0];
      touchStartX = t.clientX; touchStartY = t.clientY;
      skipSwipe = !!(e.target.closest && e.target.closest('.pipeline-wrap'));
    }, { passive: true });
    window.addEventListener('touchend', function(e){
      if (skipSwipe) return;
      var t = e.changedTouches[0];
      var dx = t.clientX - touchStartX, dy = t.clientY - touchStartY;
      if (Math.abs(dx) > 56 && Math.abs(dx) > Math.abs(dy) * 1.3){
        if (dx < 0) setSlide(current + 1, 1); else setSlide(current - 1, -1);
      }
    }, { passive: true });

    window.addEventListener('mousemove', function(e){
      mouseX = e.clientX; mouseY = e.clientY;
      pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
      pointer.y = (e.clientY / window.innerHeight) * 2 - 1;
    });

    document.addEventListener('fullscreenchange', function(){
      var btn = document.getElementById('fullscreen-btn');
      var icon = btn.querySelector('.hud-btn-icon');
      icon.textContent = document.fullscreenElement ? '\u2715' : '\u2921';
    });
  }

  function toggleFullscreen(){
    if (!document.fullscreenElement){
      var el = document.documentElement;
      if (el.requestFullscreen) el.requestFullscreen().catch(function(){});
    } else {
      if (document.exitFullscreen) document.exitFullscreen();
    }
  }

  /* ---------------------------------------------------------------------
     THREE.JS — shared helper
  --------------------------------------------------------------------- */
  var _projVec = (typeof THREE !== 'undefined') ? new THREE.Vector3() : null;
  function worldToScreen(obj3D, camera, canvas){
    obj3D.getWorldPosition(_projVec);
    _projVec.project(camera);
    var rect = canvas.getBoundingClientRect();
    return {
      x: rect.left + (_projVec.x * 0.5 + 0.5) * rect.width,
      y: rect.top + (1 - (_projVec.y * 0.5 + 0.5)) * rect.height
    };
  }

  /* ---- Ambient background: dust + soft atmosphere spheres ---- */
  function initBgScene(){
    var canvas = document.getElementById('bg-canvas');
    var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 100);
    camera.position.z = 22;

    function resize(){
      var w = window.innerWidth, h = window.innerHeight;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    resize();
    window.addEventListener('resize', resize);

    var count = 240;
    var positions = new Float32Array(count * 3);
    for (var i = 0; i < count; i++){
      positions[i * 3] = (Math.random() - 0.5) * 46;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 30;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 26 - 6;
    }
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    var mat = new THREE.PointsMaterial({ color: 0x6fd8ea, size: 0.09, transparent: true, opacity: 0.5, sizeAttenuation: true });
    var points = new THREE.Points(geo, mat);
    scene.add(points);

    function makeGlowTexture(hex){
      var size = 256;
      var c = document.createElement('canvas');
      c.width = c.height = size;
      var ctx = c.getContext('2d');
      var col = '#' + hex.toString(16).padStart(6, '0');
      var grad = ctx.createRadialGradient(size/2, size/2, 0, size/2, size/2, size/2);
      grad.addColorStop(0, col);
      grad.addColorStop(0.35, col);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, size, size);
      var tex = new THREE.CanvasTexture(c);
      return tex;
    }

    var sphereGroup = new THREE.Group();
    var sphereDefs = [
      { r: 11, color: 0x4fd8e8, pos: [-9, 4, -14], op: 0.24 },
      { r: 13, color: 0x5b8ff9, pos: [10, -5, -18], op: 0.22 },
      { r: 8, color: 0xffb648, pos: [4, 7, -12], op: 0.14 }
    ];
    sphereDefs.forEach(function(d){
      var mat = new THREE.SpriteMaterial({
        map: makeGlowTexture(d.color),
        transparent: true,
        opacity: d.op,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      });
      var sprite = new THREE.Sprite(mat);
      sprite.scale.set(d.r, d.r, 1);
      sprite.position.set(d.pos[0], d.pos[1], d.pos[2]);
      sphereGroup.add(sprite);
    });
    scene.add(sphereGroup);

    var t = 0;
    function render(dt){
      t += dt;
      points.rotation.y += dt * 0.014;
      sphereGroup.children.forEach(function(m, i){ m.position.y += Math.sin(t * 0.3 + i) * 0.0022; });
      scene.rotation.y += (pointer.x * 0.045 - scene.rotation.y) * 0.02;
      scene.rotation.x += (-pointer.y * 0.03 - scene.rotation.x) * 0.02;
      renderer.render(scene, camera);
    }
    return { render: render };
  }

  /* ---- Slide 1: hero neural cluster with labelled input ring ---- */
  function initHeroNet(){
    var canvas = document.getElementById('hero-canvas');
    var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(46, 1, 0.1, 50);
    camera.position.set(0, 0, 7.2);

    var baseDistHero = 7.2;
    var halfFovHero = (46 * Math.PI / 180) / 2;
    var desiredHalfWidthHero = 2.55; /* input ring radius (2.15) plus node/halo margin */
    function sync(){
      var w = canvas.clientWidth || 1, h = canvas.clientHeight || 1;
      renderer.setSize(w, h, false);
      var aspect = w / h;
      camera.aspect = aspect;
      var neededDist = desiredHalfWidthHero / (Math.tan(halfFovHero) * aspect);
      camera.position.z = Math.max(baseDistHero, neededDist);
      camera.updateProjectionMatrix();
    }
    sync();
    if (window.ResizeObserver) new ResizeObserver(sync).observe(canvas);
    else window.addEventListener('resize', sync);

    var clusterGroup = new THREE.Group();
    scene.add(clusterGroup);

    var clusterNodes = [];
    var N = 11;
    for (var i = 0; i < N; i++){
      var phi = Math.acos(1 - 2 * (i + 0.5) / N);
      var theta = Math.PI * (1 + Math.sqrt(5)) * (i + 0.5);
      var r = 1.5;
      var x = r * Math.sin(phi) * Math.cos(theta);
      var y = r * Math.sin(phi) * Math.sin(theta);
      var z = r * Math.cos(phi) * 0.7 - 0.6;
      var geo = new THREE.IcosahedronGeometry(0.09, 0);
      var mat = new THREE.MeshBasicMaterial({ color: 0x4fd8e8 });
      var mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, y, z);
      clusterGroup.add(mesh);
      clusterNodes.push(mesh);
    }
    var lineMat = new THREE.LineBasicMaterial({ color: 0x4fd8e8, transparent: true, opacity: 0.22 });
    clusterNodes.forEach(function(n, i){
      var dists = clusterNodes.map(function(m, j){ return { j: j, d: i === j ? Infinity : n.position.distanceTo(m.position) }; }).sort(function(a, b){ return a.d - b.d; });
      for (var k = 0; k < 2; k++){
        var j = dists[k].j;
        if (j > i){
          var g = new THREE.BufferGeometry().setFromPoints([n.position, clusterNodes[j].position]);
          clusterGroup.add(new THREE.Line(g, lineMat));
        }
      }
    });

    var outputNode = new THREE.Mesh(new THREE.IcosahedronGeometry(0.16, 1), new THREE.MeshBasicMaterial({ color: 0xffb648 }));
    outputNode.position.set(0, 0, -2.1);
    scene.add(outputNode);
    var outHalo = new THREE.Mesh(new THREE.SphereGeometry(0.34, 16, 16), new THREE.MeshBasicMaterial({ color: 0xffb648, transparent: true, opacity: 0.25 }));
    outputNode.add(outHalo);
    clusterNodes.slice(0, 5).forEach(function(n){
      var g = new THREE.BufferGeometry().setFromPoints([n.position.clone(), new THREE.Vector3(0, 0, -2.1)]);
      scene.add(new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0xffb648, transparent: true, opacity: 0.15 })));
    });

    var inputKeys = ['temperature', 'humidity', 'pressure', 'wind', 'cloud'];
    var inputNodes = [];
    var ringR = 2.15;
    inputKeys.forEach(function(key, i){
      var angle = (-90 + i * 72) * Math.PI / 180;
      var x = Math.cos(angle) * ringR;
      var y = Math.sin(angle) * ringR;
      var color = i % 2 === 0 ? 0x4fd8e8 : 0x5b8ff9;
      var mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(0.13, 1), new THREE.MeshBasicMaterial({ color: color }));
      mesh.position.set(x, y, 0.9);
      mesh.userData.key = key;
      scene.add(mesh);
      var halo = new THREE.Mesh(new THREE.SphereGeometry(0.26, 16, 16), new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.22 }));
      mesh.add(halo);
      inputNodes.push(mesh);

      var dists = clusterNodes.map(function(m){ return { m: m, d: mesh.position.distanceTo(m.position) }; }).sort(function(a, b){ return a.d - b.d; });
      for (var k = 0; k < 2; k++){
        var g = new THREE.BufferGeometry().setFromPoints([mesh.position.clone(), dists[k].m.position.clone()]);
        scene.add(new THREE.Line(g, new THREE.LineBasicMaterial({ color: color, transparent: true, opacity: 0.2 })));
      }
    });

    var labelEls = {};
    inputKeys.forEach(function(k){ labelEls[k] = document.querySelector('.node-label[data-node="' + k + '"]'); });

    var t = 0;
    function render(dt, sp){
      t += dt;
      clusterGroup.rotation.y += dt * 0.18;
      clusterGroup.rotation.x = Math.sin(t * 0.25) * 0.12;
      outputNode.rotation.y += dt * 0.4;
      var pulse = 1 + Math.sin(t * 2) * 0.08;
      outHalo.scale.setScalar(pulse);

      camera.position.x += (sp.x * 0.5 - camera.position.x) * 0.05;
      camera.position.y += (-sp.y * 0.35 - camera.position.y) * 0.05;
      camera.lookAt(0, 0, 0);

      inputNodes.forEach(function(n){
        var s = worldToScreen(n, camera, canvas);
        var el = labelEls[n.userData.key];
        if (el) el.style.transform = 'translate3d(' + s.x + 'px, ' + s.y + 'px, 0) translate(-50%, -132%)';
      });

      renderer.render(scene, camera);
    }
    return { render: render };
  }

  /* ---- Slide 4: layered input -> hidden -> output architecture ---- */
  function initMainNet(){
    var canvas = document.getElementById('main-net-canvas');
    var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(42, 1, 0.1, 50);
    camera.position.set(0, 0, 9.4);

    var baseDist = 9.4;
    var halfFovMain = (42 * Math.PI / 180) / 2;
    var desiredHalfWidth = 4.35; /* input/output span (+-3.4) plus node + halo margin */
    function sync(){
      var w = canvas.clientWidth || 1, h = canvas.clientHeight || 1;
      renderer.setSize(w, h, false);
      var aspect = w / h;
      camera.aspect = aspect;
      var neededDist = desiredHalfWidth / (Math.tan(halfFovMain) * aspect);
      camera.position.z = Math.max(baseDist, neededDist);
      camera.updateProjectionMatrix();
    }
    sync();
    if (window.ResizeObserver) new ResizeObserver(sync).observe(canvas);
    else window.addEventListener('resize', sync);

    var group = new THREE.Group();
    scene.add(group);

    function makeNode(radius, color){
      var mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(radius, 1), new THREE.MeshBasicMaterial({ color: color }));
      var halo = new THREE.Mesh(new THREE.SphereGeometry(radius * 2, 16, 16), new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.18 }));
      mesh.add(halo);
      return mesh;
    }

    var inputCount = 5, hiddenCount = 6;
    var inputNodes = [], hiddenNodes = [];
    var spanIn = 3.0, spanHidden = 3.6;

    for (var i = 0; i < inputCount; i++){
      var y1 = (i - (inputCount - 1) / 2) * (spanIn / (inputCount - 1));
      var n1 = makeNode(0.15, 0x4fd8e8);
      n1.position.set(-3.4, y1, 0);
      group.add(n1); inputNodes.push(n1);
    }
    for (var j = 0; j < hiddenCount; j++){
      var y2 = (j - (hiddenCount - 1) / 2) * (spanHidden / (hiddenCount - 1));
      var n2 = makeNode(0.16, 0x5b8ff9);
      n2.position.set(0, y2, (j % 2 === 0 ? 0.35 : -0.35));
      group.add(n2); hiddenNodes.push(n2);
    }
    var outputNode = makeNode(0.22, 0xffb648);
    outputNode.position.set(3.4, 0, 0);
    group.add(outputNode);

    var signals = [];
    var lineMatIn = new THREE.LineBasicMaterial({ color: 0x4fd8e8, transparent: true, opacity: 0.15 });
    var lineMatOut = new THREE.LineBasicMaterial({ color: 0xffb648, transparent: true, opacity: 0.18 });
    var signalGeo = new THREE.SphereGeometry(0.045, 8, 8);

    inputNodes.forEach(function(inp){
      hiddenNodes.forEach(function(hid){
        var g = new THREE.BufferGeometry().setFromPoints([inp.position.clone(), hid.position.clone()]);
        group.add(new THREE.Line(g, lineMatIn));
        var sig = new THREE.Mesh(signalGeo, new THREE.MeshBasicMaterial({ color: 0x9be9f2 }));
        group.add(sig);
        signals.push({ from: inp.position, to: hid.position, mesh: sig, dur: 1.1 + Math.random() * 0.6, t0: Math.random() * 2 });
      });
    });
    hiddenNodes.forEach(function(hid){
      var g = new THREE.BufferGeometry().setFromPoints([hid.position.clone(), outputNode.position.clone()]);
      group.add(new THREE.Line(g, lineMatOut));
      var sig = new THREE.Mesh(signalGeo, new THREE.MeshBasicMaterial({ color: 0xffd39a }));
      group.add(sig);
      signals.push({ from: hid.position, to: outputNode.position, mesh: sig, dur: 1.3 + Math.random() * 0.5, t0: Math.random() * 2 });
    });

    var labelEls = [0, 1, 2, 3, 4].map(function(i){ return document.querySelector('.net-input-label[data-node="' + i + '"]'); });

    var clock = 0;
    var tmp = new THREE.Vector3();
    function render(dt, sp){
      clock += dt;
      group.rotation.y = Math.sin(clock * 0.18) * 0.1;
      hiddenNodes.forEach(function(n){ n.rotation.y += dt * 0.6; n.rotation.x += dt * 0.2; });
      outputNode.rotation.y += dt * 0.5;
      outputNode.scale.setScalar(1 + Math.sin(clock * 2.2) * 0.1);

      signals.forEach(function(s){
        var p = ((clock + s.t0) % s.dur) / s.dur;
        tmp.copy(s.from).lerp(s.to, p);
        s.mesh.position.copy(tmp);
      });

      camera.position.x += (sp.x * 0.55 - camera.position.x) * 0.05;
      camera.position.y += (-sp.y * 0.38 - camera.position.y) * 0.05;
      camera.lookAt(0, 0, 0);

      inputNodes.forEach(function(n, i){
        var s2 = worldToScreen(n, camera, canvas);
        var el = labelEls[i];
        if (el) el.style.transform = 'translate3d(' + s2.x + 'px, ' + s2.y + 'px, 0) translate(-108%, -50%)';
      });

      renderer.render(scene, camera);
    }
    return { render: render };
  }

  /* ---------------------------------------------------------------------
     MAIN LOOP
  --------------------------------------------------------------------- */
  var lastTime = performance.now();
  function animate(now){
    var dt = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;

    smoothPointer.x += (pointer.x - smoothPointer.x) * 0.06;
    smoothPointer.y += (pointer.y - smoothPointer.y) * 0.06;

    if (bgScene) bgScene.render(dt);
    if (current === 1 && heroScene) heroScene.render(dt, smoothPointer);
    if (current === 4 && mainScene) mainScene.render(dt, smoothPointer);

    cgX += (mouseX - cgX) * 0.16;
    cgY += (mouseY - cgY) * 0.16;
    var cursorEl = document.getElementById('cursor-glow');
    if (cursorEl) cursorEl.style.transform = 'translate3d(' + cgX + 'px, ' + cgY + 'px, 0) translate(-50%, -50%)';

    requestAnimationFrame(animate);
  }

  /* ---------------------------------------------------------------------
     BOOTSTRAP
  --------------------------------------------------------------------- */
  function init(){
    buildNavDots();
    updateNav();
    updateHud();
    initOrbitSpokes();
    attachInputHandlers();

    if (typeof THREE !== 'undefined'){
      bgScene = initBgScene();
      heroScene = initHeroNet();
      mainScene = initMainNet();
    }

    slideEls[0].classList.add('is-current');
    requestAnimationFrame(animate);

    setTimeout(function(){
      var loader = document.getElementById('loader');
      if (loader) loader.classList.add('is-hidden');
      activateReveals(slideEls[0]);
      startSlideEffects(1);
    }, 650);
  }

  if (document.readyState === 'complete') init();
  else window.addEventListener('load', init);

})();
