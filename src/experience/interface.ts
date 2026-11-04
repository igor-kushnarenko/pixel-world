/** Task-based navigation; existing controls retain their IDs and event bindings. */
export function mountInterface(icon: (name: 'cloud'|'sound'|'lamp'|'menu'|'full'|'computer') => string, toggle: (open: boolean) => void) {
  const el = (id: string) => document.getElementById(id)!;
  const panel=el('scene-menu'), header=panel.querySelector('.menu-heading')!;
  const weather=el('cloud-toggle').closest('.menu-section')!;
  const room=el('lamp-left').closest('.menu-section')!;
  const computer=document.createElement('button');computer.id='computer-toggle';computer.className='device';computer.setAttribute('aria-pressed','false');computer.innerHTML=`${icon('computer')}<span>Компьютер</span><i></i>`;room.querySelector('.device-grid')!.append(computer);
  const radio=el('radio-toggle'), radioControls=el('radio-controls');
  const sound=el('sound-toggle').closest('.sound-section')!;
  const life=el('beacon-toggle').closest('details')!;
  const atmosphere=el('atmosphere-controls').closest('details')!;
  const clouds=weather.querySelector('details')!;
  const light=el('city-lights').closest('label')!;
  const footer=panel.querySelector('.menu-footer')!, hints=panel.querySelector('.key-hints')!;
  const moods=panel.querySelector('.mood-switch')!, view=panel.querySelector('.view-selector')!;
  const dock=document.createElement('nav');dock.className='scene-dock';dock.setAttribute('aria-label','Управление сценой');
  const definitions=[['scene','Сцена','cloud'],['audio','Звук','sound'],['room','Свет','lamp'],['detail','Детали','menu']] as const;
  const panes=new Map<string,HTMLElement>(),buttons=new Map<string,HTMLButtonElement>();
  const body=document.createElement('div');body.className='panel-body';
  panel.append(body);
  for(const [id,label,glyph] of definitions){
    const p=document.createElement('div');p.id=`panel-${id}`;p.className='control-panel';p.setAttribute('role','region');p.setAttribute('aria-label',label);body.append(p);panes.set(id,p);
    const b=id==='scene'?el('menu-toggle') as HTMLButtonElement:document.createElement('button');
    b.className='dock-action';b.id=id==='scene'?'menu-toggle':`nav-${id}`;
    b.innerHTML=`${icon(glyph)}<span>${label}</span>`;b.setAttribute('aria-controls',p.id);b.setAttribute('aria-expanded','false');b.setAttribute('aria-label',`Открыть: ${label}`);
    b.dataset.section=id;dock.append(b);buttons.set(id,b);
  }
  const full=el('fullscreen');full.className='dock-action dock-fullscreen';full.innerHTML=`${icon('full')}<span>Экран</span>`;dock.append(full);
  panel.after(dock);
  panes.get('scene')!.append(view,moods,weather);
  panes.get('audio')!.append(sound,radio,radioControls);
  panes.get('room')!.append(room,light);
  panes.get('detail')!.append(clouds,life,atmosphere,footer,hints);
  const intro=document.createElement('p');intro.className='panel-intro';intro.textContent='Тонкая настройка движения и атмосферы. Всё сохраняется автоматически.';panes.get('detail')!.prepend(intro);
  const lightIntro=document.createElement('p');lightIntro.className='panel-intro';lightIntro.textContent='Добавьте тепла. Светильники можно включать и прямо в комнате.';panes.get('room')!.prepend(lightIntro);
  header.querySelector('.menu-kicker')!.textContent='ВАШЕ ПРОСТРАНСТВО';
  let current='scene';
  function sync(open:boolean){for(const [id,b]of buttons)b.setAttribute('aria-expanded',String(open&&id===current));}
  function open(id:string){
    if(current===id&&!panel.hidden){toggle(false);return;}
    current=id;
    for(const [key,p]of panes)p.hidden=key!==id;
    header.querySelector('h2')!.textContent={scene:'За окном',audio:'Звук и радио',room:'Тёплый свет',detail:'Детали атмосферы'}[id]??'Настройки';
    body.scrollTop=0;toggle(true);sync(true);
  }
  for(const [id,b]of buttons)b.onclick=()=>open(id);
  for(const [id,p]of panes)p.hidden=id!=='scene';
  header.querySelector('h2')!.textContent='За окном';
  document.addEventListener('pointerdown',e=>{if(!panel.hidden&&!panel.contains(e.target as Node)&&!dock.contains(e.target as Node))toggle(false);});
  return {open,sync,focus:()=>buttons.get(current)!.focus()};
}
