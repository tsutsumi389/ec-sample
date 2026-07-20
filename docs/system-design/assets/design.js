(function(){
  // mobile toc toggle
  var btn=document.getElementById('menuBtn'),toc=document.getElementById('toc'),scrim=document.getElementById('scrim');
  function close(){toc.classList.remove('open');scrim.classList.remove('show');}
  btn&&btn.addEventListener('click',function(){var o=toc.classList.toggle('open');scrim.classList.toggle('show',o);});
  scrim&&scrim.addEventListener('click',close);
  toc&&toc.addEventListener('click',function(e){if(e.target.tagName==='A'&&window.innerWidth<=920)close();});
})();
