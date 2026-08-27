(function(){
  const sheet=document.createElement('link');sheet.rel='stylesheet';sheet.href='control-room.css';document.head.appendChild(sheet);
  const toggle=document.querySelector('.menu-toggle');const nav=document.getElementById('siteNav');if(!toggle||!nav)return;
  toggle.addEventListener('click',()=>{const open=toggle.getAttribute('aria-expanded')!=='true';toggle.setAttribute('aria-expanded',String(open));nav.classList.toggle('open',open)});
  nav.addEventListener('click',event=>{if(event.target.closest('a')){toggle.setAttribute('aria-expanded','false');nav.classList.remove('open')}});
})();
