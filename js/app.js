(()=>{
'use strict';
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const audio=$('#audio'), appShell=$('.app-shell');
const STORE_KEY='musicverse-pro-state-v2', DB_NAME='musicverse-pro-db', DB_STORE='audio-files';
const palettes=['linear-gradient(135deg,#75619d,#304a68)','linear-gradient(135deg,#a46985,#413450)','linear-gradient(135deg,#477b83,#273d57)','linear-gradient(135deg,#a87553,#523b4a)','linear-gradient(135deg,#6574a6,#373458)','linear-gradient(135deg,#966eaa,#36556a)'];
const S={tracks:[],liked:new Set(),playlists:[],lyrics:{},translations:{},recent:[],queue:[],remoteTracks:new Map(),remoteResults:[],sourceFilter:'all',searchSequence:0,currentId:null,shuffle:false,repeatMode:'off',view:'home',history:['home'],historyIndex:0,activePlaylistId:null,lyricMode:'lrc',theme:'dark',panelTab:'lyrics',modalMode:null,modalData:null,db:null};
let toastTimer=0,lastLyricIndex=-1,searchQuery='',remoteSearchTimer=0,lastRemoteQuery='',lastRemoteFilter='';
const escapeHTML=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmtTime=n=>Number.isFinite(n)&&n>=0?Math.floor(n/60)+':'+String(Math.floor(n%60)).padStart(2,'0'):'0:00';
const makeId=()=>window.crypto?.randomUUID?crypto.randomUUID():'mv-'+Date.now()+'-'+Math.random().toString(36).slice(2,10);
const icons=()=>{if(window.lucide)window.lucide.createIcons()};
const notify=message=>{const el=$('#toast');el.textContent=message;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),2400)};
function openDB(){
  return new Promise((resolve,reject)=>{
    if(!('indexedDB' in window)){reject(new Error('IndexedDB tidak tersedia'));return}
    const req=indexedDB.open(DB_NAME,1);
    req.onupgradeneeded=()=>{const db=req.result;if(!db.objectStoreNames.contains(DB_STORE))db.createObjectStore(DB_STORE)};
    req.onsuccess=()=>{S.db=req.result;resolve(req.result)};
    req.onerror=()=>reject(req.error||new Error('Database tidak dapat dibuka'));
  });
}
function dbRequest(mode,operation){
  return new Promise((resolve,reject)=>{
    if(!S.db){reject(new Error('Database belum siap'));return}
    const tx=S.db.transaction(DB_STORE,mode),store=tx.objectStore(DB_STORE),req=operation(store);
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error||new Error('Penyimpanan gagal'));
    tx.onabort=()=>reject(tx.error||new Error('Transaksi dibatalkan'));
  });
}
const dbPut=(id,blob)=>dbRequest('readwrite',st=>st.put(blob,id));
const dbDelete=id=>dbRequest('readwrite',st=>st.delete(id));
async function dbAll(){
  if(!S.db)return [];
  const keys=await dbRequest('readonly',st=>st.getAllKeys());
  const values=await dbRequest('readonly',st=>st.getAll());
  return keys.map((key,i)=>[key,values[i]]);
}
function saveState(){
  const state={version:2,tracks:S.tracks.map(({id,title,artist,duration,fileName,size,lastModified})=>({id,title,artist,duration,fileName,size,lastModified})),liked:[...S.liked],playlists:S.playlists,lyrics:S.lyrics,translations:S.translations,recent:S.recent,queue:S.queue.filter(id=>S.tracks.some(t=>t.id===id)),theme:S.theme};
  try{localStorage.setItem(STORE_KEY,JSON.stringify(state))}
  catch(e){notify('Penyimpanan browser penuh. Coba kurangi data lirik atau file.')}
}
function readSavedState(){
  try{
    const modern=JSON.parse(localStorage.getItem(STORE_KEY)||'null');
    if(modern)return modern;
    const old=JSON.parse(localStorage.getItem('mv-state')||'{}');
    return {version:1,tracks:[],liked:old.liked||[],playlists:old.playlists||[],lyrics:old.lyrics||{},recent:old.recent||[],queue:[]};
  }catch(e){return {tracks:[],liked:[],playlists:[],lyrics:{},recent:[],queue:[]}}
}
async function restoreLibrary(){
  const saved=readSavedState();
  S.liked=new Set(saved.liked||[]);S.playlists=Array.isArray(saved.playlists)?saved.playlists:[];S.lyrics=saved.lyrics||{};S.translations=saved.translations||{};S.recent=saved.recent||[];
  try{
    const files=await dbAll(),blobMap=new Map(files);
    S.tracks=(saved.tracks||[]).flatMap(meta=>{
      const blob=blobMap.get(meta.id);if(!blob)return [];
      return [{...meta,url:URL.createObjectURL(blob),blob}];
    });
  }catch(e){S.tracks=[];notify('Penyimpanan audio lokal tidak dapat dibuka.')}
  const valid=new Set(S.tracks.map(t=>t.id));
  S.playlists=S.playlists.map(p=>({...p,trackIds:(p.trackIds||[]).filter(id=>valid.has(id))}));
  S.recent=S.recent.filter(id=>valid.has(id));
  S.queue=(saved.queue||[]).filter(id=>valid.has(id));
  S.theme=saved.theme==='light'?'light':'dark';
  document.body.classList.toggle('light',S.theme==='light');
  saveState();renderAll();
}
function parseName(file){
  const raw=file.name.replace(/\.[^.]+$/,'').replace(/[_]+/g,' ').trim();
  const parts=raw.split(/\s+-\s+/);
  if(parts.length>1)return {artist:parts.shift().trim()||'File lokal',title:parts.join(' - ').trim()||raw};
  return {artist:'File lokal',title:raw||'Audio tanpa judul'};
}
function readDuration(file){
  return new Promise(resolve=>{
    const url=URL.createObjectURL(file),probe=new Audio();let done=false;
    const finish=value=>{if(done)return;done=true;URL.revokeObjectURL(url);probe.removeAttribute('src');resolve(Number.isFinite(value)?value:0)};
    probe.preload='metadata';probe.onloadedmetadata=()=>finish(probe.duration);probe.onerror=()=>finish(0);
    probe.src=url;setTimeout(()=>finish(0),8000);
  });
}
async function importFiles(fileList){
  const files=[...fileList].filter(f=>f.type.startsWith('audio/')||/\.(mp3|m4a|aac|wav|flac|ogg|oga|opus|aiff|wma)$/i.test(f.name));
  if(!files.length){notify('Tidak ada file audio yang valid.');return}
  let added=0,failed=0;
  for(const file of files){
    const duplicate=S.tracks.some(t=>t.fileName===file.name&&t.size===file.size&&t.lastModified===file.lastModified);
    if(duplicate)continue;
    const meta=parseName(file),id=makeId(),url=URL.createObjectURL(file),duration=await readDuration(file);
    const track={id,title:meta.title,artist:meta.artist,duration,fileName:file.name,size:file.size,lastModified:file.lastModified,url,blob:file};
    S.tracks.push(track);added++;
    try{await dbPut(id,file)}catch(e){failed++}
  }
  saveState();renderAll();
  if(added){notify(added+' lagu ditambahkan ke perpustakaan.');if(!S.currentId)playTrack(S.tracks[0].id,S.tracks.map(t=>t.id))}
  else if(!failed)notify('File tersebut sudah ada di perpustakaan.');
  if(failed)notify('Audio berhasil dibuka untuk sesi ini, tetapi penyimpanan permanen gagal. Periksa ruang browser.');
}
const getTrack=id=>S.tracks.find(t=>t.id===id)||S.remoteTracks.get(id);
const currentTrack=()=>getTrack(S.currentId);
function trackRow(t,index,options={}){
  const current=t.id===S.currentId,liked=S.liked.has(t.id),remove=options.removeFromPlaylist;
  return '<div class="track-row '+(current?'is-current':'')+'" data-track-row="'+escapeHTML(t.id)+'">'+
    '<button class="track-index" data-action="play" data-id="'+escapeHTML(t.id)+'" aria-label="Putar '+escapeHTML(t.title)+'">'+(current&&!audio.paused?'<i data-lucide="audio-lines"></i>':String(index+1).padStart(2,'0'))+'</button>'+
    '<div class="track-cover" style="background:'+palettes[index%palettes.length]+'"><i data-lucide="music-2"></i></div>'+
    '<div class="track-info"><strong title="'+escapeHTML(t.title)+'">'+escapeHTML(t.title)+'</strong><span>'+escapeHTML(t.artist)+'</span></div>'+
    '<span class="track-album">Local audio</span><span class="track-duration">'+fmtTime(t.duration)+'</span>'+
    '<button class="track-action '+(liked?'liked':'')+'" data-action="like" data-id="'+escapeHTML(t.id)+'" aria-label="Sukai '+escapeHTML(t.title)+'"><i data-lucide="heart"></i></button>'+
    (remove?'<button class="track-action" data-action="remove-from-playlist" data-id="'+escapeHTML(t.id)+'" aria-label="Hapus dari playlist"><i data-lucide="x"></i></button>':'<button class="track-action" data-action="add-to-playlist" data-id="'+escapeHTML(t.id)+'" aria-label="Tambahkan ke playlist"><i data-lucide="list-plus"></i></button>')+
    '</div>';
}
function emptyState(title,description,buttonLabel,buttonId){
  return '<div class="empty-state"><i data-lucide="disc-3"></i><strong>'+escapeHTML(title)+'</strong><p>'+escapeHTML(description)+'</p>'+(buttonLabel?'<button class="button-outline" data-action="'+escapeHTML(buttonId)+'">'+escapeHTML(buttonLabel)+'</button>':'')+'</div>';
}
function playlistCard(p){
  const count=(p.trackIds||[]).length;
  return '<button class="playlist-card" data-action="open-playlist" data-id="'+escapeHTML(p.id)+'"><span class="playlist-card-art"><i data-lucide="list-music"></i></span><strong>'+escapeHTML(p.name)+'</strong><span>'+count+' lagu · Playlist pribadi</span></button>';
}
function renderPlaylistNavigation(){
  $('#sidebarPlaylists').innerHTML=S.playlists.map(p=>'<button class="playlist-link" data-action="open-playlist" data-id="'+escapeHTML(p.id)+'"><i data-lucide="list-music"></i><span>'+escapeHTML(p.name)+'</span></button>').join('');
  $('#statPlaylists').textContent=S.playlists.length;
  $('#playlistCount').textContent=S.playlists.length;
}
function renderAll(){
  const recent=S.recent.map(getTrack).filter(Boolean);
  $('#recentTracks').innerHTML=recent.length?recent.slice(0,5).map(trackRow).join(''):emptyState('Belum ada perjalanan musik','Impor file audio untuk mulai membangun riwayat dengarmu.','Impor musik','import-audio');
  $('#libraryTracks').innerHTML=S.tracks.length?S.tracks.map(trackRow).join(''):emptyState('Perpustakaan masih hening','Masukkan file audio dari perangkatmu. File tetap tersimpan di browser.','Impor musik','import-audio');
  const liked=S.tracks.filter(t=>S.liked.has(t.id));
  $('#likedTracks').innerHTML=liked.length?liked.map(trackRow).join(''):emptyState('Belum ada lagu favorit','Tekan ikon hati pada lagu yang ingin kamu simpan.','','');
  $('#exploreTracks').innerHTML=S.tracks.length?S.tracks.slice(0,8).map(trackRow).join(''):emptyState('Ruang ini menunggu musikmu','Impor audio pribadi untuk mulai menjelajah koleksi.','Impor musik','import-audio');
  $('#libraryPlaylists').innerHTML=S.playlists.length?S.playlists.map(playlistCard).join(''):emptyState('Belum ada playlist','Buat ruang kurasi pertama dari tombol tambah playlist.','','');
  $('#likedCount').textContent=liked.length+' lagu tersimpan';
  $('#libraryCount').textContent=S.tracks.length;
  $('#statTracks').textContent=S.tracks.length;
  $('#statLiked').textContent=liked.length;
  renderPlaylistNavigation();renderCurrent();renderQueue();renderLyrics();
  if(S.view==='search')renderSearch(searchQuery);
  if(S.view==='playlist')renderPlaylist();
  icons();
}
function goView(view,push=true){
  const allowed=['home','explore','search','liked','library','playlist','lyrics'];
  if(!allowed.includes(view))view='home';
  if(push&&S.view!==view){S.history=S.history.slice(0,S.historyIndex+1);S.history.push(view);S.historyIndex=S.history.length-1}
  S.view=view;
  $$('.view').forEach(v=>v.classList.toggle('active',v.id===view+'View'));
  $$('.nav-link').forEach(b=>b.classList.toggle('active',b.dataset.view===view||(view==='playlist'&&b.dataset.view==='library')));
  $('#sidebar').classList.remove('open');
  if(view==='search')$('#pageSearch').value=searchQuery;
  if(view==='playlist')renderPlaylist();
  if(view==='lyrics')renderStudio();
  icons();
}
function historyMove(delta){
  const next=S.historyIndex+delta;if(next<0||next>=S.history.length)return;
  S.historyIndex=next;goView(S.history[next],false);
}
function playTrack(id,queueIds){
  const track=getTrack(id);if(!track)return;
  if(Array.isArray(queueIds))S.queue=queueIds.filter((v,i,a)=>getTrack(v)&&a.indexOf(v)===i);
  if(!S.queue.length)S.queue=S.tracks.map(t=>t.id);
  if(!S.queue.includes(id))S.queue.unshift(id);
  S.currentId=id;lastLyricIndex=-1;const source=track.playbackUrl||track.url;if(!source){notify('Sumber ini hanya menyediakan katalog atau tautan eksternal.');return}audio.src=source;audio.load();
  audio.play().catch(()=>notify('Browser belum dapat memutar file ini. Coba format audio lain.'));
  S.recent=[id,...S.recent.filter(v=>v!==id)].slice(0,20);saveState();renderCurrent();renderQueue();renderAll();
}
function playFromList(list){
  const ids=list.filter(id=>getTrack(id));
  if(!ids.length){notify('Belum ada lagu untuk diputar.');return}
  playTrack(ids[0],ids);
}
function togglePlayback(){
  if(!S.currentId){if(S.tracks.length)playFromList(S.tracks.map(t=>t.id));else $('#audioFiles').click();return}
  if(audio.paused)audio.play().catch(()=>notify('Audio tidak dapat diputar.'));else audio.pause();
}
function nextTrack(){
  if(!S.queue.length)S.queue=S.tracks.map(t=>t.id);
  if(!S.queue.length)return;
  let nextId;
  if(S.shuffle&&S.queue.length>1){const choices=S.queue.filter(id=>id!==S.currentId);nextId=choices[Math.floor(Math.random()*choices.length)]}
  else{const i=S.queue.indexOf(S.currentId);if(i<0)nextId=S.queue[0];else if(i<S.queue.length-1)nextId=S.queue[i+1];else if(S.repeatMode==='all')nextId=S.queue[0];else{audio.pause();audio.currentTime=0;renderCurrent();return}}
  playTrack(nextId);
}
function prevTrack(){
  if(audio.currentTime>3){audio.currentTime=0;return}
  const i=S.queue.indexOf(S.currentId),id=i>0?S.queue[i-1]:S.tracks[Math.max(0,S.tracks.findIndex(t=>t.id===S.currentId)-1)]?.id;
  if(id)playTrack(id);
}
function renderCurrent(){
  const t=currentTrack(),playing=!!t&&!audio.paused;
  $('#playerTitle').textContent=t?t.title:'Pilih sebuah lagu';
  const sourceLabel=t?.sourceLabel?' · '+t.sourceLabel:'';
  $('#playerArtist').textContent=t?t.artist+sourceLabel:'Musicverse local library';
  $('#sideTrackTitle').textContent=t?t.title:'Belum ada lagu';
  $('#sideTrackArtist').textContent=t?t.artist+sourceLabel:'Pilih musik untuk memulai';
  $('#studioTrackTitle').textContent=t?t.title:'Belum ada lagu dipilih';
  $('#studioTrackArtist').textContent=t?t.artist+sourceLabel:'Pilih lagu dari perpustakaan';
  $('#queueNowTitle').textContent=t?t.title:'Belum ada lagu';
  $('#playBtn').innerHTML='<i data-lucide="'+(playing?'pause':'play')+'"></i>';
  $('#playBtn').setAttribute('aria-label',playing?'Jeda':'Putar');
  $('#likeCurrent').classList.toggle('liked',!!t&&S.liked.has(t.id));
  $('#likeCurrent').disabled=!!t?.source;
  $('#likeCurrent').title=t?.source?'Favorit lintas sumber akan tersedia setelah sinkronisasi akun':'Sukai lagu';
  $('#sideArt').style.background=t?palettes[Math.max(0,S.tracks.indexOf(t))%palettes.length]:'radial-gradient(circle at 50% 45%,#77609e,#292741 61%,#171a28)';
  $('#playerCover').style.background=t?palettes[Math.max(0,S.tracks.indexOf(t))%palettes.length]:'linear-gradient(135deg,#72608f,#32475d)';
  $('#currentTime').textContent=fmtTime(audio.currentTime||0);
  $('#duration').textContent=fmtTime(t?.duration||audio.duration||0);
  if(!audio.duration)$('#seekBar').value=0;
  else if(!$('#seekBar').matches(':active'))$('#seekBar').value=Math.round(audio.currentTime/audio.duration*1000);
  $('#shuffleBtn').classList.toggle('active',S.shuffle);
  $('#repeatBtn').classList.toggle('active',S.repeatMode!=='off');
  $('#repeatBtn').innerHTML='<i data-lucide="'+(S.repeatMode==='one'?'repeat-1':'repeat')+'"></i>';
  icons();renderLyrics();if(S.view==='lyrics')renderStudio();
}
function toggleLike(id){
  if(S.liked.has(id))S.liked.delete(id);else S.liked.add(id);
  saveState();renderAll();notify(S.liked.has(id)?'Ditambahkan ke lagu disukai.':'Dihapus dari lagu disukai.');
}
function renderQueue(){
  const ids=S.queue.filter(id=>getTrack(id));
  $('#queueList').innerHTML=ids.filter(id=>id!==S.currentId).map((id,i)=>{
    const t=getTrack(id);return '<div class="queue-row" data-queue-id="'+escapeHTML(id)+'"><span class="queue-index">'+String(i+1).padStart(2,'0')+'</span><div><strong>'+escapeHTML(t.title)+'</strong><span>'+escapeHTML(t.artist)+'</span></div><button data-action="play" data-id="'+escapeHTML(id)+'" aria-label="Putar '+escapeHTML(t.title)+'"><i data-lucide="play"></i></button></div>';
  }).join('')||'<p class="lyrics-empty">Belum ada lagu berikutnya. Putar koleksi atau playlist untuk mengisi antrean.</p>';
  $('#queueNowTitle').textContent=currentTrack()?.title||'Belum ada lagu';
  icons();
}
function parseLyrics(raw){
  const out=[];
  String(raw||'').split(/\r?\n/).forEach(line=>{
    const times=[...line.matchAll(/\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/g)];
    const text=line.replace(/\[\d{1,2}:\d{2}(?:[.:]\d{1,3})?\]/g,'').replace(/^\s+|\s+$/g,'');
    if(times.length){times.forEach(m=>{const frac=m[3]?Number('0.'+m[3]):0;out.push({time:Number(m[1])*60+Number(m[2])+frac,text})})}
    else if(text)out.push({time:null,text});
  });
  return out.sort((a,b)=>a.time===null?1:b.time===null?-1:a.time-b.time);
}
function activeLyricIndex(entries){
  const timed=entries.map((x,i)=>({x,i})).filter(v=>v.x.time!==null);
  if(!timed.length)return -1;
  let active=timed[0].i;
  for(const item of timed){if(item.x.time<=audio.currentTime+.08)active=item.i;else break}
  return active;
}
function renderLyrics(){
  const t=currentTrack(),raw=t?(S.lyrics[t.id]||''):'',entries=parseLyrics(raw),active=activeLyricIndex(entries),translations=t?(S.translations[t.id]||'').split(/\r?\n/):[];
  $('#sideLyrics').innerHTML=entries.length?entries.map((line,i)=>{
    const enabled=line.time!==null,translation=(translations[i]||'').trim();
    return '<button class="lyric-line '+(i===active?'active':'')+'" '+(enabled?'data-action="seek-lyric" data-time="'+line.time+'"':'')+'>'+escapeHTML(line.text)+(translation?'<small class="lyric-translation">'+escapeHTML(translation)+'</small>':'')+'</button>';
  }).join(''):'<p class="lyrics-empty">Lirik belum ditambahkan. Buka Lyrics Studio untuk menempelkan lirik atau file .LRC milikmu.</p>';
  $('#syncStatus').textContent=entries.some(x=>x.time!==null)?'TIMESTAMP SYNC READY':entries.length?'PLAIN TEXT · NO TIMECODE':'WAITING FOR LYRICS';
  const studio=$('#studioPreview');
  if(studio){studio.innerHTML=entries.length?entries.map((line,i)=>'<p class="preview-line '+(i===active?'active':'')+'">'+(line.time!==null?'<small>'+fmtTime(line.time)+'</small> ':'')+escapeHTML(line.text)+((translations[i]||'').trim()?'<small class="preview-translation">'+escapeHTML(translations[i].trim())+'</small>':'')+'</p>').join(''):'<p class="preview-empty">Lirik yang memiliki timestamp akan menyala mengikuti posisi lagu.</p>'}
  lastLyricIndex=active;
  syncLyricScroll();
}
function updateLyricHighlight(){
  const t=currentTrack();if(!t)return;
  const entries=parseLyrics(S.lyrics[t.id]||''),active=activeLyricIndex(entries);
  if(active===lastLyricIndex)return;
  lastLyricIndex=active;
  $$('#sideLyrics .lyric-line').forEach((el,i)=>el.classList.toggle('active',i===active));
  $$('#studioPreview .preview-line').forEach((el,i)=>el.classList.toggle('active',i===active));
  syncLyricScroll();
}
function syncLyricScroll(){
  const line=$('#sideLyrics .lyric-line.active'),studio=$('#studioPreview .preview-line.active');
  if(line&&line.offsetTop>$('#sideLyrics').scrollTop+$('#sideLyrics').clientHeight-55)line.scrollIntoView({block:'center',behavior:'smooth'});
  if(studio&&studio.offsetTop>$('#studioPreview').scrollTop+$('#studioPreview').clientHeight-50)studio.scrollIntoView({block:'center',behavior:'smooth'});
}
function renderStudio(){
  const t=currentTrack();$('#studioLyrics').value=t?(S.lyricMode==='translation'?(S.translations[t.id]||''):(S.lyrics[t.id]||'')):'';
  setLyricMode(S.lyricMode,false);renderLyrics();
}
function setLyricMode(mode,toast=true){
  S.lyricMode=['plain','translation'].includes(mode)?mode:'lrc';
  $$('[data-lyric-mode]').forEach(b=>b.classList.toggle('active',b.dataset.lyricMode===S.lyricMode));
  $('#lyricHint').textContent=S.lyricMode==='lrc'?'Format: [mm:ss.xx] lirik':S.lyricMode==='translation'?'Terjemahan per baris · urutan mengikuti lirik asli':'Teks biasa · tanpa sinkronisasi waktu';
  $('#studioLyrics').placeholder=S.lyricMode==='lrc'?'[00:12.40] Baris lirik pertama\n[00:16.20] Baris lirik berikutnya':S.lyricMode==='translation'?'Terjemahkan setiap baris sesuai urutan lirik asli. Baris kosong boleh dipakai sebagai pemisah.':'Tempel lirik dalam bentuk teks biasa di sini...';
  if(toast)notify(S.lyricMode==='lrc'?'Mode lirik bertanda waktu aktif.':S.lyricMode==='translation'?'Mode terjemahan aktif.':'Mode teks biasa aktif.');
}
function saveLyrics(){
  const t=currentTrack();if(!t){notify('Pilih lagu terlebih dahulu.');return}
  const value=$('#studioLyrics').value.trim();
  if(S.lyricMode==='translation'){S.translations[t.id]=value;saveState();renderLyrics();notify(value?'Terjemahan lirik disimpan.':'Terjemahan dihapus.');return}
  S.lyrics[t.id]=value;saveState();renderLyrics();
  const timed=parseLyrics(value).filter(x=>x.time!==null).length;
  notify(value?(timed?timed+' baris lirik tersinkron disimpan.':'Lirik teks biasa disimpan.'):'Lirik dihapus.');
}
function seekToLyric(time){if(Number.isFinite(time)&&audio.duration){audio.currentTime=Math.min(Math.max(0,time),audio.duration);if(audio.paused)audio.play().catch(()=>{})}}
function renderSearch(query){
  const q=(query||'').trim().toLowerCase();
  const tracks=q?S.tracks.filter(t=>(t.title+' '+t.artist+' '+t.fileName).toLowerCase().includes(q)):S.tracks;
  const playlists=q?S.playlists.filter(p=>p.name.toLowerCase().includes(q)):S.playlists;
  $('#searchTitle').textContent=q?'Hasil untuk “'+query+'”':'Koleksi lokal';
  $('#searchCount').textContent=tracks.length+' lagu'+(playlists.length?' · '+playlists.length+' playlist':'');
  let html=tracks.map(trackRow).join('');
  if(playlists.length)html+='<div class="search-playlist-results"><span class="section-kicker">PLAYLISTS</span><div class="playlist-grid">'+playlists.map(playlistCard).join('')+'</div></div>';
  $('#searchResults').innerHTML=html||emptyState(q?'Tidak ada yang cocok':'Perpustakaan masih kosong',q?'Coba kata kunci lain atau impor audio ke perangkatmu.':'Impor audio agar pencarian dapat menemukan musikmu.','Impor musik','import-audio');
  scheduleFederatedSearch(query);
  icons();
}

function renderFederatedResults(){
  const container=$('#externalSearchResults'),status=$('#externalSearchStatus'),count=$('#externalSearchCount');
  if(!container||!status||!count)return;
  const rows=S.remoteResults;
  count.textContent=rows.length+' hasil';
  if(!rows.length){container.innerHTML=emptyState('Belum ada hasil eksternal','Coba kata kunci lain. Sebagian sumber mungkin sedang tidak merespons.','','');return}
  container.innerHTML=rows.map(track=>{
    const artwork=safeExternalURL(track.artwork),link=safeExternalURL(track.externalUrl);
    const canPlay=!!safeExternalURL(track.playbackUrl);
    const badge=track.sourceLabel||'Sumber eksternal';
    const playLabel=track.playbackType==='preview'?'Cuplikan 30 dtk':track.playbackType==='stream'?'Putar':'Buka sumber';
    const cover=artwork?'<img src="'+escapeHTML(artwork)+'" alt="" loading="lazy" referrerpolicy="no-referrer">':'<i data-lucide="disc-3"></i>';
    const sourceLink=link?'<a class="source-open-link" href="'+escapeHTML(link)+'" target="_blank" rel="noopener noreferrer">'+escapeHTML(track.storeLabel||'Lihat sumber')+' <i data-lucide="external-link"></i></a>':'';
    return '<article class="federated-card"><div class="federated-cover">'+cover+'</div><div class="federated-copy"><span class="source-badge source-'+escapeHTML(track.source)+'">'+escapeHTML(badge)+'</span><strong>'+escapeHTML(track.title)+'</strong><span>'+escapeHTML(track.artist)+'</span><small>'+escapeHTML(track.album||track.playbackLabel||'')+'</small><div class="federated-actions">'+(canPlay?'<button class="source-play" data-action="play-remote" data-id="'+escapeHTML(track.id)+'"><i data-lucide="play"></i>'+playLabel+'</button>':'')+sourceLink+'</div></div></article>';
  }).join('');
  icons();
}
function safeExternalURL(value){
  try{const url=new URL(value);return ['https:','http:'].includes(url.protocol)?url.href:''}catch{return ''}
}
function scheduleFederatedSearch(query,force=false){
  const q=String(query||'').trim();
  clearTimeout(remoteSearchTimer);
  if(q.length<2){
    S.remoteResults=[];lastRemoteQuery='';lastRemoteFilter=S.sourceFilter;
    $('#externalSearchStatus').textContent='Masukkan minimal dua karakter untuk mencari di katalog eksternal.';
    $('#externalSearchCount').textContent='—';
    $('#externalSearchResults').innerHTML='';
    return;
  }
  if(!force&&q===lastRemoteQuery&&S.sourceFilter===lastRemoteFilter)return;
  lastRemoteQuery=q;lastRemoteFilter=S.sourceFilter;
  const sequence=++S.searchSequence;
  $('#externalSearchStatus').textContent='Menghubungkan ke '+(S.sourceFilter==='all'?'berbagai sumber musik':S.sourceFilter)+'…';
  $('#externalSearchCount').textContent='Mencari';
  $('#externalSearchResults').innerHTML='<div class="source-loading"><i data-lucide="radio"></i><span>Menyelaraskan katalog musik…</span></div>';icons();
  remoteSearchTimer=setTimeout(async()=>{
    try{
      if(!window.MusicverseSources)throw new Error('Modul sumber musik tidak termuat.');
      const result=await window.MusicverseSources.search(q,S.sourceFilter);
      if(sequence!==S.searchSequence)return;
      S.remoteResults=result.items||[];
      S.remoteResults.forEach(track=>S.remoteTracks.set(track.id,track));
      const reachable=(result.providers||[]).filter(provider=>!provider.error);
      const failed=(result.providers||[]).filter(provider=>provider.error);
      const summary=reachable.map(provider=>provider.label+' ('+provider.count+')').join(' · ');
      $('#externalSearchStatus').textContent=summary?summary+(failed.length?' · tidak terhubung: '+failed.map(x=>x.label).join(', '):''):(failed.length?'Sumber belum merespons: '+failed.map(x=>x.label).join(', '):'Tidak ada hasil pada sumber eksternal.');
      renderFederatedResults();
    }catch(error){
      if(sequence!==S.searchSequence)return;
      S.remoteResults=[];
      $('#externalSearchStatus').textContent='Pencarian eksternal gagal: '+(error.message||'koneksi tidak tersedia');
      $('#externalSearchCount').textContent='0 hasil';$('#externalSearchResults').innerHTML='';
    }
  },520);
}

function openPlaylist(id){
  if(!S.playlists.some(p=>p.id===id))return;
  S.activePlaylistId=id;goView('playlist');renderPlaylist();
}
function activePlaylist(){return S.playlists.find(p=>p.id===S.activePlaylistId)}
function renderPlaylist(){
  const p=activePlaylist();if(!p)return;
  const tracks=(p.trackIds||[]).map(getTrack).filter(Boolean);
  $('#playlistTitle').textContent=p.name;$('#playlistMeta').textContent=tracks.length+' lagu · Playlist pribadi';
  $('#playlistTracks').innerHTML=tracks.length?tracks.map((t,i)=>trackRow(t,i,{removeFromPlaylist:true})).join(''):emptyState('Playlist ini masih kosong','Tambahkan lagu dari perpustakaan untuk mulai menyusun urutan.','Tambah lagu','add-to-active-playlist');
  $('#playlistCover').style.background=palettes[Math.max(0,S.playlists.indexOf(p))%palettes.length];
  icons();
}
function openModal(mode,data={}){
  S.modalMode=mode;S.modalData=data;const content=$('#modalContent');
  $('#modalBackdrop').classList.add('show');$('#modalBackdrop').setAttribute('aria-hidden','false');
  if(mode==='create-playlist'||mode==='rename-playlist'){
    $('#modalKicker').textContent=mode==='create-playlist'?'CREATE YOUR SPACE':'EDIT YOUR SPACE';
    $('#modalTitle').textContent=mode==='create-playlist'?'Beri nama playlist':'Ubah nama playlist';
    $('#modalDescription').textContent='Kurasi lagu ke dalam satu ruang yang kamu bentuk sendiri.';
    content.innerHTML='<label class="field-label" for="modalText">NAMA PLAYLIST</label><input id="modalText" maxlength="36" placeholder="Mis. Midnight thoughts" value="'+escapeHTML(data.value||'')+'">';
    $('#modalConfirm').textContent=mode==='create-playlist'?'Buat playlist':'Simpan perubahan';
    setTimeout(()=>$('#modalText')?.focus(),60);
  }else if(mode==='add-to-playlist'){
    const preselected=data.trackId?[data.trackId]:[];
    $('#modalKicker').textContent='CURATE YOUR COLLECTION';$('#modalTitle').textContent='Tambahkan ke playlist';$('#modalDescription').textContent='Pilih satu atau beberapa ruang tujuan.';
    const eligible=S.playlists;
    content.innerHTML=eligible.length?'<div class="choice-list">'+eligible.map(p=>'<label class="choice-row"><input type="checkbox" value="'+escapeHTML(p.id)+'" '+(preselected.length&&p.trackIds.includes(data.trackId)?'checked':'')+'><span>'+escapeHTML(p.name)+'</span></label>').join('')+'</div>':'<div class="choice-empty">Belum ada playlist. Buat playlist terlebih dahulu.</div>';
    $('#modalConfirm').textContent='Tambahkan';
  }else if(mode==='add-tracks'){
    $('#modalKicker').textContent='BUILD YOUR PLAYLIST';$('#modalTitle').textContent='Pilih lagu';$('#modalDescription').textContent='Tandai lagu yang ingin dimasukkan ke playlist ini.';
    const p=activePlaylist(),existing=new Set(p?.trackIds||[]);
    content.innerHTML=S.tracks.length?'<div class="choice-list">'+S.tracks.map(t=>'<label class="choice-row"><input type="checkbox" value="'+escapeHTML(t.id)+'" '+(existing.has(t.id)?'checked':'')+'><span>'+escapeHTML(t.title)+' <small>— '+escapeHTML(t.artist)+'</small></span></label>').join('')+'</div>':'<div class="choice-empty">Perpustakaan masih kosong. Impor audio terlebih dahulu.</div>';
    $('#modalConfirm').textContent='Simpan pilihan';
  }else if(mode==='delete-playlist'){
    $('#modalKicker').textContent='CONFIRM ACTION';$('#modalTitle').textContent='Hapus playlist?';$('#modalDescription').textContent='Playlist akan dihapus dari koleksimu. File audio dan lagu asli tidak akan terhapus.';content.innerHTML='<div class="choice-empty">Playlist: '+escapeHTML(data.name||'')+'</div>';$('#modalConfirm').textContent='Hapus playlist';
  }
  icons();
}
function closeModal(){
  $('#modalBackdrop').classList.remove('show');$('#modalBackdrop').setAttribute('aria-hidden','true');S.modalMode=null;S.modalData=null;
}
function confirmModal(){
  const mode=S.modalMode,data=S.modalData||{};
  if(mode==='create-playlist'){
    const name=$('#modalText').value.trim();if(!name){notify('Nama playlist belum diisi.');return}
    const p={id:makeId(),name,trackIds:[]};S.playlists.push(p);saveState();renderAll();closeModal();notify('Playlist berhasil dibuat.');openPlaylist(p.id);
  }else if(mode==='rename-playlist'){
    const name=$('#modalText').value.trim(),p=activePlaylist();if(!name||!p){notify('Nama playlist tidak valid.');return}
    p.name=name;saveState();renderAll();closeModal();renderPlaylist();notify('Nama playlist diperbarui.');
  }else if(mode==='add-to-playlist'){
    const ids=$$('#modalContent input:checked').map(el=>el.value),track=getTrack(data.trackId);
    if(!ids.length){notify('Pilih setidaknya satu playlist.');return}
    ids.forEach(id=>{const p=S.playlists.find(x=>x.id===id);if(p&&track&&!p.trackIds.includes(track.id))p.trackIds.push(track.id)});
    saveState();renderAll();closeModal();notify('Lagu ditambahkan ke '+ids.length+' playlist.');
  }else if(mode==='add-tracks'){
    const p=activePlaylist();if(!p)return;
    p.trackIds=$$('#modalContent input:checked').map(el=>el.value);
    saveState();renderAll();closeModal();renderPlaylist();notify('Isi playlist diperbarui.');
  }else if(mode==='delete-playlist'){
    const p=activePlaylist();if(p){S.playlists=S.playlists.filter(x=>x.id!==p.id);S.activePlaylistId=null;saveState();renderAll();closeModal();goView('library');notify('Playlist dihapus.')}
  }
}
function addToActivePlaylist(){if(!activePlaylist())return;openModal('add-tracks')}
function removeFromPlaylist(trackId){
  const p=activePlaylist();if(!p)return;
  p.trackIds=p.trackIds.filter(id=>id!==trackId);saveState();renderAll();renderPlaylist();notify('Lagu dihapus dari playlist.');
}
function showPanel(tab){
  document.body.classList.remove('panel-collapsed');$('#rightPanel').classList.remove('mobile-open');
  if(window.innerWidth<=1120)$('#rightPanel').classList.add('mobile-open');
  S.panelTab=tab;
  $$('.panel-tab').forEach(b=>b.classList.toggle('active',b.dataset.panelTab===tab));
  $('#lyricsPane').hidden=tab!=='lyrics';$('#queuePane').hidden=tab!=='queue';
  if(tab==='lyrics')renderLyrics();else renderQueue();
}
function hidePanel(){document.body.classList.add('panel-collapsed');$('#rightPanel').classList.remove('mobile-open')}
function handleAction(button){
  const action=button.dataset.action,id=button.dataset.id;
  if(action==='play'){
    const row=button.closest('[data-track-row]'),list=row?.closest('#likedTracks')?S.tracks.filter(t=>S.liked.has(t.id)).map(t=>t.id):row?.closest('#recentTracks')?S.recent:row?.closest('#playlistTracks')?(activePlaylist()?.trackIds||[]):S.tracks.map(t=>t.id);
    playTrack(id,list);
  }else if(action==='like')toggleLike(id);
  else if(action==='add-to-playlist')openModal('add-to-playlist',{trackId:id});
  else if(action==='remove-from-playlist')removeFromPlaylist(id);
  else if(action==='open-playlist')openPlaylist(id);
  else if(action==='import-audio')$('#audioFiles').click();
  else if(action==='add-to-active-playlist')addToActivePlaylist();
  else if(action==='seek-lyric')seekToLyric(Number(button.dataset.time));
  else if(action==='play-remote'){const track=S.remoteTracks.get(id);if(track?.playbackUrl){const queue=[id,...S.remoteResults.filter(x=>x.id!==id&&x.playbackUrl).map(x=>x.id)];playTrack(id,queue)}else if(track?.externalUrl)window.open(track.externalUrl,'_blank','noopener');}
}
document.addEventListener('click',e=>{
  const action=e.target.closest('[data-action]');
  if(action){handleAction(action);return}
  const nav=e.target.closest('[data-view],[data-view-link]');
  if(nav){goView(nav.dataset.view||nav.dataset.viewLink);return}
  const row=e.target.closest('[data-track-row]');
  if(row){const id=row.dataset.trackRow;const list=row.closest('#likedTracks')?S.tracks.filter(t=>S.liked.has(t.id)).map(t=>t.id):row.closest('#recentTracks')?S.recent:row.closest('#playlistTracks')?(activePlaylist()?.trackIds||[]):S.tracks.map(t=>t.id);playTrack(id,list);return}
  const providerFilter=e.target.closest('[data-provider-filter]');
  if(providerFilter){S.sourceFilter=providerFilter.dataset.providerFilter;$$('[data-provider-filter]').forEach(x=>x.classList.toggle('active',x===providerFilter));lastRemoteQuery='';scheduleFederatedSearch(searchQuery,true);return}
  const tab=e.target.closest('[data-library-tab]');
  if(tab){$$('[data-library-tab]').forEach(x=>x.classList.toggle('active',x===tab));$('#libraryTrackPane').hidden=tab.dataset.libraryTab!=='tracks';$('#libraryPlaylistPane').hidden=tab.dataset.libraryTab!=='playlists';return}
  const panelTab=e.target.closest('[data-panel-tab]');
  if(panelTab){showPanel(panelTab.dataset.panelTab);return}
  const mood=e.target.closest('[data-mood]');
  if(mood){openModal('create-playlist',{value:mood.dataset.mood==='Focus'?'Deep Focus':mood.dataset.mood==='Chill'?'Soft Landing':mood.dataset.mood==='Energy'?'Full Energy':'Night Drive'});return}
  if($('#sidebar').classList.contains('open')&&!e.target.closest('#sidebar')&&!e.target.closest('#mobileMenu'))$('#sidebar').classList.remove('open');
});
$('#audioFiles').addEventListener('change',e=>{importFiles(e.target.files);e.target.value=''});
['uploadSide','importButton','exploreImport'].forEach(id=>$('#'+id).addEventListener('click',()=>$('#audioFiles').click()));
$('#heroPlay').addEventListener('click',()=>{if(S.currentId)togglePlayback();else if(S.tracks.length)playFromList(S.tracks.map(t=>t.id));else $('#audioFiles').click()});
$('#playBtn').addEventListener('click',togglePlayback);
$('#nextBtn').addEventListener('click',nextTrack);$('#prevBtn').addEventListener('click',prevTrack);
$('#likeCurrent').addEventListener('click',()=>{if(S.currentId)toggleLike(S.currentId)});
$('#shuffleBtn').addEventListener('click',()=>{S.shuffle=!S.shuffle;renderCurrent();notify(S.shuffle?'Putar acak aktif.':'Putar acak nonaktif.')});
$('#repeatBtn').addEventListener('click',()=>{S.repeatMode=S.repeatMode==='off'?'all':S.repeatMode==='all'?'one':'off';audio.loop=S.repeatMode==='one';renderCurrent();notify(S.repeatMode==='off'?'Ulangi nonaktif.':S.repeatMode==='all'?'Ulangi antrean aktif.':'Ulangi satu lagu aktif.')});
audio.addEventListener('timeupdate',()=>{
  const duration=audio.duration||0;
  $('#currentTime').textContent=fmtTime(audio.currentTime);
  $('#duration').textContent=fmtTime(duration);
  if(duration&&!$('#seekBar').matches(':active'))$('#seekBar').value=Math.round(audio.currentTime/duration*1000);
  updateLyricHighlight();
});
audio.addEventListener('loadedmetadata',()=>{
  const t=currentTrack();if(t&&Number.isFinite(audio.duration)){t.duration=audio.duration;saveState();renderAll()}
});
audio.addEventListener('play',()=>{renderCurrent();renderQueue()});
audio.addEventListener('pause',()=>renderCurrent());
audio.addEventListener('ended',()=>{if(S.repeatMode==='one'){audio.currentTime=0;audio.play().catch(()=>{});return}nextTrack()});
audio.addEventListener('error',()=>{if(S.currentId)notify('Format audio tidak didukung atau file tidak dapat dibaca.')});
$('#seekBar').addEventListener('input',e=>{if(audio.duration)audio.currentTime=audio.duration*Number(e.target.value)/1000});
$('#volumeBar').addEventListener('input',e=>{audio.volume=Number(e.target.value)});
audio.volume=.8;
$('#globalSearch').addEventListener('focus',()=>{goView('search');$('#pageSearch').focus()});
$('#globalSearch').addEventListener('input',e=>{searchQuery=e.target.value;$('#pageSearch').value=searchQuery;goView('search',false);renderSearch(searchQuery)});
$('#pageSearch').addEventListener('input',e=>{searchQuery=e.target.value;$('#globalSearch').value=searchQuery;renderSearch(searchQuery)});
$('#newPlaylistBtn').addEventListener('click',()=>openModal('create-playlist'));
$('#modalClose').addEventListener('click',closeModal);$('#modalCancel').addEventListener('click',closeModal);$('#modalConfirm').addEventListener('click',confirmModal);
$('#modalBackdrop').addEventListener('click',e=>{if(e.target.id==='modalBackdrop')closeModal()});
$('#modalContent').addEventListener('keydown',e=>{if(e.key==='Enter'&&S.modalMode==='create-playlist'||e.key==='Enter'&&S.modalMode==='rename-playlist')confirmModal()});
$('#mobileMenu').addEventListener('click',()=>$('#sidebar').classList.toggle('open'));
$('#backBtn').addEventListener('click',()=>historyMove(-1));$('#forwardBtn').addEventListener('click',()=>historyMove(1));
$('#themeBtn').addEventListener('click',()=>{S.theme=S.theme==='dark'?'light':'dark';document.body.classList.toggle('light',S.theme==='light');saveState();notify(S.theme==='light'?'Tema terang aktif.':'Tema gelap aktif.')});
$('#profileBtn').addEventListener('click',()=>notify('MUSICVERSE PRO menghubungkan koleksi lokal dan katalog eksternal.'));
$('#saveYoutubeKey').addEventListener('click',()=>{
  const key=$('#youtubeApiKey').value.trim();
  const stored=window.MusicverseSources?.setYoutubeApiKey(key);
  if(key&&!stored){notify('Key tidak dapat disimpan pada browser ini.');return}
  $('#youtubeKeyStatus').textContent=key?'Key tersimpan di browser ini. Batasi key melalui referrer dan API restriction.':'Key dihapus. YouTube menjadi sumber opsional.';
  lastRemoteQuery='';scheduleFederatedSearch(searchQuery,true);
  notify(key?'Pencarian YouTube dikonfigurasi.':'Konfigurasi YouTube dihapus.');
});
$('#saveJamendoKey').addEventListener('click',()=>{
  const clientId=$('#jamendoClientId').value.trim();
  const stored=window.MusicverseSources?.setJamendoClientId(clientId);
  if(clientId&&!stored){notify('Client ID tidak dapat disimpan pada browser ini.');return}
  $('#jamendoKeyStatus').textContent=clientId?'Client ID tersimpan di browser ini. Jamendo akan masuk ke pencarian terpadu.':'Client ID dihapus. Jamendo menjadi sumber opsional.';
  lastRemoteQuery='';scheduleFederatedSearch(searchQuery,true);
  notify(clientId?'Jamendo berhasil dikonfigurasi.':'Konfigurasi Jamendo dihapus.');
});
$('#spotifyExternalSearch').addEventListener('click',()=>{
  if(!searchQuery.trim()){notify('Masukkan kata kunci terlebih dahulu.');return}
  window.open('https://open.spotify.com/search/'+encodeURIComponent(searchQuery.trim()),'_blank','noopener');
});
$('#lyricsToggle').addEventListener('click',()=>showPanel('lyrics'));$('#queueBtn').addEventListener('click',()=>showPanel('queue'));$('#closePanel').addEventListener('click',hidePanel);
$('#openLyricsStudio').addEventListener('click',()=>{goView('lyrics');hidePanel()});
$('#clearQueue').addEventListener('click',()=>{S.queue=S.currentId?[S.currentId]:[];saveState();renderQueue();notify('Antrean berikutnya dibersihkan.')});
$('#addToPlaylist').addEventListener('click',addToActivePlaylist);
$('#playPlaylist').addEventListener('click',()=>{const p=activePlaylist();if(p)playFromList(p.trackIds)});
$('#renamePlaylist').addEventListener('click',()=>{const p=activePlaylist();if(p)openModal('rename-playlist',{value:p.name})});
$('#deletePlaylist').addEventListener('click',()=>{const p=activePlaylist();if(p)openModal('delete-playlist',{name:p.name})});
$('#playLiked').addEventListener('click',()=>playFromList(S.tracks.filter(t=>S.liked.has(t.id)).map(t=>t.id)));
$$('[data-lyric-mode]').forEach(b=>b.addEventListener('click',()=>{setLyricMode(b.dataset.lyricMode);const t=currentTrack();$('#studioLyrics').value=t?(S.lyricMode==='translation'?(S.translations[t.id]||''):(S.lyrics[t.id]||'')):'';renderLyrics()}));
$('#importLrcButton').addEventListener('click',()=>$('#lrcFile').click());
$('#lrcFile').addEventListener('change',async e=>{const file=e.target.files?.[0];if(!file)return;try{const value=await file.text();setLyricMode('lrc',false);$('#studioLyrics').value=value;renderLyrics();notify('File .LRC dimuat. Simpan untuk mengaitkannya dengan lagu.')}catch(err){notify('File .LRC tidak dapat dibaca.')}e.target.value=''});
$('#saveStudioLyrics').addEventListener('click',saveLyrics);
$('#studioLyrics').addEventListener('input',()=>{const value=$('#studioLyrics').value,container=$('#studioPreview');if(S.lyricMode==='translation'){const lines=value.split(/\r?\n/).filter(x=>x.trim());container.innerHTML=lines.length?lines.map(line=>'<p class="preview-line">'+escapeHTML(line)+'</p>').join(''):'<p class="preview-empty">Terjemahan akan terlihat di sini.</p>';return}const entries=parseLyrics(value);container.innerHTML=entries.length?entries.map(line=>'<p class="preview-line">'+(line.time!==null?'<small>'+fmtTime(line.time)+'</small> ':'')+escapeHTML(line.text)+'</p>').join(''):'<p class="preview-empty">Lirik akan terlihat di sini setelah kamu menambahkannya.</p>'});
const drop=$('#dropZone');
['dragenter','dragover'].forEach(name=>drop.addEventListener(name,e=>{e.preventDefault();drop.classList.add('dragging')}));
['dragleave','drop'].forEach(name=>drop.addEventListener(name,e=>{e.preventDefault();drop.classList.remove('dragging')}));
drop.addEventListener('drop',e=>importFiles(e.dataTransfer.files));
document.addEventListener('dragover',e=>{if(e.dataTransfer?.types?.includes('Files'))e.preventDefault()});
document.addEventListener('drop',e=>{if(e.target.closest('#dropZone'))return;if(e.dataTransfer?.files?.length){e.preventDefault();importFiles(e.dataTransfer.files)}});
document.addEventListener('keydown',e=>{
  const tag=document.activeElement?.tagName;
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();$('#globalSearch').focus()}
  if(e.key==='Escape'){if($('#modalBackdrop').classList.contains('show'))closeModal();else if($('#rightPanel').classList.contains('mobile-open'))$('#rightPanel').classList.remove('mobile-open')}
  if(e.code==='Space'&&!['INPUT','TEXTAREA','BUTTON'].includes(tag)){e.preventDefault();togglePlayback()}
  if(!['INPUT','TEXTAREA'].includes(tag)&&e.key.toLowerCase()==='n')nextTrack();
  if(!['INPUT','TEXTAREA'].includes(tag)&&e.key.toLowerCase()==='p')prevTrack();
});
window.addEventListener('resize',()=>{if(window.innerWidth>1120)$('#rightPanel').classList.remove('mobile-open')});
(async()=>{
  try{await openDB();if(navigator.storage?.persist)navigator.storage.persist().catch(()=>{})}catch(e){notify('Browser tidak mendukung penyimpanan audio permanen.')}
  if('serviceWorker' in navigator)navigator.serviceWorker.register('sw.js').catch(()=>{});
  await restoreLibrary();
  const savedYoutubeKey=window.MusicverseSources?.getYoutubeApiKey?.();
  if(savedYoutubeKey)$('#youtubeKeyStatus').textContent='Key tersimpan di browser ini. YouTube akan masuk ke pencarian eksternal.';
  const savedJamendoClientId=window.MusicverseSources?.getJamendoClientId?.();
  if(savedJamendoClientId)$('#jamendoKeyStatus').textContent='Client ID tersimpan di browser ini. Jamendo masuk ke pencarian terpadu.';
  if(S.tracks.length===0&&readSavedState().tracks?.length)notify('File audio sebelumnya tidak ditemukan di penyimpanan browser.');
  $('#libraryGreeting').textContent=new Intl.DateTimeFormat('id-ID',{weekday:'long',day:'numeric',month:'long'}).format(new Date()).toUpperCase();
  setLyricMode('lrc',false);renderAll();icons();
})();
})();