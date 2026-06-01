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
    <section id="campaign-tiers"></section>
    <nav data-campaign-share data-share-url="https://pool.test/campaigns/demo/" data-share-title="Demo campaign" data-share-text="Help Demo campaign reach its goal. Pledge or share before the deadline:">
      <a data-campaign-share-target="bluesky" href="#bluesky">Bluesky</a>
      <a data-campaign-share-target="x" href="#x">X</a>
      <a data-campaign-share-target="threads" href="#threads">Threads</a>
      <a data-campaign-share-target="facebook" href="#facebook">Facebook</a>
      <a data-campaign-share-target="sms" href="#sms">SMS</a>
      <a data-campaign-share-target="email" href="#email">Email</a>
    </nav>
    <script data-campaign-page-script="true" data-campaign-slug="demo"></script>
  `;
}

function renderCampaignPageWithVideo() {
  document.body.innerHTML = `
    <div class="campaign-countdown" id="campaign-countdown" data-deadline="2000-01-01" data-state="live" data-goal-met="false">
      <h2 class="campaign-countdown__heading">Ends in</h2>
      <p class="sr-only" id="campaign-countdown-status"></p>
      <div class="flip-countdown">
        <div class="flip-card" data-unit="days"><span class="flip-card__value">00</span></div>
        <div class="flip-card" data-unit="hours"><span class="flip-card__value">00</span></div>
        <div class="flip-card" data-unit="mins"><span class="flip-card__value">00</span></div>
        <div class="flip-card" data-unit="secs"><span class="flip-card__value">00</span></div>
      </div>
      <div class="campaign-countdown__message"></div>
    </div>
    <div class="hero__video-wrapper" id="hero-video-wrapper" aria-busy="false">
      <video class="hero__video" id="hero-video"></video>
      <div class="hero__video-overlay" id="hero-video-overlay">
        <button class="hero__video-play" id="hero-video-play" aria-label="Play video" aria-controls="hero-video"></button>
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
    (window as any).POOL_CONFIG = {
      i18n: {
        messages: {
          campaign: {
            imageGallery: 'Image gallery',
            countdownLive: 'Campaign is now live!',
            countdownFunded: 'Project Funded',
            countdownEnded: 'Campaign Ended',
            launchReminderSuccess: "You're on the reminder list.",
            launchReminderError: 'Could not save this reminder. Please try again.',
            launchReminderSubmitting: 'Saving...',
            launchReminderEmailRequired: 'Enter your email address.',
            launchReminderConsentRequired: 'Confirm that you want this launch reminder.'
          }
        }
      },
      workerBase: 'https://pledge.test'
    };
    window.history.replaceState({}, '', '/campaigns/demo/?dev=1');
    renderCampaignPage();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
    delete (document as any).activeElement;
    delete (window as any).POOL_CONFIG;
    delete (window as any).POOL_TIME;
    document.body.innerHTML = '';
  });

  it('binds support scrolling and unlocks the community teaser in dev mode', async () => {
    const tiers = document.getElementById('campaign-tiers') as HTMLElement & { focus: (options?: { preventScroll?: boolean }) => void };
    const scrollSpy = vi.fn();
    (tiers as any).scrollIntoView = scrollSpy;
    tiers.focus = vi.fn(function focus() {
      Object.defineProperty(document, 'activeElement', {
        configurable: true,
        value: tiers
      });
    });
    const gallery = document.querySelector('.gallery__container') as HTMLElement;
    const scrollBySpy = vi.fn();
    const scrollToSpy = vi.fn();
    (gallery as any).scrollBy = scrollBySpy;
    (gallery as any).scrollTo = scrollToSpy;

    await import('../../assets/js/campaign-page.js');

    const supportButton = document.querySelector('[data-scroll-target="campaign-tiers"]') as HTMLButtonElement;
    expect(supportButton.getAttribute('aria-controls')).toBe('campaign-tiers');
    supportButton.click();
    expect(scrollSpy).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
    expect(tiers.getAttribute('tabindex')).toBe('-1');
    expect(document.activeElement).toBe(tiers);

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

  it('updates campaign share links with safe current-page params', async () => {
    window.history.replaceState({}, '', '/campaigns/demo/?utm_source=newsletter&token=secret&ref=abc');

    await import('../../assets/js/campaign-page.js');

    const bluesky = document.querySelector('[data-campaign-share-target="bluesky"]') as HTMLAnchorElement;
    const x = document.querySelector('[data-campaign-share-target="x"]') as HTMLAnchorElement;
    const email = document.querySelector('[data-campaign-share-target="email"]') as HTMLAnchorElement;

    expect(bluesky.href).toContain('Help%20Demo%20campaign%20reach%20its%20goal.%20Pledge%20or%20share%20before%20the%20deadline%3A%20https%3A%2F%2Fpool.test%2Fcampaigns%2Fdemo%2F%3Fref%3Dabc%26utm_source%3Dnewsletter');
    expect(x.href).toContain('text=Help%20Demo%20campaign%20reach%20its%20goal.%20Pledge%20or%20share%20before%20the%20deadline%3A');
    expect(x.href).toContain('url=https%3A%2F%2Fpool.test%2Fcampaigns%2Fdemo%2F%3Fref%3Dabc%26utm_source%3Dnewsletter');
    expect(email.href).toContain('subject=Demo%20campaign');
    expect(email.href).toContain('body=Help%20Demo%20campaign%20reach%20its%20goal.%20Pledge%20or%20share%20before%20the%20deadline%3A%20https%3A%2F%2Fpool.test%2Fcampaigns%2Fdemo%2F%3Fref%3Dabc%26utm_source%3Dnewsletter');
    expect(bluesky.href).not.toContain('token');
    expect(document.querySelector('[data-campaign-share-target="copy"]')).toBeNull();
  });

  it('submits upcoming campaign launch reminder signups to the Worker', async () => {
    document.body.innerHTML = `
      <form data-launch-reminder-form data-campaign-slug="demo" data-lang="en">
        <input name="email" type="email">
        <input name="consent" type="hidden" value="true">
        <button type="submit">Remind me</button>
        <p data-launch-reminder-status></p>
      </form>
      <script data-campaign-page-script="true" data-campaign-slug="demo"></script>
    `;
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }));
    vi.stubGlobal('fetch', fetchMock);

    await import('../../assets/js/campaign-page.js');

    const form = document.querySelector('[data-launch-reminder-form]') as HTMLFormElement;
    const email = form.querySelector('input[name="email"]') as HTMLInputElement;
    email.value = 'fan@example.com';
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(fetchMock).toHaveBeenCalledWith('https://pledge.test/launch-reminders', expect.objectContaining({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        campaignSlug: 'demo',
        email: 'fan@example.com',
        preferredLang: 'en',
        consent: true,
        turnstileToken: undefined
      })
    }));
    expect((form.querySelector('[data-launch-reminder-status]') as HTMLElement).textContent).toBe("You're on the reminder list.");
  });

  it('uses normal Turnstile sizing in the sidebar and flexible sizing in the header', async () => {
    document.body.innerHTML = `
      <section class="launch-reminder launch-reminder--sidebar">
        <form data-launch-reminder-form data-campaign-slug="demo" data-lang="en" data-turnstile-site-key="site-key">
          <input name="email" type="email" value="sidebar@example.com">
          <input name="consent" type="hidden" value="true">
          <button type="submit">Remind me</button>
          <div data-launch-reminder-turnstile></div>
          <p data-launch-reminder-status></p>
        </form>
      </section>
      <section class="launch-reminder launch-reminder--header">
        <form data-launch-reminder-form data-campaign-slug="demo" data-lang="en" data-turnstile-site-key="site-key">
          <input name="email" type="email" value="header@example.com">
          <input name="consent" type="hidden" value="true">
          <button type="submit">Remind me</button>
          <div data-launch-reminder-turnstile></div>
          <p data-launch-reminder-status></p>
        </form>
      </section>
      <script data-campaign-page-script="true" data-campaign-slug="demo"></script>
    `;
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }));
    const renderMock = vi.fn(() => 'widget-id');
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('turnstile', {
      render: renderMock,
      getResponse: vi.fn(() => 'turnstile-token'),
      reset: vi.fn()
    });

    await import('../../assets/js/campaign-page.js');

    const forms = document.querySelectorAll('[data-launch-reminder-form]');
    forms[0].dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await new Promise(resolve => setTimeout(resolve, 0));
    forms[1].dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(renderMock.mock.calls[0][1]).toMatchObject({ size: 'normal' });
    expect(renderMock.mock.calls[1][1]).toMatchObject({ size: 'flexible' });
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
    expect((document.querySelector('.campaign-countdown__message h2') as HTMLElement).textContent).toBe('Campaign Ended');
    expect((document.getElementById('campaign-countdown-status') as HTMLElement).textContent).toBe('Campaign Ended');

    video.dispatchEvent(new Event('progress'));
    const bufferBar = document.querySelector('.hero__video-buffer-bar') as HTMLElement;
    expect(bufferBar.classList.contains('hero__video-buffer-bar--w-50')).toBe(true);

    const playButton = document.getElementById('hero-video-play') as HTMLButtonElement;
    const loading = document.getElementById('hero-video-loading') as HTMLElement;
    const overlay = document.getElementById('hero-video-overlay') as HTMLElement;
    const wrapper = document.getElementById('hero-video-wrapper') as HTMLElement;

    playButton.click();
    expect(wrapper.getAttribute('aria-busy')).toBe('true');
    expect(loading.hidden).toBe(false);
    expect(playButton.hidden).toBe(true);
    expect(overlay.hidden).toBe(false);

    video.dispatchEvent(new Event('playing'));
    expect(wrapper.getAttribute('aria-busy')).toBe('false');
    expect(loading.hidden).toBe(true);
    expect(playButton.hidden).toBe(true);
    expect(overlay.hidden).toBe(true);

    video.dispatchEvent(new Event('waiting'));
    expect(wrapper.getAttribute('aria-busy')).toBe('false');
    expect(loading.hidden).toBe(true);
    expect(playButton.hidden).toBe(true);
    expect(overlay.hidden).toBe(true);

    video.dispatchEvent(new Event('pause'));
    expect(loading.hidden).toBe(true);
    expect(playButton.hidden).toBe(true);
    expect(overlay.hidden).toBe(true);

    vi.useRealTimers();
  });

  it('uses a smaller value style when the days countdown has three or more digits', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    (window as any).POOL_TIME = {
      campaignDeadlineDate: () => new Date('2026-04-11T00:00:00Z')
    };
    window.history.replaceState({}, '', '/campaigns/demo/');
    document.body.innerHTML = `
      <div class="campaign-countdown" id="campaign-countdown" data-deadline="2026-04-11" data-state="live" data-goal-met="false">
        <h2 class="campaign-countdown__heading">Ends in</h2>
        <p class="sr-only" id="campaign-countdown-status"></p>
        <div class="flip-countdown">
          <div class="flip-card" data-unit="days"><span class="flip-card__value">00</span></div>
          <div class="flip-card" data-unit="hours"><span class="flip-card__value">00</span></div>
          <div class="flip-card" data-unit="mins"><span class="flip-card__value">00</span></div>
          <div class="flip-card" data-unit="secs"><span class="flip-card__value">00</span></div>
        </div>
        <div class="campaign-countdown__message"></div>
      </div>
      <script data-campaign-page-script="true" data-campaign-slug="demo"></script>
    `;

    await import('../../assets/js/campaign-page.js');

    const daysCard = document.querySelector('.flip-card[data-unit="days"]') as HTMLElement;
    const hoursCard = document.querySelector('.flip-card[data-unit="hours"]') as HTMLElement;
    expect((daysCard.querySelector('.flip-card__value') as HTMLElement).textContent).toBe('100');
    expect(daysCard.classList.contains('flip-card--long-value')).toBe(true);
    expect(hoursCard.classList.contains('flip-card--long-value')).toBe(false);

    vi.useRealTimers();
  });

  it('uses localized runtime messages for gallery labels and countdown states', async () => {
    vi.useFakeTimers();
    (window as any).POOL_CONFIG = {
      i18n: {
        messages: {
          campaign: {
            imageGallery: 'Galeria de imagenes',
            countdownLive: 'La campana ya esta activa',
            countdownFunded: 'Proyecto financiado',
            countdownEnded: 'Campana finalizada',
            countdownRemaining: 'Quedan %{days} dias, %{hours} horas, %{minutes} minutos y %{seconds} segundos'
          }
        }
      }
    };
    window.history.replaceState({}, '', '/es/campaigns/demo/');
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

    expect(document.querySelector('.gallery__container')).toBeNull();
    expect((document.querySelector('.campaign-countdown__message h2') as HTMLElement).textContent).toBe('Campana finalizada');
    expect((document.getElementById('campaign-countdown-status') as HTMLElement).textContent).toBe('Campana finalizada');

    document.body.innerHTML = `
      <section class="gallery gallery--carousel">
        <div class="gallery__container">
          <div class="gallery__item">Uno</div>
        </div>
      </section>
      <script data-campaign-page-script="true" data-campaign-slug="demo"></script>
    `;

    vi.resetModules();
    await import('../../assets/js/campaign-page.js');
    expect((document.querySelector('.gallery__container') as HTMLElement).getAttribute('aria-label')).toBe('Galeria de imagenes');

    vi.useRealTimers();
  });
});
