(function () {
  const fallback = window.K2K_FALLBACK || {};
  const $ = (id) => document.getElementById(id);
  const set = (id, value) => { const node = $(id); if (node) node.textContent = value; };
  const number = (value) => new Intl.NumberFormat('en-IN').format(Number(value) || 0);
  const duration = (minutes) => {
    const total = Number(minutes) || 0;
    return total < 60 ? `${total} min` : `${Math.floor(total / 60)}h ${total % 60}m`;
  };

  function render(data) {
    const isLive = data.mode === 'live';
    document.body.dataset.journeyMode = data.mode || 'preparation';
    set('roomMode', isLive ? 'LIVE EXPEDITION' : 'PREPARATION MODE');
    set('roomStatus', data.status || (isLive ? 'Walking' : 'Preparing'));
    set('roomDay', isLive ? `Day ${number(data.day)}` : 'Before day one');
    set('roomPlace', data.currentPlace || 'Location unavailable');
    set('roomDistanceToday', `${number(data.distanceToday)} km`);
    set('roomDistanceTotal', `${number(data.distanceTotal)} km`);
    set('roomSteps', number(data.stepsToday));
    set('roomWalkingTime', duration(data.walkingMinutes));
    set('roomWeather', data.temperature == null ? 'Waiting for live data' : `${data.temperature}°C`);
    set('roomAltitude', data.altitude == null ? '—' : `${number(data.altitude)} m`);
    set('roomBattery', data.battery == null ? '—' : `${data.battery}%`);
    set('roomConnection', data.connectivity || 'Unknown');
    set('roomSleep', data.lastSleep || 'Not shared');
    set('roomNext', data.nextPlace || 'The road decides');
    set('roomEta', data.nextPlaceEta || 'Estimate pending');
    set('latestTitle', data.latestTitle || 'Latest dispatch');
    set('latestText', data.latestText || 'The next story will appear here.');
    set('roomSponsor', data.sponsorName || 'Partnership open');

    const progress = Math.min(100, Math.max(0, ((Number(data.distanceTotal) || 0) / (Number(data.targetDistance) || 4000)) * 100));
    const progressBar = $('journeyProgress');
    if (progressBar) {
      progressBar.style.width = `${progress}%`;
      progressBar.parentElement.setAttribute('aria-valuenow', String(Math.round(progress)));
    }
    set('progressText', `${progress.toFixed(1)}% of the road walked`);

    const latestLink = $('latestLink');
    if (latestLink) latestLink.href = data.latestUrl || 'journal.html';
    const sponsorLink = $('sponsorOfDay');
    if (sponsorLink) sponsorLink.href = data.sponsorUrl || 'sponsorship.html';

    const updated = data.updatedAt ? new Date(data.updatedAt) : null;
    set('roomUpdated', updated && !Number.isNaN(updated.valueOf()) ? `Updated ${updated.toLocaleString('en-IN')}` : 'Live publishing begins on day one');
    renderStories(data.stories || []);
  }

  function renderStories(stories) {
    const list = $('storyCapsules');
    if (!list) return;
    list.innerHTML = '';
    (stories.length ? stories : fallback.stories || []).slice().reverse().forEach((story, index) => {
      const article = document.createElement('article');
      article.className = 'story-capsule';
      article.innerHTML = `<button type="button" aria-expanded="${index === 0}"><span>${story.place || 'On the road'}</span><strong>${story.title || 'Untitled field note'}</strong><small>${story.type || 'dispatch'} · open story</small></button><div class="story-capsule-body"><p>${story.text || ''}</p>${story.url ? `<a class="text-link" href="${story.url}">Read or watch →</a>` : ''}</div>`;
      const button = article.querySelector('button');
      button.addEventListener('click', () => {
        const open = article.classList.toggle('open');
        button.setAttribute('aria-expanded', String(open));
      });
      if (index === 0) article.classList.add('open');
      list.appendChild(article);
    });
  }

  async function load() {
    render(fallback);
    try {
      const response = await fetch('/api/journey', { headers: { accept: 'application/json' }, cache: 'no-store' });
      if (!response.ok) throw new Error('Journey API unavailable');
      render({ ...fallback, ...(await response.json()) });
    } catch (error) {
      document.body.dataset.dataSource = 'fallback';
    }
  }

  load();
  window.setInterval(load, 60000);
})();
