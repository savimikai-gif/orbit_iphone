// ORBIT Mobile 3.1 — local-first PWA. No microphone, cloud account, or native PC APIs.
const $ = id => document.getElementById(id);
const KEY_REMINDERS = 'orbit_mobile_reminders_v1'; // Keep the 2.8 key so existing local reminders remain.
const KEY_PREFS = 'orbit_mobile_preferences_v1';
const KEY_NOTES = 'orbit_mobile_notes_v31';
const KEY_WEATHER = 'orbit_mobile_weather_v31';
const VERSION = '3.1.0';
const ACCENTS = ['blue', 'purple', 'teal', 'amber', 'rose'];
const REPEATS = ['once', 'daily', 'weekdays', 'custom'];
const load = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback; } catch { return fallback; } };
const save = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { toast('Storage full. Please export a backup before adding more data.'); return false; } };
const pad = n => String(n).padStart(2, '0');
const localDateTime = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
const uuid = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`);
const safeString = (value, max = 300) => typeof value === 'string' ? value.slice(0, max) : '';
const dateValid = value => Number.isFinite(Number(value)) && Number(value) > 0;
const locale = () => prefs.language === 'ro' ? 'ro-RO' : 'en-GB';
const whenText = time => new Date(time).toLocaleString(locale(), { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
const emptyMessage = (message) => { const el = document.createElement('div'); el.className = 'empty'; el.textContent = message; return el; };
let toastTimer;
function toast(message) { $('toast').textContent = message; $('toast').classList.remove('hidden'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').classList.add('hidden'), 3900); }

function cleanReminder(item) {
  if (!item || typeof item !== 'object' || !dateValid(item.when)) return null;
  const repeat = REPEATS.includes(item.repeat) ? item.repeat : 'once';
  return {
    id: safeString(item.id, 100) || uuid(), title: safeString(item.title, 300).trim() || 'Untitled reminder',
    when: Number(item.when), repeat, days: Array.isArray(item.days) ? item.days.filter(v => Number.isInteger(v) && v >= 0 && v <= 6) : [],
    done: Boolean(item.done), lastAlert: dateValid(item.lastAlert) ? Number(item.lastAlert) : null
  };
}
function cleanNote(item) {
  if (!item || typeof item !== 'object') return null;
  return { id: safeString(item.id, 100) || uuid(), title: safeString(item.title, 200), body: safeString(item.body, 60000),
    pinned: Boolean(item.pinned), created: dateValid(item.created) ? Number(item.created) : Date.now(),
    updated: dateValid(item.updated) ? Number(item.updated) : Date.now() };
}
function cleanPrefs(raw) {
  const obj = raw && typeof raw === 'object' ? raw : {};
  return { accent: ACCENTS.includes(obj.accent) ? obj.accent : 'blue', language: obj.language === 'ro' ? 'ro' : 'en',
    city: obj.city && typeof obj.city === 'object' && Number.isFinite(Number(obj.city.latitude)) && Number.isFinite(Number(obj.city.longitude))
      ? { name: safeString(obj.city.name, 130), latitude: Number(obj.city.latitude), longitude: Number(obj.city.longitude) } : null };
}
let reminders = (Array.isArray(load(KEY_REMINDERS, [])) ? load(KEY_REMINDERS, []) : []).map(cleanReminder).filter(Boolean);
let notes = (Array.isArray(load(KEY_NOTES, [])) ? load(KEY_NOTES, []) : []).map(cleanNote).filter(Boolean);
let prefs = cleanPrefs(load(KEY_PREFS, {}));
let weather = load(KEY_WEATHER, null);
let screen = 'home', editingReminder = null, selectedDays = [1, 2, 3, 4, 5], selectedNoteId = null, notificationRegistration = null;

function show(next) {
  if (!['home','reminders','notes','weather','settings'].includes(next)) return;
  screen = next;
  document.querySelectorAll('.screen').forEach(el => el.classList.toggle('hidden', el.id !== `screen-${next}`));
  document.querySelectorAll('[data-nav]').forEach(el => el.classList.toggle('active', el.dataset.nav === next));
  if (next === 'notes') renderNotes();
  if (next === 'weather' && prefs.city && !weather) refreshWeather();
  window.scrollTo({ top: 0, behavior: 'auto' });
}
document.querySelectorAll('[data-nav]').forEach(btn => btn.addEventListener('click', () => show(btn.dataset.nav)));
document.querySelectorAll('[data-go]').forEach(btn => btn.addEventListener('click', () => show(btn.dataset.go)));
$('quickAdd').onclick = () => { show('reminders'); $('reminderTitle').focus(); };

function nextOccurrence(originalWhen, repeat, days = [], reference = Date.now()) {
  if (repeat === 'once') return originalWhen;
  const original = new Date(originalWhen);
  const initial = Math.max(reference, originalWhen - 1000);
  const start = new Date(initial);
  start.setHours(0, 0, 0, 0);
  for (let offset = 0; offset <= 14; offset++) {
    const candidate = new Date(start);
    candidate.setDate(start.getDate() + offset);
    candidate.setHours(original.getHours(), original.getMinutes(), 0, 0);
    const day = candidate.getDay();
    const allowed = repeat === 'daily' || (repeat === 'weekdays' && day >= 1 && day <= 5) || (repeat === 'custom' && days.includes(day));
    if (allowed && candidate.getTime() > reference && candidate.getTime() >= originalWhen) return candidate.getTime();
  }
  return originalWhen;
}
function persistReminders() { save(KEY_REMINDERS, reminders); renderReminders(); renderHome(); }
function reminderRow(item, compact = false) {
  const row = document.createElement('div');
  row.className = `reminder-row${item.done ? ' done' : ''}${!item.done && item.when < Date.now() ? ' overdue' : ''}`;
  const check = document.createElement('input'); check.type = 'checkbox'; check.checked = item.done;
  check.setAttribute('aria-label', `Mark ${item.title} complete`);
  check.onchange = () => {
    if (item.repeat !== 'once' && check.checked) {
      item.when = nextOccurrence(item.when, item.repeat, item.days, Math.max(Date.now(), item.when) + 1000);
      item.lastAlert = null; item.done = false; toast('Next reminder scheduled.');
    } else { item.done = check.checked; }
    persistReminders();
  };
  const body = document.createElement('div'); const title = document.createElement('strong'); const sub = document.createElement('small');
  title.textContent = item.title;
  const repeatName = { once: 'Once', daily: 'Daily', weekdays: 'Weekdays', custom: 'Custom days' }[item.repeat];
  sub.textContent = `${whenText(item.when)} · ${repeatName}${!item.done && item.when < Date.now() ? ' · Due' : ''}`;
  body.append(title, sub);
  const actions = document.createElement('div'); actions.className = 'row-actions';
  if (!compact) {
    const edit = document.createElement('button'); edit.type = 'button'; edit.textContent = 'Edit';
    edit.onclick = () => {
      editingReminder = item.id; $('reminderTitle').value = item.title; $('reminderWhen').value = localDateTime(new Date(item.when));
      $('reminderRepeat').value = item.repeat; selectedDays = [...item.days]; drawDays();
      $('formHeading').textContent = 'Edit reminder'; $('saveReminder').textContent = 'Save changes'; $('cancelEdit').classList.remove('hidden');
      window.scrollTo({top: 0, behavior: 'smooth'});
    };
    const del = document.createElement('button'); del.type = 'button'; del.className = 'danger'; del.textContent = 'Delete';
    del.onclick = () => { if (!confirm('Delete this reminder?')) return; reminders = reminders.filter(r => r.id !== item.id); persistReminders(); toast('Reminder deleted.'); };
    actions.append(edit, del);
  }
  row.append(check, body, actions); return row;
}
function renderReminders() {
  const sorted = [...reminders].sort((a, b) => Number(a.done) - Number(b.done) || a.when - b.when);
  $('reminderCount').textContent = String(reminders.length);
  const list = $('reminderList'); list.replaceChildren();
  if (!sorted.length) list.append(emptyMessage('No reminders yet. Add one above.'));
  else sorted.forEach(item => list.append(reminderRow(item)));
}
function drawDays() {
  const days = $('customDays'); const custom = $('reminderRepeat').value === 'custom';
  days.classList.toggle('hidden', !custom); days.replaceChildren();
  ['S','M','T','W','T','F','S'].forEach((label, day) => {
    const button = document.createElement('button'); button.type = 'button'; button.textContent = label;
    button.setAttribute('aria-label', ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][day]);
    button.setAttribute('aria-pressed', String(selectedDays.includes(day))); button.classList.toggle('selected', selectedDays.includes(day));
    button.onclick = () => { selectedDays = selectedDays.includes(day) ? selectedDays.filter(d => d !== day) : [...selectedDays, day]; drawDays(); };
    days.append(button);
  });
}
function resetReminderForm() {
  editingReminder = null; $('reminderForm').reset();
  $('reminderWhen').value = localDateTime(new Date(Date.now() + 30 * 60000));
  $('formHeading').textContent = 'New reminder'; $('saveReminder').textContent = 'Add reminder';
  $('cancelEdit').classList.add('hidden'); selectedDays = [1,2,3,4,5]; drawDays();
}
$('reminderRepeat').onchange = drawDays;
$('cancelEdit').onclick = resetReminderForm;
$('reminderForm').onsubmit = e => {
  e.preventDefault();
  const title = $('reminderTitle').value.trim(); let when = new Date($('reminderWhen').value).getTime(); const repeat = $('reminderRepeat').value;
  if (!title || !Number.isFinite(when)) return toast('Enter a reminder and a valid date.');
  if (when < Date.now() && !editingReminder) return toast('Choose a future date and time.');
  if (repeat === 'custom' && !selectedDays.length) return toast('Choose at least one day.');
  const days = repeat === 'custom' ? [...selectedDays] : [];
  if (repeat !== 'once') when = nextOccurrence(when, repeat, days, when - 1000);
  const patch = { title: title.slice(0,300), when, repeat, days, done: false, lastAlert: null };
  if (editingReminder) { const current = reminders.find(r => r.id === editingReminder); if (current) Object.assign(current, patch); }
  else reminders.push({ id: uuid(), ...patch });
  persistReminders(); resetReminderForm(); toast('Reminder saved.');
};

function sortedNotes() { return [...notes].sort((a,b) => Number(b.pinned) - Number(a.pinned) || b.updated - a.updated); }
function persistNotes() { save(KEY_NOTES, notes); renderHome(); }
function renderNotes() {
  const browser = $('notesBrowser'), editor = $('notesEditor');
  const current = notes.find(n => n.id === selectedNoteId);
  browser.classList.toggle('hidden', Boolean(current)); editor.classList.toggle('hidden', !current);
  if (current) {
    $('noteTitle').value = current.title; $('noteBody').value = current.body;
    $('notePin').textContent = current.pinned ? 'Unpin' : 'Pin'; $('noteSaveStatus').textContent = 'Saved locally';
  } else {
    const term = $('notesSearch').value.toLocaleLowerCase().trim(), target = $('notesList'); target.replaceChildren();
    const filtered = sortedNotes().filter(n => `${n.title} ${n.body}`.toLocaleLowerCase().includes(term));
    if (!filtered.length) target.append(emptyMessage(term ? 'No notes match your search.' : 'No notes yet. Create your first note.'));
    filtered.forEach(item => {
      const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'note-card';
      const title = document.createElement('strong'), summary = document.createElement('p'), time = document.createElement('small');
      title.textContent = `${item.pinned ? '◆  ' : ''}${item.title.trim() || 'Untitled note'}`;
      summary.textContent = item.body.trim().replace(/\s+/g, ' ').slice(0, 120) || 'Empty note';
      time.textContent = new Date(item.updated).toLocaleDateString(locale(), { day: 'numeric', month: 'short', year: 'numeric' });
      btn.append(title,summary,time); btn.onclick = () => { selectedNoteId = item.id; renderNotes(); window.scrollTo({top:0,behavior:'auto'}); };
      target.append(btn);
    });
  }
}
function updateNote() {
  const item = notes.find(n => n.id === selectedNoteId); if (!item) return;
  item.title = $('noteTitle').value.slice(0,200); item.body = $('noteBody').value.slice(0,60000); item.updated = Date.now();
  persistNotes(); $('noteSaveStatus').textContent = 'Saved locally';
}
$('notesSearch').addEventListener('input', renderNotes);
$('newNote').onclick = () => { const note = { id:uuid(), title:'', body:'', pinned:false, created:Date.now(), updated:Date.now() }; notes.unshift(note); persistNotes(); selectedNoteId=note.id; renderNotes(); $('noteTitle').focus(); };
$('noteBack').onclick = () => { selectedNoteId=null; renderNotes(); };
$('noteTitle').addEventListener('input', updateNote); $('noteBody').addEventListener('input', updateNote);
$('notePin').onclick = () => { const n=notes.find(n=>n.id===selectedNoteId); if(!n)return; n.pinned=!n.pinned; n.updated=Date.now(); persistNotes(); renderNotes(); };
$('noteDelete').onclick = () => { if (!selectedNoteId || !confirm('Delete this note?')) return; notes=notes.filter(n=>n.id!==selectedNoteId); selectedNoteId=null; persistNotes(); renderNotes(); toast('Note deleted.'); };

function renderHome() {
  const hour = new Date().getHours(); $('greeting').textContent = hour < 12 ? 'Good morning.' : hour < 17 ? 'Good afternoon.' : 'Good evening.';
  const active = reminders.filter(r => !r.done).sort((a,b)=>a.when-b.when), now = Date.now();
  const endToday = new Date(); endToday.setHours(23,59,59,999);
  $('activeCount').textContent = String(active.length);
  $('todayCount').textContent = String(active.filter(r => r.when >= now && r.when <= endToday.getTime()).length);
  $('nextHint').textContent = active.length ? `Next: ${active[0].title} · ${whenText(active[0].when)}` : 'Nothing scheduled. Take control of your day.';
  const list = $('homeReminders'); list.replaceChildren();
  if (!active.length) list.append(emptyMessage('You are all caught up.'));
  active.slice(0,3).forEach(r => list.append(reminderRow(r,true)));
  const preview = $('homeNotes'); preview.replaceChildren(); const sorted = sortedNotes();
  if (!sorted.length) preview.append(emptyMessage('Notes you create will appear here.'));
  sorted.slice(0,2).forEach(n => {
    const btn = document.createElement('button');btn.className='note-card';btn.type='button';
    const name=document.createElement('strong');name.textContent=`${n.pinned?'◆  ':''}${n.title||'Untitled note'}`;
    const body=document.createElement('p');body.textContent=n.body.replace(/\s+/g,' ').slice(0,100)||'Empty note';btn.append(name,body);
    btn.onclick=()=>{selectedNoteId=n.id;show('notes');};preview.append(btn);
  });
  renderWeatherHome();
}
function applyPrefs() {
  document.documentElement.dataset.accent=prefs.accent; document.documentElement.lang=prefs.language;
  $('language').value=prefs.language;document.querySelectorAll('[data-accent]').forEach(btn=>btn.classList.toggle('selected',btn.dataset.accent===prefs.accent));
}
document.querySelectorAll('[data-accent]').forEach(btn => btn.onclick = () => { prefs.accent=btn.dataset.accent; save(KEY_PREFS,prefs); applyPrefs(); });
$('language').onchange = event => { prefs.language=event.target.value==='ro'?'ro':'en';save(KEY_PREFS,prefs);applyPrefs();renderHome();renderReminders();renderNotes();renderWeather(); };

const weatherLabels = {0:'Clear sky',1:'Mainly clear',2:'Partly cloudy',3:'Overcast',45:'Fog',48:'Rime fog',51:'Light drizzle',53:'Drizzle',55:'Heavy drizzle',56:'Freezing drizzle',57:'Freezing drizzle',61:'Light rain',63:'Rain',65:'Heavy rain',66:'Freezing rain',67:'Freezing rain',71:'Light snow',73:'Snow',75:'Heavy snow',77:'Snow grains',80:'Rain showers',81:'Rain showers',82:'Heavy showers',85:'Snow showers',86:'Heavy snow showers',95:'Thunderstorm',96:'Thunderstorm',99:'Thunderstorm'};
const weatherIcon = code => code===0?'☀':code<=3?'⛅':code<=48?'≋':code<=67?'☂':code<=86?'❄':'☈';
function renderWeatherHome() {
  const box=$('homeWeather');box.replaceChildren();
  if (!weather?.current || !prefs.city) {box.textContent='Choose a city in Weather.';return;}
  const strong=document.createElement('strong');strong.textContent=`${weatherIcon(weather.current.weather_code)}  ${Math.round(weather.current.temperature_2m)}°C · ${prefs.city.name}`;
  const extra=document.createElement('div');extra.className='weather-extra';extra.textContent=weatherLabels[weather.current.weather_code]||'Conditions';box.append(strong,extra);
}
function renderWeather() {
  $('weatherHeading').textContent=prefs.city?.name||'Current conditions';
  const details=$('weatherDetails'), forecast=$('weatherForecast');details.replaceChildren();forecast.replaceChildren();
  if (!weather?.current || !prefs.city) {details.textContent='Select a city to see the weather.';return;}
  const row=document.createElement('div');row.className='weather-main';
  const sym=document.createElement('div');sym.className='weather-symbol';sym.textContent=weatherIcon(weather.current.weather_code);
  const data=document.createElement('div'), temp=document.createElement('div'), place=document.createElement('div'), more=document.createElement('div');
  temp.className='temp';temp.textContent=`${Math.round(weather.current.temperature_2m)}°`;
  place.className='weather-place';place.textContent=prefs.city.name;
  more.className='weather-extra';more.textContent=`${weatherLabels[weather.current.weather_code]||'Weather'} · Feels like ${Math.round(weather.current.apparent_temperature)}° · Wind ${Math.round(weather.current.wind_speed_10m)} km/h`;
  data.append(temp,place,more);row.append(sym,data);details.append(row);
  if (weather.daily?.time) weather.daily.time.slice(0,3).forEach((date,i)=>{
    const card=document.createElement('div');card.className='forecast-day';
    const label=document.createElement('div');label.textContent=new Date(`${date}T12:00`).toLocaleDateString(locale(),{weekday:'short'});
    const icon=document.createElement('div');icon.style.fontSize='23px';icon.textContent=weatherIcon(weather.daily.weather_code[i]);
    const range=document.createElement('strong');range.textContent=`${Math.round(weather.daily.temperature_2m_max[i])}° / ${Math.round(weather.daily.temperature_2m_min[i])}°`;
    card.append(label,icon,range);forecast.append(card);
  });
}
async function refreshWeather() {
  if (!prefs.city) return toast('Search for a city first.');
  $('weatherDetails').textContent='Loading weather…';
  try {
    const url=new URL('https://api.open-meteo.com/v1/forecast');
    url.search=new URLSearchParams({latitude:String(prefs.city.latitude),longitude:String(prefs.city.longitude),current:'temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m',daily:'weather_code,temperature_2m_max,temperature_2m_min',timezone:'auto',forecast_days:'3'}).toString();
    const response=await fetch(url);if(!response.ok)throw Error('Weather service unavailable');
    weather=await response.json();if(!weather.current)throw Error('Invalid weather response');
    save(KEY_WEATHER,weather);renderWeather();renderWeatherHome();
  } catch(error) {renderWeather();toast(`Weather could not refresh: ${error.message}`);}
}
$('cityForm').onsubmit=async e=>{
  e.preventDefault();const q=$('cityInput').value.trim();if(!q)return;
  const target=$('cityResults');target.replaceChildren();target.append(emptyMessage('Searching…'));
  try {
    const url=`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=6&language=${prefs.language}&format=json`;
    const result=await fetch(url);if(!result.ok)throw Error('City search unavailable');
    const data=await result.json();target.replaceChildren();
    if(!data.results?.length)return target.append(emptyMessage('No cities found.'));
    data.results.forEach(city=>{
      const button=document.createElement('button');button.type='button';button.className='city-option';
      button.textContent=[city.name,city.admin1,city.country].filter(Boolean).join(', ');
      button.onclick=()=>{prefs.city={name:button.textContent,latitude:city.latitude,longitude:city.longitude};save(KEY_PREFS,prefs);weather=null;target.replaceChildren();refreshWeather();};
      target.append(button);
    });
  }catch(error){target.replaceChildren();target.append(emptyMessage(`Search failed: ${error.message}`));}
};
$('weatherRefresh').onclick=refreshWeather;

function announceReminder(title) {
  // Speech synthesis is available on the page, not in a background service worker.
  if (!('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') return;
  try {
    const lang=prefs.language==='ro'?'ro-RO':'en-US';
    const message=prefs.language==='ro'?`Ai un memento: ${title}`:`Reminder: ${title}`;
    const utterance=new SpeechSynthesisUtterance(message);utterance.lang=lang;utterance.rate=.96;utterance.volume=1;
    const voices=window.speechSynthesis.getVoices();
    const voice=voices.find(v=>v.lang.toLowerCase()===lang.toLowerCase()) || voices.find(v=>v.lang.toLowerCase().startsWith(lang.slice(0,2).toLowerCase()));
    if(voice)utterance.voice=voice;
    window.speechSynthesis.cancel();window.speechSynthesis.speak(utterance);
  }catch(error){console.warn('ORBIT voice unavailable:',error);}
}
async function showReminderNotification(item) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    const registration=notificationRegistration || (await navigator.serviceWorker?.ready);
    if(registration?.showNotification) {
      await registration.showNotification('ORBIT Reminder', {body:item.title,tag:`orbit-reminder-${item.id}-${item.when}`,icon:'./icons/icon-192.png',badge:'./icons/icon-192.png'});
    } else if (typeof Notification !== 'undefined') new Notification('ORBIT Reminder',{body:item.title});
  }catch(err){console.warn('Notification blocked:',err);}
}
function checkDueReminders() {
  const now=Date.now();const DUE_WINDOW=5*60*1000;let changed=false;const due=[];
  reminders.forEach(item=>{
    if(item.done || item.when>now) return;
    const timely=now-item.when<=DUE_WINDOW;
    if(item.repeat==='once') {
      if(!item.lastAlert){item.lastAlert=now;changed=true;if(timely)due.push({...item});}
    } else {
      if(timely && item.lastAlert!==item.when)due.push({...item});
      // Recurring reminders move forward even if ORBIT was closed and missed the event.
      item.when=nextOccurrence(item.when,item.repeat,item.days,now+1000);
      item.lastAlert=null;changed=true;
    }
  });
  if(changed)persistReminders();
  if(due.length) {
    toast(due.length===1 ? `Reminder: ${due[0].title}` : `${due.length} reminders are due.`);
    announceReminder(due.map(item=>item.title).join('. '));
    due.forEach(showReminderNotification);
  }
}
function updateNotificationStatus() {
  const status=!('Notification' in window)?'Notifications are not supported in this browser.':`Permission: ${Notification.permission}`;
  $('notificationStatus').textContent=`Notification status: ${status}`;
  $('allowNotifications').textContent=('Notification' in window && Notification.permission==='granted')?'Notifications enabled':'Enable notification permission';
}
$('allowNotifications').onclick=async()=>{
  if (!('Notification' in window)) {toast('Notifications unavailable. Voice alerts can still work while ORBIT is open.');return;}
  try {const state=await Notification.requestPermission();toast(state==='granted'?'Notifications allowed. Keep ORBIT open for scheduled alerts.':'Permission not granted.');}
  catch(error){toast('Notification permission could not be requested. On iPhone, install ORBIT to the Home Screen first.');}
  updateNotificationStatus();
};

// Updating: the browser detects a newer service-worker.js when the GitHub Pages files change.
let workerRegistration=null, reloading=false;
function showUpdateBanner(){$('updateBanner').classList.remove('hidden');$('updateStatus').textContent='An update is ready to install.';}
function watchWorker(worker) {
  if(!worker)return;
  worker.addEventListener('statechange',()=>{if(worker.state==='installed' && navigator.serviceWorker.controller)showUpdateBanner();});
}
async function setupUpdater() {
  $('updateVersion').textContent=VERSION;
  if (!('serviceWorker' in navigator) || !window.isSecureContext) {
    $('updateStatus').textContent='Automatic updates require an HTTPS website (for example GitHub Pages).';return;
  }
  const hadController=Boolean(navigator.serviceWorker.controller);
  navigator.serviceWorker.addEventListener('controllerchange',()=>{
    if(reloading)return;
    if(hadController){reloading=true;location.reload();}
  });
  try {
    workerRegistration=await navigator.serviceWorker.register('./service-worker.js',{updateViaCache:'none'});
    notificationRegistration=workerRegistration;
    workerRegistration.addEventListener('updatefound',()=>watchWorker(workerRegistration.installing));
    if(workerRegistration.installing)watchWorker(workerRegistration.installing);
    if(workerRegistration.waiting && navigator.serviceWorker.controller)showUpdateBanner();
    await workerRegistration.update();
    if(workerRegistration.waiting && navigator.serviceWorker.controller)showUpdateBanner();
    else $('updateStatus').textContent=`ORBIT Mobile ${VERSION}. Automatic checks are enabled.`;
    setInterval(()=>workerRegistration.update().catch(()=>{}),60*60*1000);
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)workerRegistration.update().catch(()=>{});});
  }catch(error){$('updateStatus').textContent=`Update check unavailable: ${error.message}`;}
}
$('installUpdate').onclick=()=>{
  if(workerRegistration?.waiting) { $('updateStatus').textContent='Installing update…';workerRegistration.waiting.postMessage({type:'SKIP_WAITING'}); }
  else toast('Update not ready. Try checking again.');
};
$('checkUpdate').onclick=async()=>{
  if(!workerRegistration)return toast('Update service is not running. Use HTTPS.');
  $('updateStatus').textContent='Checking for updates…';
  try {await workerRegistration.update();
    if(workerRegistration.waiting&&navigator.serviceWorker.controller)showUpdateBanner();
    else $('updateStatus').textContent=`Up to date: ORBIT Mobile ${VERSION}.`;
  }catch(error){$('updateStatus').textContent='Could not check. Connect to the internet and try again.';}
};

// Backup is a single JSON file; no cloud sync or login required.
$('exportData').onclick=()=>{
  const snapshot={format:'orbit-mobile-backup',version:1,exportedAt:new Date().toISOString(),reminders,notes,preferences:prefs};
  const blob=new Blob([JSON.stringify(snapshot,null,2)],{type:'application/json'});
  const link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download=`ORBIT-Mobile-backup-${new Date().toISOString().slice(0,10)}.json`;
  document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(link.href),5000);toast('Backup exported.');
};
$('importData').onclick=()=>$('importFile').click();
$('importFile').onchange=async e=>{
  const file=e.target.files?.[0];if(!file)return;
  try {
    if(file.size>6_000_000)throw Error('Backup is too large.');
    const data=JSON.parse(await file.text());
    if(data.format!=='orbit-mobile-backup'||!Array.isArray(data.reminders)||!Array.isArray(data.notes))throw Error('Not a valid ORBIT Mobile backup.');
    if(!confirm('Replace all current reminders, notes, and preferences with this backup?'))return;
    reminders=data.reminders.slice(0,3000).map(cleanReminder).filter(Boolean);
    notes=data.notes.slice(0,3000).map(cleanNote).filter(Boolean);
    prefs=cleanPrefs(data.preferences);weather=null;selectedNoteId=null;
    save(KEY_REMINDERS,reminders);save(KEY_NOTES,notes);save(KEY_PREFS,prefs);
    localStorage.removeItem(KEY_WEATHER);applyPrefs();renderHome();renderReminders();renderNotes();renderWeather();resetReminderForm();checkDueReminders();toast('Backup imported.');
  } catch(error){toast(`Import failed: ${error.message}`);}
  finally {e.target.value='';}
};

function tick() {
  const now=new Date();$('clock').textContent=now.toLocaleTimeString(locale(),{hour:'2-digit',minute:'2-digit',hour12:false});
  checkDueReminders();
}
resetReminderForm();applyPrefs();renderReminders();renderWeather();renderHome();updateNotificationStatus();tick();
setInterval(tick,15000);
window.addEventListener('focus',tick);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)tick();});
setupUpdater();
if('serviceWorker' in navigator) navigator.serviceWorker.addEventListener('message', event => {
  if (event.data?.type === 'OPEN_REMINDERS') show('reminders');
});
if (prefs.city && !weather) refreshWeather();
