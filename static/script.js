/* ============================================================================
   WeatherNet AI — script.js
   Vanilla ES6, no framework. Organized into small, focused modules that each
   own one concern (theme, clock, form, history, deck, search, accordion,
   clipboard, toasts, image fallback). Every module exposes an init() and is
   bootstrapped once, on DOMContentLoaded, at the bottom of this file.

   IMPORTANT: this file never predicts anything. The rain prediction always
   comes from the Flask backend via a normal POST to /predict — JavaScript
   here only handles UI behaviour: validation, loading states, timing display,
   local history, theme, navigation, the slide deck, search and clipboard.
   ============================================================================ */

'use strict';

/* ---------------------------------- ToastManager ---------------------------------- */
/* A small reusable toast system used by several other modules below. */
const ToastManager = {
  container: null,

  init() {
    this.container = document.getElementById('toastContainer');
  },

  show(message) {
    if (!this.container) this.container = document.getElementById('toastContainer');
    if (!this.container) return;

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.setAttribute('role', 'status');

    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    icon.setAttribute('class', 'icon');
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', '#icon-check');
    icon.appendChild(use);

    const text = document.createElement('span');
    text.textContent = message;

    toast.appendChild(icon);
    toast.appendChild(text);
    this.container.appendChild(toast);

    window.setTimeout(() => {
      toast.classList.add('is-leaving');
      toast.addEventListener('animationend', () => toast.remove(), { once: true });
      // Fallback removal in case animationend doesn't fire (e.g. reduced motion).
      window.setTimeout(() => toast.remove(), 400);
    }, 2600);
  },
};

/* ---------------------------------- ThemeManager ---------------------------------- */
const ThemeManager = {
  STORAGE_KEY: 'weatherNetTheme',
  toggleBtn: null,

  init() {
    this.toggleBtn = document.getElementById('themeToggle');
    const saved = this._readSaved();
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    this.apply(saved || (prefersDark ? 'dark' : 'light'), false);

    if (this.toggleBtn) {
      this.toggleBtn.addEventListener('click', () => {
        const current = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
        this.apply(current === 'dark' ? 'light' : 'dark', true);
      });
    }
  },

  _readSaved() {
    try {
      return localStorage.getItem(this.STORAGE_KEY);
    } catch (err) {
      return null;
    }
  },

  apply(theme, announce) {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.setAttribute('data-theme', 'dark');
    } else {
      root.removeAttribute('data-theme');
    }

    if (this.toggleBtn) {
      this.toggleBtn.setAttribute('aria-pressed', theme === 'dark' ? 'true' : 'false');
      this.toggleBtn.setAttribute('aria-label', theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
    }

    try {
      localStorage.setItem(this.STORAGE_KEY, theme);
    } catch (err) {
      /* localStorage unavailable — theme just won't persist across visits */
    }

    if (announce) ToastManager.show(`Theme switched to ${theme} mode`);
  },
};

/* ---------------------------------- ClockManager ---------------------------------- */
const ClockManager = {
  el: null,
  timer: null,

  init() {
    this.el = document.getElementById('liveClock');
    if (!this.el) return;
    this._tick();
    this.timer = window.setInterval(() => this._tick(), 1000);
  },

  _tick() {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    this.el.textContent = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  },
};

/* ---------------------------------- NavigationManager ---------------------------------- */
/* Mobile hamburger menu, the docs sidebar's mobile toggle, and lightweight
   scroll-spy highlighting for in-page section links. */
const NavigationManager = {
  init() {
    this._initMobileMenu();
    this._initSidebarToggle();
    this._initScrollSpy();
  },

  _initMobileMenu() {
    const toggle = document.getElementById('navToggle');
    const links = document.getElementById('navLinks');
    if (!toggle || !links) return;

    toggle.addEventListener('click', () => {
      const isOpen = links.classList.toggle('is-open');
      toggle.setAttribute('aria-expanded', String(isOpen));
    });

    links.querySelectorAll('a').forEach((link) => {
      link.addEventListener('click', () => {
        links.classList.remove('is-open');
        toggle.setAttribute('aria-expanded', 'false');
      });
    });
  },

  _initSidebarToggle() {
    const toggle = document.getElementById('sidebarToggle');
    const sidebar = document.getElementById('docsSidebar');
    if (!toggle || !sidebar) return;

    toggle.addEventListener('click', () => {
      const isOpen = sidebar.classList.toggle('is-open');
      toggle.setAttribute('aria-expanded', String(isOpen));
    });

    sidebar.querySelectorAll('a').forEach((link) => {
      link.addEventListener('click', () => {
        sidebar.classList.remove('is-open');
        toggle.setAttribute('aria-expanded', 'false');
      });
    });
  },

  _initScrollSpy() {
    if (!('IntersectionObserver' in window)) return;

    const links = Array.from(document.querySelectorAll('a[data-scroll-link]'));
    const pairs = links
      .map((link) => {
        const id = (link.getAttribute('href') || '').split('#')[1];
        const section = id ? document.getElementById(id) : null;
        return section ? { link, section } : null;
      })
      .filter(Boolean);

    if (!pairs.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const match = pairs.find((pair) => pair.section === entry.target);
          if (!match) return;
          pairs.forEach((pair) => pair.link.classList.remove('active'));
          match.link.classList.add('active');
        });
      },
      { rootMargin: '-35% 0px -55% 0px', threshold: 0 }
    );

    pairs.forEach((pair) => observer.observe(pair.section));
  },
};

/* ---------------------------------- PredictionFormManager ---------------------------------- */
/* Client-side UX only: inline validation, sample data, reset, loading state,
   and a client-measured request timer. The Flask server remains the sole
   authority on both validation and the prediction itself. */
const PredictionFormManager = {
  TIMER_KEY: 'wn_predict_start',
  form: null,
  submitBtn: null,

  RANGES: {
    Temperature: { min: -50, max: 60 },
    Humidity: { min: 0, max: 100 },
    Pressure: { min: 800, max: 1100 },
    WindSpeed: { min: 0, max: 200 },
    CloudCover: { min: 0, max: 100 },
  },

  SAMPLE_DATA: { Temperature: 25, Humidity: 65, Pressure: 1012, WindSpeed: 12, CloudCover: 55 },

  init() {
    this._renderClientRequestTime();

    this.form = document.getElementById('predictForm');
    if (!this.form) return;

    this.submitBtn = document.getElementById('submitBtn');

    this.form.querySelectorAll('input[type="number"]').forEach((input) => {
      input.addEventListener('input', () => this._validateField(input));
      input.addEventListener('blur', () => this._validateField(input));
    });

    const fillBtn = document.getElementById('fillSampleBtn');
    if (fillBtn) fillBtn.addEventListener('click', () => this._fillSample());

    const resetBtn = document.getElementById('resetBtn');
    if (resetBtn) resetBtn.addEventListener('click', () => this._handleReset());

    this.form.addEventListener('submit', (event) => this._handleSubmit(event));
  },

  _validateField(input) {
    const field = input.closest('.field');
    const rules = this.RANGES[input.name];
    const value = parseFloat(input.value);
    const errorEl = document.getElementById(`err-${input.name}`);
    let message = '';

    if (input.value.trim() === '' || Number.isNaN(value)) {
      message = 'This field is required.';
    } else if (rules && (value < rules.min || value > rules.max)) {
      message = `Must be between ${rules.min} and ${rules.max}.`;
    }

    if (field) field.classList.toggle('has-error', Boolean(message));
    if (errorEl) errorEl.textContent = message;
    return !message;
  },

  _fillSample() {
    Object.entries(this.SAMPLE_DATA).forEach(([name, value]) => {
      const input = this.form.elements.namedItem(name);
      if (input) {
        input.value = value;
        this._validateField(input);
      }
    });
    ToastManager.show('Sample atmospheric data loaded');
  },

  _handleReset() {
    // The reset button already restores the values Jinja rendered into the
    // form; this just clears validation state once that reset has applied.
    window.requestAnimationFrame(() => {
      this.form.querySelectorAll('.field').forEach((field) => field.classList.remove('has-error'));
      this.form.querySelectorAll('.field-error').forEach((el) => {
        el.textContent = '';
      });
    });
    ToastManager.show('Form reset to defaults');
  },

  _handleSubmit(event) {
    const inputs = Array.from(this.form.querySelectorAll('input[type="number"]'));
    const allValid = inputs.map((input) => this._validateField(input)).every(Boolean);

    if (!allValid) {
      event.preventDefault();
      ToastManager.show('Please correct the highlighted fields');
      return;
    }

    try {
      localStorage.setItem(this.TIMER_KEY, String(Date.now()));
    } catch (err) {
      /* localStorage unavailable — Client Request Time just won't be shown */
    }

    HistoryManager.record({
      Temperature: this.form.Temperature.value,
      Humidity: this.form.Humidity.value,
      Pressure: this.form.Pressure.value,
      WindSpeed: this.form.WindSpeed.value,
      CloudCover: this.form.CloudCover.value,
    });

    if (this.submitBtn) {
      this.submitBtn.classList.add('is-loading');
      this.submitBtn.disabled = true;
      const label = this.submitBtn.querySelector('.btn-label');
      if (label) label.textContent = 'Analyzing Atmosphere...';
    }

    // Intentionally no event.preventDefault() here — the browser proceeds
    // to POST /predict exactly as it would without this script.
  },

  _renderClientRequestTime() {
    const target = document.getElementById('clientRequestTime');
    let startedAt = null;

    try {
      startedAt = localStorage.getItem(this.TIMER_KEY);
      localStorage.removeItem(this.TIMER_KEY);
    } catch (err) {
      /* localStorage unavailable */
    }

    if (!target) return;

    const hasPrediction = document.body.dataset.hasPrediction === 'true';
    if (!hasPrediction) return;

    if (startedAt) {
      const elapsed = Math.max(Date.now() - Number(startedAt), 0);
      target.textContent = `${elapsed} ms`;
    } else {
      target.textContent = 'Not measured this session';
    }
  },
};

/* ---------------------------------- WeatherWidgetManager ---------------------------------- */
/* "Today's Weather" live city-search widget. Calls the Flask GET /weather
   endpoint (which keeps WEATHER_API_KEY server-side), renders loading /
   error / success states, remembers recently searched cities locally,
   supports "Use my location" via browser geolocation, and can push the
   live reading into the existing prediction form on request. It never
   auto-fills the form or runs a prediction on its own. */
const WeatherWidgetManager = {
  RECENT_KEY: 'wn_recentCities',
  MAX_RECENT: 6,

  ICON_MAP: {
    '01': 'icon-sun', '02': 'icon-cloud', '03': 'icon-cloud', '04': 'icon-cloud',
    '09': 'icon-rain', '10': 'icon-rain', '11': 'icon-rain',
    '13': 'icon-cloud', '50': 'icon-cloud',
  },

  lastReading: null,

  init() {
    this.form = document.getElementById('weatherSearchForm');
    if (!this.form) return;

    this.cityInput = document.getElementById('cityInput');
    this.getWeatherBtn = document.getElementById('getWeatherBtn');
    this.useLocationBtn = document.getElementById('useLocationBtn');
    this.searchError = document.getElementById('weatherSearchError');
    this.chipsWrap = document.getElementById('recentCitiesChips');
    this.recentList = document.getElementById('recentCitiesList');

    this.stateEls = {
      empty: document.getElementById('weatherEmpty'),
      loading: document.getElementById('weatherLoading'),
      error: document.getElementById('weatherErrorState'),
      success: document.getElementById('weatherSuccess'),
    };
    this.errorMessageEl = document.getElementById('weatherErrorMessage');

    this.form.addEventListener('submit', (event) => {
      event.preventDefault();
      const city = this.cityInput.value.trim();
      if (!city) {
        this._showSearchError('Please enter a city name.');
        return;
      }
      this._showSearchError('');
      this._fetchByCity(city);
    });

    if (this.useLocationBtn) {
      this.useLocationBtn.addEventListener('click', () => this._useMyLocation());
    }

    const useForPredictionBtn = document.getElementById('useWeatherForPredictionBtn');
    if (useForPredictionBtn) {
      useForPredictionBtn.addEventListener('click', () => this._applyToPredictionForm());
    }

    this._renderRecentCities();
  },

  _showSearchError(message) {
    if (this.searchError) this.searchError.textContent = message;
  },

  _setLoading(isLoading) {
    if (isLoading) {
      this._showState('loading');
      if (this.getWeatherBtn) {
        this.getWeatherBtn.classList.add('is-loading');
        this.getWeatherBtn.disabled = true;
      }
    } else if (this.getWeatherBtn) {
      this.getWeatherBtn.classList.remove('is-loading');
      this.getWeatherBtn.disabled = false;
    }
  },

  _showState(name) {
    Object.entries(this.stateEls).forEach(([key, el]) => {
      if (el) el.hidden = key !== name;
    });
  },

  async _fetchByCity(city) {
    this._setLoading(true);
    try {
      const response = await fetch(`/weather?city=${encodeURIComponent(city)}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not fetch weather for that city.');
      this._renderSuccess(data);
      this._rememberCity(data.city || city);
    } catch (err) {
      this._renderError(err.message || 'Something went wrong while fetching the weather.');
    } finally {
      this._setLoading(false);
    }
  },

  async _fetchByCoords(lat, lon) {
    this._setLoading(true);
    try {
      const response = await fetch(`/weather?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not fetch weather for your location.');
      this._renderSuccess(data);
      if (data.city) {
        this.cityInput.value = data.city;
        this._rememberCity(data.city);
      }
    } catch (err) {
      this._renderError(err.message || 'Something went wrong while fetching the weather.');
    } finally {
      this._setLoading(false);
    }
  },

  _useMyLocation() {
    if (!('geolocation' in navigator)) {
      this._renderError('Geolocation is not supported by this browser.');
      return;
    }
    this._setLoading(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        // Coordinates are used only for this one lookup and are not stored.
        this._fetchByCoords(position.coords.latitude, position.coords.longitude);
      },
      () => {
        this._setLoading(false);
        this._renderError('Location permission was denied or is unavailable. Try searching by city name instead.');
      },
      { timeout: 10000 }
    );
  },

  _renderError(message) {
    this._showState('error');
    if (this.errorMessageEl) this.errorMessageEl.textContent = message;
  },

  _renderSuccess(reading) {
    this.lastReading = reading;
    this._showState('success');

    const locationEl = document.getElementById('weatherLocation');
    if (locationEl) {
      locationEl.textContent = reading.country ? `${reading.city}, ${reading.country}` : reading.city;
    }

    const updatedEl = document.getElementById('weatherUpdated');
    if (updatedEl) {
      updatedEl.textContent = reading.last_updated_unix
        ? `Updated ${new Date(reading.last_updated_unix * 1000).toLocaleTimeString()}`
        : 'Updated now';
    }

    const iconUse = document.querySelector('#weatherConditionIcon use');
    if (iconUse) {
      const prefix = (reading.icon || '01').slice(0, 2);
      iconUse.setAttribute('href', `#${this.ICON_MAP[prefix] || 'icon-sun'}`);
    }

    this._setText('weatherTemp', `${reading.temperature_c}°C`);
    this._setText('weatherCondition', reading.description || reading.condition || '—');
    this._setText('weatherFeelsLike', `Feels like ${reading.feels_like_c}°C`);
    this._setText('weatherHumidity', `${reading.humidity_pct}%`);
    this._setText('weatherWind', `${reading.wind_speed_kmh} km/h`);
    this._setText('weatherPressure', `${reading.pressure_hpa} hPa`);
    this._setText('weatherCloud', `${reading.cloud_cover_pct}%`);

    const visibilityStat = document.getElementById('weatherVisibilityStat');
    if (visibilityStat) {
      const hasVisibility = reading.visibility_km !== null && reading.visibility_km !== undefined;
      visibilityStat.hidden = !hasVisibility;
      if (hasVisibility) this._setText('weatherVisibility', `${reading.visibility_km} km`);
    }
  },

  _setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  },

  _applyToPredictionForm() {
    if (!this.lastReading) return;
    const form = document.getElementById('predictForm');
    if (!form) return;

    const mapping = {
      Temperature: this.lastReading.temperature_c,
      Humidity: this.lastReading.humidity_pct,
      Pressure: this.lastReading.pressure_hpa,
      WindSpeed: this.lastReading.wind_speed_kmh,
      CloudCover: this.lastReading.cloud_cover_pct,
    };

    let appliedCount = 0;
    Object.entries(mapping).forEach(([name, value]) => {
      const input = form.elements.namedItem(name);
      if (input && value !== null && value !== undefined && !Number.isNaN(Number(value))) {
        input.value = value;
        PredictionFormManager._validateField(input);
        appliedCount += 1;
      }
    });

    const badge = document.getElementById('liveDataBadge');
    if (badge) badge.hidden = appliedCount === 0;

    if (appliedCount > 0) {
      ToastManager.show('Live weather values loaded into the prediction form');
      const predictSection = document.getElementById('predict');
      if (predictSection) predictSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      ToastManager.show('Live weather data was incomplete — please review the form manually');
    }
  },

  _rememberCity(city) {
    if (!city) return;
    const recents = this._readRecent().filter((c) => c.toLowerCase() !== city.toLowerCase());
    recents.unshift(city);
    this._writeRecent(recents.slice(0, this.MAX_RECENT));
    this._renderRecentCities();
  },

  _readRecent() {
    try {
      const raw = localStorage.getItem(this.RECENT_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (err) {
      return [];
    }
  },

  _writeRecent(cities) {
    try {
      localStorage.setItem(this.RECENT_KEY, JSON.stringify(cities));
    } catch (err) {
      /* localStorage unavailable — recent cities just won't persist */
    }
  },

  _renderRecentCities() {
    const cities = this._readRecent();

    if (this.recentList) {
      this.recentList.innerHTML = '';
      cities.forEach((city) => {
        const option = document.createElement('option');
        option.value = city;
        this.recentList.appendChild(option);
      });
    }

    if (this.chipsWrap) {
      this.chipsWrap.innerHTML = '';
      cities.forEach((city) => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'chip';
        chip.textContent = city;
        chip.addEventListener('click', () => {
          this.cityInput.value = city;
          this._fetchByCity(city);
        });
        this.chipsWrap.appendChild(chip);
      });
    }
  },
};

/* ---------------------------------- GaugeAnimator ---------------------------------- */
/* Animates the probability gauge from empty to its real value on page load. */
const GaugeAnimator = {
  init() {
    const circle = document.querySelector('.gauge-fill');
    if (!circle || circle.dataset.targetOffset === undefined) return;

    const target = circle.dataset.targetOffset;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        circle.style.strokeDashoffset = target;
      });
    });
  },
};

/* ---------------------------------- HistoryManager ---------------------------------- */
const HistoryManager = {
  STORAGE_KEY: 'weatherNetPredictionHistory',
  MAX_ENTRIES: 5,
  listEl: null,

  init() {
    this.listEl = document.getElementById('historyList');
    const clearBtn = document.getElementById('clearHistoryBtn');
    if (clearBtn) clearBtn.addEventListener('click', () => this.clear());
    this.render();
  },

  _read() {
    try {
      const raw = localStorage.getItem(this.STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (err) {
      return [];
    }
  },

  _write(entries) {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(entries));
    } catch (err) {
      /* localStorage unavailable — history just won't persist */
    }
  },

  record(inputs) {
    const entries = this._read();
    entries.unshift({ ...inputs, timestamp: new Date().toLocaleString() });
    this._write(entries.slice(0, this.MAX_ENTRIES));
    this.render();
  },

  clear() {
    try {
      localStorage.removeItem(this.STORAGE_KEY);
    } catch (err) {
      /* ignore */
    }
    this.render();
    ToastManager.show('Prediction history cleared');
  },

  render() {
    if (!this.listEl) return;
    const entries = this._read();
    this.listEl.innerHTML = '';

    if (!entries.length) {
      const li = document.createElement('li');
      li.className = 'history-empty';
      li.textContent = 'No predictions yet — run one above to see it appear here.';
      this.listEl.appendChild(li);
      return;
    }

    entries.forEach((entry) => {
      const li = document.createElement('li');

      const summary = document.createElement('span');
      summary.className = 'history-summary';
      summary.textContent =
        `T:${entry.Temperature}\u00B0C  H:${entry.Humidity}%  ` +
        `P:${entry.Pressure}hPa  W:${entry.WindSpeed}km/h  C:${entry.CloudCover}%`;

      const time = document.createElement('span');
      time.className = 'history-time';
      time.textContent = entry.timestamp;

      li.appendChild(summary);
      li.appendChild(time);
      this.listEl.appendChild(li);
    });
  },
};

/* ---------------------------------- SlideDeck ---------------------------------- */
const SlideDeck = {
  AUTOPLAY_MS: 6000,
  root: null,
  viewport: null,
  slides: [],
  dots: [],
  index: 0,
  timer: null,
  playing: false,
  wasPlayingBeforePause: false,

  init() {
    this.root = document.getElementById('slideDeck');
    if (!this.root) return;

    this.viewport = this.root.querySelector('.deck-viewport');
    this.slides = Array.from(this.root.querySelectorAll('.slide'));
    this.dotsContainer = document.getElementById('deckDots');
    this.progressFill = document.getElementById('deckProgressFill');
    this.counterEl = document.getElementById('deckCounter');
    this.prevBtn = document.getElementById('deckPrev');
    this.nextBtn = document.getElementById('deckNext');
    this.playBtn = document.getElementById('deckPlay');

    if (!this.slides.length) return;

    this._buildDots();
    this._bindControls();
    this._bindKeyboard();
    this._bindSwipe();
    this._bindPauseTriggers();
    this.goTo(0);
  },

  _buildDots() {
    if (!this.dotsContainer) return;
    this.dotsContainer.innerHTML = '';
    this.dots = [];

    this.slides.forEach((_, i) => {
      const dot = document.createElement('button');
      dot.type = 'button';
      dot.className = 'deck-dot';
      dot.setAttribute('role', 'tab');
      dot.setAttribute('aria-label', `Go to slide ${i + 1}`);
      dot.addEventListener('click', () => this.goTo(i));
      this.dotsContainer.appendChild(dot);
      this.dots.push(dot);
    });
  },

  _bindControls() {
    if (this.prevBtn) this.prevBtn.addEventListener('click', () => this.prev());
    if (this.nextBtn) this.nextBtn.addEventListener('click', () => this.next());
    if (this.playBtn) this.playBtn.addEventListener('click', () => this.toggleAutoplay());
  },

  _bindKeyboard() {
    this.root.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        this.prev();
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        this.next();
      }
    });
  },

  _bindSwipe() {
    let startX = 0;
    let tracking = false;

    this.viewport.addEventListener(
      'touchstart',
      (event) => {
        startX = event.touches[0].clientX;
        tracking = true;
      },
      { passive: true }
    );

    this.viewport.addEventListener('touchend', (event) => {
      if (!tracking) return;
      tracking = false;
      const deltaX = event.changedTouches[0].clientX - startX;
      if (Math.abs(deltaX) < 40) return;
      if (deltaX < 0) this.next();
      else this.prev();
    });
  },

  _bindPauseTriggers() {
    this.root.addEventListener('mouseenter', () => this._pauseForInteraction());
    this.root.addEventListener('mouseleave', () => this._resumeIfNeeded());
    this.root.addEventListener('focusin', () => this._pauseForInteraction());
    this.root.addEventListener('focusout', () => this._resumeIfNeeded());
  },

  _pauseForInteraction() {
    this.wasPlayingBeforePause = this.playing;
    this._stopTimer();
  },

  _resumeIfNeeded() {
    if (this.wasPlayingBeforePause) this._startTimer();
  },

  goTo(index) {
    this.index = (index + this.slides.length) % this.slides.length;
    this.slides.forEach((slide, i) => slide.classList.toggle('is-active', i === this.index));
    this.dots.forEach((dot, i) => dot.classList.toggle('is-active', i === this.index));
    if (this.progressFill) {
      this.progressFill.style.width = `${((this.index + 1) / this.slides.length) * 100}%`;
    }
    if (this.counterEl) {
      this.counterEl.textContent = `${this.index + 1} / ${this.slides.length}`;
    }
  },

  next() {
    this.goTo(this.index + 1);
  },

  prev() {
    this.goTo(this.index - 1);
  },

  toggleAutoplay() {
    if (this.playing) this._stopTimer();
    else this._startTimer();
  },

  _startTimer() {
    if (this.timer) window.clearInterval(this.timer);
    this.playing = true;
    this.wasPlayingBeforePause = true;
    if (this.playBtn) this.playBtn.setAttribute('aria-pressed', 'true');
    this.timer = window.setInterval(() => this.next(), this.AUTOPLAY_MS);
  },

  _stopTimer() {
    this.playing = false;
    if (this.playBtn) this.playBtn.setAttribute('aria-pressed', 'false');
    if (this.timer) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
  },
};

/* ---------------------------------- AccordionManager ---------------------------------- */
const AccordionManager = {
  triggers: [],

  init() {
    const container = document.getElementById('vivaAccordion');
    if (!container) return;

    this.triggers = Array.from(container.querySelectorAll('.accordion-trigger'));
    this.triggers.forEach((trigger) => {
      trigger.addEventListener('click', () => this.toggle(trigger));
    });

    const expandBtn = document.getElementById('expandAllBtn');
    const collapseBtn = document.getElementById('collapseAllBtn');
    if (expandBtn) expandBtn.addEventListener('click', () => this.setAll(true));
    if (collapseBtn) collapseBtn.addEventListener('click', () => this.setAll(false));
  },

  toggle(trigger) {
    const isOpen = trigger.getAttribute('aria-expanded') === 'true';
    this._setState(trigger, !isOpen);
  },

  setAll(open) {
    this.triggers.forEach((trigger) => {
      const item = trigger.closest('.accordion-item');
      if (item && item.hidden) return; // leave search-hidden items untouched
      this._setState(trigger, open);
    });
  },

  _setState(trigger, open) {
    const panel = document.getElementById(trigger.getAttribute('aria-controls'));
    trigger.setAttribute('aria-expanded', String(open));
    if (panel) panel.hidden = !open;
  },
};

/* ---------------------------------- VivaSearch ---------------------------------- */
const VivaSearch = {
  init() {
    const input = document.getElementById('vivaSearch');
    const accordion = document.getElementById('vivaAccordion');
    const noResults = document.getElementById('vivaNoResults');
    if (!input || !accordion) return;

    const items = Array.from(accordion.querySelectorAll('.accordion-item'));

    input.addEventListener('input', () => {
      const query = input.value.trim().toLowerCase();
      let visibleCount = 0;

      items.forEach((item) => {
        const haystack = (item.dataset.search || item.textContent).toLowerCase();
        const matches = query === '' || haystack.includes(query);
        item.hidden = !matches;
        if (matches) visibleCount += 1;
      });

      if (noResults) noResults.hidden = visibleCount !== 0;
    });
  },
};

/* ---------------------------------- SyllabusSearch ---------------------------------- */
/* A small, focused helper for the syllabus mapping table's live search. */
const SyllabusSearch = {
  init() {
    const input = document.getElementById('syllabusSearch');
    const table = document.getElementById('syllabusTable');
    const noResults = document.getElementById('syllabusNoResults');
    if (!input || !table) return;

    const rows = Array.from(table.querySelectorAll('tbody tr'));

    input.addEventListener('input', () => {
      const query = input.value.trim().toLowerCase();
      let visibleCount = 0;

      rows.forEach((row) => {
        const matches = query === '' || row.textContent.toLowerCase().includes(query);
        row.hidden = !matches;
        if (matches) visibleCount += 1;
      });

      if (noResults) noResults.hidden = visibleCount !== 0;
    });
  },
};

/* ---------------------------------- ClipboardManager ---------------------------------- */
const ClipboardManager = {
  init() {
    document.querySelectorAll('.copy-btn').forEach((btn) => {
      btn.addEventListener('click', () => this._copy(btn));
    });
  },

  _copy(btn) {
    const block = btn.closest('.code-block');
    const codeEl = block ? block.querySelector('code') : null;
    const text = codeEl ? codeEl.textContent : '';
    if (!text) return;

    this._writeText(text)
      .then(() => {
        this._markCopied(btn);
        ToastManager.show('Command copied to clipboard');
      })
      .catch(() => {
        ToastManager.show('Could not copy — please copy it manually');
      });
  },

  _writeText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text);
    }
    // Fallback for older browsers / non-secure contexts.
    return new Promise((resolve, reject) => {
      try {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        const success = document.execCommand('copy');
        document.body.removeChild(textarea);
        if (success) resolve();
        else reject(new Error('execCommand copy failed'));
      } catch (err) {
        reject(err);
      }
    });
  },

  _markCopied(btn) {
    btn.classList.add('copied');
    window.setTimeout(() => btn.classList.remove('copied'), 1800);
  },
};

/* ---------------------------------- ImageFallbackManager ---------------------------------- */
const ImageFallbackManager = {
  init() {
    document.querySelectorAll('img[data-fallback]').forEach((img) => {
      img.addEventListener('error', () => this._replace(img), { once: true });
    });
  },

  _replace(img) {
    const fallback = document.createElement('div');
    fallback.className = 'graph-fallback';
    fallback.innerHTML =
      '<svg class="icon icon-lg"><use href="#icon-image-off"></use></svg>' +
      '<span>Visualization unavailable</span>';
    if (img.parentNode) img.parentNode.replaceChild(fallback, img);
  },
};

/* ---------------------------------- Bootstrap ---------------------------------- */
document.addEventListener('DOMContentLoaded', () => {
  ToastManager.init();
  ThemeManager.init();
  ClockManager.init();
  NavigationManager.init();
  PredictionFormManager.init();
  WeatherWidgetManager.init();
  GaugeAnimator.init();
  HistoryManager.init();
  SlideDeck.init();
  AccordionManager.init();
  VivaSearch.init();
  SyllabusSearch.init();
  ClipboardManager.init();
  ImageFallbackManager.init();
});
