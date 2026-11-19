'use strict';
/* Learning Campus 3.2 · KI-Kurserstellung im externen Chat · No paid APIs */
(() => {
  const STORAGE_KEY = 'learning-campus-v3';
  const LEGACY_KEY = 'teamcoaching-campus-v2';
  const BUILTIN_ID = 'teamcoaching';
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const safeURL = value => { try { const u = new URL(String(value)); return ['https:','http:'].includes(u.protocol) ? u.href : ''; } catch { return ''; } };
  const slug = value => String(value || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,70);
  const text = (v,max=3000) => String(v ?? '').trim().slice(0,max);
  const escapeJSON = x => JSON.stringify(x,null,2);
  const courseData = window.CAMPUS;
  if (!courseData || !Array.isArray(courseData.days)) {
    $('content').textContent = 'Die Kursdaten konnten nicht geladen werden. Bitte index.html und data.js im selben Ordner belassen.';
    return;
  }
  const builtin = {
    id:BUILTIN_ID, title:'Teamcoaching', description:'Coaching-Handwerk, Teamdiagnostik, Interventionen und Transfer in die Praxis.',
    goal:'Teamcoaching fachlich fundiert anwenden und die eigene Coaching-Haltung weiterentwickeln.',
    audience:'Coaches, Führungskräfte und Gründerteams', minutesPerLesson:60,
    weeks:courseData.weeks.map((title,i)=>({id:`w${i+1}`,title})),
    lessons:courseData.days.map(d=>({
      id:String(d.id),weekId:`w${d.week}`,title:d.title,concept:d.concept,exercise:d.exercise,
      question:d.question,choices:[...d.choices],answer:d.answer,openQuestion:d.openQuestion,oralQuestion:d.oralQuestion,
      sources:d.sources.map(i=>courseData.sources[i]).filter(Boolean).map(s=>({title:s.name,type:s.type,note:s.note,url:s.url}))
    }))
  };
  const blankLibrary = () => ({links:[],documents:[],instructions:''});
  const hosted=()=>document.body.hasAttribute('data-campus-online');
  const scopedName=name=>hosted()?window.learningCampusCloud?.userId&&name+':'+window.learningCampusCloud.userId:name;
  const blankState=()=>({version:3,customCourses:[],progress:{},sourceLibraries:{},draftSources:blankLibrary(),selectedCourseId:BUILTIN_ID,legacyMigrated:hosted()});
  let state = blankState();
  let courseDraftForm={title:'',goal:'',audience:'',weeks:4,perWeek:6,minutes:60,focus:''};
  const DOC_DB='learning-campus-local-documents-v1';
  function documentDB(){
    return new Promise((resolve,reject)=>{
      if(!window.indexedDB){reject(Error('IndexedDB ist in diesem Browser nicht verfügbar.'));return}
      const name=scopedName(DOC_DB);
      if(!name){reject(Error('Bitte zuerst anmelden.'));return}
      const req=indexedDB.open(name,1);
      req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains('files'))req.result.createObjectStore('files',{keyPath:'id'})};
      req.onsuccess=()=>resolve(req.result);
      req.onerror=()=>reject(req.error||Error('Dokumentenspeicher konnte nicht geöffnet werden.'));
    });
  }
  async function documentOperation(mode,fn){
    const db=await documentDB();
    try{return await new Promise((resolve,reject)=>{
      const tx=db.transaction('files',mode),store=tx.objectStore('files');let value;
      const request=fn(store);
      if(request){request.onsuccess=()=>{value=request.result};request.onerror=()=>reject(request.error||Error('Dateizugriff fehlgeschlagen.'))}
      tx.oncomplete=()=>resolve(value);
      tx.onerror=()=>reject(tx.error||Error('Dateispeicherung fehlgeschlagen.'));
      tx.onabort=()=>reject(tx.error||Error('Dateispeicherung abgebrochen.'));
    })}finally{db.close()}
  }
  const putDocument=record=>documentOperation('readwrite',store=>store.put(record));
  const getDocument=id=>documentOperation('readonly',store=>store.get(id));
  const removeDocument=id=>documentOperation('readwrite',store=>store.delete(id));
  function library(courseId){return courseId==='draft'?state.draftSources:(state.sourceLibraries[courseId] ||= blankLibrary())}
  function cleanLibrary(raw){
    if(!raw||typeof raw!=='object')return blankLibrary();
    return {
      links:Array.isArray(raw.links)?raw.links.slice(0,100).map(x=>({id:text(x.id,100)||`ref-${Math.random().toString(36).slice(2)}`,title:text(x.title,250),url:safeURL(x.url),priority:x.priority==='optional'?'optional':'required',note:text(x.note,1000)})).filter(x=>x.url||x.title):[],
      documents:Array.isArray(raw.documents)?raw.documents.slice(0,100).map(x=>({id:text(x.id,120),name:text(x.name,250),type:text(x.type,120),size:Math.max(0,Number(x.size)||0),priority:x.priority==='optional'?'optional':'required',note:text(x.note,1000),excerpt:text(x.excerpt,12000)})).filter(x=>x.id&&x.name):[],
      instructions:text(raw.instructions,2500)
    };
  }
  function rememberCreateForm(){
    if(!$('new-title'))return;
    courseDraftForm={title:$('new-title').value,goal:$('new-goal').value,audience:$('new-audience').value,weeks:$('new-weeks').value,perWeek:$('new-per-week').value,minutes:$('new-minutes').value,focus:$('new-focus')?.value||''};
  }
  function materialsListHTML(lib){
    const links=lib.links.map(r=>`<div class="material-item"><div><span class="pill ${r.priority==='required'?'':'gray'}">${r.priority==='required'?'Pflichtquelle':'Ergänzend'}</span> ${r.url?`<a href="${esc(r.url)}" target="_blank" rel="noopener noreferrer">${esc(r.title||r.url)} ↗</a>`:`<strong>${esc(r.title)}</strong>`}<div class="small">${esc(r.note||r.url)}</div></div></div>`).join('');
    const docs=lib.documents.map(d=>`<div class="material-item"><div><span class="pill ${d.priority==='required'?'':'gray'}">${d.priority==='required'?'Pflichtquelle':'Ergänzend'}</span> <strong>${esc(d.name)}</strong><div class="small">${esc(d.note||'Archiviertes Kursdokument')} · ${Math.ceil(d.size/1024)} KB</div></div><button class="button small" data-action="downloadDocument" data-id="${esc(d.id)}">Herunterladen</button></div>`).join('');
    return `<div class="material-list">${links||'<p class="small">Keine archivierten Webquellen.</p>'}${docs||'<p class="small">Keine archivierten Dokumente.</p>'}</div>`;
  }
  function sourceContext(lib){
    const lines=[];
    if(lib.links.length){lines.push('VORGEGEBENE QUELLEN (Websites oder Literaturangaben):');for(const r of lib.links)lines.push(`- [${r.priority==='required'?'PFLICHT':'ERGÄNZEND'}] ${r.title||r.url}${r.url?': '+r.url:''}${r.note?' — '+r.note:''}`)}
    if(lib.documents.length){lines.push('ARCHIVIERTE DOKUMENTREFERENZEN (nicht automatisch in diesem KI-Chat verfügbar):');for(const d of lib.documents){lines.push(`- [${d.priority==='required'?'PFLICHT':'ERGÄNZEND'}] ${d.name}${d.note?' — '+d.note:''}`)}}
    if(lib.instructions)lines.push('PERSÖNLICHE QUELLENVORGABEN:\n'+lib.instructions);
    lines.push('QUELLENREGELN: Nutze Pflichtquellen vorrangig und ordne ihre Aussagen den passenden Lektionen zu. Wenn eine URL nicht zugänglich ist, eine Literaturangabe nicht verifiziert wurde oder eine genannte Datei im Chat nicht angehängt wurde, sage das ausdrücklich und behaupte nicht, sie gelesen zu haben. Erfinde keine Zitate, Seitenzahlen oder Links. Trenne belegte Aussagen, eigene Schlussfolgerungen und ergänzende externe Quellen. Verweise bei Dokumenten in lesson.sources mit {"title":"...","fileName":"exakter-dateiname.pdf","type":"Dokument","note":"..."}, bei Webquellen mit {"title":"...","url":"https://...","type":"Artikel","note":"..."} und bei Literatur ohne URL mit {"title":"...","citation":"vollständige bibliografische Angabe, soweit bekannt","type":"Buch","note":"..."}.');
    if(lib.documents.length)lines.push('VOR DEM START: Bitte mich, die oben genannten Dateien direkt in diesen Chat hochzuladen. Beginne erst mit der Kurserstellung, nachdem du bestätigt hast, welche Dokumente tatsächlich vorliegen und lesbar sind.');
    return lines.join('\n');
  }

  let view = {name:'catalog',courseId:BUILTIN_ID,lessonId:null};
  let toastTimeout;
  function notify(message,ms=3500){const t=$('toast');t.textContent=message;t.hidden=false;clearTimeout(toastTimeout);toastTimeout=setTimeout(()=>{t.hidden=true},ms)}
  function persist(){
    const key=scopedName(STORAGE_KEY);
    if(!key)return false;
    try{localStorage.setItem(key,JSON.stringify(state));return true}
    catch(err){notify('Speichern nicht möglich: Browser-Speicher prüfen und Daten exportieren.',6500);console.error(err);return false}
  }
  function initialize(){
    try{
      const key=scopedName(STORAGE_KEY);
      const saved=key&&JSON.parse(localStorage.getItem(key)||'null');
      if(saved && saved.version===3 && Array.isArray(saved.customCourses) && saved.progress && typeof saved.progress==='object'){
        state={...state,...saved};
      }
    }catch(err){console.warn('Campus state could not be read',err)}
    // Copy the old Teamcoaching 2.0 entries once. Do NOT delete the old storage key.
    if(!state.legacyMigrated){
      try{
        const old=JSON.parse(localStorage.getItem(LEGACY_KEY)||'null');
        if(old && old.lessons && typeof old.lessons==='object'){
          const target=state.progress[BUILTIN_ID] ||= {lessons:{},selectedLessonId:null};
          target.lessons ||= {};
          for(const [id,entry] of Object.entries(old.lessons)){
            if(builtin.lessons.some(l=>l.id===String(id)) && entry && typeof entry==='object')
              target.lessons[id]={...entry,...(target.lessons[id]||{})};
          }
          const selected=localStorage.getItem(LEGACY_KEY+'-selected');
          if(selected && builtin.lessons.some(l=>l.id===selected) && !target.selectedLessonId) target.selectedLessonId=selected;
        }
      }catch(err){console.warn('Legacy progress migration skipped',err)}
      state.legacyMigrated=true;persist();
    }
    state.sourceLibraries=state.sourceLibraries&&typeof state.sourceLibraries==='object'?state.sourceLibraries:{};
    state.draftSources=cleanLibrary(state.draftSources);
    for(const [id,lib] of Object.entries(state.sourceLibraries))state.sourceLibraries[id]=cleanLibrary(lib);
    if(!allCourses().some(c=>c.id===state.selectedCourseId))state.selectedCourseId=BUILTIN_ID;
    view.courseId=state.selectedCourseId;
  }
  function allCourses(){return [builtin,...state.customCourses]}
  function getCourse(id){return allCourses().find(c=>c.id===id)}
  function progress(courseId){const p=state.progress[courseId] ||= {lessons:{},selectedLessonId:null};p.lessons ||= {};return p}
  function entry(courseId,lessonId){const p=progress(courseId);return p.lessons[lessonId] ||= {}}
  function isCompleted(courseId,id){return Boolean(state.progress[courseId]?.lessons?.[id]?.done||(courseId===BUILTIN_ID&&cloudEntries.some(entry=>entry.lessonId===id)))}
  function counts(course){const done=course.lessons.filter(l=>isCompleted(course.id,l.id)).length;return {done,total:course.lessons.length,pct:course.lessons.length?Math.round(100*done/course.lessons.length):0}}
  function setView(name,courseId=view.courseId,lessonId=null){
    view={name,courseId,lessonId};
    if(getCourse(courseId)){state.selectedCourseId=courseId;persist()}
    render();window.scrollTo({top:0,behavior:'instant'});
  }
  function openCourse(courseId){if(getCourse(courseId))setView('course',courseId)}
  function openLesson(courseId,lessonId){const c=getCourse(courseId);if(!c||!c.lessons.some(l=>l.id===lessonId))return;progress(courseId).selectedLessonId=lessonId;setView('lesson',courseId,lessonId)}
  function store(courseId,lessonId,field,value){entry(courseId,lessonId)[field]=value;persist();renderSidebar()}
  function download(name,contents,mime='application/json'){
    const blob=contents instanceof Blob?contents:new Blob([contents],{type:mime});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);
  }
  async function copy(value){
    try{if(navigator.clipboard && window.isSecureContext){await navigator.clipboard.writeText(value)}else throw Error('Clipboard API unavailable')}
    catch{const t=document.createElement('textarea');t.value=value;t.style.position='fixed';t.style.opacity='0';document.body.appendChild(t);t.focus();t.select();if(!document.execCommand('copy')){t.remove();notify('Kopieren nicht möglich. Bitte Text markieren und kopieren.');return}t.remove()}
    notify('In die Zwischenablage kopiert.');
  }
  function sidebarButton(label,action,extra=''){return `<button class="sidebar-course ${extra}" data-action="${action}">${esc(label)}</button>`}
  function localDay(){
    const now=new Date();
    return [now.getFullYear(),now.getMonth()+1,now.getDate()].map(n=>String(n).padStart(2,'0')).join('-');
  }
  let journalLoad;
  let cloudEntries=[];
  let cloudNotes=[];
  function loadServerJournal(){
    if(location.protocol!=='file:')return Promise.resolve([]);
    if(journalLoad)return journalLoad;
    journalLoad=new Promise(resolve=>{
      const script=document.createElement('script');
      script.src='chatgpt-prototype/.notion-local/web-journal.js?refresh='+Date.now();
      function finish(entries){
        script.remove();
        delete window.learningCampusServerJournal;
        resolve(Array.isArray(entries)?entries:[]);
      }
      script.onload=()=>finish(window.learningCampusServerJournal);
      script.onerror=()=>finish([]);
      document.head.append(script);
    }).finally(()=>{journalLoad=null});
    return journalLoad;
  }
  function renderDailySummaries(serverEntries=[]){
    const days=new Map();
    const add=(day,card)=>{
      if(!days.has(day))days.set(day,[]);
      days.get(day).push(card);
    };
    for(const c of allCourses()){
      for(const l of c.lessons){
        const summaries=state.progress[c.id]?.lessons?.[l.id]?.dailySummaries;
        for(const [day,summary] of Object.entries(summaries||{})){
          if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||typeof summary!=='string'||!summary.trim())continue;
          add(day,{c,l,summary});
        }
      }
    }
    for(const entry of serverEntries){
      if(!entry||!/^\d{4}-\d{2}-\d{2}$/.test(entry.date)||!Array.isArray(entry.insights))continue;
      const lesson=builtin.lessons.find(l=>l.id===entry.lessonId);
      if(!lesson)continue;
      const insights=entry.insights.filter(item=>typeof item==='string'&&item.trim());
      const summary=[
        insights.length?'Kernerkenntnisse\n'+insights.map(item=>'• '+item).join('\n'):'',
        typeof entry.openQuestion==='string'&&entry.openQuestion?'Offene Frage\n'+entry.openQuestion:'',
        typeof entry.nextStep==='string'&&entry.nextStep?'Nächster Praxisschritt\n'+entry.nextStep:'',
      ].filter(Boolean).join('\n\n');
      if(summary)add(entry.date,{c:builtin,l:lesson,summary,fromServer:true,notionUrl:safeURL(entry.notionUrl)});
    }
    for(const note of cloudNotes){
      const lesson=builtin.lessons.find(l=>l.id===note.lektion);
      if(!lesson||!/^\d{4}-\d{2}-\d{2}$/.test(note.lerntag)||typeof note.zusammenfassung!=='string')continue;
      const copies=days.get(note.lerntag)||[];
      if(copies.some(item=>item.l===lesson&&!item.fromServer&&item.summary.trim()===note.zusammenfassung.trim()))continue;
      add(note.lerntag,{c:builtin,l:lesson,summary:note.zusammenfassung});
    }
    const formatter=new Intl.DateTimeFormat('de-DE',{dateStyle:'full',timeZone:'UTC'});
    const sections=[...days.keys()].sort().reverse().map(day=>{
      const date=new Date(day+'T00:00:00Z');
      const label=Number.isNaN(date.getTime())?day:formatter.format(date);
      const cards=days.get(day).map(({c,l,summary,fromServer,notionUrl})=>`<article class="daily-card"><div class="small">${esc(c.title)}${fromServer?' · Aus ChatGPT':''}</div><h3>${esc(l.title)}</h3><p class="daily-text">${esc(summary.trim())}</p><div class="actions"><button class="button small" data-action="lesson" data-course="${esc(c.id)}" data-lesson="${esc(l.id)}">Lektion öffnen</button>${notionUrl?`<a class="button small" href="${esc(notionUrl)}" target="_blank" rel="noopener noreferrer">In Notion öffnen ↗</a>`:''}</div></article>`).join('');
      return `<section class="section daily-group"><h2>${esc(label)}</h2>${cards}</section>`;
    }).join('');
    $('content').innerHTML=`<button class="button small back" data-action="catalog">← Alle Kurse</button><h1>Lernzusammenfassungen</h1>${sections||'<p>Hier erscheinen deine gespeicherten Zusammenfassungen nach Lerntag. Öffne eine Lektion, um deine erste Zusammenfassung einzutragen.</p>'}`;
  }
  async function refreshDailySummaries(){
    const cloud=window.learningCampusCloud;
    if(cloud?.userId){
      const userId=cloud.userId;
      const [entries,notes]=await Promise.all([cloud.entries(),cloud.notes()]);
      if(cloud.userId!==userId)return;
      cloudEntries=entries;
      cloudNotes=notes;
      renderSidebar();
      if(view.name==='daily')renderDailySummaries(entries);
    }else{
      const entries=await loadServerJournal();
      if(view.name==='daily')renderDailySummaries(entries);
    }
  }
  function renderSidebar(){
    const c=getCourse(view.courseId)||builtin;
    const all=allCourses();
    let html=`<div class="smallcaps">Meine Kurse</div>`;
    for(const item of all){const s=counts(item);html+=`<button class="sidebar-course ${c.id===item.id?'active':''}" data-action="course" data-course="${esc(item.id)}"><strong>${esc(item.title)}</strong><span>${s.done} / ${s.total} Lektionen abgeschlossen</span></button>`}
    html+=sidebarButton('Lernzusammenfassungen','daily',view.name==='daily'?'active':'');
    html+=`<button class="button wide space-top" data-action="create">+ Kurs mit KI erstellen</button>`;
    if(['course','lesson','sources','lessonEditor','edit'].includes(view.name)){
      const s=counts(c);
      html+=`<div class="sidebar-divider"></div><div class="smallcaps">${esc(c.title)} · Fortschritt</div><div class="stat">${s.done} / ${s.total}</div><div class="progress"><span style="width:${s.pct}%"></span></div>`;
      if(c.lessons.length){
        for(const w of c.weeks){
          const ls=c.lessons.filter(l=>l.weekId===w.id);if(!ls.length)continue;
          html+=`<div class="week-heading">${esc(w.title)}</div>`;
          ls.forEach(l=>{const idx=c.lessons.indexOf(l)+1;const done=isCompleted(c.id,l.id);html+=`<button class="lesson-nav ${view.lessonId===l.id?'active':''} ${done?'done':''}" data-action="lesson" data-course="${esc(c.id)}" data-lesson="${esc(l.id)}"><span class="lesson-num">${done?'✓':idx}</span><span>${esc(l.title)}</span></button>`});
        }
      }
    }
    html+=`<div class="sidebar-divider"></div><div class="smallcaps">Datenverwaltung</div><div class="actions space-top"><button class="button small" data-action="exportBackup">Backup exportieren</button><button class="button small" data-action="importBackup">Backup importieren</button></div><p class="hint">Automatische Speicherung im aktuellen Browser. Noch keine Synchronisierung zwischen Geräten.</p>`;
    $('sidebar').innerHTML=html;
  }
  function renderCatalog(){
    const cards=allCourses().map(c=>{
      const s=counts(c);const editable=c.id!==BUILTIN_ID;
      return `<div class="course-card"><div><span class="pill">${editable?'Eigener Kurs':'Startkurs'}</span><span class="pill gray">${c.weeks.length} Module</span></div><h2>${esc(c.title)}</h2><p>${esc(c.description||c.goal||'Dein persönlicher Lernkurs.')}</p><div class="small">${s.done} von ${s.total} Lektionen abgeschlossen · ${s.pct}%</div><div class="progress"><span style="width:${s.pct}%"></span></div><div class="actions"><button class="button primary" data-action="course" data-course="${esc(c.id)}">Kurs öffnen</button>${editable?`<button class="button" data-action="edit" data-course="${esc(c.id)}">Bearbeiten</button>`:''}</div></div>`
    }).join('');
    $('content').innerHTML=`<div class="intro"><div><div class="eyebrow-dark">Deine persönliche Lernplattform</div><h1>Meine Kurse</h1><p class="lead">Lerne mit Teamcoaching oder importiere weitere Kurse, die du gemeinsam mit ChatGPT oder Claude erstellt hast.</p></div><div class="actions"><button class="button primary" data-action="create">+ Kurs mit KI erstellen</button><button class="button" data-action="import">Kurs importieren</button></div></div><div class="course-grid">${cards}</div><div class="section"><h3>So entstehen neue Kurse</h3><div class="steps"><div><strong>1 · KI-Chat</strong><p>ChatGPT oder Claude öffnen und Dokumente, Links und Lernziele dort direkt bereitstellen.</p></div><div><strong>2 · Kurs-JSON</strong><p>Gemeinsam die Struktur abstimmen und den fertigen Kurs als JSON erzeugen.</p></div><div><strong>3 · Learning Campus</strong><p>JSON importieren und mit Übungen, Voice-Coaching, Prüfungen und Lernjournal lernen.</p></div></div><div class="notice">Keine kostenpflichtige KI-API nötig. Deine bestehenden Lernfortschritte bleiben lokal erhalten. Für die automatische Synchronisierung zwischen Geräten wird weiterhin ein Backend benötigt.</div></div>`;
  }
  function renderCourse(){
    const c=getCourse(view.courseId)||builtin;const s=counts(c);const editable=c.id!==BUILTIN_ID;
    const weeks=c.weeks.map((w,i)=>{
      const lessons=c.lessons.filter(l=>l.weekId===w.id);
      return `<div class="section"><div class="split"><h3>Modul ${i+1} · ${esc(w.title)}</h3><span class="small">${lessons.length} Lektionen</span></div>${lessons.length?`<div class="lesson-list">${lessons.map(l=>{const index=c.lessons.indexOf(l)+1;const done=isCompleted(c.id,l.id);return `<button data-action="lesson" data-course="${esc(c.id)}" data-lesson="${esc(l.id)}"><span><span class="small">${done?'✓ Abgeschlossen':'Lektion '+index}</span><br><strong>${esc(l.title)}</strong></span><span class="meta">Öffnen →</span></button>`}).join('')}</div>`:`<p class="small">Noch keine Lektionen in diesem Modul.</p>`}</div>`
    }).join('');
    $('content').innerHTML=`<button class="button small back" data-action="catalog">← Alle Kurse</button><div class="intro"><div><div class="eyebrow-dark">${editable?'Individueller Kurs':'Dein Startkurs'}</div><h1>${esc(c.title)}</h1><p class="lead">${esc(c.description||c.goal)}</p></div><div class="actions"><button class="button" data-action="exportCourse" data-course="${esc(c.id)}">Kurs-JSON exportieren</button>${editable?`<button class="button" data-action="edit" data-course="${esc(c.id)}">Kurs bearbeiten</button>`:''}</div></div><div class="pill">${c.weeks.length} Module</div><div class="pill">${c.lessons.length} Lektionen</div><div class="pill">${c.minutesPerLesson||60} Min./Lektion</div><div class="stat space-top">${s.pct}%</div><div class="small">Dein Lernfortschritt · ${s.done} von ${s.total} Lektionen</div><div class="progress"><span style="width:${s.pct}%"></span></div>${c.goal?`<div class="notice"><strong>Lernziel:</strong> ${esc(c.goal)}</div>`:''}${c.lessons.length?`<div class="actions"><button class="button primary" data-action="lesson" data-course="${esc(c.id)}" data-lesson="${esc(progress(c.id).selectedLessonId&&c.lessons.some(l=>l.id===progress(c.id).selectedLessonId)?progress(c.id).selectedLessonId:c.lessons[0].id)}">Lernen fortsetzen →</button><button class="button" data-action="sources" data-course="${esc(c.id)}">Quellenbibliothek</button></div>`:`<div class="empty"><h3>Dieser Kurs enthält noch keine Lektionen</h3><p>Du kannst den Kurs mit ChatGPT oder Claude ausarbeiten oder eine Lektion manuell hinzufügen.</p><button class="button primary" data-action="edit" data-course="${esc(c.id)}">Kurs mit KI ausarbeiten</button></div>`}${weeks}${editable?`<div class="section actions"><button class="button primary" data-action="lessonEditor" data-course="${esc(c.id)}">+ Lektion manuell hinzufügen</button></div>`:''}`;
  }
  function sourcesHTML(lesson){
    if(!lesson.sources?.length)return '<p class="small">Für diese Lektion wurden noch keine Quellen hinterlegt.</p>';
    return lesson.sources.map(s=>{
      const url=safeURL(s.url);
      return `<div class="source"><span class="pill gray">${esc(s.type||'Quelle')}</span> ${url?`<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(s.title)} ↗</a>`:`<strong>${esc(s.title)}</strong>`}${s.fileName?`<div class="small">Dokumentreferenz: ${esc(s.fileName)} (Originaldatei separat aufbewahren)</div>`:''}${s.citation?`<div class="small">Literatur: ${esc(s.citation)}</div>`:''}<div class="small">${esc(s.note||'')}</div></div>`
    }).join('');
  }
  function promptLearningChat(c,l){
    const sources=l.sources.map(s=>[s.title,s.url,s.fileName,s.citation].filter(Boolean).join(' · ')).join('\n');
    return `Führe mich auf Deutsch in einem zusammenhängenden Lernchat durch die Lektion „${l.title}“ aus dem Kurs „${c.title}“.

Lernfokus: ${l.concept}
Praxisübung: ${l.exercise}
Verständnisfrage: ${l.openQuestion}
Vertiefungsfrage: ${l.oralQuestion}
Quellenhinweise:
${sources||'Für diese Lektion sind keine Quellen hinterlegt.'}

Beginne mit einer Frage zu meinem Vorwissen. Kläre anschließend die zentralen Begriffe, begleite mich durch die Praxisübung und prüfe mein Verständnis. Stelle jeweils eine Frage und warte auf meine Antwort. Gib konkretes Feedback und frage am Ende nach meinem nächsten Praxisschritt. Nutze Quellen nur, wenn du den Inhalt tatsächlich lesen kannst. Kennzeichne fehlenden Zugriff und erfinde keine Belege.

Gib zum Abschluss eine kurze Lernzusammenfassung als Klartext zum Kopieren aus. Verwende drei Abschnitte mit kurzen Stichpunkten:
Kernerkenntnisse (bis zu drei)
Offene Frage (falls vorhanden)
Nächster Praxisschritt (eine konkrete Handlung)
Stütze die Zusammenfassung auf unser Gespräch und erfinde keine persönlichen Erkenntnisse.`;
  }
  function promptVoice(c,l){return `Du bist mein anspruchsvoller, wertschätzender Lerncoach für den Kurs „${c.title}“. Wir bearbeiten die Lektion „${l.title}“. Lernziel des Kurses: ${c.goal||c.description}. Lernfokus: ${l.concept}. Zielgruppe: ${c.audience||'Erwachsene Lernende'}. Führe mit mir einen interaktiven 20-minütigen Sprachdialog: (1) Vorwissen erfragen, (2) Konzepte präzise erklären, (3) jeweils nur eine Frage stellen und Antwort abwarten, (4) Praxisfälle und Gegenbeispiele nutzen, (5) mich selbst Lösungen entwickeln lassen, (6) fachliche Fehler begründet korrigieren. Übung: ${l.exercise}. Schließe mit drei Kernerkenntnissen und einer Transferfrage. Erfinde keine Quellen.`}
  function promptOral(c,l){return `Prüfe mich mündlich im Kurs „${c.title}“, Lektion „${l.title}“. Stelle nacheinander vier anspruchsvolle Fragen, darunter: ${l.oralQuestion}. Warte jeweils auf meine Antwort, stelle höchstens eine Rückfrage und verrate die Lösung nicht vorab. Bewerte am Ende fachliche Korrektheit (0–4), Anwendung (0–3), Reflexion (0–2), Klarheit (0–1). Gib konkrete Korrekturen, verbesserte Formulierungen und zwei Wiederholungsimpulse. Liefere einen strukturierten Auswertungsblock zum Kopieren in mein Lernjournal.`}
  function promptEvaluate(c,l,e){return `Du bist fachlicher Prüfer für den Kurs „${c.title}“. Werte meine Antwort zur Lektion „${l.title}“ aus. Lernfokus: ${l.concept}. Prüfungsfrage: ${l.openQuestion}. Bewerte auf Deutsch: fachliche Korrektheit (0–4), Anwendung (0–3), Reflexion und Risiken (0–2), Klarheit (0–1). Liefere Punkte /10, Stärken, Fehler/Lücken, korrigierte Musterantwort und zwei konkrete Übungen. Erfinde keine Quellen und kennzeichne Unsicherheit. Meine Antwort:\n${e.free||'[Keine Antwort]'}\n\nMultiple Choice: ${e.mc===undefined?'nicht beantwortet':l.choices[e.mc]}. Richtige Antwort: ${l.choices[l.answer]}.`}
  function promptJournal(c,l,e){return `Führe mit mir ein sokratisches Reflexionsgespräch zum Kurs „${c.title}“, Lektion „${l.title}“. Frage mich nacheinander nach (1) neuen Erkenntnissen, (2) einem Aha-Moment, (3) einem wörtlichen persönlichen Zitat, (4) Unsicherheiten, (5) Praxistransfer, (6) einem konkreten nächsten Schritt. Nutze mein Transkript und Prüfungsfeedback, falls vorhanden. Erstelle erst danach einen Journalentwurf mit Datum, drei Kernerkenntnissen, persönlichem Zitat, offener Frage, Transferexperiment, Tags und Quellen. Bitte mich um Korrekturen und überarbeite den Entwurf gemeinsam mit mir. Gib die finale Fassung zum Einfügen ins Dashboard aus.\n\nBisheriges Journal:\n${e.journal||'[leer]'}\n\nPrüfungsfeedback:\n${e.feedback||'[leer]'}\n\nTranskript:\n${e.transcript||'[leer]'}`}
  function promptFor(kind,c,l){const e=entry(c.id,l.id);return kind==='learning'?promptLearningChat(c,l):kind==='voice'?promptVoice(c,l):kind==='oral'?promptOral(c,l):kind==='eval'?promptEvaluate(c,l,e):promptJournal(c,l,e)}
  function renderLesson(){
    const c=getCourse(view.courseId)||builtin;
    const l=c.lessons.find(x=>x.id===view.lessonId)||c.lessons[0];if(!l){renderCourse();return}
    const e=entry(c.id,l.id),i=c.lessons.indexOf(l),w=c.weeks.find(x=>x.id===l.weekId);
    const day=localDay();
    $('content').innerHTML=`<button class="button small back" data-action="course" data-course="${esc(c.id)}">← ${esc(c.title)}</button><div class="topline"><div><span class="pill">${esc(w?.title||'Modul')}</span><span class="pill">Lektion ${i+1} / ${c.lessons.length}</span><span class="pill">${c.minutesPerLesson||60} Minuten</span></div><span class="small">${e.done?'✓ Abgeschlossen':'Noch offen'}</span></div><h1>${esc(l.title)}</h1><p class="lead">${esc(l.concept)}</p>
    <section class="section"><h2>Lernchat</h2><p>Kopiere den fertigen Prompt einmal in deinen Chat. Übernimm am Ende die kurze Lernzusammenfassung hier.</p><div class="actions"><button class="button primary" data-action="copyPrompt" data-kind="learning">Lernchat-Prompt kopieren</button><a class="button" href="https://chatgpt.com/" target="_blank" rel="noopener noreferrer">ChatGPT öffnen ↗</a><a class="button" href="https://claude.ai/" target="_blank" rel="noopener noreferrer">Claude öffnen ↗</a></div><details class="space-top"><summary>Fertigen Prompt anzeigen</summary><pre class="json-preview">${esc(promptLearningChat(c,l))}</pre></details><label class="field space-top"><span>Lernzusammenfassung für heute</span><textarea data-field="dailySummary" data-day="${day}" placeholder="Kernerkenntnisse, offene Frage und nächster Praxisschritt …">${esc(e.dailySummaries?.[day]||'')}</textarea></label><div class="actions"><span class="small">Wird automatisch lokal gespeichert</span><button class="button small" data-action="daily">Alle Lernzusammenfassungen</button>${c.id===BUILTIN_ID&&window.learningCampusCloud?.userId?'<button class="button small" data-action="saveCloudNote">Notiz online speichern</button>':''}</div></section>
    <div class="section"><h3>01 · Theorie & Quellen</h3><p>Erarbeite die Konzepte und notiere zentrale Unterschiede, Anwendungsbedingungen und Grenzen.</p>${sourcesHTML(l)}<div class="actions space-top"><button class="button" data-action="sources" data-course="${esc(c.id)}">Alle Kursquellen</button></div></div>
    <div class="section"><h3>02 · Sprachdialog mit ChatGPT oder Claude</h3><p>Nutze den auf diese Lektion abgestimmten Lernprompt. Der Dialog läuft außerhalb dieser Anwendung; füge danach das Transkript oder eine Zusammenfassung ein.</p><div class="actions"><button class="button primary" data-action="copyPrompt" data-kind="voice">🎙 Lernprompt kopieren</button><a class="button" href="https://chatgpt.com/" target="_blank" rel="noopener noreferrer">ChatGPT öffnen ↗</a><a class="button" href="https://claude.ai/" target="_blank" rel="noopener noreferrer">Claude öffnen ↗</a></div><div class="notice">Keine API-Kosten und keine automatische Transkriptübertragung. Textfelder werden während der Eingabe lokal gespeichert.</div><label class="field"><span>Transkript / Gesprächsnotizen</span><textarea data-field="transcript" placeholder="Transkript oder Zusammenfassung einfügen …">${esc(e.transcript||'')}</textarea></label><div class="status">Automatische lokale Speicherung</div></div>
    <div class="section"><h3>03 · Praxisübung</h3><p>${esc(l.exercise)}</p></div>
    <div class="section"><h3>04 · Schriftliche Prüfung</h3><p><strong>Multiple Choice:</strong> ${esc(l.question)}</p>${l.choices.map((v,n)=>`<label class="choice"><input type="radio" name="mc" value="${n}" ${e.mc===n?'checked':''}>${esc(v)}</label>`).join('')}<button class="button" data-action="score">Antwort auswerten</button><div id="mc-result">${e.mc===undefined?'':`<div class="result">${e.mcCorrect?'✓ Richtig':'✗ Noch nicht richtig'} · Richtige Antwort: ${esc(l.choices[l.answer])}</div>`}</div><label class="field space-top"><span>Offene Prüfungsfrage: ${esc(l.openQuestion)}</span><textarea data-field="free" placeholder="Deine begründete Antwort …">${esc(e.free||'')}</textarea></label><button class="button primary" data-action="copyPrompt" data-kind="eval">KI-Auswertungsprompt kopieren</button><p class="small">Füge den Prompt in ChatGPT oder Claude ein und übertrage die Auswertung hierher.</p><label class="field"><span>Bewertung, Korrekturen und Verbesserungsvorschläge</span><textarea data-field="feedback" placeholder="KI-Feedback einfügen …">${esc(e.feedback||'')}</textarea></label></div>
    <div class="section"><h3>05 · Mündliche Prüfung</h3><p>Vier aufeinander aufbauende Fragen mit individueller Rückmeldung.</p><button class="button primary" data-action="copyPrompt" data-kind="oral">Prüfungsprompt kopieren</button><label class="field space-top"><span>Prüfungsfeedback / Transkript</span><textarea data-field="oral" placeholder="Mündliches Prüfungsfeedback …">${esc(e.oral||'')}</textarea></label></div>
    <div class="section"><h3>06 · Persönliches Lernjournal</h3><p>Reflektiere die Lektion mit ChatGPT oder Claude, überarbeite deinen Entwurf und speichere ihn hier.</p><button class="button primary" data-action="copyPrompt" data-kind="journal">Reflexionsprompt kopieren</button><label class="field space-top"><span>Mein Lernjournal</span><textarea class="tall" data-field="journal" placeholder="Erkenntnisse, Aha-Moment, Zitat, Transfer …">${esc(e.journal||'')}</textarea></label><button class="button" data-action="copyJournal">Journaleintrag kopieren</button></div>
    <div class="section"><div class="actions"><button class="button ${e.done?'':'primary'}" data-action="finish">${e.done?'Als offen markieren':'✓ Lektion abschließen'}</button><label class="checkbox-row"><input type="checkbox" data-field="review" ${e.review?'checked':''}> Diese Lektion später wiederholen</label></div></div><div class="navbuttons"><button class="button" data-action="lesson" data-course="${esc(c.id)}" data-lesson="${esc(c.lessons[Math.max(0,i-1)].id)}" ${i===0?'disabled':''}>← Vorherige</button><button class="button" data-action="lesson" data-course="${esc(c.id)}" data-lesson="${esc(c.lessons[Math.min(c.lessons.length-1,i+1)].id)}" ${i===c.lessons.length-1?'disabled':''}>Nächste →</button></div>`;
  }
  function renderSources(){
    const c=getCourse(view.courseId)||builtin,unique=new Map();for(const l of c.lessons)for(const s of l.sources||[])unique.set(`${s.url||s.fileName||s.citation}|${s.title}`,s);
    const lib=library(c.id),hasArchive=lib.links.length||lib.documents.length||lib.instructions;
    $('content').innerHTML=`<button class="button small back" data-action="course" data-course="${esc(c.id)}">← Zum Kurs</button><h1>Quellenbibliothek · ${esc(c.title)}</h1><p class="lead">${unique.size} Quellenreferenzen aus den Lektionen. Die eigentlichen Quelldokumente verwaltest du beim Erstellen im ChatGPT- oder Claude-Chat.</p><div class="section"><h2>Quellen aus den Lektionen</h2>${[...unique.values()].map(s=>sourcesHTML({sources:[s]})).join('')||'<p>Für diesen Kurs sind noch keine Quellen hinterlegt.</p>'}</div>${hasArchive?`<div class="section"><h2>Archivierte Materialien aus früheren Versionen</h2><p class="small">Vorhandene Links und lokal gespeicherte Dateien bleiben erhalten. Neue Dokumente lädst du direkt in den KI-Chat hoch.</p>${materialsListHTML(lib)}${lib.instructions?`<p class="small">Frühere Quellenhinweise: ${esc(lib.instructions)}</p>`:''}</div>`:''}`;
  }
  function courseTemplate(){return {
    id:'beispiel-kurs',title:'Beispielkurs',description:'Ein neuer Lernkurs.',goal:'Ein konkretes Lernziel.',audience:'Berufstätige',minutesPerLesson:60,
    weeks:[{id:'w1',title:'Grundlagen'}],
    lessons:[{
      id:'l1',weekId:'w1',title:'Einführung',concept:'Zentrales Konzept der Lektion.',
      exercise:'Bearbeite einen konkreten Praxisfall.',
      question:'Welche Aussage ist korrekt?',choices:['Richtige Antwort','Falsche Antwort','Weitere falsche Antwort'],answer:0,
      openQuestion:'Erkläre das Konzept an einem Praxisbeispiel.',oralQuestion:'Welche Entscheidung würdest du in diesem Fall treffen und warum?',
      sources:[{title:'Verlässliche Quelle',url:'https://example.org/',type:'Artikel',note:'Beispiel-Link durch überprüfte Quelle ersetzen.'},{title:'Eigenes Dokument',fileName:'meine-quelle.pdf',type:'Dokument',note:'Nur verwenden, wenn im KI-Chat hochgeladen.'}]
    }]
  }}
  function promptCourse({title,goal,audience,weeks,perWeek,minutes,focus=''},existing,lib=blankLibrary()){
    const schema=courseTemplate();
    schema.id=existing?.id||slug(title)||'neuer-kurs';schema.title=title||'Neuer Kurs';schema.goal=goal||'';schema.audience=audience||'';schema.minutesPerLesson=minutes;
    schema.lessons[0].sources=[];
    const oldMaterials=(lib.links.length||lib.documents.length||lib.instructions)?`\n\nBISHERIGE QUELLEN-METADATEN (keine Anhänge; frage mich, ob ich diese Materialien erneut bereitstellen kann):\n${sourceContext(lib)}`:'';
    return `Du bist mein didaktischer Curriculum-Designer, Fachrechercheur und kritischer Lerncoach. Wir erstellen gemeinsam einen fachlich fundierten Kurs für meinen Learning Campus. Arbeite in Phasen und gib NICHT sofort das fertige JSON aus. Ich kann ChatGPT oder Claude verwenden.\n\nKURSBRIEFING\nTitel: ${title||'[noch festzulegen]'}\nLernziel: ${goal||'[bitte mit mir konkretisieren]'}\nZielgruppe und Vorwissen: ${audience||'[bitte erfragen]'}\nGeplanter Umfang: ${weeks} Module mit je ${perWeek} Lektionen, insgesamt ${weeks*perWeek} Lektionen, ${minutes} Minuten pro Lektion.\nFachliche Schwerpunkte und weitere Vorgaben: ${focus||'[keine weiteren Vorgaben]'}${oldMaterials}\n\nPHASE 1 – BRIEFING UND QUELLEN\n1. Frage mich zunächst, welche PDFs, DOCX-Dateien, Studien, Bücher, Links, Videos oder Notizen ich direkt in diesem KI-Chat bereitstellen möchte. Ich hänge sie HIER an, nicht in der Lernplattform. Wenn ich keine Quellen bereitstellen möchte, darfst du nach Rückfrage ohne sie fortfahren.\n2. Stelle maximal fünf gezielte Rückfragen zu Lernzielen, Vorkenntnissen, Anwendungsfällen und Umfang. Warte auf meine Antworten.\n3. Prüfe die tatsächlich verfügbaren Quellen. Liste auf, welche Dateien du vollständig lesen konntest, welche nur teilweise und welche nicht zugänglich sind. Erfinde keine Inhalte, Zitate, Seitenzahlen oder Links. Berücksichtige meine Quellen vorrangig; ergänze nur verifizierbare externe Quellen und unterscheide klar zwischen Beleg und Schlussfolgerung.\n\nPHASE 2 – KURSARCHITEKTUR\n4. Schlage eine didaktische Struktur mit Modulen, Lektionen, messbaren Lernzielen, Praxisübungen, Transfer und Quellenschwerpunkten vor. Passe das Niveau an meine Vorkenntnisse an.\n5. Bitte mich um Feedback und ausdrückliche Freigabe der Kursstruktur. Überarbeite sie bei Bedarf.\n\nPHASE 3 – IMPORTFERTIGES JSON (ERST NACH MEINER FREIGABE)\n6. Erstelle das vollständige Kurs-JSON gemäß dem Schema unten. Jede Lektion benötigt eine substanzielle concept-Erklärung, eine konkrete exercise-Übung, eine Multiple-Choice-Frage mit mindestens drei plausiblen choices, genau einen richtigen nullbasierten answer-Index, eine openQuestion, eine oralQuestion und ein sources-Array. Plane pro Lektion etwa ${minutes} Minuten Lernzeit ein.\n7. Ordne überprüfbare Quellen den einzelnen Lektionen zu. Für Webquellen: {"title":"...","url":"https://...","type":"Artikel","note":"..."}; für tatsächlich gelesene Anhänge: {"title":"...","fileName":"exakter-dateiname.pdf","type":"Dokument","note":"relevantes Kapitel/Abschnitt"}; für Literatur ohne URL: {"title":"...","citation":"bibliografische Angabe","type":"Buch","note":"..."}. Unverifizierbare Quellen weglassen und keine erfundenen URLs einfügen.\n8. Verwende eindeutige, stabile IDs für Kurs, Module und Lektionen. Alle weekId-Werte müssen existieren. Gib nach Freigabe ausschließlich ein gültiges JSON-Objekt ohne Markdown-Codeblock oder erläuternden Text aus. Wenn dein Chat Dateien erzeugen kann, stelle alternativ eine echte .json-Datei bereit.\n9. Prüfe die JSON-Struktur vor der Ausgabe auf Vollständigkeit, eindeutige IDs, valide Antwortindizes und korrekte Quelleneinträge.\n\nSCHEMA – MIT ECHTEN INHALTEN UND ALLEN LEKTIONEN AUSFÜLLEN\n${escapeJSON(schema)}${existing?`\n\nBESTEHENDER KURS ZUR ÜBERARBEITUNG: Behalte course.id und bestehende lesson.id unbedingt bei; ändere nur ausdrücklich vereinbarte Inhalte, damit vorhandene Lernfortschritte erhalten bleiben. Frage mich, welche Änderungen gewünscht sind.\n${escapeJSON(existing)}`:''}\n\nBeginne jetzt mit PHASE 1 und frage mich nach meinen Quellen und Unterlagen.`;
  }
  function courseFormValues(){
    const title=text($('new-title')?.value,140)||'Neuer Lernkurs';
    const goal=text($('new-goal')?.value,1200);
    const audience=text($('new-audience')?.value,400);
    const weeks=Math.max(1,Math.min(12,Number($('new-weeks')?.value)||4));
    const perWeek=Math.max(1,Math.min(12,Number($('new-per-week')?.value)||6));
    const minutes=Math.max(10,Math.min(240,Number($('new-minutes')?.value)||60));
    return {title,goal,audience,weeks,perWeek,minutes,focus:text($('new-focus')?.value,2000)};
  }
  function renderCreate(){
    const v=courseDraftForm;
    $('content').innerHTML=`<button class="button small back" data-action="catalog">← Alle Kurse</button><div class="eyebrow-dark">KI-Kurserstellung</div><h1>Kurs mit ChatGPT oder Claude erstellen</h1><p class="lead">Die Kursentwicklung findet direkt im KI-Chat statt. Dort kannst du Dokumente hochladen, Quellen besprechen und die Kursstruktur abstimmen. Hier erzeugst du nur den passenden Master-Prompt und importierst anschließend den fertigen Kurs.</p>
    <div class="section"><h2>1 · Kursbriefing (optional)</h2><p class="small">Du kannst die Angaben hier vorbereiten oder sie im KI-Chat gemeinsam mit dem Sprachmodell erarbeiten.</p><div class="form-grid"><label class="field"><span>Kurstitel</span><input id="new-title" value="${esc(v.title)}" placeholder="z. B. KI-Grundlagen & Agenten" maxlength="140"></label><label class="field"><span>Zielgruppe / Vorwissen</span><input id="new-audience" value="${esc(v.audience)}" placeholder="z. B. Führungskräfte ohne Programmiererfahrung"></label></div><label class="field"><span>Was möchtest du nach dem Kurs können?</span><textarea id="new-goal" placeholder="Lernziele und gewünschte Anwendung …">${esc(v.goal)}</textarea></label><div class="form-grid"><label class="field"><span>Anzahl Module</span><input id="new-weeks" type="number" min="1" max="12" value="${esc(v.weeks)}"></label><label class="field"><span>Lektionen je Modul</span><input id="new-per-week" type="number" min="1" max="12" value="${esc(v.perWeek)}"></label></div><label class="field"><span>Minuten je Lektion</span><input id="new-minutes" type="number" min="10" max="240" value="${esc(v.minutes)}"></label><label class="field"><span>Fachliche Schwerpunkte oder besondere Anforderungen (optional)</span><textarea id="new-focus" placeholder="z. B. Praxisfälle aus Startups, wissenschaftliche Evidenz priorisieren, Reflexionsübungen …">${esc(v.focus||'')}</textarea></label></div>
    <div class="section"><h2>2 · Im KI-Chat erstellen</h2><div class="notice"><strong>Dokumente gehören direkt in ChatGPT oder Claude.</strong> Lade dort PDFs, Word-Dateien und Notizen hoch, füge Links ein und diskutiere die Quellen. Im Learning Campus ist dafür kein zusätzlicher Upload nötig.</div><div class="actions"><button class="button primary" data-action="generateCoursePrompt">Master-Prompt kopieren</button><button class="button" data-action="downloadMasterPrompt">Master-Prompt als Text speichern</button><a class="button" href="https://chatgpt.com/" target="_blank" rel="noopener noreferrer">ChatGPT öffnen ↗</a><a class="button" href="https://claude.ai/" target="_blank" rel="noopener noreferrer">Claude öffnen ↗</a></div><p class="small">Der Prompt führt durch Quellenprüfung, Rückfragen und Kurskonzept. Erst nach deiner Freigabe erstellt die KI das importierbare JSON.</p><div id="prompt-preview" class="space-top"></div></div>
    <div class="section"><h2>3 · Fertigen Kurs importieren</h2><p>Wenn du mit dem Ergebnis zufrieden bist, lasse dir den Kurs als JSON-Datei ausgeben oder kopiere den JSON-Text hier hinein.</p><label class="field"><span>Kurs-JSON</span><textarea id="course-json" class="tall" placeholder='{ "id": "ki-grundlagen", "title": "KI-Grundlagen", ... }'></textarea></label><div class="actions"><button class="button primary" data-action="importCourseText">Kurs importieren</button><button class="button" data-action="importCourseFile">JSON-Datei auswählen</button><button class="button" data-action="downloadTemplate">JSON-Beispiel herunterladen</button></div><div id="import-error" class="error small space-top" role="alert"></div><div class="notice">Deine 24 Teamcoaching-Lektionen und alle bisherigen Lernfortschritte bleiben erhalten. Daten werden weiterhin lokal im Browser gespeichert; Supabase-Synchronisierung ist noch nicht eingerichtet.</div></div>`;
  }
  function renderImport(){
    $('content').innerHTML=`<button class="button small back" data-action="catalog">← Alle Kurse</button><div class="eyebrow-dark">Kursbibliothek</div><h1>Fertigen Kurs importieren</h1><p class="lead">Importiere eine JSON-Datei, die du in ChatGPT oder Claude erstellt hast. Der Kurs erscheint anschließend neben Teamcoaching in deiner Kursübersicht.</p><div class="section"><h2>Kursdatei auswählen oder JSON einfügen</h2><label class="field"><span>Kurs-JSON</span><textarea id="course-json" class="tall" placeholder='{ "id": "ki-grundlagen", "title": "KI-Grundlagen", ... }'></textarea></label><div class="actions"><button class="button primary" data-action="importCourseText">Kurs importieren</button><button class="button" data-action="importCourseFile">JSON-Datei auswählen</button><button class="button" data-action="downloadTemplate">JSON-Beispiel herunterladen</button></div><div id="import-error" class="error small space-top" role="alert"></div></div><div class="section"><p>Noch keinen Kurs erstellt? Nutze den Master-Prompt und hänge deine Materialien direkt im KI-Chat an.</p><button class="button" data-action="create">Kurs mit KI erstellen →</button></div>`;
  }
  function normalizeCourse(raw){
    if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('Es wird ein JSON-Objekt für einen Kurs erwartet.');
    const title=text(raw.title,140);if(!title)throw Error('Kurstitel (title) fehlt.');
    const id=slug(raw.id||title);if(!id)throw Error('Ungültige Kurs-ID.');
    if(id===BUILTIN_ID)throw Error('Die ID "teamcoaching" ist für den unveränderlichen Startkurs reserviert.');
    if(!Array.isArray(raw.weeks)||raw.weeks.length<1||raw.weeks.length>40)throw Error('weeks muss 1 bis 40 Module enthalten.');
    if(!Array.isArray(raw.lessons)||raw.lessons.length>500)throw Error('lessons muss ein Array mit maximal 500 Lektionen sein.');
    const weeks=raw.weeks.map((w,i)=>{
      if(typeof w==='string')return {id:`w${i+1}`,title:text(w,140)||`Modul ${i+1}`};
      if(!w||typeof w!=='object')throw Error(`Modul ${i+1}: ungültige Daten.`);
      return {id:slug(w.id||`w${i+1}`),title:text(w.title,140)||`Modul ${i+1}`};
    });
    if(new Set(weeks.map(w=>w.id)).size!==weeks.length)throw Error('Modul-IDs müssen eindeutig sein.');
    const weekIDs=new Set(weeks.map(w=>w.id));
    const lessons=raw.lessons.map((l,i)=>{
      if(!l||typeof l!=='object')throw Error(`Lektion ${i+1}: ungültige Daten.`);
      const id=slug(l.id||`l${i+1}`),weekId=slug(l.weekId||l.week||weeks[0].id);
      if(!weekIDs.has(weekId))throw Error(`Lektion ${i+1}: weekId "${weekId}" existiert nicht in weeks.`);
      const title=text(l.title,180),concept=text(l.concept,2000),exercise=text(l.exercise,3000);
      const question=text(l.question,1200),openQuestion=text(l.openQuestion,1500),oralQuestion=text(l.oralQuestion,1500);
      if(!title||!concept||!exercise||!question||!openQuestion||!oralQuestion)throw Error(`Lektion ${i+1}: title, concept, exercise, question, openQuestion und oralQuestion sind Pflichtfelder.`);
      if(!Array.isArray(l.choices)||l.choices.length<2||l.choices.length>8||l.choices.some(x=>!text(x,1000)))throw Error(`Lektion ${i+1}: choices benötigt 2 bis 8 Antwortmöglichkeiten.`);
      if(!Number.isInteger(l.answer)||l.answer<0||l.answer>=l.choices.length)throw Error(`Lektion ${i+1}: answer muss der nullbasierte Index einer Antwort sein.`);
      if(l.sources!==undefined&&!Array.isArray(l.sources))throw Error(`Lektion ${i+1}: sources muss ein Array sein.`);
      const sources=(l.sources||[]).map((s,j)=>{
        if(!s||typeof s!=='object')throw Error(`Lektion ${i+1}, Quelle ${j+1}: ungültige Daten.`);
        const title=text(s.title||s.name,300),url=text(s.url,2000),fileName=text(s.fileName,250),citation=text(s.citation,800);
        if(!title||(!safeURL(url)&&!fileName&&!citation))throw Error(`Lektion ${i+1}, Quelle ${j+1}: Titel und URL, fileName oder citation benötigt.`);
        return {title,...(safeURL(url)?{url:safeURL(url)}:{}),...(fileName?{fileName}:{}),...(citation?{citation}:{}),type:text(s.type,100),note:text(s.note,500)};
      });
      return {id,weekId,title,concept,exercise,question,choices:l.choices.map(x=>text(x,1000)),answer:l.answer,openQuestion,oralQuestion,sources};
    });
    if(new Set(lessons.map(l=>l.id)).size!==lessons.length)throw Error('Lektions-IDs müssen eindeutig sein.');
    return {id,title,description:text(raw.description,1200),goal:text(raw.goal,1500),audience:text(raw.audience,500),minutesPerLesson:Math.max(10,Math.min(240,Number(raw.minutesPerLesson)||60)),weeks,lessons};
  }
  function importCourse(raw){
    const input=raw.course||raw;
    const c=normalizeCourse(input);
    const suppliedMaterials=input.referenceMaterials?cleanLibrary(input.referenceMaterials):null;
    const existing=state.customCourses.findIndex(x=>x.id===c.id);
    if(existing>=0){if(!confirm(`Der Kurs „${c.title}“ existiert bereits. Inhalte ersetzen? Fortschritte mit identischen Lektions-IDs bleiben erhalten.`))return false;state.customCourses[existing]=c}
    else state.customCourses.push(c);
    if(suppliedMaterials){
      // Never drop previously archived file references when an AI-edited course is reimported.
      const previous=library(c.id);
      state.sourceLibraries[c.id]={
        links:[...suppliedMaterials.links,...previous.links.filter(x=>!suppliedMaterials.links.some(y=>y.id===x.id||(y.url&&y.url===x.url)))],
        documents:[...previous.documents,...suppliedMaterials.documents.filter(x=>!previous.documents.some(y=>y.id===x.id))],
        instructions:suppliedMaterials.instructions||previous.instructions
      };
    }
    if(view.name==='create'&&(state.draftSources.links.length||state.draftSources.documents.length||state.draftSources.instructions)){
      const target=library(c.id);target.links.push(...state.draftSources.links.filter(x=>!target.links.some(y=>y.url===x.url)));
      target.documents.push(...state.draftSources.documents.filter(x=>!target.documents.some(y=>y.id===x.id)));
      if(state.draftSources.instructions)target.instructions=[target.instructions,state.draftSources.instructions].filter(Boolean).join('\n');
      state.draftSources=blankLibrary();
    }
    if(view.name==='create')courseDraftForm={title:'',goal:'',audience:'',weeks:4,perWeek:6,minutes:60,focus:''};
    state.selectedCourseId=c.id;persist();notify(`Kurs „${c.title}“ importiert (${c.lessons.length} Lektionen).`);openCourse(c.id);return true;
  }
  function importCourseString(value){
    try{let parsed=JSON.parse(String(value).trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,''));return importCourse(parsed)}
    catch(err){const box=$('import-error');if(box)box.textContent='Import fehlgeschlagen: '+err.message;notify('Kurs-Import fehlgeschlagen. Bitte JSON prüfen.',5500);return false}
  }
  function renderEdit(){
    const c=getCourse(view.courseId);if(!c||c.id===BUILTIN_ID){openCourse(BUILTIN_ID);return}
    $('content').innerHTML=`<button class="button small back" data-action="course" data-course="${esc(c.id)}">← Zum Kurs</button><div class="eyebrow-dark">Kursverwaltung</div><h1>${esc(c.title)} bearbeiten</h1><p class="lead">Du kannst den Kurs hier manuell ändern oder mit ChatGPT/Claude überarbeiten. Hänge neue Dokumente direkt im KI-Chat an. Bei unveränderten Kurs- und Lektions-IDs bleiben deine Fortschritte zugeordnet.</p><div class="actions"><button class="button primary" data-action="copyEditPrompt">Überarbeitung mit KI starten · Prompt kopieren</button><button class="button" data-action="exportCourse" data-course="${esc(c.id)}">Aktuellen Kurs exportieren</button><button class="button" data-action="lessonEditor" data-course="${esc(c.id)}">+ Lektion hinzufügen</button><a class="button" href="https://chatgpt.com/" target="_blank" rel="noopener noreferrer">ChatGPT ↗</a><a class="button" href="https://claude.ai/" target="_blank" rel="noopener noreferrer">Claude ↗</a></div><div class="notice"><strong>Mit KI überarbeiten:</strong> Kopiere den Prompt, ergänze deine Änderungswünsche und neue Quellen im KI-Chat, prüfe den Entwurf und importiere das überarbeitete JSON. Vor größeren Änderungen ein Backup exportieren.</div><div class="section"><h2>Kursdaten (JSON)</h2><p class="small">Änderungen an Modulen, Lektionen, Fragen und Quellen kannst du hier direkt speichern. Bitte behalte Kurs- und Lektions-IDs bei, wenn du den Fortschritt erhalten möchtest.</p><label class="field"><span>Vollständiges Kurs-JSON</span><textarea id="course-json" class="tall" style="min-height:360px;font-family:ui-monospace,monospace;font-size:12px">${esc(escapeJSON(c))}</textarea></label><div class="actions"><button class="button primary" data-action="importCourseText">Kursänderungen speichern</button><button class="button" data-action="importCourseFile">JSON-Datei importieren</button><button class="button danger" data-action="deleteCourse" data-course="${esc(c.id)}">Kurs löschen</button></div><div id="import-error" class="error small space-top" role="alert"></div></div>`;
  }
  function renderLessonEditor(){
    const c=getCourse(view.courseId);if(!c||c.id===BUILTIN_ID){openCourse(BUILTIN_ID);return}
    const l=c.lessons.find(x=>x.id===view.lessonId);
    const value=(key)=>esc(l?.[key]||'');
    $('content').innerHTML=`<button class="button small back" data-action="course" data-course="${esc(c.id)}">← Zum Kurs</button><h1>${l?'Lektion bearbeiten':'Lektion hinzufügen'}</h1><p class="lead">Neue Lektionen erscheinen sofort im Kurs. Du kannst Inhalte auch später per KI-JSON überarbeiten.</p><form id="lesson-form"><label class="field"><span>Titel</span><input name="title" required value="${value('title')}" placeholder="Lektionstitel"></label><label class="field"><span>Modul</span><select name="weekId">${c.weeks.map(w=>`<option value="${esc(w.id)}" ${l?.weekId===w.id?'selected':''}>${esc(w.title)}</option>`).join('')}</select></label><label class="field"><span>Konzept / Lernziel</span><textarea name="concept" required>${value('concept')}</textarea></label><label class="field"><span>Praxisübung</span><textarea name="exercise" required>${value('exercise')}</textarea></label><label class="field"><span>Multiple-Choice-Frage</span><input name="question" required value="${value('question')}"></label><label class="field"><span>Antwortoptionen (eine pro Zeile)</span><textarea name="choices" required>${esc(l?.choices?.join('\n')||'')}</textarea></label><label class="field"><span>Richtige Antwort (1 = erste Option)</span><input type="number" min="1" max="8" name="answer" required value="${l?l.answer+1:1}"></label><label class="field"><span>Offene Prüfungsfrage</span><textarea name="openQuestion" required>${value('openQuestion')}</textarea></label><label class="field"><span>Mündliche Prüfungsfrage</span><textarea name="oralQuestion" required>${value('oralQuestion')}</textarea></label><label class="field"><span>Quellen als JSON-Array (optional)</span><textarea name="sources" placeholder='[{"title":"Quelle","url":"https://...","type":"Artikel","note":"..."}]'>${esc(l?.sources?.length?escapeJSON(l.sources):'[]')}</textarea><small>Nur echte http(s)-Quellen verwenden. Unbekannte Quellen weglassen.</small></label><div class="actions"><button class="button primary" type="submit">Lektion speichern</button>${l?`<button class="button danger" type="button" data-action="deleteLesson">Lektion entfernen</button>`:''}</div><div id="lesson-error" class="error small space-top" role="alert"></div></form>`;
  }
  function saveLesson(form){
    const c=getCourse(view.courseId),existing=c?.lessons.find(l=>l.id===view.lessonId);
    if(!c||c.id===BUILTIN_ID)return;
    const f=new FormData(form);
    let sources;
    try{sources=JSON.parse(String(f.get('sources')||'[]'))}catch{ $('lesson-error').textContent='Quellen müssen ein gültiges JSON-Array sein.';return }
    const choices=String(f.get('choices')||'').split('\n').map(x=>x.trim()).filter(Boolean);
    let id=existing?.id||slug(f.get('title'))||`l${c.lessons.length+1}`;
    if(!existing){const base=id;let i=2;while(c.lessons.some(l=>l.id===id))id=`${base}-${i++}`}
    const raw={...c,lessons:[...c.lessons.filter(l=>l.id!==existing?.id),{
      id,weekId:f.get('weekId'),title:f.get('title'),concept:f.get('concept'),exercise:f.get('exercise'),
      question:f.get('question'),choices,answer:Number(f.get('answer'))-1,openQuestion:f.get('openQuestion'),oralQuestion:f.get('oralQuestion'),sources
    }]};
    try{const normalized=normalizeCourse(raw);state.customCourses[state.customCourses.findIndex(x=>x.id===c.id)]=normalized;persist();openLesson(c.id,id);notify('Lektion gespeichert.')}
    catch(err){$('lesson-error').textContent=err.message}
  }
  async function exportBackup(){
    const ids=new Set([...Object.values(state.sourceLibraries).flatMap(x=>(x.documents||[]).map(d=>d.id)),...(state.draftSources.documents||[]).map(d=>d.id)]);
    const attachments=[];
    for(const id of ids){const record=await getDocument(id);if(!record){notify(`Achtung: Datei ${id} fehlt im Browser-Speicher. Backup enthält nur Metadaten.`,6000);continue}
      const base64=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(reader.error);reader.readAsDataURL(record.blob)});
      attachments.push({id,name:record.name,type:record.type,base64});
    }
    download(`learning-campus-backup-${new Date().toISOString().slice(0,10)}.json`,escapeJSON({format:'learning-campus-backup',version:3,exportedAt:new Date().toISOString(),data:state,attachments}));
    notify(`Backup erstellt: ${attachments.length} Dokumente enthalten.`);
  }
  function base64Blob(encoded,type){const binary=atob(encoded),chunks=[];for(let i=0;i<binary.length;i+=32768){const slice=binary.slice(i,i+32768),bytes=new Uint8Array(slice.length);for(let j=0;j<slice.length;j++)bytes[j]=slice.charCodeAt(j);chunks.push(bytes)}return new Blob(chunks,{type:type||'application/octet-stream'})}

  async function importBackup(raw){
    if(raw?.format==='learning-campus-backup'&&raw.version===3){
      const data=raw.data;
      if(!data||!Array.isArray(data.customCourses)||!data.progress||typeof data.progress!=='object')throw Error('Ungültiges Learning-Campus-Backup.');
      const validated=data.customCourses.map(normalizeCourse);
      if(!confirm('Backup importieren? Gleichnamige Kurse und vorhandene Einträge werden durch die Backup-Daten ersetzt. Bitte vorher bei Bedarf ein eigenes Backup exportieren.'))return;
      const merged=new Map(state.customCourses.map(c=>[c.id,c]));for(const c of validated)merged.set(c.id,c);
      state.customCourses=[...merged.values()];
      if(data.sourceLibraries&&typeof data.sourceLibraries==='object')for(const [id,lib] of Object.entries(data.sourceLibraries))state.sourceLibraries[id]=cleanLibrary(lib);
      if(data.draftSources)state.draftSources=cleanLibrary(data.draftSources);
      for(const record of raw.attachments||[]){if(!record?.id||!record.base64)continue;await putDocument({id:record.id,name:text(record.name,250),type:text(record.type,120),blob:base64Blob(record.base64,record.type)})}
      for(const [id,p] of Object.entries(data.progress)){
        if(!p||typeof p!=='object'||!p.lessons||typeof p.lessons!=='object')continue;
        const current=progress(id);
        current.lessons={...current.lessons,...p.lessons};
        if(p.selectedLessonId)current.selectedLessonId=p.selectedLessonId;
      }
      persist();setView('catalog');notify('Backup importiert; Kurse und Fortschritte zusammengeführt.');return;
    }
    // Also support the exact backup shape exported by Teamcoaching Campus 2.0.
    const legacy=raw?.version===2&&raw.data?raw.data:raw;
    if(legacy?.lessons&&typeof legacy.lessons==='object'){
      if(!confirm('Teamcoaching-2.0-Backup importieren und bestehende Teamcoaching-Fortschritte für gleiche Lektionen aktualisieren?'))return;
      const p=progress(BUILTIN_ID);p.lessons={...p.lessons,...legacy.lessons};persist();openCourse(BUILTIN_ID);notify('Teamcoaching-2.0-Backup importiert.');return;
    }
    throw Error('Datei ist kein unterstütztes Lerncampus-Backup.');
  }
  async function deleteCourse(courseId){const c=getCourse(courseId);if(!c||c.id===BUILTIN_ID)return;if(!confirm(`Kurs „${c.title}“ inklusive lokal gespeicherter Fortschritte und Dokumente wirklich löschen? Exportiere vorher ein Backup.`))return;const ids=(library(courseId).documents||[]).map(d=>d.id);state.customCourses=state.customCourses.filter(x=>x.id!==courseId);delete state.progress[courseId];delete state.sourceLibraries[courseId];state.selectedCourseId=BUILTIN_ID;persist();for(const id of ids)await removeDocument(id);setView('catalog',BUILTIN_ID);notify('Kurs gelöscht.')}
  async function downloadDocument(id){
    const d=await getDocument(id);if(!d){notify('Datei nicht gefunden. Bitte erneut hochladen.',5500);return}
    download(d.name,d.blob,d.type||'application/octet-stream');
  }

  function deleteLesson(){const c=getCourse(view.courseId),l=c?.lessons.find(x=>x.id===view.lessonId);if(!c||!l||c.id===BUILTIN_ID)return;if(!confirm(`Lektion „${l.title}“ aus dem Kurs entfernen? Der bisherige Fortschritt bleibt im Backup bzw. in der lokalen Datenstruktur erhalten.`))return;c.lessons=c.lessons.filter(x=>x.id!==l.id);persist();openCourse(c.id);notify('Lektion entfernt.')}
  function render(){renderSidebar();switch(view.name){case 'catalog':renderCatalog();break;case 'daily':renderDailySummaries(cloudEntries);break;case 'course':renderCourse();break;case 'lesson':renderLesson();break;case 'sources':renderSources();break;case 'create':renderCreate();break;case 'import':renderImport();break;case 'edit':renderEdit();break;case 'lessonEditor':renderLessonEditor();break;default:renderCatalog()}}
  async function handleAction(button){
    const action=button.dataset.action,courseId=button.dataset.course||view.courseId,lessonId=button.dataset.lesson||null;
    const c=getCourse(view.courseId),l=c?.lessons.find(x=>x.id===view.lessonId);
    switch(action){
      case 'daily':setView('daily');await refreshDailySummaries();break;
      case 'saveCloudNote':{
        const field=document.querySelector('[data-field="dailySummary"]');
        const summary=field?.value.trim();
        if(!summary||!l)return notify('Gib zuerst eine Lernzusammenfassung ein.');
        button.disabled=true;
        try{
          await window.learningCampusCloud.saveNote(field.dataset.day,l.id,summary);
          notify('Deine Browser-Notiz wurde zusätzlich online gespeichert.');
        }finally{button.disabled=false}
        break;
      }
      case 'catalog':setView('catalog',state.selectedCourseId);break;
      case 'course':openCourse(courseId);break;
      case 'lesson':openLesson(courseId,lessonId);break;
      case 'create':setView('create',state.selectedCourseId);break;
      case 'import':setView('import',state.selectedCourseId);break;
      case 'downloadDocument':await downloadDocument(button.dataset.id);break;
      case 'edit':setView('edit',courseId);break;
      case 'lessonEditor':setView('lessonEditor',courseId,lessonId);break;
      case 'sources':setView('sources',courseId);break;
      case 'generateCoursePrompt':{
        rememberCreateForm();
        const p=promptCourse(courseFormValues(),null,library('draft'));
        $('prompt-preview').innerHTML=`<div class="notice">Prompt erstellt. Füge ihn in ChatGPT oder Claude ein und hänge deine Dokumente dort an.</div><details><summary>Prompt anzeigen</summary><pre class="json-preview">${esc(p)}</pre></details>`;
        await copy(p);break;
      }
      case 'downloadMasterPrompt':{rememberCreateForm();download('Learning_Campus_Kurs_Master_Prompt.txt',promptCourse(courseFormValues(),null,library('draft')),'text/plain;charset=utf-8');break}
      case 'importCourseText':importCourseString($('course-json')?.value||'');break;
      case 'importCourseFile':$('course-file').click();break;
      case 'downloadTemplate':download('kurs-vorlage.json',escapeJSON(courseTemplate()));break;
      case 'copyEditPrompt':{
        const current=getCourse(view.courseId);
        if(!current)return;
        const p=promptCourse({title:current.title,goal:current.goal,audience:current.audience,weeks:current.weeks.length,perWeek:Math.max(1,Math.ceil(current.lessons.length/current.weeks.length)),minutes:current.minutesPerLesson},current,library(current.id));
        await copy(p);break;
      }
      case 'exportCourse':{const current=getCourse(courseId);if(current)download(`${current.id}-kurs.json`,escapeJSON({...current,referenceMaterials:library(current.id)}));break}
      case 'deleteCourse':await deleteCourse(courseId);break;
      case 'deleteLesson':deleteLesson();break;
      case 'copyPrompt':if(c&&l)await copy(promptFor(button.dataset.kind,c,l));break;
      case 'copyJournal':if(c&&l)await copy(entry(c.id,l.id).journal||'');break;
      case 'score':{
        if(!c||!l)return;const checked=document.querySelector('input[name="mc"]:checked');if(!checked){notify('Bitte eine Antwort auswählen.');return}
        const e=entry(c.id,l.id);e.mc=Number(checked.value);e.mcCorrect=e.mc===l.answer;persist();
        $('mc-result').innerHTML=`<div class="result">${e.mcCorrect?'✓ Richtig':'✗ Noch nicht richtig'} · Richtige Antwort: ${esc(l.choices[l.answer])}.<br>Fachlicher Kontext: ${esc(l.concept)}</div>`;break;
      }
      case 'finish':if(c&&l){const e=entry(c.id,l.id);e.done=!e.done;persist();render();notify(e.done?'Lektion abgeschlossen.':'Lektion als offen markiert.')}break;
      case 'exportBackup':await exportBackup();break;
      case 'importBackup':$('backup-file').click();break;
    }
  }
  document.addEventListener('click',event=>{
    const button=event.target.closest('[data-action]');if(button && !button.disabled){event.preventDefault();handleAction(button).catch(err=>{console.error(err);notify('Aktion fehlgeschlagen: '+err.message)})}
  });
  document.addEventListener('keydown',event=>{if((event.key==='Enter'||event.key===' ')&&event.target.classList.contains('brand')){event.preventDefault();setView('catalog')}});
  $('content').addEventListener('input',event=>{
    const field=event.target.dataset.field;
    if(!field||view.name!=='lesson')return;
    if(field==='review')return;
    if(field==='dailySummary'){
      const e=entry(view.courseId,view.lessonId);
      const summaries=e.dailySummaries ||= {};
      const day=event.target.dataset.day;
      if(event.target.value.trim())summaries[day]=event.target.value;
      else delete summaries[day];
      persist();
      return;
    }
    store(view.courseId,view.lessonId,field,event.target.value);
  });
  $('content').addEventListener('change',event=>{
    const field=event.target.dataset.field;
    if(field==='review'&&view.name==='lesson')store(view.courseId,view.lessonId,'review',event.target.checked);
  });
  $('content').addEventListener('submit',event=>{if(event.target.id==='lesson-form'){event.preventDefault();saveLesson(event.target)}});
  $('course-file').addEventListener('change',async event=>{
    const file=event.target.files?.[0];if(!file)return;
    try{importCourseString(await file.text())}catch(err){notify('Datei konnte nicht gelesen werden: '+err.message)}
    event.target.value='';
  });
  $('backup-file').addEventListener('change',async event=>{
    const file=event.target.files?.[0];if(!file)return;
    try{await importBackup(JSON.parse(await file.text()))}catch(err){notify('Backup-Import fehlgeschlagen: '+err.message,5500)}
    event.target.value='';
  });
  const refreshJournal=()=>refreshDailySummaries().catch(()=>notify('Die Online-Zusammenfassungen konnten nicht geladen werden.'));
  window.addEventListener('focus',()=>{if(view.name==='daily')void refreshJournal()});
  window.addEventListener('campus-cloud-change',()=>{
    cloudEntries=[];
    cloudNotes=[];
    state=blankState();
    view={name:'catalog',courseId:BUILTIN_ID,lessonId:null};
    initialize();
    render();
    void refreshJournal();
  });
  initialize();render();
})();
