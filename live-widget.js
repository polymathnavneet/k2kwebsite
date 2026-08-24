(() => {
  if (window.__K2KLiveWidgetLoaded) return;
  window.__K2KLiveWidgetLoaded = true;

  const style = document.createElement('style');
  style.textContent = `
    .k2k-float-live{position:fixed;right:18px;bottom:18px;z-index:9999;display:flex;align-items:center;gap:11px;min-width:190px;max-width:260px;padding:11px 13px;background:#201e1d;color:#f5f3ee;border:2px solid #201e1d;box-shadow:6px 6px 0 #e33a19;font-family:Arial,Helvetica,sans-serif;text-decoration:none;transition:transform .18s ease,box-shadow .18s ease}
    .k2k-float-live:hover{transform:translate(-2px,-2px);box-shadow:8px 8px 0 #e33a19}
    .k2k-float-live .dot{width:11px;height:11px;min-width:11px;border-radius:50%;background:#e33a19;box-shadow:0 0 0 5px rgba(227,58,25,.16)}
    .k2k-float-live .copy{display:flex;flex-direction:column;min-width:0}
    .k2k-float-live .label{font-size:10px;font-weight:900;letter-spacing:.13em;text-transform:uppercase}
    .k2k-float-live .place{font-size:13px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .k2k-float-live .arrow{margin-left:auto;font-size:19px;color:#e33a19}
    .k2k-float-live.stale .dot{background:#aaa;box-shadow:none}
    @keyframes k2kPulse{0%,100%{transform:scale(1)}50%{transform:scale(1.18)}}
    @media(max-width:600px){.k2k-float-live{right:12px;bottom:12px;min-width:0;width:calc(100% - 24px);max-width:none}}
  `;
  document.head.appendChild(style);

  const a = document.createElement('a');
  a.className = 'k2k-float-live';
  a.href = 'live-track.html';
  a.setAttribute('aria-label','Open K2K live tracker');
  a.innerHTML = '<span class="dot"></span><span class="copy"><span class="label">K2K · Live Track</span><span class="place">Checking latest GPS…</span></span><span class="arrow">↗</span>';
  document.body.appendChild(a);

  const place = a.querySelector('.place');
  const dot = a.querySelector('.dot');
  async function refresh(){
    try{
      const r = await fetch('/api/location?ts=' + Date.now(), {cache:'no-store'});
      if(!r.ok) throw new Error('GPS unavailable');
      const loc = await r.json();
      const age = loc.updatedAt ? Math.max(0, (Date.now()-new Date(loc.updatedAt).getTime())/1000) : Infinity;
      if(loc.source === 'live-gps' && age < 120){
        place.textContent = 'LIVE · latest GPS point'; a.classList.remove('stale'); dot.style.animation = 'k2kPulse 1.6s infinite';
      } else if(loc.source === 'live-gps'){
        place.textContent = 'Last known GPS point'; a.classList.add('stale'); dot.style.animation = 'none';
      } else {
        place.textContent = 'Lucknow · preparation mode'; a.classList.remove('stale'); dot.style.animation = 'k2kPulse 1.6s infinite';
      }
    }catch{ place.textContent = 'Open live tracker'; a.classList.add('stale'); }
  }
  refresh();
  setInterval(refresh, 20000);
})();
