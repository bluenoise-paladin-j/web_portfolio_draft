/* =========================================================
   v10 — Jared Amuso, A2 responsive portfolio

   Four jobs:
     1. size each band's type so the capitals fill the band
     2. build the marquees
     3. work out each link band's hover swell
     4. open and close the project panels
   ========================================================= */


/* A single canvas, used only for measuring type. Never drawn to. */
const measurer = document.createElement('canvas').getContext('2d');

function fontString(el, size) {
  const cs = getComputedStyle(el);
  return `${cs.fontWeight} ${size}px ${cs.fontFamily}`;
}

/* Per-band speed offsets. A fixed list rather than random numbers so the
   page looks the same on every reload. Swap in Math.random() if you want
   the speeds to reshuffle each refresh. */
const DRIFT = [0, -0.55, 0.85, -0.30, 0.60, -0.80, 0.40, -0.15];


/* ---- 1. FIT THE TYPE TO THE BAND ------------------------
   We size against cap height — the flat top of a capital down
   to the baseline — not the font's em box, which carries
   invisible space above and below. Every face hides a
   different amount of that space, so this measures the real
   ratio at runtime rather than hardcoding a number.

   --fill controls how much of the band the capitals take:
     1.10  capitals overshoot and clip at both edges. This is
           the default, and it's what removes the awkward gaps
           that a letter's own sidebearings otherwise leave.
     1.00  exactly flush, top and bottom.
     0.90  sits inside the band with an even margin.
   Set it per band inline; the default lives in :root.
   ---------------------------------------------------------- */
function fitType(marquee) {
  const band = marquee.closest('.band');
  const bandHeight = band.getBoundingClientRect().height;
  if (!bandHeight) return null;

  const fill = parseFloat(getComputedStyle(marquee).getPropertyValue('--fill')) || 1;

  // cap height per 1px of font-size, for this face
  measurer.font = fontString(marquee, 100);
  const capPerEm = measurer.measureText('H').actualBoundingBoxAscent / 100;

  const capHeight = bandHeight * fill;
  const size = capHeight / capPerEm;
  marquee.style.fontSize = size + 'px';

  // Find where the capitals currently sit inside the line box, then centre
  // that block in the band. At fill 1 they land flush; above 1 they overflow
  // equally top and bottom; below 1 they sit inside with an equal margin.
  measurer.font = fontString(marquee, size);
  const m = measurer.measureText('H');
  const baseline = (size - (m.fontBoundingBoxAscent + m.fontBoundingBoxDescent)) / 2
                 + m.fontBoundingBoxAscent;
  const capTop = baseline - m.actualBoundingBoxAscent;

  return { size, shift: -capTop + (bandHeight - capHeight) / 2 };
}


/* ---- 2. MARQUEE -----------------------------------------
   The HTML holds each phrase once, so the page still reads with
   JS off. Here we repeat it enough to cover the screen, then
   clone the whole run so sliding -50% loops seamlessly.
   ---------------------------------------------------------- */
function buildMarquee(marquee, index) {
  // Keep the original phrase: after the first build this element
  // holds the generated track, so textContent is no longer clean.
  const phrase = marquee.dataset.phrase || marquee.textContent.trim();
  if (!phrase) return;
  marquee.dataset.phrase = phrase;

  const fit = fitType(marquee);
  if (!fit) return;
  const size = fit.size;

  marquee.textContent = '';
  const track = document.createElement('span');
  track.className = 'marquee__track';
  marquee.appendChild(track);

  // Each repeat is its own span with a margin, not a run of text with
  // spaces — these faces have almost no word space, so at this size the
  // repeats would collide into "WORKSWORKS".
  function word() {
    const w = document.createElement('span');
    w.className = 'marquee__word';
    w.textContent = phrase;
    return w;
  }

  // measure one real word to work out how many are needed
  const probe = word();
  track.appendChild(probe);
  const gap  = size * 0.3;                                // matches .marquee__word
  const unit = probe.getBoundingClientRect().width + gap;
  track.removeChild(probe);

  const reps = Math.ceil(window.innerWidth / unit) + 1;

  for (let half = 0; half < 2; half++) {
    const group = document.createElement('span');
    group.className = 'marquee__half';
    for (let r = 0; r < reps; r++) group.appendChild(word());
    if (half === 1) group.setAttribute('aria-hidden', 'true');  // don't read it twice
    track.appendChild(group);
  }

  // position the line so the capitals sit as --fill asks
  track.style.setProperty('--shift', fit.shift + 'px');

  // Duration from distance, so a short word and a long one travel at the
  // same speed. Then nudge by this band's share of the drift.
  const style = getComputedStyle(marquee);
  const base  = parseFloat(style.getPropertyValue('--marquee-speed')) || 90;
  const drift = parseFloat(style.getPropertyValue('--marquee-drift')) || 0;
  const speed = base * (1 + drift * DRIFT[index % DRIFT.length]);

  track.style.setProperty('--dur', (unit * reps) / speed + 's');
}


/* ---- 2b. HOVER SWELL ------------------------------------
   A link band swells vertically under the pointer. The CSS does
   the animating; this only works out how far.

   --swell is a pixel amount, so the scale has to be per band:
   1.05 on the 410px WORKS band is a 20px lift, the same 1.05 on
   the 38px HOME strip is 2px and reads as nothing. Dividing the
   pixel amount by the band's own height makes every band travel
   the same distance.

   The clamp keeps it sane at the extremes — a very short band
   would otherwise want to nearly double, and on a very tall one
   the stretch would vanish.

   offsetHeight, not getBoundingClientRect: the rect includes the
   transform, so re-measuring a band while it happens to be
   hovered would feed its own scale back into itself.
   ---------------------------------------------------------- */
function setSwell(band) {
  const height = band.offsetHeight;
  if (!height) return;

  const swell = parseFloat(getComputedStyle(band).getPropertyValue('--swell')) || 0;
  const scale = Math.min(1.16, Math.max(1.02, 1 + swell / height));

  band.style.setProperty('--sy', swell ? scale : 1);
}


/* ---- 3. PROJECT PANELS ---------------------------------- */
function wirePanels() {
  const projects = document.querySelectorAll('.project');

  projects.forEach(project => {
    const band = project.querySelector('.project__band');

    band.addEventListener('click', () => {
      const wasOpen = project.dataset.open === 'true';

      // close everything first — only one open at a time
      projects.forEach(p => {
        p.dataset.open = 'false';
        p.querySelector('.project__band').setAttribute('aria-expanded', 'false');
      });

      if (wasOpen) return;

      project.dataset.open = 'true';
      band.setAttribute('aria-expanded', 'true');

      // Scroll the opened band to the top, but only once the height
      // animation has finished — run both at once and they fight.
      project.addEventListener('transitionend', function once(e) {
        if (e.propertyName !== 'grid-template-rows') return;
        project.scrollIntoView({ behavior: 'smooth', block: 'start' });
        project.removeEventListener('transitionend', once);
      });
    });
  });
}


/* ---- 4. START ------------------------------------------
   Wait for the fonts before measuring: measuring against a
   fallback gives the wrong cap height and the type lands off.
   ---------------------------------------------------------- */
function buildAll() {
  document.querySelectorAll('.marquee').forEach(buildMarquee);
  document.querySelectorAll('.band--link').forEach(setSwell);
}

wirePanels();
document.fonts.ready.then(buildAll);

/* Rebuild on resize. Band heights are viewport-relative, so every
   vertical drag changes them. Rebuilding in place (rather than
   reloading) keeps any open panel and the scroll position. */
let resizeTimer;
addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(buildAll, 120);
});
