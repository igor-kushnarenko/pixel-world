export function shutterStep(position:number,direction:number,dt:number){return Math.max(0,Math.min(1,position+direction*Math.min(Math.max(dt,0),0.1)*0.18));}
export function exteriorVisibility(closed:number){return Math.pow(1-Math.max(0,Math.min(1,closed)),1.4);}
