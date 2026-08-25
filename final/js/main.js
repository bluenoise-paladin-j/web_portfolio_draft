/* Type Measuring Canvas (never drawn to) */
const measurer = document.createElement('canvas').getContext('2d');

function fontString(el, size) {
  const cs = getComputedStyle(el);
  return `${cs.fontWeight} ${size}px ${cs.fontFamily}`;
}

/* Per Band Speed Offsets */
const DRIFT = [0, -0.55, 0.85, -0.30, 0.60, -0.80, 0.40, -0.15];


/* Fit The Type To The Band*/
function fitType(marquee) {
  const band = marquee.closest('.band');

  // offsetHeight, not getBoundingClientRect - the rect includes the
  // hover swell, which would feed back into the type size
  const bandHeight = band.offsetHeight;
  if (!bandHeight) return null;

  const fill = parseFloat(getComputedStyle(marquee).getPropertyValue('--fill')) || 1;

  // cap height per 1px of font size, for this face
  measurer.font = fontString(marquee, 100);
  const capPerEm = measurer.measureText('H').actualBoundingBoxAscent / 100;

  const capHeight = bandHeight * fill;
  const size = capHeight / capPerEm;
  marquee.style.fontSize = size + 'px';

  // Centre the capitals inside the band
  measurer.font = fontString(marquee, size);
  const m = measurer.measureText('H');
  const baseline = (size - (m.fontBoundingBoxAscent + m.fontBoundingBoxDescent)) / 2
                 + m.fontBoundingBoxAscent;
  const capTop = baseline - m.actualBoundingBoxAscent;

  return { size, shift: -capTop + (bandHeight - capHeight) / 2 };
}


/* Build A Marquee */
function buildMarquee(marquee, index, force) {
  // After the first build this element holds the track, not the phrase
  const phrase = marquee.dataset.phrase || marquee.textContent.trim();
  if (!phrase) return;
  marquee.dataset.phrase = phrase;

  const band = marquee.closest('.band');
  if (!band || !band.offsetHeight) return;

  // Only rebuild if the band height or the window width has changed.
  // Scrolling on a phone slides the URL bar away and fires resize, and
  // rebuilding there snapped every marquee back to its start.
  const key = window.innerWidth + 'x' + band.offsetHeight;
  if (!force && marquee.dataset.builtFor === key) return;

  // Remember where the old track had got to
  const previous = marquee.querySelector('.marquee__track');
  let phase = 0;
  if (previous && previous.getAnimations) {
    const running = previous.getAnimations()[0];
    const span = running && running.effect && running.effect.getTiming().duration;
    if (span && running.currentTime != null) {
      phase = (running.currentTime % span) / span;
    }
  }

  const fit = fitType(marquee);
  if (!fit) return;
  const size = fit.size;

  marquee.textContent = '';
  const track = document.createElement('span');
  track.className = 'marquee__track';
  marquee.appendChild(track);

  // Each repeat is its own span - these faces have almost no word space,
  // so plain spaces would collide into "WORKSWORKS"
  function word() {
    const w = document.createElement('span');
    w.className = 'marquee__word';
    w.textContent = phrase;
    return w;
  }

  // Measure one word to work out how many are needed
  const probe = word();
  track.appendChild(probe);
  const gap  = size * 0.3;                // matches .marquee__word
  const unit = probe.getBoundingClientRect().width + gap;
  track.removeChild(probe);

  const reps = Math.ceil(window.innerWidth / unit) + 1;

  for (let half = 0; half < 2; half++) {
    const group = document.createElement('span');
    group.className = 'marquee__half';
    for (let r = 0; r < reps; r++) group.appendChild(word());
    if (half === 1) group.setAttribute('aria-hidden', 'true');   // don't read it twice
    track.appendChild(group);
  }

  // Position the line so the capitals sit as --fill asks
  track.style.setProperty('--shift', fit.shift + 'px');

  // Duration from distance, so a short word and a long one travel at the
  // same speed. Then nudge it by this band's share of the drift.
  const style = getComputedStyle(marquee);
  const base  = parseFloat(style.getPropertyValue('--marquee-speed')) || 90;
  const drift = parseFloat(style.getPropertyValue('--marquee-drift')) || 0;
  const speed = base * (1 + drift * DRIFT[index % DRIFT.length]);

  const duration = (unit * reps) / speed;
  track.style.setProperty('--dur', duration + 's');

  // A negative delay starts the animation part way through
  if (phase) track.style.animationDelay = (-phase * duration) + 's';

  marquee.dataset.builtFor = key;

  // Sized and positioned, so safe to show (see .marquee in style.css)
  marquee.classList.add('marquee--set');
}


/* Hover Swell Amount */
function setSwell(band) {
  const height = band.offsetHeight;
  if (!height) return;

  const swell = parseFloat(getComputedStyle(band).getPropertyValue('--swell')) || 0;
  const scale = Math.min(1.16, Math.max(1.02, 1 + swell / height));

  band.style.setProperty('--sy', swell ? scale : 1);
}


/* Project Panels (one open at a time) */
function wirePanels() {
  const projects = document.querySelectorAll('.project');

  projects.forEach(project => {
    const band = project.querySelector('.project__band');

    // A gallery only runs while its panel is open, so re-check once the
    // height has finished moving - both opening and closing
    project.addEventListener('transitionend', e => {
      if (e.propertyName === 'grid-template-rows') syncGalleries();
    });

    band.addEventListener('click', () => {
      const wasOpen = project.dataset.open === 'true';

      // Close everything first
      projects.forEach(p => {
        p.dataset.open = 'false';
        p.querySelector('.project__band').setAttribute('aria-expanded', 'false');
      });

      if (wasOpen) return;

      project.dataset.open = 'true';
      band.setAttribute('aria-expanded', 'true');

      // Scroll the opened band up, but only once the panel has finished
      // expanding - run both together and they fight each other
      project.addEventListener('transitionend', function once(e) {
        if (e.propertyName !== 'grid-template-rows') return;
        project.scrollIntoView({ behavior: 'smooth', block: 'start' });
        project.removeEventListener('transitionend', once);
      });
    });
  });
}


/* Gallery Timings */
const GAL_DOWN = 650;   /* ms to coast to a stop under the pointer */
const GAL_UP   = 900;   /* ms to get back up to speed */

const galReduce = matchMedia('(prefers-reduced-motion: reduce)');

/* Gallery Helpers */
function galTrack(gallery) { return gallery.querySelector('.gallery__track'); }

function galAnim(gallery) {
  const track = galTrack(gallery);
  if (!track || !track.getAnimations) return null;
  return track.getAnimations()[0] || null;
}


/* Build The Row */
function buildGallery(gallery, force) {
  const track = galTrack(gallery);
  if (!track) return false;

  // The images as authored, kept aside before the track fills with copies
  if (!gallery._items) {
    gallery._items = Array.from(track.children).map(function (n) { return n.cloneNode(true); });
  }

  // Only rebuild if the window width or the frame height has changed
  const key = window.innerWidth + 'x' +
              getComputedStyle(gallery).getPropertyValue('--gal-h').trim();
  if (!force && gallery.dataset.builtFor === key) return false;

  // Remember the position, since a rebuild throws the old animation away
  const running = galAnim(gallery);
  if (running && running.effect && running.currentTime != null) {
    const span = running.effect.getTiming().duration;
    if (span) gallery._phase = (running.currentTime % span) / span;
  }

  track.textContent = '';
  gallery._items.forEach(function (n) { track.appendChild(n.cloneNode(true)); });

  // Reduced motion has no loop, so one set of images is the whole thing
  if (galReduce.matches) { gallery.dataset.builtFor = key; return true; }

  const setWidth = track.getBoundingClientRect().width;
  if (!setWidth) return false;          // the images have no size yet

  const reps = Math.max(1, Math.ceil(window.innerWidth / setWidth));
  for (let r = 1; r < reps; r++) {
    gallery._items.forEach(function (n) { track.appendChild(n.cloneNode(true)); });
  }

  // aria-hidden on every copy, so a screen reader reads the set once
  Array.from(track.children).forEach(function (item, i) {
    if (i >= gallery._items.length) item.setAttribute('aria-hidden', 'true');
  });
  Array.from(track.children).forEach(function (item) {
    const copy = item.cloneNode(true);
    copy.setAttribute('aria-hidden', 'true');
    track.appendChild(copy);
  });

  gallery.dataset.builtFor = key;
  return true;
}


/* Measure And Time The Row */
function sizeGallery(gallery) {
  const track = galTrack(gallery);
  if (!track || galReduce.matches) return;

  // width: max-content, so this includes the last frame's gap
  const half = track.getBoundingClientRect().width / 2;
  if (!half) return;                 // the images have no size yet

  const speed = parseFloat(getComputedStyle(gallery).getPropertyValue('--gal-speed')) || 45;
  const duration = half / speed;

  // Take the position from a rebuild, or from the running animation
  let phase = 0;
  if (gallery._phase != null) {
    phase = gallery._phase;
    delete gallery._phase;
  } else {
    const running = galAnim(gallery);
    if (running && running.effect && running.currentTime != null) {
      const span = running.effect.getTiming().duration;
      if (span) phase = (running.currentTime % span) / span;
    }
  }

  track.style.setProperty('--dur', duration + 's');
  track.style.animationDelay = phase ? (-phase * duration) + 's' : '0s';
}


/* The Hover Ramp */
function rampGallery(gallery, target, ms) {
  const anim = galAnim(gallery);
  if (!anim) return;

  cancelAnimationFrame(gallery._ramp);
  const from = anim.playbackRate;
  if (from === target) return;

  const start = performance.now();
  (function step(now) {
    const p = Math.min(1, (now - start) / ms);
    const eased = 1 - Math.pow(1 - p, 3);        // ease-out cubic
    anim.playbackRate = from + (target - from) * eased;
    if (p < 1) gallery._ramp = requestAnimationFrame(step);
  })(start);
}


/* Wire The Hover */
function wireGallery(gallery) {
  if (galReduce.matches) return;

  // Ignored for touch - a finger's hover sticks until you tap somewhere
  // else, which would leave the row stopped with nothing to restart it
  gallery.addEventListener('pointerenter', function (e) {
    if (e.pointerType === 'touch') return;
    rampGallery(gallery, 0, GAL_DOWN);
  });
  gallery.addEventListener('pointerleave', function (e) {
    if (e.pointerType === 'touch') return;
    rampGallery(gallery, 1, GAL_UP);
  });
}


/* Is It Hidden? */
function galClipped(el) {
  for (let node = el.parentElement; node && node !== document.body; node = node.parentElement) {
    const rect = node.getBoundingClientRect();
    if ((rect.height === 0 || rect.width === 0) &&
        getComputedStyle(node).overflow !== 'visible') return true;
  }
  return false;
}


/* Play Or Pause One Gallery */
function syncGallery(gallery) {
  const anim = galAnim(gallery);
  if (!anim) return;

  const rect = gallery.getBoundingClientRect();
  const onScreen = rect.bottom > 0 && rect.top < innerHeight;

  if (onScreen && !galClipped(gallery)) {
    if (anim.playState === 'paused') anim.play();
    return;
  }

  if (anim.playState === 'running') anim.pause();

  // Reset the speed while it is away, or a panel closed under the
  // pointer comes back still stopped
  cancelAnimationFrame(gallery._ramp);
  anim.playbackRate = 1;
}

/* Play Or Pause All Of Them */
function syncGalleries() {
  document.querySelectorAll('.gallery').forEach(syncGallery);
}

/* Re-measure After A Resize */
function refreshGalleries() {
  document.querySelectorAll('.gallery').forEach(function (gallery) {
    buildGallery(gallery, false);   // a no-op unless the repeat count changed
    sizeGallery(gallery);
    syncGallery(gallery);
  });
}


/* Set The Galleries Up */
function initGalleries() {
  const galleries = document.querySelectorAll('.gallery');
  if (!galleries.length) return;

  galleries.forEach(function (gallery) {
    buildGallery(gallery, true);
    wireGallery(gallery);
    sizeGallery(gallery);
  });

  // Safety net for an image whose real size does not match its width and
  // height attributes. One listener per image rather than waiting for all
  // of them, because lazy images in a closed panel never load until you
  // open it. The timer lets a panel's images arrive before rebuilding.
  document.querySelectorAll('.gallery__item').forEach(function (img) {
    if (img.complete) return;
    img.addEventListener('load', function () {
      const gallery = img.closest('.gallery');
      if (!gallery) return;
      clearTimeout(gallery._remeasure);
      gallery._remeasure = setTimeout(function () {
        buildGallery(gallery, true);
        sizeGallery(gallery);
        syncGallery(gallery);
      }, 100);
    }, { once: true });
  });

  // Pause a gallery as soon as it leaves the screen
  if (window.IntersectionObserver) {
    const io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) { syncGallery(entry.target); });
    });
    galleries.forEach(function (gallery) { io.observe(gallery); });
  }

  syncGalleries();
}


/* Start */
function buildAll(force) {
  document.querySelectorAll('.marquee').forEach(function (marquee, index) {
    buildMarquee(marquee, index, force);
  });
  document.querySelectorAll('.band--link').forEach(setSwell);
}

wirePanels();
buildAll(true);
initGalleries();
document.fonts.ready.then(function () { buildAll(true); });


/* Rebuild On Resize */
let resizeTimer;
addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    buildAll(false);      // no force - each marquee decides for itself
    refreshGalleries();
  }, 120);
});
