(() => {
  'use strict';
  const trusted = __NAVIGATOR_ORIGIN__;
  if (window.top !== window || location.origin !== trusted || window.navigatorDesktop) return;
  const listeners = new Set();
  let fullscreen = false;
  const send = message => {
    if (location.origin !== trusted || window.top !== window || !message || typeof message.type !== 'string') return;
    window.webkit.messageHandlers.navigator.postMessage(message);
  };
  Object.defineProperty(window, 'navigatorDesktop', {value:Object.freeze({
    protocol:1,platform:'ios',engine:'vlc',
    capabilities:Object.freeze({videoFit:true,nativePreviews:true,pip:false,airplay:false,glass:false,systemVolume:true}),
    get fullscreen(){return fullscreen;},send,
    subscribe(listener){listeners.add(listener);return()=>listeners.delete(listener);}
  }),writable:false,configurable:false});
  Object.defineProperty(window,'NavigatorIOS',{value:Object.freeze({receive(message){
    if(location.origin!==trusted || !message || typeof message.type!=='string')return;
    if(message.type==='fullscreen')fullscreen=message.value===true;
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
  function install(){
    const root=document.documentElement;if(!root)return false;
    root.dataset.desktop='mpv';root.dataset.nativeEngine='vlc';root.dataset.nativePlatform='ios';
    const style=document.createElement('style');style.textContent=__NAVIGATOR_STYLES__;
    (document.head||root).appendChild(style);
    let visible;
    const update=()=>{
      const next=root.hasAttribute('data-native-playing');
      if(visible!==next){visible=next;send({type:'visible',value:next});}
    };
    new MutationObserver(update).observe(root,{attributes:true,attributeFilter:['data-native-playing']});update();
    return true;
  }
  if(!install()){
    const observer=new MutationObserver(()=>{if(install())observer.disconnect();});
    observer.observe(document,{childList:true,subtree:true});
  }
  window.addEventListener('pagehide',()=>send({type:'visible',value:false}));
  send({type:'hello'});
})();
