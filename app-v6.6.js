// Parkest v6.6 — client-side logic. Supabase JS v2 + Realtime + Leaflet/OpenStreetMap.

const TEST_LAT = 44.3075;
const TEST_LNG = 8.4810;
const VAPID_PUBLIC_KEY = 'BPUczTn4MWRbVzTSZ3YgnsKMpXbucb9v2eTH8oUFb1_ZmdIyBYjfHe0cEBEgGxPhYc0ecBHE0B_uPisw0yGEpP4';

const state = {
  supabase: null,
  user: null,
  authMode: 'login',
  leaveMinutes: 0,
  parkingType: 'LIBERO',
  notificationMemory: new Set(JSON.parse(localStorage.getItem('parkest_notified') || '[]')),
  searchActive: localStorage.getItem('parkest_search_active') === 'true',
  home: { radius: Number(localStorage.getItem('parkest_home_radius')) || 500, lat:null, lng:null, channel:null, pollBusy:false },
  lascio: { lat:null, lng:null, isTest:false, map:null, marker:null },
  cerco: { lat:null, lng:null, isTest:false, radius:500, spots:[], channel:null, map:null, markersLayer:null, availableCluster:null, userMarker:null, radiusCircle:null, markerBySpotId:new Map(), cardBySpotId:new Map(), claimedSpotIds:new Set(), dataFingerprint:'', pollBusy:false },
  arrivalWatch: { watchId:null, spotId:null, nearSince:null, prompted:false },
  geocodeCache: new Map(),
  geocodePending: new Map(),
};

const $ = id => document.getElementById(id);
document.querySelectorAll('.build-version').forEach(el=>el.textContent='Build Parkest v6.6 · JavaScript 6.6 attivo');

// ---------- Light / dark dimmer ----------
function applyTheme(theme){
  const dark=theme==='dark';
  document.body.classList.toggle('dark',dark);
  const b=$('btn-theme'); if(b){b.textContent=dark?'☀️':'🌙'; b.setAttribute('aria-label',dark?'Modalità giorno':'Modalità notte');}
}
const savedTheme=localStorage.getItem('parkest_theme') || 'light';
applyTheme(savedTheme);
$('btn-theme')?.addEventListener('click',()=>{const next=document.body.classList.contains('dark')?'light':'dark';localStorage.setItem('parkest_theme',next);applyTheme(next);});

// ---------- Views ----------
function showView(id) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  $(id).classList.add('active');
}

function showAppForSession() {
  if (!state.supabase) { showView('view-auth'); return; }
  if (!state.user) { showView('view-auth'); return; }
  updateWelcome();
  $('btn-logout').classList.remove('hidden');
  showView('view-home');
  refreshHomeSummary();
  consumePendingNotificationAction();
}

$('btn-mode-lascio').addEventListener('click', () => { if (!requireAuth()) return; stopHomeChannel(); showView('view-lascio'); startLascio(); });
$('btn-mode-cerco').addEventListener('click', () => { if (!requireAuth()) return; stopHomeChannel(); showView('view-cerco'); startCerco(); });
document.querySelectorAll('[data-back]').forEach(btn => btn.addEventListener('click', () => { stopCercoChannel(); showView('view-home'); refreshHomeSummary(); }));

// ---------- Toast ----------
function showToast(message, ms=4000) {
  const el=document.createElement('div'); el.className='toast'; el.textContent=message; $('toast-container').appendChild(el); setTimeout(()=>el.remove(),ms);
}

// ---------- Supabase connection + Auth ----------
function loadSavedConnection() {
  const url=localStorage.getItem('parkest_supabase_url');
  const key=localStorage.getItem('parkest_supabase_key');
  if (url && key) connectSupabase(url,key,false);
  else showView('view-auth');
}

async function connectSupabase(url,key,persist=true) {
  try {
    state.supabase=window.supabase.createClient(url,key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
    if (persist) { localStorage.setItem('parkest_supabase_url',url); localStorage.setItem('parkest_supabase_key',key); }
    $('connection-status').textContent='Collegato a Parkest ✓'; $('connection-status').style.color='var(--green-dark)';
    $('auth-connection-hint').textContent='Parkest è collegato. Puoi accedere o registrarti.';
    wireAuthListener();
    const {data}=await state.supabase.auth.getSession();
    state.user=data.session?.user || null;
    showAppForSession();
    return true;
  } catch(e) {
    $('settings-feedback').textContent='Errore di connessione: '+(e.message||'credenziali non valide.');
    return false;
  }
}

let authListenerWired=false;
function wireAuthListener() {
  if (authListenerWired || !state.supabase) return;
  authListenerWired=true;
  state.supabase.auth.onAuthStateChange((event,session)=>{
    state.user=session?.user || null;
    if(event==='PASSWORD_RECOVERY'){
      $('new-password-feedback').textContent='';
      $('new-password-overlay').classList.remove('hidden');
      return;
    }
    if (state.user) showAppForSession();
    else { $('btn-logout').classList.add('hidden'); showView('view-auth'); }
  });
}

function requireSupabase() {
  if (!state.supabase) { showToast('Collega prima Parkest a Supabase dalle impostazioni ⚙︎.'); $('settings-overlay').classList.remove('hidden'); return false; }
  return true;
}
function requireAuth() { if (!requireSupabase()) return false; if (!state.user) { showToast('Accedi prima al tuo account Parkest.'); showView('view-auth'); return false; } return true; }

function updateWelcome() {
  const name=state.user?.user_metadata?.name?.trim() || state.user?.email?.split('@')[0] || '';
  $('welcome-name').textContent=`Benvenuto/a${name ? ', '+name : ''} 👋`;
}

$('tab-login').addEventListener('click',()=>setAuthMode('login'));
$('tab-register').addEventListener('click',()=>setAuthMode('register'));
function setAuthMode(mode) {
  state.authMode=mode;
  $('tab-login').classList.toggle('active',mode==='login'); $('tab-register').classList.toggle('active',mode==='register');
  $('register-name-wrap').classList.toggle('hidden',mode!=='register'); $('register-confirm-wrap').classList.toggle('hidden',mode!=='register');
  $('btn-forgot-password').classList.toggle('hidden',mode!=='login');
  $('btn-auth-submit').textContent=mode==='login'?'ACCEDI':'CREA ACCOUNT'; $('auth-feedback').textContent='';
}

$('btn-auth-submit').addEventListener('click',async()=>{
  if (!requireSupabase()) return;
  const email=$('auth-email').value.trim(); const password=$('auth-password').value; const name=$('auth-name').value.trim();
  if (!email || !password) { $('auth-feedback').textContent='Inserisci email e password.'; return; }
  $('btn-auth-submit').disabled=true; $('auth-feedback').textContent='Attendi…';
  try {
    if (state.authMode==='register') {
      if (!name) throw new Error('Inserisci il tuo nome.');
      if (password.length<6) throw new Error('La password deve avere almeno 6 caratteri.');
      if (password!==$('auth-password-confirm').value) throw new Error('Le password non coincidono.');
      const {data,error}=await state.supabase.auth.signUp({email,password,options:{data:{name}}});
      if (error) throw error;
      if (!data.session) $('auth-feedback').textContent='Account creato. Controlla la tua email per confermarlo.';
      else $('auth-feedback').textContent='Account creato!';
    } else {
      const {data,error}=await state.supabase.auth.signInWithPassword({email,password}); if (error) throw error;
      state.user=data.user || data.session?.user || null;
      $('auth-feedback').textContent='Accesso effettuato.';
      if(state.user) showAppForSession();
    }
  } catch(e) { $('auth-feedback').textContent=e.message||'Operazione non riuscita.'; }
  finally { $('btn-auth-submit').disabled=false; }
});

$('btn-forgot-password').addEventListener('click',()=>{
  $('reset-email').value=$('auth-email').value.trim();
  $('reset-feedback').textContent='';
  $('forgot-password-overlay').classList.remove('hidden');
  setTimeout(()=>$('reset-email').focus(),0);
});
$('btn-close-forgot').addEventListener('click',()=>$('forgot-password-overlay').classList.add('hidden'));
$('btn-send-reset').addEventListener('click',async()=>{
  if(!requireSupabase())return;
  const email=$('reset-email').value.trim(),feedback=$('reset-feedback'),button=$('btn-send-reset');
  if(!email){feedback.textContent='Inserisci la tua email.';return;}
  button.disabled=true;feedback.textContent='Invio in corso…';
  const redirectTo=location.origin+location.pathname;
  const {error}=await state.supabase.auth.resetPasswordForEmail(email,{redirectTo});
  button.disabled=false;
  if(error){feedback.textContent='Invio non riuscito: '+error.message;return;}
  feedback.textContent='Se l’email è registrata, riceverai il link per creare una nuova password.';
});
$('btn-update-password').addEventListener('click',async()=>{
  if(!requireSupabase())return;
  const password=$('new-password').value,confirmPassword=$('new-password-confirm').value,feedback=$('new-password-feedback'),button=$('btn-update-password');
  if(password.length<6){feedback.textContent='La password deve avere almeno 6 caratteri.';return;}
  if(password!==confirmPassword){feedback.textContent='Le password non coincidono.';return;}
  button.disabled=true;feedback.textContent='Aggiornamento in corso…';
  const {error}=await state.supabase.auth.updateUser({password});
  if(error){button.disabled=false;feedback.textContent='Aggiornamento non riuscito: '+error.message;return;}
  feedback.textContent='Password aggiornata. Ora puoi accedere con la nuova password.';
  await state.supabase.auth.signOut();
  setTimeout(()=>{$('new-password-overlay').classList.add('hidden');showView('view-auth');button.disabled=false;},1200);
});

$('btn-logout').addEventListener('click',async()=>{ if (!state.supabase) return; state.cerco.claimedSpotIds.clear(); stopArrivalWatch(); stopHomeChannel(); state.searchActive=false;localStorage.setItem('parkest_search_active','false');await syncPushSearchState();await state.supabase.auth.signOut();updateSearchButton();$('settings-overlay').classList.add('hidden'); showToast('Sei uscito da Parkest.'); });

$('btn-settings').addEventListener('click',()=>{ $('input-url').value=localStorage.getItem('parkest_supabase_url')||''; $('input-key').value=localStorage.getItem('parkest_supabase_key')||''; $('settings-feedback').textContent=''; $('btn-logout').classList.toggle('hidden',!state.user); $('settings-overlay').classList.remove('hidden'); });
$('btn-close-settings').addEventListener('click',()=>$('settings-overlay').classList.add('hidden'));
$('btn-connect').addEventListener('click',async()=>{ const url=$('input-url').value.trim(),key=$('input-key').value.trim(); if(!url||!key){$('settings-feedback').textContent='Inserisci URL e chiave.';return;} const ok=await connectSupabase(url,key,true); if(ok){$('settings-feedback').textContent='Connesso con successo!';setTimeout(()=>$('settings-overlay').classList.add('hidden'),700);} });

// ---------- Geolocation ----------
function geolocate(onPosition,onFallback) {
  if(!navigator.geolocation){onFallback();return;}
  navigator.geolocation.getCurrentPosition(p=>onPosition(p.coords.latitude,p.coords.longitude),()=>onFallback(),{enableHighAccuracy:true,timeout:8000,maximumAge:15000});
}


// ---------- Reverse geocoding (coordinates -> street / square) ----------
function geocodeKey(lat,lng){return `${Number(lat).toFixed(5)},${Number(lng).toFixed(5)}`;}
function formatAddressFromNominatim(data){
  const a=data?.address||{};
  const road=a.road||a.pedestrian||a.footway||a.cycleway||a.residential||a.path||a.square||a.place||a.neighbourhood||a.suburb||'';
  const house=a.house_number||'';
  const city=a.city||a.town||a.village||a.municipality||a.county||'';
  const primary=[road,house].filter(Boolean).join(' ');
  if(primary&&city) return `${primary}, ${city}`;
  if(primary) return primary;
  if(a.neighbourhood&&city) return `${a.neighbourhood}, ${city}`;
  if(city) return city;
  return data?.display_name?.split(',').slice(0,2).join(',').trim()||'Posizione sulla mappa';
}
async function reverseGeocode(lat,lng){
  const key=geocodeKey(lat,lng);
  if(state.geocodeCache.has(key)) return state.geocodeCache.get(key);
  if(state.geocodePending.has(key)) return state.geocodePending.get(key);
  const req=(async()=>{
    try{
      const url=`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}&zoom=18&addressdetails=1&accept-language=it`;
      const r=await fetch(url,{headers:{'Accept':'application/json'}});
      if(!r.ok) throw new Error('reverse geocoding unavailable');
      const data=await r.json();
      const label=formatAddressFromNominatim(data);
      state.geocodeCache.set(key,label);
      return label;
    }catch(_e){
      const fallback='Posizione sulla mappa';
      state.geocodeCache.set(key,fallback);
      return fallback;
    }finally{state.geocodePending.delete(key);}
  })();
  state.geocodePending.set(key,req);
  return req;
}
function cachedAddress(lat,lng){return state.geocodeCache.get(geocodeKey(lat,lng))||'Ricerca indirizzo…';}
async function hydrateAddress(lat,lng,onReady){const label=await reverseGeocode(lat,lng);if(onReady)onReady(label);return label;}

// ---------- Map helpers ----------
function pinIcon(colorClass){return L.divIcon({className:'',html:`<div class="map-pin ${colorClass}"></div>`,iconSize:[28,28],iconAnchor:[14,28],popupAnchor:[0,-28]});}
function timedPinIcon(minutes){const soon=minutes<=10?' soon':'';return L.divIcon({className:'',html:`<div class="timed-pin${soon}">${minutes} min</div>`,iconSize:[62,38],iconAnchor:[8,34],popupAnchor:[20,-32]});}
function userDotIcon(){return L.divIcon({className:'',html:'<div class="user-dot"></div>',iconSize:[16,16],iconAnchor:[8,8]});}
function addOsmTileLayer(map){L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap contributors'}).addTo(map);}
function isScheduled(spot){return spot.status==='LIBERO' && spot.available_at && new Date(spot.available_at).getTime()>Date.now();}
function minutesRemaining(spot){if(!spot.available_at)return 0;return Math.max(0,Math.ceil((new Date(spot.available_at).getTime()-Date.now())/60000));}
function visualStatus(spot){if(spot.status==='IN_ARRIVO')return 'IN_ARRIVO'; if(isScheduled(spot))return 'SCHEDULED'; return spot.status;}
function parkingTypeLabel(type){return ({LIBERO:'Libero',DISCO_ORARIO:'Disco orario',A_PAGAMENTO:'A pagamento',DISABILI:'♿ Disabili'})[type]||'Libero';}
function parkingTypeClass(type){return String(type||'LIBERO').toLowerCase();}
function isMyArrival(spot){
  if(spot?.status!=='IN_ARRIVO')return false;
  // If Supabase tells us who claimed it, that value is authoritative.
  // The local set is used only for the very short gap before the server row refreshes.
  if(spot.claimed_by)return spot.claimed_by===state.user?.id;
  return state.cerco.claimedSpotIds.has(spot.id);
}

// ---------- LASCIO ----------
function initLascioMap(lat,lng){
  if(!state.lascio.map){state.lascio.map=L.map('lascio-map').setView([lat,lng],16);addOsmTileLayer(state.lascio.map);state.lascio.marker=L.marker([lat,lng],{icon:pinIcon('pin-green'),draggable:true}).addTo(state.lascio.map);state.lascio.marker.on('dragend',()=>{const p=state.lascio.marker.getLatLng();state.lascio.lat=p.lat;state.lascio.lng=p.lng;updateLascioCoords();});state.lascio.map.on('click',e=>{state.lascio.marker.setLatLng(e.latlng);state.lascio.lat=e.latlng.lat;state.lascio.lng=e.latlng.lng;updateLascioCoords();});}
  else{state.lascio.map.setView([lat,lng],16);state.lascio.marker.setLatLng([lat,lng]);}
  setTimeout(()=>state.lascio.map.invalidateSize(),0);
}
function startLascio(){const status=$('lascio-status'),badge=$('lascio-test-badge'),btn=$('btn-confirm-lascio');$('lascio-result').textContent='';btn.disabled=true;badge.classList.add('hidden');status.textContent='Rilevamento posizione GPS…';setLeaveMinutes(0);setParkingType('LIBERO');geolocate((lat,lng)=>{Object.assign(state.lascio,{lat,lng,isTest:false});status.textContent='Posizione rilevata tramite GPS.';btn.disabled=false;updateLascioCoords();initLascioMap(lat,lng);},()=>{Object.assign(state.lascio,{lat:TEST_LAT,lng:TEST_LNG,isTest:true});status.textContent='GPS non disponibile.';badge.classList.remove('hidden');btn.disabled=false;updateLascioCoords();initLascioMap(TEST_LAT,TEST_LNG);});}
function updateLascioCoords(){if(state.lascio.lat==null)return;const lat=state.lascio.lat,lng=state.lascio.lng;$('lascio-address').textContent='Ricerca indirizzo…';hydrateAddress(lat,lng,label=>{if(state.lascio.lat===lat&&state.lascio.lng===lng)$('lascio-address').textContent=label;});}
function setLeaveMinutes(value){state.leaveMinutes=value;document.querySelectorAll('#leave-time-chips .time-chip').forEach(c=>c.classList.toggle('active',c.dataset.minutes===String(value)));$('custom-minutes-wrap').classList.toggle('hidden',value!=='custom');}
document.querySelectorAll('#leave-time-chips .time-chip').forEach(chip=>chip.addEventListener('click',()=>setLeaveMinutes(chip.dataset.minutes==='custom'?'custom':parseInt(chip.dataset.minutes,10))));
function setParkingType(type){state.parkingType=type;document.querySelectorAll('#parking-type-chips .parking-type-chip').forEach(c=>c.classList.toggle('active',c.dataset.parkingType===type));}
document.querySelectorAll('#parking-type-chips .parking-type-chip').forEach(chip=>chip.addEventListener('click',()=>setParkingType(chip.dataset.parkingType)));

$('btn-confirm-lascio').addEventListener('click',async()=>{
  if(!requireAuth())return; const btn=$('btn-confirm-lascio'),result=$('lascio-result'); btn.disabled=true;result.textContent='Pubblicazione in corso…';
  let minutes=state.leaveMinutes==='custom'?parseInt($('custom-minutes').value,10):state.leaveMinutes;
  if(!Number.isFinite(minutes)||minutes<0||(state.leaveMinutes==='custom'&&minutes<=45)){result.textContent='Inserisci un tempo superiore a 45 minuti.';btn.disabled=false;return;}
  const availableAt=new Date(Date.now()+(minutes===0?-2000:minutes*60000)).toISOString();
  const address=$('lascio-address').textContent||'Posizione parcheggio';
  const {data:createdSpot,error}=await state.supabase.from('parking_spots').insert({lat:state.lascio.lat,lng:state.lascio.lng,status:'LIBERO',released_by:state.user.id,claimed_by:null,available_at:availableAt,parking_type:state.parkingType,address}).select('id').single();
  if(error){result.textContent='Errore: '+error.message;btn.disabled=false;return;}
  const publishedMessage=minutes===0?'Parcheggio pubblicato come libero!':`Parcheggio segnalato: disponibile tra ${minutes} min.`;
  result.textContent=publishedMessage;
  try{
    const {data:pushResult,error:pushError}=await state.supabase.functions.invoke('notify-nearby-spot',{body:{spotId:createdSpot.id}});
    if(pushError)throw pushError;
    if(pushResult?.error)throw new Error(pushResult.error);
    const attempted=Number(pushResult?.attempted||0),sent=Number(pushResult?.sent||0),failed=Number(pushResult?.failed||0);
    console.info('Parkest push dispatch:',pushResult);
    if(attempted>0&&sent===0)showToast(`Parcheggio pubblicato, ma ${failed||attempted} notifiche push non sono partite.`,9000);
  }catch(pushDispatchError){
    console.error('Parkest push dispatch:',pushDispatchError);
    showToast(`Parcheggio pubblicato, ma l'invio push è fallito: ${pushDispatchError?.message||pushDispatchError}`,9000);
  }
  showToast(minutes===0?'Parcheggio libero pubblicato.':`Pre-segnalazione pubblicata: ${minutes} min.`);setTimeout(()=>{showView('view-home');refreshHomeSummary();},1800);
});

// ---------- Navigation + smart arrival ----------
function navigateToSpot(spot){
  const dest=`${spot.lat},${spot.lng}`;
  const isApple=/iPhone|iPad|iPod|Macintosh/i.test(navigator.userAgent);
  const url=isApple?`https://maps.apple.com/?daddr=${encodeURIComponent(dest)}&dirflg=d`:`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}&travelmode=driving`;
  window.open(url,'_blank','noopener');
}
function stopArrivalWatch(){
  if(state.arrivalWatch.watchId!=null && navigator.geolocation) navigator.geolocation.clearWatch(state.arrivalWatch.watchId);
  state.arrivalWatch={watchId:null,spotId:null,nearSince:null,prompted:false};
}
function startArrivalWatch(spot){
  stopArrivalWatch();
  if(!navigator.geolocation || state.cerco.isTest) return;
  state.arrivalWatch.spotId=spot.id;
  state.arrivalWatch.watchId=navigator.geolocation.watchPosition(pos=>{
    const d=haversineMeters(pos.coords.latitude,pos.coords.longitude,spot.lat,spot.lng);
    const speed=pos.coords.speed==null?0:pos.coords.speed;
    const near=d<=25 && speed<=1.5;
    if(!near){state.arrivalWatch.nearSince=null;state.arrivalWatch.prompted=false;return;}
    if(!state.arrivalWatch.nearSince) state.arrivalWatch.nearSince=Date.now();
    if(!state.arrivalWatch.prompted && Date.now()-state.arrivalWatch.nearSince>=75000){
      state.arrivalWatch.prompted=true;
      if(confirm('Sembra che tu abbia parcheggiato qui. Confermi?')) occupySpot(spot.id,null);
      else state.arrivalWatch.nearSince=Date.now();
    }
  },()=>{}, {enableHighAccuracy:true,maximumAge:5000,timeout:10000});
}


// ---------- Core actions / notifications ----------
function formatDistance(m){return m<1000?Math.round(m)+' m':(m/1000).toFixed(1)+' km';}
async function claimSpot(id,btn,openNav=false){
  if(!requireAuth())return;
  const spot=state.cerco.spots.find(s=>s.id===id);
  if(!spot)return;
  const originalButtonText=btn?.textContent||'VAI';
  if(btn){btn.disabled=true;btn.textContent='…';}
  const {data,error}=await state.supabase.rpc('claim_parking_spot',{spot_id:id});
  if(error){showToast('Errore: '+error.message);if(btn){btn.disabled=false;btn.textContent=originalButtonText;}return;}
  if(data!==true){showToast('Questo parcheggio è stato appena preso da un altro utente.');if(btn){btn.disabled=false;btn.textContent=originalButtonText;}await loadNearbySpots(true);return;}
  const claimed={...spot,status:'IN_ARRIVO',claimed_by:state.user.id};
  state.cerco.claimedSpotIds.add(id);
  upsertSpot(claimed); renderCerco();
  // Immediate cross-user hint. The database remains the source of truth; this
  // broadcast only removes perceptible Realtime latency on other devices.
  try{
    await state.cerco.channel?.send({type:'broadcast',event:'spot_claimed',payload:{spot_id:id,claimed_by:state.user.id}});
  }catch(_e){}
  showToast('Hai segnalato che stai raggiungendo questo posto.'); startArrivalWatch(claimed);
  if(openNav)navigateToSpot(claimed);
}
async function occupySpot(id,btn){
  if(!requireAuth())return;
  if(btn){btn.disabled=true;btn.textContent='…';}
  const {data,error}=await state.supabase.rpc('occupy_parking_spot',{spot_id:id});
  if(error){showToast('Errore: '+error.message);if(btn){btn.disabled=false;btn.textContent='SONO ARRIVATO';}return;}
  if(data!==true){showToast('Non è stato possibile aggiornare questo parcheggio.');await loadNearbySpots(true);return;}
  state.cerco.claimedSpotIds.delete(id); stopArrivalWatch(); removeSpot(id); renderCerco(); showToast('Arrivo confermato. Il posto è stato rimosso.'); setTimeout(()=>loadNearbySpots(true),250);
}
function rememberNotification(key){state.notificationMemory.add(key);localStorage.setItem('parkest_notified',JSON.stringify([...state.notificationMemory].slice(-300)));}
function updateSearchButton(){const b=$('btn-search-toggle');if(!b)return;const permission='Notification'in window?Notification.permission:'unsupported';b.classList.toggle('active',state.searchActive);b.classList.toggle('permission-warning',state.searchActive&&permission!=='granted');b.setAttribute('aria-pressed',String(state.searchActive));$('search-toggle-label').textContent=state.searchActive?'RICERCA ATTIVA':'RICERCA DISATTIVATA';$('search-toggle-hint').textContent=state.searchActive?(permission==='granted'?'Riceverai notifiche sui parcheggi disponibili':'Ricerca attiva · abilita le notifiche del dispositivo'):'Tocca per cercare parcheggi e ricevere notifiche';}
async function setSearchActive(active){
  const button=$('btn-search-toggle'),hint=$('search-toggle-hint');
  if(button?.disabled)return;
  if(active&&'Notification'in window&&Notification.permission==='default')await Notification.requestPermission();
  if(active&&(!('Notification'in window)||Notification.permission!=='granted')){state.searchActive=false;localStorage.setItem('parkest_search_active','false');updateSearchButton();hint.textContent='Notifiche non autorizzate nelle impostazioni del dispositivo.';showToast('Per attivare la ricerca devi consentire le notifiche.',9000);return;}
  if(!active){
    state.searchActive=false;localStorage.setItem('parkest_search_active','false');updateSearchButton();
    await syncPushSearchState();showToast('Ricerca disattivata: non riceverai notifiche Parkest.');return;
  }
  if(button)button.disabled=true;
  hint.textContent='Attivazione notifiche in corso…';
  state.searchActive=true;
  window.__parkestPushError='';
  const synced=await syncPushSearchState();
  if(button)button.disabled=false;
  if(!synced){
    state.searchActive=false;localStorage.setItem('parkest_search_active','false');updateSearchButton();
    const detail=window.__parkestPushError?` Dettaglio: ${window.__parkestPushError}`:'';
    hint.textContent=`ERRORE ATTIVAZIONE: ${window.__parkestPushError||'errore sconosciuto'}`;
    showToast(`Non è stato possibile attivare le notifiche.${detail}`,12000);return;
  }
  localStorage.setItem('parkest_search_active','true');updateSearchButton();
  hint.textContent='Ricerca confermata dal server · notifiche attive';
  showToast('Ricerca attiva: riceverai notifiche sui parcheggi disponibili.',7000);checkScheduledNotifications();
}
$('btn-search-toggle')?.addEventListener('click',()=>setSearchActive(!state.searchActive));
function urlBase64ToUint8Array(value){const padding='='.repeat((4-value.length%4)%4),base64=(value+padding).replace(/-/g,'+').replace(/_/g,'/'),raw=atob(base64);return Uint8Array.from([...raw].map(c=>c.charCodeAt(0)));}
function withTimeout(promise,ms,label){return Promise.race([promise,new Promise((_,reject)=>setTimeout(()=>reject(new Error(`${label}: tempo scaduto dopo ${Math.round(ms/1000)} secondi`)),ms))]);}
async function ensureParkestServiceWorker(){
  if(!('serviceWorker'in navigator))throw new Error('Service Worker non supportato');
  await withTimeout(navigator.serviceWorker.register('/sw-v6.6.js',{updateViaCache:'none'}),12000,'Registrazione Service Worker');
  return withTimeout(navigator.serviceWorker.ready,12000,'Avvio Service Worker');
}
async function syncPushSearchState(){
  if(!state.supabase||!state.user)return false;
  const lat=state.cerco.lat??state.home.lat,lng=state.cerco.lng??state.home.lng;
  try{
    if(state.searchActive){
      if(!('serviceWorker'in navigator)||!('PushManager'in window))throw new Error('Push non supportato');
      const registration=await ensureParkestServiceWorker();
      let subscription=await withTimeout(registration.pushManager.getSubscription(),10000,'Lettura sottoscrizione push');
      const savedVapidKey=localStorage.getItem('parkest_vapid_public_key');
      if(subscription&&savedVapidKey!==VAPID_PUBLIC_KEY){
        await withTimeout(subscription.unsubscribe(),10000,'Rimozione vecchia sottoscrizione');
        subscription=null;
      }
      if(!subscription)subscription=await withTimeout(registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:urlBase64ToUint8Array(VAPID_PUBLIC_KEY)}),15000,'Registrazione push Apple');
      const json=subscription.toJSON();
      if(!json.endpoint||!json.keys?.p256dh||!json.keys?.auth)throw new Error('Apple non ha restituito una sottoscrizione push completa');
      const {error:pushError}=await withTimeout(state.supabase.rpc('register_push_subscription',{p_endpoint:json.endpoint,p_p256dh:json.keys.p256dh,p_auth:json.keys.auth,p_user_agent:navigator.userAgent}),12000,'Salvataggio sottoscrizione');
      if(pushError)throw pushError;
      let {data:stored,error:verifyError}=await state.supabase.from('push_subscriptions').select('id').eq('user_id',state.user.id).eq('endpoint',json.endpoint).maybeSingle();
      if(verifyError)throw verifyError;
      // Defensive fallback for projects where the RPC schema cache accepted
      // the call but did not persist the row. A fresh endpoint can be inserted
      // safely through the user's existing RLS policy.
      if(!stored){
        const {error:directError}=await state.supabase.from('push_subscriptions').upsert({user_id:state.user.id,endpoint:json.endpoint,p256dh:json.keys?.p256dh,auth:json.keys?.auth,user_agent:navigator.userAgent,updated_at:new Date().toISOString()},{onConflict:'endpoint'});
        if(directError)throw directError;
        const verified=await state.supabase.from('push_subscriptions').select('id').eq('user_id',state.user.id).eq('endpoint',json.endpoint).maybeSingle();
        if(verified.error)throw verified.error;
        stored=verified.data;
      }
      if(!stored)throw new Error('La sottoscrizione push non è stata registrata dal server.');
      localStorage.setItem('parkest_vapid_public_key',VAPID_PUBLIC_KEY);
    }
    const {error:searchError}=await state.supabase.from('search_sessions').upsert({user_id:state.user.id,active:state.searchActive,lat,lng,radius:state.cerco.radius||state.home.radius,updated_at:new Date().toISOString()},{onConflict:'user_id'});
    if(searchError)throw searchError;
    return true;
  }catch(error){
    console.warn('Parkest push sync:',error);
    window.__parkestPushError=error?.message||String(error);
    if(state.searchActive){
      await state.supabase.from('search_sessions').upsert({user_id:state.user.id,active:false,lat,lng,radius:state.cerco.radius||state.home.radius,updated_at:new Date().toISOString()},{onConflict:'user_id'});
    }
    return false;
  }
}
async function sendBrowserNotification(title,detail,spot,key){
  if(!state.searchActive||state.notificationMemory.has(key))return;
  const address=await hydrateAddress(spot.lat,spot.lng);if(!state.searchActive||state.notificationMemory.has(key))return;
  const body=`${address}\n${detail}`;rememberNotification(key);showToast(`${title} — ${address} · ${detail}`);
  if(!('Notification'in window)||Notification.permission!=='granted')return;
  const options={body,tag:key,renotify:false,data:{spotId:spot.id,lat:spot.lat,lng:spot.lng},actions:[{action:'navigate',title:'NAVIGA'},{action:'go',title:'VAI'}]};
  try{const registration=await navigator.serviceWorker?.ready;if(registration)await registration.showNotification(title,options);else{const n=new Notification(title,options);n.onclick=()=>{window.focus();showView('view-cerco');focusSpot(spot.id);};}}catch(_e){const n=new Notification(title,{body,tag:key});n.onclick=()=>{window.focus();showView('view-cerco');focusSpot(spot.id);};}
}
function spotInCurrentRadius(spot){return state.cerco.lat!=null&&haversineMeters(state.cerco.lat,state.cerco.lng,spot.lat,spot.lng)<=state.cerco.radius;}
function upsertSpot(spot){const i=state.cerco.spots.findIndex(s=>s.id===spot.id);if(i>=0)state.cerco.spots[i]=spot;else state.cerco.spots.unshift(spot);}
function removeSpot(id){state.cerco.spots=state.cerco.spots.filter(s=>s.id!==id);}
function spotFingerprint(spots){return (spots||[]).map(s=>[s.id,s.status,s.claimed_by||'',s.available_at||'',s.updated_at||''].join(':')).sort().join('|');}

async function handleNotificationAction(action,spotId){
  if(!spotId||!state.user)return;
  stopHomeChannel();showView('view-cerco');startCerco();
  for(let attempt=0;attempt<20&&!state.cerco.spots.some(s=>s.id===spotId);attempt++)await new Promise(resolve=>setTimeout(resolve,250));
  const spot=state.cerco.spots.find(s=>s.id===spotId);if(!spot){showToast('Questo parcheggio non è più disponibile.');return;}
  if(action==='go')await claimSpot(spotId,null,false);
  else if(action==='navigate')await claimSpot(spotId,null,true);
  else focusSpot(spotId);
}
function consumePendingNotificationAction(){
  const pending=localStorage.getItem('parkest_pending_notification_action');if(!pending||!state.user)return;
  localStorage.removeItem('parkest_pending_notification_action');
  try{const data=JSON.parse(pending);handleNotificationAction(data.action,data.spotId);}catch(_e){}
}
if('serviceWorker'in navigator)navigator.serviceWorker.addEventListener('message',event=>{const data=event.data;if(data?.type==='PARKEST_NOTIFICATION_ACTION')handleNotificationAction(data.action,data.spotId);});
const notificationParams=new URLSearchParams(location.search);if(notificationParams.get('notification_action')&&notificationParams.get('spot')){localStorage.setItem('parkest_pending_notification_action',JSON.stringify({action:notificationParams.get('notification_action'),spotId:notificationParams.get('spot')}));history.replaceState({},'',location.pathname);}

// ---------- CERCO ----------
function initCercoMap(lat,lng){
  if(!state.cerco.map){
    state.cerco.map=L.map('cerco-map').setView([lat,lng],15); addOsmTileLayer(state.cerco.map);
    state.cerco.map.createPane('parkingPane'); state.cerco.map.getPane('parkingPane').style.zIndex='650';
    state.cerco.map.createPane('userPane'); state.cerco.map.getPane('userPane').style.zIndex='620';
    state.cerco.markersLayer=L.layerGroup().addTo(state.cerco.map);
    state.cerco.availableCluster=(L.markerClusterGroup?L.markerClusterGroup({showCoverageOnHover:false,spiderfyOnMaxZoom:true,disableClusteringAtZoom:18,maxClusterRadius:55,iconCreateFunction(cluster){return L.divIcon({html:`<div class="parkest-cluster"><span>${cluster.getChildCount()}</span></div>`,className:'parkest-cluster-wrap',iconSize:[44,44]});}}):L.layerGroup()).addTo(state.cerco.map);
    state.cerco.userMarker=L.marker([lat,lng],{icon:userDotIcon(),interactive:false,pane:'userPane'}).addTo(state.cerco.map);
    state.cerco.radiusCircle=L.circle([lat,lng],{radius:state.cerco.radius,weight:1,fillOpacity:.06,interactive:false}).addTo(state.cerco.map);
  }else{
    state.cerco.map.setView([lat,lng],15); state.cerco.userMarker.setLatLng([lat,lng]); state.cerco.radiusCircle.setLatLng([lat,lng]).setRadius(state.cerco.radius);
  }
  setTimeout(()=>state.cerco.map.invalidateSize(),0);
}
function buildSpotPopupContent(spot,dist){
  const vs=visualStatus(spot), ownArrival=isMyArrival(spot), otherArrival=vs==='IN_ARRIVO'&&!ownArrival;
  const c=document.createElement('div'); c.className='popup-content';
  const address=document.createElement('strong'); address.textContent=cachedAddress(spot.lat,spot.lng); c.appendChild(address); hydrateAddress(spot.lat,spot.lng,label=>address.textContent=label);
  const d=document.createElement('span'); d.className='popup-dist'; d.textContent=formatDistance(dist); c.appendChild(d); const pt=document.createElement('span');pt.className='popup-parking-type type-'+parkingTypeClass(spot.parking_type);pt.textContent=parkingTypeLabel(spot.parking_type);c.appendChild(pt);
  const t=document.createElement('span'); t.className='popup-time'; t.textContent=vs==='SCHEDULED'?`Si libera tra ${minutesRemaining(spot)} min`:vs==='LIBERO'?'Libero adesso':otherArrival?'Qualcuno sta raggiungendo il posto':'Stai raggiungendo questo posto'; c.appendChild(t);
  if(!otherArrival){
    const select=document.createElement('button'); select.className='btn-secondary popup-go'; select.textContent='VEDI NELLA LISTA'; select.addEventListener('click',()=>selectSpotInList(spot.id)); c.appendChild(select);
  }
  if(vs==='SCHEDULED'||vs==='LIBERO'||ownArrival){
    const n=document.createElement('button'); n.className='btn-go popup-go'; n.textContent='NAVIGA'; n.addEventListener('click',()=>{if(ownArrival)navigateToSpot(spot);else claimSpot(spot.id,n,true);}); c.appendChild(n);
  }
  if(vs==='SCHEDULED'||vs==='LIBERO'){const b=document.createElement('button');b.className='btn-go popup-go';b.textContent='VAI';b.addEventListener('click',()=>claimSpot(spot.id,b,false));c.appendChild(b);}
  if(ownArrival){const b=document.createElement('button');b.className='btn-go btn-red popup-go';b.textContent='SONO ARRIVATO';b.addEventListener('click',()=>occupySpot(spot.id,b));c.appendChild(b);}
  return c;
}
function canonicalCercoSpots(){
  const {lat,lng,radius,spots}=state.cerco; if(lat==null||lng==null)return [];
  return spots.map(s=>({...s,_dist:haversineMeters(lat,lng,s.lat,s.lng)}))
    .filter(s=>Number.isFinite(s._dist)&&s._dist<=radius&&s.status!=='OCCUPATO')
    .sort((a,b)=>{const av=visualStatus(a),bv=visualStatus(b);if(av==='LIBERO'&&bv!=='LIBERO')return -1;if(bv==='LIBERO'&&av!=='LIBERO')return 1;if(av==='SCHEDULED'&&bv==='SCHEDULED')return minutesRemaining(a)-minutesRemaining(b);return a._dist-b._dist;});
}
function visibleCercoSpots(){return canonicalCercoSpots().filter(s=>s.status!=='IN_ARRIVO'||isMyArrival(s));}
function selectSpotInList(id){
  const card=state.cerco.cardBySpotId.get(id); if(!card)return;
  document.querySelectorAll('.spot-card.selected').forEach(x=>x.classList.remove('selected')); card.classList.add('selected');
  card.scrollIntoView({behavior:'smooth',block:'center'}); setTimeout(()=>card.focus({preventScroll:true}),350);
}
function focusSpot(id){
  const marker=state.cerco.markerBySpotId.get(id); if(marker){state.cerco.map.setView(marker.getLatLng(),Math.max(state.cerco.map.getZoom(),16));marker.openPopup();}
  selectSpotInList(id);
}
function renderCerco(){
  if(!state.cerco.map||state.cerco.lat==null)return;
  const mapRows=canonicalCercoSpots(), rows=mapRows.filter(s=>s.status!=='IN_ARRIVO'||isMyArrival(s)), list=$('spot-list');
  state.cerco.radiusCircle?.setRadius(state.cerco.radius); state.cerco.markersLayer.clearLayers(); state.cerco.availableCluster?.clearLayers(); state.cerco.markerBySpotId=new Map(); state.cerco.cardBySpotId=new Map(); list.replaceChildren();
  $('spot-count').textContent=String(rows.length);
  mapRows.forEach(spot=>{
    const vs=visualStatus(spot), ownArrival=isMyArrival(spot), otherArrival=vs==='IN_ARRIVO'&&!ownArrival;
    const icon=vs==='SCHEDULED'?timedPinIcon(minutesRemaining(spot)):pinIcon(vs==='IN_ARRIVO'?'pin-red':'pin-green');
    const m=L.marker([spot.lat,spot.lng],{icon,interactive:true,pane:'parkingPane',keyboard:true,riseOnHover:true,riseOffset:1000,title:'Parcheggio Parkest'}); if(vs==='LIBERO'||vs==='SCHEDULED') state.cerco.availableCluster.addLayer(m); else state.cerco.markersLayer.addLayer(m);
    m.bindPopup(buildSpotPopupContent(spot,spot._dist),{closeButton:true,autoPan:true});
    m.on('click',()=>{if(!otherArrival)selectSpotInList(spot.id);m.openPopup();}); state.cerco.markerBySpotId.set(spot.id,m);
  });
  if(!rows.length){const e=document.createElement('p');e.className='empty-hint';e.textContent='Nessun parcheggio disponibile nel raggio selezionato.';list.appendChild(e);return;}
  rows.forEach(spot=>{
    const vs=visualStatus(spot), iconOwn=isMyArrival(spot);
    const card=document.createElement('div'); card.className='spot-card status-'+vs.toLowerCase(); card.dataset.spotId=spot.id; card.tabIndex=0; card.setAttribute('role','button');
    const info=document.createElement('div'); info.className='spot-info';
    const addr=document.createElement('div'); addr.className='spot-address'; addr.textContent=cachedAddress(spot.lat,spot.lng); hydrateAddress(spot.lat,spot.lng,label=>addr.textContent=label);
    const dist=document.createElement('div'); dist.className='spot-dist'; dist.textContent=formatDistance(spot._dist);
    const meta=document.createElement('div'); meta.className='spot-meta'; meta.dataset.countdownFor=spot.id; meta.textContent=vs==='SCHEDULED'?`Disponibile tra ${minutesRemaining(spot)} min`:vs==='LIBERO'?'Libero adesso':'Stai raggiungendo questo posto';
    const badge=document.createElement('span'); badge.className='badge badge-'+vs.toLowerCase(); badge.textContent=vs==='SCHEDULED'?'SI LIBERA':vs==='IN_ARRIVO'?'IN ARRIVO':'LIBERO';
    const typeBadge=document.createElement('span');typeBadge.className='parking-type-badge type-'+parkingTypeClass(spot.parking_type);typeBadge.textContent=parkingTypeLabel(spot.parking_type);info.append(addr,dist,meta,badge,typeBadge); if(spot.released_by===state.user?.id){const own=document.createElement('span');own.className='own-spot-label';own.textContent='IL TUO POSTO';info.appendChild(own);} card.appendChild(info);
    const actions=document.createElement('div'); actions.className='spot-actions';
    if(vs==='SCHEDULED'||vs==='LIBERO'||iconOwn){const n=document.createElement('button');n.className='btn-go';n.textContent='NAVIGA';n.addEventListener('click',e=>{e.stopPropagation();if(iconOwn)navigateToSpot(spot);else claimSpot(spot.id,n,true);});actions.appendChild(n);}
    if(vs==='SCHEDULED'||vs==='LIBERO'){const b=document.createElement('button');b.className='btn-go';b.textContent='VAI';b.addEventListener('click',e=>{e.stopPropagation();claimSpot(spot.id,b,false);});actions.appendChild(b);}
    if(iconOwn){const b=document.createElement('button');b.className='btn-go btn-red';b.textContent='SONO ARRIVATO';b.addEventListener('click',e=>{e.stopPropagation();occupySpot(spot.id,b);});actions.appendChild(b);}
    if(actions.children.length)card.appendChild(actions);
    card.addEventListener('click',e=>{if(!e.target.closest('button'))focusSpot(spot.id);}); card.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();focusSpot(spot.id);}});
    list.appendChild(card); state.cerco.cardBySpotId.set(spot.id,card);
  });
}
function startCerco(){if(!requireAuth())return;state.cerco.radius=state.home.radius;document.querySelectorAll('#radius-chips .chip').forEach(c=>c.classList.toggle('active',parseInt(c.dataset.radius,10)===state.cerco.radius));const status=$('cerco-status'),badge=$('cerco-test-badge');status.textContent='Rilevamento posizione GPS…';badge.classList.add('hidden');geolocate((lat,lng)=>{Object.assign(state.cerco,{lat,lng,isTest:false});status.textContent='Posizione rilevata tramite GPS.';initCercoMap(lat,lng);loadNearbySpots(true);subscribeCerco();if(state.searchActive)syncPushSearchState();},()=>{Object.assign(state.cerco,{lat:TEST_LAT,lng:TEST_LNG,isTest:true});status.textContent='GPS non disponibile.';badge.classList.remove('hidden');initCercoMap(TEST_LAT,TEST_LNG);loadNearbySpots(true);subscribeCerco();});}
document.querySelectorAll('#radius-chips .chip').forEach(chip=>chip.addEventListener('click',()=>{document.querySelectorAll('#radius-chips .chip').forEach(c=>c.classList.remove('active'));chip.classList.add('active');state.cerco.radius=parseInt(chip.dataset.radius,10);state.home.radius=state.cerco.radius;localStorage.setItem('parkest_home_radius',String(state.home.radius));syncHomeRadiusChips();renderCerco();checkScheduledNotifications();}));
function haversineMeters(lat1,lng1,lat2,lng2){const R=6371000,toRad=d=>d*Math.PI/180,dLat=toRad(lat2-lat1),dLng=toRad(lng2-lng1);const a=Math.sin(dLat/2)**2+Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLng/2)**2;return 2*R*Math.asin(Math.sqrt(a));}
async function loadNearbySpots(force=false){
  if(!requireAuth())return; const {data,error}=await state.supabase.from('parking_spots').select('*').neq('status','OCCUPATO').order('created_at',{ascending:false}).limit(300);
  if(error){showToast('Errore nel caricamento parcheggi: '+error.message);return;}
  const serverSpots=data||[];
  // Rebuild the local ownership cache from the authoritative server value.
  state.cerco.claimedSpotIds=new Set(serverSpots.filter(s=>s.status==='IN_ARRIVO'&&s.claimed_by===state.user?.id).map(s=>s.id));
  const fp=spotFingerprint(serverSpots); if(force||fp!==state.cerco.dataFingerprint){state.cerco.spots=serverSpots;state.cerco.dataFingerprint=fp;renderCerco();checkScheduledNotifications();}
}
function stopCercoChannel(){if(state.cerco.channel&&state.supabase){state.supabase.removeChannel(state.cerco.channel);state.cerco.channel=null;}}
function subscribeCerco(){
  if(!state.supabase)return; stopCercoChannel();
  state.cerco.channel=state.supabase.channel('parking_spots_changes')
  .on('postgres_changes',{event:'*',schema:'public',table:'parking_spots'},payload=>{
    if(payload.eventType==='DELETE'){state.cerco.claimedSpotIds.delete(payload.old.id);removeSpot(payload.old.id);} else{
      const spot=payload.new, previous=state.cerco.spots.find(s=>s.id===spot.id);
      if(spot.status==='IN_ARRIVO'&&spot.claimed_by===state.user?.id)state.cerco.claimedSpotIds.add(spot.id);
      else if(spot.claimed_by!==state.user?.id)state.cerco.claimedSpotIds.delete(spot.id);
      if(spot.status==='OCCUPATO')state.cerco.claimedSpotIds.delete(spot.id);
      if(previous&&previous.status==='LIBERO'&&spot.status==='IN_ARRIVO'&&spot.claimed_by!==state.user?.id)notifySpotTaken(spot);
      upsertSpot(spot); if(payload.eventType==='INSERT')notifyForNewSpot(spot);
    }
    state.cerco.dataFingerprint=spotFingerprint(state.cerco.spots); renderCerco(); checkScheduledNotifications();
  })
  .on('broadcast',{event:'spot_claimed'},({payload})=>{
    if(!payload?.spot_id||payload.claimed_by===state.user?.id)return;
    const spot=state.cerco.spots.find(s=>s.id===payload.spot_id);
    if(spot){
      const wasFree=spot.status==='LIBERO';
      const red={...spot,status:'IN_ARRIVO',claimed_by:payload.claimed_by};
      state.cerco.claimedSpotIds.delete(red.id); upsertSpot(red); renderCerco();
      if(wasFree)notifySpotTaken(red);
    }
    // Confirm against Supabase immediately so the broadcast never becomes the source of truth.
    loadNearbySpots(true);
  })
  .subscribe();
}
function notifyForNewSpot(spot){if(!state.searchActive||!spotInCurrentRadius(spot))return;const dist=formatDistance(haversineMeters(state.cerco.lat,state.cerco.lng,spot.lat,spot.lng));if(isScheduled(spot)){const m=minutesRemaining(spot);if(m<=10)sendBrowserNotification('🅿️ Si libera tra poco',`${dist} · disponibile tra ${m} min`,spot,`${spot.id}:10`);}else if(spot.status==='LIBERO')sendBrowserNotification('🅿️ Parcheggio disponibile',`${dist} · libero adesso`,spot,`${spot.id}:free`);}
function notifySpotTaken(spot){if(!state.searchActive||!spotInCurrentRadius(spot))return;const dist=formatDistance(haversineMeters(state.cerco.lat,state.cerco.lng,spot.lat,spot.lng));if(navigator.vibrate)navigator.vibrate([180,100,180]);sendBrowserNotification('Parkest – Parcheggio non più disponibile',`${dist} · preso da un altro utente`,spot,`${spot.id}:taken`);}
function checkScheduledNotifications(){if(!state.searchActive||state.cerco.lat==null)return;state.cerco.spots.forEach(spot=>{if(!spotInCurrentRadius(spot)||spot.status!=='LIBERO')return;const m=minutesRemaining(spot),dist=formatDistance(haversineMeters(state.cerco.lat,state.cerco.lng,spot.lat,spot.lng));if(isScheduled(spot)&&m<=10)sendBrowserNotification('🅿️ Si libera tra poco',`${dist} · disponibile tra ${m} min`,spot,`${spot.id}:10`);if(!isScheduled(spot))sendBrowserNotification('🅿️ Parcheggio disponibile',`${dist} · libero adesso`,spot,`${spot.id}:free`);});}

// ---------- Home summary (live + selectable radius) ----------
function formatRadiusLabel(m){return m>=1000?`${m/1000} km`:`${m} m`;}
function syncHomeRadiusChips(){document.querySelectorAll('#home-radius-chips .chip').forEach(c=>c.classList.toggle('active',parseInt(c.dataset.homeRadius,10)===state.home.radius));}
function refreshHomeSummary(){
  if(!state.supabase||!state.user)return;
  syncHomeRadiusChips();
  geolocate(async(lat,lng)=>{state.home.lat=lat;state.home.lng=lng;await updateHomeSummaryAt(lat,lng);subscribeHomeSummary();},async()=>{state.home.lat=TEST_LAT;state.home.lng=TEST_LNG;await updateHomeSummaryAt(TEST_LAT,TEST_LNG);subscribeHomeSummary();});
}
async function updateHomeSummaryAt(lat,lng){
  const stats=$('home-summary-stats'); if(!stats)return;
  const {data,error}=await state.supabase.from('parking_spots').select('*').eq('status','LIBERO').limit(500);
  if(error){stats.textContent='Impossibile aggiornare i parcheggi vicini.';return;}
  const near=(data||[]).map(s=>({...s,_dist:haversineMeters(lat,lng,s.lat,s.lng)})).filter(s=>s._dist<=state.home.radius);
  const free=near.filter(s=>visualStatus(s)==='LIBERO').length;
  const scheduled=near.filter(s=>visualStatus(s)==='SCHEDULED').length;
  const total=free+scheduled, radiusLabel=formatRadiusLabel(state.home.radius);
  stats.innerHTML=`<div class="home-total">${total} ${total===1?'posto disponibile':'posti disponibili'}</div><div class="home-detail">entro ${radiusLabel} · ${free} ${free===1?'libero':'liberi'} ora · ${scheduled} ${scheduled===1?'programmato':'programmati'}</div>`;
}
function stopHomeChannel(){if(state.home.channel&&state.supabase){state.supabase.removeChannel(state.home.channel);state.home.channel=null;}}
function subscribeHomeSummary(){
  if(!state.supabase||state.home.channel)return;
  state.home.channel=state.supabase.channel('parkest-home-live').on('postgres_changes',{event:'*',schema:'public',table:'parking_spots'},()=>{
    if($('view-home').classList.contains('active')&&state.home.lat!=null)updateHomeSummaryAt(state.home.lat,state.home.lng);
  }).subscribe();
}
document.querySelectorAll('#home-radius-chips .chip').forEach(chip=>chip.addEventListener('click',()=>{
  state.home.radius=parseInt(chip.dataset.homeRadius,10);
  state.cerco.radius=state.home.radius;
  localStorage.setItem('parkest_home_radius',String(state.home.radius));
  syncHomeRadiusChips();
  if(state.home.lat!=null)updateHomeSummaryAt(state.home.lat,state.home.lng); else refreshHomeSummary();
}));

// Home Realtime is primary; this poll is only a safety net for mobile browsers.
setInterval(()=>{if($('view-home').classList.contains('active')&&state.supabase&&state.user&&state.home.lat!=null&&!state.home.pollBusy){state.home.pollBusy=true;updateHomeSummaryAt(state.home.lat,state.home.lng).finally(()=>state.home.pollBusy=false);}},5000);
window.addEventListener('focus',()=>{if($('view-home').classList.contains('active')&&state.supabase&&state.user)refreshHomeSummary();});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&$('view-home').classList.contains('active')&&state.supabase&&state.user)refreshHomeSummary();});

// CERCO reliability: Realtime is primary. A low-frequency poll is only a safety net.
setInterval(()=>{if($('view-cerco').classList.contains('active')&&state.supabase&&state.user&&!state.cerco.pollBusy){state.cerco.pollBusy=true;loadNearbySpots(false).finally(()=>state.cerco.pollBusy=false);}},3000);
setInterval(()=>{if(state.searchActive&&$('view-cerco').classList.contains('active')&&state.user)geolocate((lat,lng)=>{state.cerco.lat=lat;state.cerco.lng=lng;syncPushSearchState();},()=>{});},60000);
window.addEventListener('focus',()=>{if($('view-cerco').classList.contains('active')&&state.supabase&&state.user)loadNearbySpots(true);});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&$('view-cerco').classList.contains('active')&&state.supabase&&state.user)loadNearbySpots(true);});
// Countdown tick: rebuild only when a scheduled spot actually crosses into LIBERO.
let lastVisualSignature='';
setInterval(()=>{
  if(!$('view-cerco').classList.contains('active'))return;
  const rows=visibleCercoSpots();
  const sig=rows.map(x=>x.id+':'+visualStatus(x)).join('|');
  if(sig!==lastVisualSignature){lastVisualSignature=sig;renderCerco();return;}
  rows.filter(x=>visualStatus(x)==='SCHEDULED').forEach(x=>{
    const m=minutesRemaining(x), meta=document.querySelector(`[data-countdown-for="${x.id}"]`); if(meta)meta.textContent=`Disponibile tra ${m} min`;
    const marker=state.cerco.markerBySpotId.get(x.id); if(marker)marker.setIcon(timedPinIcon(m));
  });
},10000);

// ---------- Init ----------
updateSearchButton();
loadSavedConnection();

// ---------- PWA install ----------
let deferredInstallPrompt = null;
const installButton = document.getElementById('btn-install-app');
const installHint = document.getElementById('pwa-install-hint');
const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

function refreshInstallUI(){
  if(!installButton || !installHint) return;
  if(isStandalone){
    installButton.classList.add('hidden');
    installHint.textContent='Parkest è già installata su questo dispositivo.';
    return;
  }
  if(deferredInstallPrompt){
    installButton.classList.remove('hidden');
    installHint.textContent='Installa Parkest sulla schermata Home per aprirla come una vera app.';
  } else if(isIOS){
    installButton.classList.remove('hidden');
    installHint.textContent='Su iPhone: apri Parkest in Safari, tocca Condividi e poi “Aggiungi alla schermata Home”.';
  } else {
    installButton.classList.add('hidden');
    installHint.textContent='Quando il browser renderà disponibile l’installazione, comparirà qui il pulsante Installa Parkest.';
  }
}

window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault();
  deferredInstallPrompt = event;
  refreshInstallUI();
});

window.addEventListener('appinstalled', () => {
  deferredInstallPrompt = null;
  refreshInstallUI();
  showToast('Parkest installata. La trovi nella schermata Home.');
});

installButton?.addEventListener('click', async () => {
  if(isIOS && !deferredInstallPrompt){
    showToast('Su iPhone: Safari → Condividi → Aggiungi alla schermata Home.', 6500);
    return;
  }
  if(!deferredInstallPrompt){
    showToast('Apri Parkest con Chrome/Safari e usa “Aggiungi alla schermata Home”.', 5500);
    return;
  }
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  refreshInstallUI();
});

if('serviceWorker' in navigator){
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw-v6.6.js',{updateViaCache:'none'}).catch(err => console.warn('Parkest service worker:', err));
  });
}
refreshInstallUI();
