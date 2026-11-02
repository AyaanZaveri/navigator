(() => {
  'use strict';
  const trusted = __NAVIGATOR_ORIGIN__;
  if (window.top !== window || location.origin !== trusted || window.navigatorDesktop) return;
  const listeners = new Set();
  const setMaterials=value=>{
    const root=document.documentElement;if(!root)return;
    if(value)root.setAttribute('data-native-materials','');else root.removeAttribute('data-native-materials');
    for(const button of document.querySelectorAll?.('[data-player-close]')||[]){
      if(value){button.setAttribute('aria-hidden','true');button.tabIndex=-1;}
      else{button.removeAttribute('aria-hidden');button.removeAttribute('tabindex');}
    }
  };
  let fullscreen = false, session = "";
  let scheduleLayout = () => {};
  const send = message => {
    if (location.origin !== trusted || window.top !== window || !message || typeof message.type !== 'string') return;
    if(message.type==='load') {
      session=message.session; lastLayout='';
      setMaterials(false);
      scheduleLayout();
    }
    if(message.type==='stop' && message.session===session) {
      session=''; lastLayout='';
      setMaterials(false);
    }
    window.webkit.messageHandlers.navigator.postMessage(message);
  };
  Object.defineProperty(window, 'navigatorDesktop', {value:Object.freeze({
    protocol:1,platform:'ios',engine:'vlc',
    capabilities:Object.freeze({videoFit:true,nativePreviews:true,nativeSurfaceGestures:true,nativeMaterials:true,nativeSystemVolume:true,pip:false,airplay:false,glass:false,systemVolume:true}),
    get fullscreen(){return fullscreen;},send,
    subscribe(listener){listeners.add(listener);return()=>listeners.delete(listener);}
  }),writable:false,configurable:false});
  Object.defineProperty(window,'NavigatorIOS',{value:Object.freeze({receive(message){
    if(location.origin!==trusted || !message || typeof message.type!=='string')return;
    if(message.type==='fullscreen')fullscreen=message.value===true;
    if(message.type==='materials-ready' && session && message.session===session) {
      setMaterials(true);
    }
    if(message.type==='layout-request'){lastLayout='';setMaterials(false);scheduleLayout();}
    else if(['ready','loaded','fullscreen'].includes(message.type))scheduleLayout();
    if(message.type==='close'){
      const event=new Event('navigatornativeclose',{cancelable:true});
      if(document.dispatchEvent(event))document.querySelector('[data-player-close]')?.click();
      return;
    }
    if(message.type==='suspend'){
      document.querySelector('navigator-mpv')?.pause();return;
    }
    for(const listener of [...listeners])listener(message);
  }}),writable:false,configurable:false});
  let lastLayout='', pendingLayout=false, settleFrames=0;
  function install(){
    const root=document.documentElement;if(!root)return false;
    root.dataset.desktop='mpv';root.dataset.nativeEngine='vlc';root.dataset.nativePlatform='ios';
    const style=document.createElement('style');style.textContent=__NAVIGATOR_STYLES__;
    (document.head||root).appendChild(style);
    let visible,theme;
    const update=()=>{
      const next=root.hasAttribute('data-native-playing');
      if(visible!==next){visible=next;send({type:'visible',value:next});}
      const appearance=root.classList.contains('dark')?'dark':'light';
      if(theme!==appearance){theme=appearance;send({type:'appearance',theme});}
    };
    new MutationObserver(update).observe(root,{attributes:true,attributeFilter:['data-native-playing','class']});update();
    // Observe actual rendered geometry. Native views use window points, while
    // these rectangles are CSS points in an initial-scale=1 viewport.
    if(typeof requestAnimationFrame==='function' && typeof getComputedStyle==='function') {
      const shown=(element,ignoreOwnOpacity=false)=>{
        if(!element || element.getBoundingClientRect().width<=0)return false;
        for(let current=element;current;current=current.parentElement){
          const style=getComputedStyle(current);
          if(style.display==='none'||style.visibility==='hidden'||(!ignoreOwnOpacity&&Number(style.opacity)<.02))return false;
          ignoreOwnOpacity=false;
        }
        return true;
      };
      const rect=element=>{
        if(!element)return null;
        const r=element.getBoundingClientRect();
        return r.width>0&&r.height>0?{x:r.x,y:r.y,width:r.width,height:r.height}:null;
      };
      const measure=()=>{
        pendingLayout=false;
        if(!session||!root.hasAttribute('data-native-playing'))return;
        const player=document.querySelector('[data-slot="media-player"]');
        const closes=[...document.querySelectorAll('[data-player-close]')];
        const close=closes.reverse().find(e=>shown(e,true));
        const controls=document.querySelector('[data-slot="media-player-controls"]');
        const controlsVisible=!!controls&&controls.hasAttribute('data-visible');
        const tooltip=document.querySelector('[data-slot="media-player-seek-tooltip"]');
        const blocked=[...document.querySelectorAll('[role="menu"],[role="dialog"]')].some(e=>shown(e));
        const targets=player?[...player.querySelectorAll('button,a,input,select,textarea,[role="button"],[role="slider"]')]:[];
        const exclusions=targets.filter(e=>!e.hasAttribute('data-player-close')&&shown(e)).map(rect).filter(Boolean);
        if(controlsVisible&&shown(controls))exclusions.push(rect(controls));
        const message={type:'player-layout',session,width:innerWidth,height:innerHeight,blocked,controlsVisible,exclusions:exclusions.slice(0,64),close:rect(close),preview:shown(tooltip)?rect(tooltip):null};
        const signature=JSON.stringify(message);
        if(signature!==lastLayout){lastLayout=signature;send(message);}
        if(settleFrames-->0){pendingLayout=true;requestAnimationFrame(measure);}
      };
      scheduleLayout=()=>{settleFrames=12;if(!pendingLayout){pendingLayout=true;requestAnimationFrame(measure);}};
      const relevant='[data-slot="media-player"],[data-player-close],[data-slot="media-player-controls"],[data-slot="media-player-seek-tooltip"],[role="menu"],[role="dialog"]';
      const resizeObserver=typeof ResizeObserver==='function'?new ResizeObserver(scheduleLayout):null;
      const observeGeometry=()=>{
        resizeObserver?.disconnect();resizeObserver?.observe(root);
        for(const element of document.querySelectorAll(relevant))resizeObserver?.observe(element);
      };
      new MutationObserver(records=>{
        if(records.some(record=>record.type==='attributes'
          ?record.target.matches?.(relevant)||record.target===root
          :[...record.addedNodes,...record.removedNodes].some(node=>node.matches?.(relevant)||node.querySelector?.(relevant)))){
          observeGeometry();scheduleLayout();
        }
      }).observe(root,{subtree:true,childList:true,attributes:true,attributeFilter:['class','style','data-state','data-visible','hidden']});
      observeGeometry();
      window.addEventListener('resize',()=>{lastLayout='';scheduleLayout();});
      window.addEventListener('scroll',scheduleLayout,true);
      window.visualViewport?.addEventListener('resize',scheduleLayout);
      scheduleLayout();
    }
    return true;
  }
  if(!install()){
    const observer=new MutationObserver(()=>{if(install())observer.disconnect();});
    observer.observe(document,{childList:true,subtree:true});
  }
  window.addEventListener('pagehide',()=>send({type:'visible',value:false}));
  send({type:'hello'});
})();
