const assert=require('node:assert/strict');
const fs=require('node:fs');
const {load,hooks}=require('./test-support/react-hooks.cjs');
const appearance=load('lib/subtitle-appearance.ts');
const storage=new Map();
function mount(){
 const host=hooks();const context=load('contexts/settings-context.tsx',{'react':host.react,'react/jsx-runtime':host.jsx,'@/lib/subtitle-appearance':appearance},{localStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value)}});
 host.render(context.SettingsProvider,{children:null});host.flush();host.render(context.SettingsProvider,{children:null});
 return {get value(){return context.useSettings();},render(){host.render(context.SettingsProvider,{children:null});}};
}
let settings=mount();assert.equal(settings.value.subtitleSize,'standard');assert.equal(settings.value.subtitleOutline,'thin');
settings.value.setSubtitleSize('large');settings.value.setSubtitleOutline('strong');settings.render();
assert.equal(settings.value.subtitleSize,'large');assert.equal(settings.value.subtitleOutline,'strong');
settings=mount();assert.equal(settings.value.subtitleSize,'large');assert.equal(settings.value.subtitleOutline,'strong');
storage.set('navigator-subtitle-size','huge');storage.set('navigator-subtitle-outline','blur');
settings=mount();assert.equal(settings.value.subtitleSize,'standard');assert.equal(settings.value.subtitleOutline,'thin');
const host=hooks();const {SubtitleText}=load('components/subtitle-text.tsx',{'react/jsx-runtime':host.jsx,'./subtitle-text.module.css':{default:{text:'subtitle-text'}}});
const text=SubtitleText({children:'A bright scene.\nA dark scene.'});
assert.equal(text.props['data-subtitle-outline'],'thin');assert.equal(text.props['data-player-native-glass'],undefined);
assert.equal(text.props['data-player-glass'],undefined);assert.equal(text.props.children,'A bright scene.\nA dark scene.');
const source=fs.readFileSync('components/global-media-player.tsx','utf8');const cues=source.slice(source.indexOf('{/* Current subtitle */}'),source.indexOf('{!loading && streamUrl',source.indexOf('{/* Current subtitle */}')));
assert.match(cues,/<SubtitleText/);assert.doesNotMatch(cues,/data-player-native-glass|backdrop-blur|bg-black/);
console.log('PASS: subtitle defaults, saved preferences, invalid-value recovery and sampler-free cue rendering');
