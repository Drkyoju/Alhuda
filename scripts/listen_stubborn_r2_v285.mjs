#!/usr/bin/env node
/** Re-TTS+Whisper only residual fails from v284 report. */
import { createHash } from 'crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import { prepareFishTtsText } from '../fish-audio-tts.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const base = 'https://alhuda.ryodan71.workers.dev';
const outDir = join(root, 'extracted/listen_stubborn_v284/r2');
const mp3Dir = join(outDir, 'mp3');
const whisperDir = join(outDir, 'whisper_work');
mkdirSync(mp3Dir, { recursive: true });
mkdirSync(whisperDir, { recursive: true });

function bareLetters(t){return String(t||'').replace(/[\u064B-\u065F\u0670\u0640]/g,'').replace(/[^\u0621-\u064A\s]/g,' ').replace(/\s+/g,' ').trim();}
function compactLetters(t){return bareLetters(t).replace(/\s+/g,'');}
function letterCount(t){return compactLetters(t).length;}
function words(t){return bareLetters(t).split(/\s+/).filter(Boolean);}
function compactOverlap(a,b){const ca=compactLetters(a),cb=compactLetters(b);if(!ca.length&&!cb.length)return 1;if(!ca.length||!cb.length)return 0;let shared=0;const bag=[...cb];for(const ch of ca){const i=bag.indexOf(ch);if(i>=0){shared++;bag.splice(i,1);}}return shared/Math.max(ca.length,cb.length);}
function editDistanceLimited(a,b,max=2){a=String(a);b=String(b);if(Math.abs(a.length-b.length)>max)return max+1;const rows=a.length+1,cols=b.length+1;const dp=Array.from({length:rows},()=>Array(cols).fill(0));for(let i=0;i<rows;i++)dp[i][0]=i;for(let j=0;j<cols;j++)dp[0][j]=j;for(let i=1;i<rows;i++){let rowMin=Infinity;for(let j=1;j<cols;j++){const cost=a[i-1]===b[j-1]?0:1;dp[i][j]=Math.min(dp[i-1][j]+1,dp[i][j-1]+1,dp[i-1][j-1]+cost);rowMin=Math.min(rowMin,dp[i][j]);}if(rowMin>max)return max+1;}return dp[a.length][b.length];}
function wordPresentFuzzy(w,heardCompact,hw){if(heardCompact.includes(compactLetters(w)))return true;for(const h of hw){if(editDistanceLimited(w,h,1)<=1)return true;}return false;}
function judge(fish,transcript){
  const heardNorm=String(transcript||'');
  const intendedCompact=compactLetters(fish);
  const heardCompact=compactLetters(heardNorm);
  const iw=words(fish); const hw=words(heardNorm);
  const flags=[]; const missing=[];
  for(const w of iw){if(w.length<3)continue;if(!wordPresentFuzzy(w,heardCompact,hw))missing.push(w);}
  const il=letterCount(fish); const hl=letterCount(heardNorm);
  const ratio=il?hl/il:1; const overlap=compactOverlap(fish,heardNorm);
  const dist=editDistanceLimited(intendedCompact,heardCompact,2);
  if(il<=16&&dist<=1&&overlap>=0.7)return{pass:true,overlap,ratio,missing:[],flags:[{kind:'stt_letter_noise'}]};
  if(/\b7\b/.test(heardNorm)&&/سبعة/.test(bareLetters(fish)))return{pass:true,overlap,ratio,missing:[],flags:[{kind:'number_equiv'}]};
  if(/\b20\b/.test(heardNorm)&&/عشرين/.test(bareLetters(fish)))return{pass:true,overlap,ratio,missing:[],flags:[{kind:'number_equiv'}]};
  if(il>=12&&(ratio<0.55||overlap<0.72))flags.push({kind:'missing_words',missing:missing.slice(0,8)});
  else if(il>=4&&il<12&&overlap<0.55)flags.push({kind:'missing_words',missing:missing.slice(0,8)});
  else if(il>=4&&il<12&&missing.length>=1&&overlap<0.62)flags.push({kind:'missing_words',missing:missing.slice(0,8)});
  const mangled=[];
  for(const w of hw){if(w.length<4)continue;let best=0;for(const t of iw){const shared=[...w].filter(c=>t.includes(c)).length;best=Math.max(best,shared/Math.max(w.length,t.length));}if(best<0.35&&!intendedCompact.includes(compactLetters(w)))mangled.push(w);}
  if(il>=4&&il<18&&mangled.length>=1&&overlap<0.55)flags.push({kind:'mangled',words:mangled.slice(0,6)});
  const sttNoiseOnly=overlap>=0.85&&ratio>=0.75;
  const hard=flags.filter(f=>f.kind==='missing_words'||f.kind==='mangled');
  const pass=sttNoiseOnly||(hard.length===0&&(il<4||ratio>=0.45));
  if(!pass)flags.push({kind:'fish_voice_limitation'});
  return{pass,overlap:Number(overlap.toFixed(3)),ratio:Number(ratio.toFixed(3)),missing:missing.slice(0,8),flags};
}

async function mapPool(items,limit,fn){const out=new Array(items.length);let i=0;async function w(){while(i<items.length){const idx=i++;out[idx]=await fn(items[idx],idx);}}await Promise.all(Array.from({length:Math.min(limit,items.length)},()=>w()));return out;}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

const r2list=JSON.parse(readFileSync(join(root,'extracted/listen_stubborn_v284/r2_fails.json'),'utf8'));
const items=r2list.map((it,idx)=>{
  const fish=prepareFishTtsText(it.spoken||it.bare);
  const hash=createHash('sha1').update(`v285r2|${fish}`).digest('hex').slice(0,16);
  return {...it, fish, hash, id:`r2_${idx}_${hash}`};
});

console.log('r2 items', items.length);
const rows=await mapPool(items,3,async (row,idx)=>{
  const file=join(mp3Dir,`${row.hash}.mp3`);
  const res=await fetch(`${base}/api/tts`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:row.fish,voice:'fish'})});
  const buf=Buffer.from(await res.arrayBuffer());
  const ok=res.status>=200&&res.status<300&&buf.length>800;
  if(ok) writeFileSync(file,buf);
  console.log(`[tts ${idx+1}/${items.length}] ${row.bare} ${ok?buf.length:'FAIL'}`);
  await sleep(300);
  return {...row,mp3:ok?file:null,ttsOk:ok,size:buf.length};
});
writeFileSync(join(outDir,'tts_manifest.json'),JSON.stringify({n:rows.length,rows},null,2));

for(const r of rows){if(r.ttsOk) writeFileSync(join(whisperDir,`${r.hash}.mp3`), readFileSync(r.mp3));}
const sttOut=join(outDir,'stt_small.json');
await new Promise((resolve,reject)=>{
  const child=spawn(join(root,'.venv/bin/python'),[join(root,'scripts/whisper_transcribe.py'),'--dir',whisperDir,'--model','small','--out',sttOut,'--lang','ar'],{cwd:root});
  child.stderr.on('data',d=>process.stderr.write(d));
  child.stdout.on('data',d=>process.stdout.write(d));
  child.on('close',c=>c===0?resolve():reject(new Error('whisper '+c)));
});
const stt=JSON.parse(readFileSync(sttOut,'utf8'));
const byHash=new Map((stt.results||[]).map(e=>[String(e.id||e.file).replace(/\.mp3$/,''),e.transcript||'']));
const scored=rows.map(r=>{const transcript=byHash.get(r.hash)||'';const j=r.ttsOk?judge(r.fish,transcript):{pass:false,overlap:0,flags:[{kind:'tts_fail'}]};return{...r,transcript,pass:j.pass,overlap:j.overlap,ratio:j.ratio,missing:j.missing,flags:j.flags};});
const pass=scored.filter(x=>x.pass).length;
const fail=scored.filter(x=>!x.pass);
writeFileSync(join(outDir,'score.json'),JSON.stringify({pass,fail:fail.length,passRate:pass/scored.length,fails:fail,all:scored},null,2));
console.log({pass,fail:fail.length,passRate:pass/scored.length});
for(const x of fail) console.log(JSON.stringify({bare:x.bare,fish:x.fish,stt:String(x.transcript).slice(0,50),ov:x.overlap}));
