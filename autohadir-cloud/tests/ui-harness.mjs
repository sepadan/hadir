import vm from 'node:vm';
import { renderAppJs } from '../src/ui.mjs';

export async function runUi(pageStatus = null, phase = 'active', expired = false, flow = null) {
  const nodes = new Map(), timers = [];
  function element() {
    return { textContent:'', className:'', innerHTML:'', hidden:true, disabled:false,
      checked:false, children:[], addEventListener(){}, removeAttribute(){},
      setAttribute(){}, appendChild(n){this.children.push(n);}, remove(){},
      getAttribute(){return null;}, querySelectorAll(){return [];}, focus(){} };
  }
  const document = { visibilityState:'visible', hidden:false,
    getElementById(id) { if(!nodes.has(id)) nodes.set(id,element()); return nodes.get(id); },
    createElement:element, addEventListener(){} };
  let fetchCount = 0;
  const payload = {csrf:'fixture-csrf',dailyLaunches:{count:1,max:8,date:'2026-10-30'},
    nextActionAt:null,session:{phase,requestedTarget:'control',navigation:'sent',expiresAt:Date.now()+(expired ? -1 : 900000)},pageStatus,flow};
  const window = { location:{replace(){}}, addEventListener(){} };
  const context = {document,window,console,Date,
    fetch:async()=>{fetchCount++;return {ok:true,status:200,json:async()=>payload};},
    setInterval:(fn,ms)=>{timers.push({fn,ms});return timers.length;},
    clearInterval(){},setTimeout(){},clearTimeout(){}};
  vm.runInNewContext(renderAppJs(),context);
  await new Promise(setImmediate);
  return {nodes,timers,document,get fetchCount(){return fetchCount;}};
}
