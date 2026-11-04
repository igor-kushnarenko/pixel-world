export interface Place { name:string; latitude:number; longitude:number; timezone:string }
export const DEFAULT_PLACE:Place={name:'Анапа',latitude:44.89497,longitude:37.31623,timezone:'Europe/Moscow'};
const key='pixel-world.place.v1';
export function validPlace(v:unknown):v is Place {
  if(!v||typeof v!=='object')return false;const p=v as Place;
  try{new Intl.DateTimeFormat('ru',{timeZone:p.timezone});}catch{return false;}
  return typeof p.name==='string'&&p.name.length>0&&p.name.length<150&&Number.isFinite(p.latitude)&&Math.abs(p.latitude)<=90&&Number.isFinite(p.longitude)&&Math.abs(p.longitude)<=180&&typeof p.timezone==='string';
}
export function weatherName(code:number){
  if(!Number.isInteger(code)||code<0||code>99)return 'Погода';
  if(code===0)return 'Ясно';if(code<=3)return 'Облачно';if(code===45||code===48)return 'Туман';
  if(code>=95)return 'Гроза';if([71,73,75,77,85,86].includes(code))return 'Снег';
  if(code>=51&&code<=82)return 'Дождь';return 'Погода';
}
export function mountWeather(open:()=>void,refreshScreen:()=>void){
  const screen=document.createElement('canvas');screen.width=176;screen.height=100;
  let place:Place|null=DEFAULT_PLACE,temperature='',description='Загрузка…',updated='',disposed=false,revision=0;
  let weatherRequest:AbortController|undefined, searchRequest:AbortController|undefined;
  try{const saved=JSON.parse(localStorage.getItem(key)??'null');if(validPlace(saved))place=saved;}catch{}
  const widget=document.createElement('button');widget.className='real-world';widget.id='real-world';widget.setAttribute('aria-label','Время и погода города');
  widget.innerHTML='<time id="real-clock"></time><span id="real-place"></span><span id="real-weather"></span>';
  document.querySelector('.experience')!.append(widget);
  const section=document.createElement('details');section.className='city-weather';
  section.innerHTML='<summary>Город и погода <span>+</span></summary><form id="city-form"><label for="city-query">Город</label><div class="city-search"><input id="city-query" type="search" placeholder="Название города" minlength="2" maxlength="80" required autocomplete="off"><button>Найти</button></div></form><div id="city-results"></div><p id="weather-state" role="status"></p><a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer">Данные Open-Meteo ↗</a>';
  document.querySelector('#panel-scene')!.append(section);
  const el=(id:string)=>document.getElementById(id)!;
  function tick(){
    const now=new Date(), zone=place?.timezone??Intl.DateTimeFormat().resolvedOptions().timeZone;
    const clock=new Intl.DateTimeFormat('ru-RU',{timeZone:zone,hour:'2-digit',minute:'2-digit'}).format(now);
    el('real-clock').textContent=clock;el('real-clock').setAttribute('datetime',now.toISOString());
    el('real-place').textContent=place?.name??'Местное время';
    el('real-weather').textContent=place?`${temperature} ${description}`.trim():'Выбрать город';
    widget.title=place?`${place.name} · ${zone}${updated?' · Данные: '+updated:''}`:'Выбрать город для погоды';
    const ctx=screen.getContext('2d')!;ctx.imageSmoothingEnabled=false;ctx.fillStyle='#0b202c';ctx.fillRect(0,0,176,100);
    ctx.fillStyle='#78b9ba';ctx.font='8px monospace';ctx.fillText('PIXEL WORLD / ONLINE',9,13);
    ctx.fillStyle='#b4e2da';ctx.font='24px monospace';ctx.fillText(clock,9,44);
    ctx.font='10px monospace';ctx.fillText((place?.name??'Местное время').slice(0,23),9,63);
    ctx.fillStyle='#84b6c1';ctx.fillText((`${temperature} ${description}`.trim()||'Выберите город').slice(0,25),9,82);
    refreshScreen();
  }
  async function loadWeather(){
    if(!place||disposed)return;weatherRequest?.abort();const controller=new AbortController();weatherRequest=controller;const mine=++revision;
    const timer=setTimeout(()=>controller.abort(),10000);
    el('weather-state').textContent='Обновляем погоду…';
    try{
      const url=new URL('https://api.open-meteo.com/v1/forecast');
      url.search=new URLSearchParams({latitude:String(place.latitude),longitude:String(place.longitude),current:'temperature_2m,weather_code',timezone:place.timezone,timeformat:'unixtime'}).toString();
      const response=await fetch(url,{signal:weatherRequest.signal});if(!response.ok)throw new Error('weather');
      const data=await response.json();if(!Number.isFinite(data.current?.temperature_2m)||!Number.isFinite(data.current?.weather_code)||!Number.isFinite(data.current?.time))throw new Error('weather');
      if(disposed||mine!==revision)return;
      temperature=`${Math.round(data.current.temperature_2m)}°`;description=weatherName(data.current.weather_code);
      updated=new Intl.DateTimeFormat('ru-RU',{timeZone:place.timezone,hour:'2-digit',minute:'2-digit'}).format(new Date(data.current.time*1000));
      el('weather-state').textContent=`${place.name} · ${temperature} · ${description}. Данные на ${updated}.`;
    }catch{if(!disposed&&mine===revision){temperature='';description='Погода недоступна';updated='';el('weather-state').textContent='Погода недоступна. Повторим запрос позже.';}}
    finally{clearTimeout(timer);if(!disposed&&mine===revision)tick();}
  }
  async function select(p:Place){place=p;temperature='';description='Загрузка…';updated='';try{localStorage.setItem(key,JSON.stringify(p));}catch{}el('city-results').replaceChildren();tick();await loadWeather();}
  widget.onclick=()=>{open();section.open=true;document.querySelector<HTMLInputElement>('#city-query')!.focus();};
  el('city-form').onsubmit=async e=>{
    e.preventDefault();const query=(el('city-query') as HTMLInputElement).value.trim();if(query.length<2)return;
    searchRequest?.abort();const controller=new AbortController();searchRequest=controller;const timer=setTimeout(()=>controller.abort(),10000);
    el('city-results').replaceChildren();el('weather-state').textContent='Ищем город…';
    try{
      const res=await fetch(`https://geocoding-api.open-meteo.com/v1/search?${new URLSearchParams({name:query,count:'5',language:'ru'})}`,{signal:controller.signal});if(!res.ok)throw new Error('search');const data=await res.json();if(disposed||searchRequest!==controller)return;
      const results=(Array.isArray(data.results)?data.results:[]).filter(validPlace) as Place[];
      for(const p of results){const b=document.createElement('button');b.type='button';b.textContent=[p.name,(p as Place&{country?:string}).country].filter(Boolean).join(', ');b.onclick=()=>{void select(p);};el('city-results').append(b);}
      el('weather-state').textContent=results.length?'Выберите город из списка.':'Город не найден. Попробуйте другое название.';
    }catch{if(!disposed&&searchRequest===controller)el('weather-state').textContent='Не удалось найти город. Попробуйте ещё раз.';}finally{clearTimeout(timer);}
  };
  tick();if(place)void loadWeather();
  const clockTimer=setInterval(tick,1000),weatherTimer=setInterval(()=>{void loadWeather();},15*60*1000);
  return {screen,select,dispose(){disposed=true;revision++;clearInterval(clockTimer);clearInterval(weatherTimer);weatherRequest?.abort();searchRequest?.abort();}};
}
