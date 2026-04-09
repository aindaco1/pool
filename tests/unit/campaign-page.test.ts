import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function renderCampaignPage() {
  document.body.innerHTML = `
    <button type="button" data-scroll-target="campaign-tiers">Support!</button>
    <section class="gallery gallery--carousel">
      <div class="gallery__container">
        <div class="gallery__item">One</div>
        <div class="gallery__item">Two</div>
      </div>
    </section>
    <section class="community-teaser" id="community-teaser">
      <p class="teaser-locked">Locked</p>
      <p class="teaser-unlocked" hidden>Unlocked</p>
      <a href="/community/demo/" class="btn btn--secondary btn--locked" id="community-btn">
        <span class="locked-text">Locked</span>
        <span class="unlocked-text" hidden>Unlocked</span>
      </a>
    </section>
    <div id="campaign-tiers"></div>
    <script data-campaign-page-script="true" data-campaign-slug="demo"></script>
  `;
}

function renderCampaignPageWithVideo() {
  document.body.innerHTML = `
    <div class="campaign-countdown" id="campaign-countdown" data-deadline="2000-01-01" data-state="live" data-goal-met="false">
      <h2 class="campaign-countdown__heading">Ends in</h2>
      <div class="flip-countdown">
        <div class="flip-card" data-unit="days"><span class="flip-card__value">00</span></div>
        <div class="flip-card" data-unit="hours"><span class="flip-card__value">00</span></div>
        <div class="flip-card" data-unit="mins"><span class="flip-card__value">00</span></div>
        <div class="flip-card" data-unit="secs"><span class="flip-card__value">00</span></div>
      </div>
      <div class="campaign-countdown__message"></div>
    </div>
    <div class="hero__video-wrapper" id="hero-video-wrapper">
      <video class="hero__video" id="hero-video"></video>
      <div class="hero__video-overlay" id="hero-video-overlay">
        <button class="hero__video-play" id="hero-video-play" aria-label="Play video"></button>
        <div class="hero__video-loading" id="hero-video-loading" hidden></div>
      </div>
      <div class="hero__video-buffer" id="hero-video-buffer">
        <div class="hero__video-buffer-bar"></div>
      </div>
    </div>
    <script data-campaign-page-script="true" data-campaign-slug="demo"></script>
  `;
}

describe('campaign page script', () => {
  beforeEach(() => {
    vi.resetModules();
    window.history.replaceState({}, '', '/campaigns/demo/?dev=1');
    renderCampaignPage();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('binds support scrolling and unlocks the community teaser in dev mode', async () => {
    const tiers = document.getElementById('campaign-tiers') as HTMLElement;
    const scrollSpy = vi.fn();
    (tiers as any).scrollIntoView = scrollSpy;
    const gallery = document.querySelector('.gallery__container') as HTMLElement;
    const scrollBySpy = vi.fn();
    const scrollToSpy = vi.fn();
    (gallery as any).scrollBy = scrollBySpy;
    (gallery as any).scrollTo = scrollToSpy;

    await import('../../assets/js/campaign-page.js');

    const supportButton = document.querySelector('[data-scroll-target="campaign-tiers"]') as HTMLButtonElement;
    expect(supportButton.getAttribute('aria-controls')).toBe('campaign-tiers');
    supportButton.click();
    expect(scrollSpy).toHaveBeenCalledWith({ behavior: 'smooth' });

    expect((document.querySelector('.teaser-locked') as HTMLElement).hidden).toBe(true);
    expect((document.querySelector('.teaser-unlocked') as HTMLElement).hidden).toBe(false);
    expect((document.querySelector('.locked-text') as HTMLElement).hidden).toBe(true);
    expect((document.querySelector('.unlocked-text') as HTMLElement).hidden).toBe(false);

    const button = document.getElementById('community-btn') as HTMLElement;
    expect(button.classList.contains('btn--primary')).toBe(true);
    expect(button.classList.contains('btn--locked')).toBe(false);

    expect(gallery.getAttribute('tabindex')).toBe('0');
    expect(gallery.getAttribute('aria-label')).toBe('Image gallery');

    gallery.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
    expect(scrollBySpy).toHaveBeenCalled();

    gallery.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true, cancelable: true }));
    expect(scrollToSpy).toHaveBeenCalledWith({ left: 0, behavior: 'smooth' });
  });

  it('uses hidden state and width classes for countdown and video shell', async () => {
    vi.useFakeTimers();
    window.history.replaceState({}, '', '/campaigns/demo/');
    renderCampaignPageWithVideo();

    const video = document.getElementById('hero-video') as HTMLVideoElement & {
      load: () => void;
      play: () => Promise<void>;
      buffered: { length: number; end: (index: number) => number };
      duration: number;
      ended: boolean;
    };
    video.load = vi.fn();
    video.play = vi.fn(() => Promise.resolve());
    Object.defineProperty(video, 'buffered', {
      configurable: true,
      value: { length: 1, end: () => 5 }
    });
    Object.defineProperty(video, 'duration', {
      configurable: true,
      value: 10
    });
    Object.defineProperty(video, 'ended', {
      configurable: true,
      value: false,
      writable: true
    });

    await import('../../assets/js/campaign-page.js');

    expect((document.querySelector('.flip-countdown') as HTMLElement).hidden).toBe(true);
    expect((document.querySelector('.campaign-countdown__heading') as HTMLElement).hidden).toBe(true);
    expect((document.querySelector('.campaign-countdown__message') as HTMLElement).getAttribute('role')).toBe('status');
    expect((document.querySelector('.campaign-countdown__message') as HTMLElement).getAttribute('aria-live')).toBe('polite');

    video.dispatchEvent(new Event('progress'));
    const bufferBar = document.querySelector('.hero__video-buffer-bar') as HTMLElement;
    expect(bufferBar.classList.contains('hero__video-buffer-bar--w-50')).toBe(true);

    const playButton = document.getElementById('hero-video-play') as HTMLButtonElement;
    const loading = document.getElementById('hero-video-loading') as HTMLElement;
    const overlay = document.getElementById('hero-video-overlay') as HTMLElement;

    playButton.click();
    expect(loading.hidden).toBe(false);
    expect(playButton.hidden).toBe(true);
    expect(overlay.hidden).toBe(false);

    video.dispatchEvent(new Event('playing'));
    expect(loading.hidden).toBe(true);
    expect(playButton.hidden).toBe(true);
    expect(overlay.hidden).toBe(true);

    vi.useRealTimers();
  });
});
