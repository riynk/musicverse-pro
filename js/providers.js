/* MUSICVERSE PRO — federated source adapters.
 * The adapters normalize catalog records but preserve source and playback rights.
 * No scraping, credential harvesting, or undocumented stream extraction.
 */
(()=>{
'use strict';
const config=window.MUSICVERSE_CONFIG||{};
const APP_NAME='MUSICVERSE_PRO';
const timeoutFetch=async(url,timeout=11000)=>{
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeout);
  try{
    const response=await fetch(url,{signal:controller.signal,headers:{Accept:'application/json'}});
    if(!response.ok)throw new Error('HTTP '+response.status);
    return await response.json();
  }finally{clearTimeout(timer)}
};
const jsonp=(url,timeout=12000)=>new Promise((resolve,reject)=>{
  const callback='__mvJSONP_'+Date.now()+'_'+Math.random().toString(36).slice(2);
  const script=document.createElement('script');
  let settled=false;
  const finish=(error,value)=>{
    if(settled)return;settled=true;clearTimeout(timer);delete window[callback];script.remove();
    error?reject(error):resolve(value);
  };
  const timer=setTimeout(()=>finish(new Error('Apple Search timeout')),timeout);
  window[callback]=data=>finish(null,data);
  script.onerror=()=>finish(new Error('Apple Search unavailable'));
  script.src=url+(url.includes('?')?'&':'?')+'callback='+callback;
  document.head.appendChild(script);
});
const safeURL=value=>{
  try{const u=new URL(value);return ['https:','http:'].includes(u.protocol)?u.href:''}catch{return ''}
};
const artworkOf=value=>safeURL(value||'');
const safeStreamURL=value=>{const url=safeURL(value);return url.startsWith('https://')?url:''};
const normalizeAudius=track=>{
  const user=track.user||{};
  const gated=!!track.is_stream_gated||!!(track.stream_conditions&&Object.keys(track.stream_conditions).length);
  const id=String(track.id||'');
  const slug=track.permalink||'';
  return {
    id:'audius:'+id,source:'audius',sourceLabel:'Audius',sourceId:id,
    title:track.title||'Untitled',artist:user.name||track.artist_name||'Audius creator',
    album:track.album_name||'',duration:Number(track.duration)||0,
    artwork:artworkOf(track.artwork?.['480x480']||track.artwork?.['150x150']||track.artwork?.['1000x1000']),
    externalUrl:safeURL(slug)||('https://audius.co/search?q='+encodeURIComponent(track.title||'')),
    playbackUrl:gated?'':('https://api.audius.co/v1/tracks/'+encodeURIComponent(id)+'/stream?app_name='+APP_NAME),
    playbackType:gated?'external':'stream',
    playbackLabel:gated?'Buka di Audius':'Putar dari Audius',
    gated
  };
};
async function searchAudius(query){
  const url='https://api.audius.co/v1/tracks/search?'+new URLSearchParams({query,limit:'12'});
  const json=await timeoutFetch(url);
  const rows=Array.isArray(json.data)?json.data:[];
  return rows.map(normalizeAudius).filter(x=>x.sourceId&&x.title);
}
async function searchApple(query){
  const params=new URLSearchParams({term:query,country:'ID',media:'music',entity:'song',limit:'16',explicit:'Yes'});
  const json=await jsonp('https://itunes.apple.com/search?'+params.toString());
  return (json.results||[]).map(track=>({
    id:'apple:'+track.trackId,source:'apple',sourceLabel:'Apple Music',sourceId:String(track.trackId||''),
    title:track.trackName||'Untitled',artist:track.artistName||'Unknown artist',
    album:track.collectionName||'',duration:Math.round((Number(track.trackTimeMillis)||0)/1000),
    artwork:artworkOf((track.artworkUrl100||'').replace('100x100','300x300')),
    externalUrl:safeURL(track.trackViewUrl)||safeURL(track.collectionViewUrl),
    playbackUrl:safeURL(track.previewUrl),
    playbackType:track.previewUrl?'preview':'external',
    playbackLabel:track.previewUrl?'Cuplikan 30 detik':'Buka di Apple Music',
    storeLabel:'Buka di Apple Music'
  })).filter(x=>x.sourceId&&x.title);
}
let radioServerPromise;
async function radioServer(){
  if(!radioServerPromise){
    radioServerPromise=timeoutFetch('https://all.api.radio-browser.info/json/servers',7000)
      .then(rows=>{
        const names=(rows||[]).map(x=>x.name).filter(Boolean);
        if(!names.length)throw new Error('No radio servers');
        return 'https://'+names[Math.floor(Math.random()*names.length)];
      }).catch(()=>'https://de1.api.radio-browser.info');
  }
  return radioServerPromise;
}
async function searchRadio(query){
  const server=await radioServer();
  const params=new URLSearchParams({name:query,limit:'12',hidebroken:'true',order:'clickcount',reverse:'true'});
  const rows=await timeoutFetch(server+'/json/stations/search?'+params.toString());
  return (rows||[]).filter(station=>station.stationuuid&&station.name).map(station=>({
    id:'radio:'+station.stationuuid,source:'radio',sourceLabel:'Radio Browser',sourceId:station.stationuuid,
    title:station.name,artist:[station.country,station.tags].filter(Boolean).join(' · ')||'Radio station',
    album:station.codec||'Live radio',duration:0,artwork:artworkOf(station.favicon),
    externalUrl:safeURL(station.homepage)||('https://www.radio-browser.info/'),
    playbackUrl:Number(station.lastcheckok)===1?safeStreamURL(station.url_resolved||station.url):'',
    playbackType:Number(station.lastcheckok)===1&&safeStreamURL(station.url_resolved||station.url)?'stream':'external',
    playbackLabel:Number(station.lastcheckok)===1&&safeStreamURL(station.url_resolved||station.url)?'Dengarkan siaran':'Buka situs radio',
    bitrate:Number(station.bitrate)||0,codec:station.codec||''
  })).filter(x=>x.playbackUrl||x.externalUrl);
}
async function searchArchive(query){
  const params=new URLSearchParams();
  params.set('q','('+query.replace(/[+\-!(){}\[\]^"~*?:\\/]/g,' ').trim()+') AND mediatype:audio');
  ['identifier','title','creator','year','licenseurl'].forEach(k=>params.append('fl[]',k));
  params.set('rows','12');params.set('page','1');params.set('output','json');
  const json=await timeoutFetch('https://archive.org/advancedsearch.php?'+params.toString());
  return (json.response?.docs||[]).map(item=>({
    id:'archive:'+item.identifier,source:'archive',sourceLabel:'Internet Archive',sourceId:item.identifier,
    title:item.title||item.identifier,artist:Array.isArray(item.creator)?item.creator.join(', '):(item.creator||'Internet Archive collection'),
    album:item.year||'Open archive',duration:0,artwork:'https://archive.org/services/img/'+encodeURIComponent(item.identifier),
    externalUrl:'https://archive.org/details/'+encodeURIComponent(item.identifier),
    playbackUrl:'',playbackType:'external',playbackLabel:'Buka rekaman',
    licenseUrl:safeURL(item.licenseurl||'')
  })).filter(x=>x.sourceId&&x.title);
}

let youtubeApiKey='';
try{youtubeApiKey=config.youtubeApiKey||localStorage.getItem('musicverse-youtube-api-key')||''}catch{}
let jamendoClientId='';
try{jamendoClientId=config.jamendoClientId||localStorage.getItem('musicverse-jamendo-client-id')||''}catch{}
function setJamendoClientId(value){
  jamendoClientId=String(value||'').trim();
  try{if(jamendoClientId)localStorage.setItem('musicverse-jamendo-client-id',jamendoClientId);else localStorage.removeItem('musicverse-jamendo-client-id')}catch{return false}
  return true;
}
function setYoutubeApiKey(value){
  youtubeApiKey=String(value||'').trim();
  try{if(youtubeApiKey)localStorage.setItem('musicverse-youtube-api-key',youtubeApiKey);else localStorage.removeItem('musicverse-youtube-api-key')}catch{return false}
  return true;
}
async function searchYouTube(query){
  if(!youtubeApiKey)throw new Error('API key YouTube belum dipasang pada setelan sumber.');
  const params=new URLSearchParams({part:'snippet',q:query,type:'video',videoCategoryId:'10',maxResults:'10',safeSearch:'moderate',key:youtubeApiKey});
  const json=await timeoutFetch('https://www.googleapis.com/youtube/v3/search?'+params.toString());
  if(json.error)throw new Error(json.error.message||'YouTube API error');
  return (json.items||[]).map(item=>{
    const snippet=item.snippet||{},id=item.id?.videoId||'';
    return {
      id:'youtube:'+id,source:'youtube',sourceLabel:'YouTube',sourceId:id,
      title:snippet.title||'Untitled video',artist:snippet.channelTitle||'YouTube creator',
      album:'Video musik · YouTube',duration:0,
      artwork:artworkOf(snippet.thumbnails?.high?.url||snippet.thumbnails?.medium?.url||snippet.thumbnails?.default?.url),
      externalUrl:id?'https://www.youtube.com/watch?v='+encodeURIComponent(id):'',
      playbackUrl:'',playbackType:'external',playbackLabel:'Tonton di YouTube'
    };
  }).filter(item=>item.sourceId);
}


async function searchJamendo(query){
  if(!jamendoClientId)throw new Error('Client ID Jamendo belum dipasang pada setelan sumber.');
  const params=new URLSearchParams({
    client_id:jamendoClientId,format:'json',limit:'12',
    search:query,type:'single albumtrack',
    include:'licenses,musicinfo',audioformat:'mp32',imagesize:'300'
  });
  const json=await jsonp('https://api.jamendo.com/v3.0/tracks/?'+params.toString());
  if(json.headers?.status&&json.headers.status!=='success')throw new Error(json.headers.error_message||'Jamendo API error');
  return (json.results||[]).map(track=>{
    const licenseUrl=safeURL(track.license_ccurl||'');
    const playbackUrl=safeStreamURL(track.audio||'');
    return {
      id:'jamendo:'+track.id,source:'jamendo',sourceLabel:'Jamendo',sourceId:String(track.id||''),
      title:track.name||'Untitled',artist:track.artist_name||'Jamendo artist',
      album:[track.album_name,licenseUrl?'Creative Commons':'Jamendo terms'].filter(Boolean).join(' · '),
      duration:Number(track.duration)||0,
      artwork:artworkOf(track.album_image||track.image),
      externalUrl:safeURL(track.shareurl||track.shorturl),
      playbackUrl,playbackType:playbackUrl?'stream':'external',
      playbackLabel:playbackUrl?'Putar dari Jamendo':'Buka di Jamendo',
      licenseUrl,licenseType:licenseUrl?'Creative Commons':'Jamendo',
      downloadAllowed:track.audiodownload_allowed===true
    };
  }).filter(track=>track.sourceId&&track.title);
}

const PROVIDERS={
  audius:{label:'Audius',type:'streaming',search:searchAudius},
  apple:{label:'Apple Music',type:'licensed-catalog-preview',search:searchApple},
  radio:{label:'Radio Browser',type:'live-radio',search:searchRadio},
  archive:{label:'Internet Archive',type:'metadata-archive',search:searchArchive},
  youtube:{label:'YouTube',type:'official-video-discovery',search:searchYouTube},
  jamendo:{label:'Jamendo',type:'licensed-independent-streaming',search:searchJamendo}
};
async function search(query,filter='all'){
  const selected=filter==='all'?Object.keys(PROVIDERS).filter(key=>(key!=='youtube'||!!youtubeApiKey)&&(key!=='jamendo'||!!jamendoClientId)):[filter];
  const providers=selected.filter(key=>PROVIDERS[key]);
  const outcomes=await Promise.all(providers.map(async key=>{
    try{return {key,items:await PROVIDERS[key].search(query),error:null}}
    catch(error){return {key,items:[],error:error?.message||'Tidak tersedia'}}
  }));
  return {
    items:outcomes.flatMap(x=>x.items),
    providers:outcomes.map(x=>({key:x.key,label:PROVIDERS[x.key].label,count:x.items.length,error:x.error}))
  };
}
window.MusicverseSources={search,providers:PROVIDERS,setYoutubeApiKey,getYoutubeApiKey:()=>youtubeApiKey,setJamendoClientId,getJamendoClientId:()=>jamendoClientId};
})();