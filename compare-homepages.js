(() => {
  'use strict';

  const DEFAULT_WIDTH = 1280;
  const widthButtons = [...document.querySelectorAll('[data-preview-width]')];
  const directionButtons = [...document.querySelectorAll('[data-direction]')];
  const stages = [...document.querySelectorAll('.preview-stage')];
  const frames = [...document.querySelectorAll('.preview-viewport iframe')];
  const reset = document.querySelector('#reset-previews');
  let selectedWidth = DEFAULT_WIDTH;

  function updateScale() {
    for (const stage of stages) {
      const viewport = stage.querySelector('.preview-viewport');
      const frame = viewport.querySelector('iframe');
      const available = stage.clientWidth;
      if (available <= 0 || stage.clientHeight <= 0) continue;
      const scale = Math.min(1, available / selectedWidth);
      const virtualHeight = Math.max(640, Math.ceil(stage.clientHeight / scale));
      viewport.style.width = `${selectedWidth}px`;
      viewport.style.height = `${virtualHeight}px`;
      viewport.style.marginLeft = `${Math.max(0, (available - selectedWidth * scale) / 2)}px`;
      viewport.style.setProperty('--preview-scale', String(scale));
      frame.style.width = `${selectedWidth}px`;
      frame.style.height = `${virtualHeight}px`;
    }
  }

  function chooseWidth(button) {
    const next = Number(button.dataset.previewWidth);
    if (!Number.isFinite(next) || next < 320) return;
    selectedWidth = next;
    for (const candidate of widthButtons) {
      candidate.setAttribute('aria-pressed', String(candidate === button));
    }
    updateScale();
  }

  function chooseDirection(button) {
    const direction = button.dataset.direction;
    if (!['current', 'editorial'].includes(direction)) return;
    document.body.dataset.activePreview = direction;
    for (const candidate of directionButtons) {
      candidate.setAttribute('aria-pressed', String(candidate === button));
    }
    updateScale();
  }

  for (const button of widthButtons) {
    button.addEventListener('click', () => chooseWidth(button));
  }

  for (const button of directionButtons) {
    button.addEventListener('click', () => chooseDirection(button));
  }

  reset?.addEventListener('click', () => {
    for (const frame of frames) {
      const homepage = frame.dataset.homepageSrc;
      if (homepage) frame.src = homepage;
    }
  });

  for (const frame of frames) frame.addEventListener('load', updateScale);

  const observer = 'ResizeObserver' in window ? new ResizeObserver(updateScale) : null;
  for (const stage of stages) observer?.observe(stage);
  window.addEventListener('resize', updateScale, { passive: true });
  updateScale();
})();
