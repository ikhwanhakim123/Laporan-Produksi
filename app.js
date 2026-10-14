const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const SERVER='Google Sheets';
const NAMES=`Julham Oktavia Hasibuan
Mhd Afdillah Fauzi
Sarwedi Siringo-Ringo
Ramot Manurung
Haris Syahputra Pulungan
M. Agus Suhendra
Ibrahim
Syahrizal
Sudirman Sagala
Putra Iskandar Muda
Wahyudi Nasution
Amir Hamzah
Erwin Siagian
Muhammad Andika
Dede Rinaldi
Riyan Rivaldi
Irsan
Ridwan Zulhendra Simarmata
Bagus Abdillah
Marrowan P Malau
Agus Suriwayadi
Doni Tri Pendi Purba`;
$('names').value=NAMES;

let res=[],paper=null,paperTot=null,extra=[],file=null,isDemo=false,written=false;
let sample=null,downloads=null,mcp=null,canImg=false;
let tabs=[],tab='',groups=[],dates=[],plan=null,busy=false,checksOk=false;
let planTok=0,planTimer=null,planP=Promise.resolve();

/* ---------- util ---------- */
const status=(t,k='')=>{const el=$('st');el.textContent=t;el.dataset.k=k};
const asObj=p=>{if(typeof p==='string'){try{return JSON.parse(p)}catch(e){return{}}}return p||{}};
const q=t=>"'"+String(t).replace(/'/g,"''")+"'";
function colLetter(n){let s='';n++;while(n>0){const m=(n-1)%26;s=String.fromCharCode(65+m)+s;n=Math.floor((n-1)/26)}return s}
function sid(){const v=$('sid').value.trim();const m=v.match(/\/d\/([a-zA-Z0-9_-]+)/);return m?m[1]:v}
async function call(tool,input){const r=await mcp.callTool(SERVER,tool,input,{cache:false});return r.payload}
function errText(e){const c=e&&e.code;
  if(c==='needs_reauth')return'Sambungan Google Sheets habis. Sambungkan ulang di claude.ai: Pengaturan, Konektor.';
  if(c==='server_not_connected'||c==='selection_required')return'Konektor Google Sheets belum tersambung. Tambahkan di claude.ai: Pengaturan, Konektor.';
  if(c==='not_in_manifest'||c==='consent_required'||c==='not_granted')return'Akses ke Google Sheets belum Anda izinkan untuk halaman ini. Izinkan, lalu klik Muat ulang dari Sheet.';
  if(c==='blocked_by_policy')return'Kebijakan organisasi memblokir akses ini.';
  if(c==='approval_required')return'Perlu persetujuan Anda untuk panggilan ini. Coba lagi dan pilih Izinkan.';
  if(c==='tool_error')return'Google Sheets menolak permintaan: '+(e.message||'');
  if(c==='server_unavailable')return'Google Sheets tidak merespons. Coba lagi sebentar lagi.';
  return'Gagal ('+(c||'error')+'): '+((e&&e.message)||'')}
function steps(){
  const s={1:!!(curGroup()&&$('tg').value!==''),2:res.length>0&&!isDemo,3:written};
  document.querySelectorAll('.steps li').forEach(li=>li.classList.toggle('on',!!s[li.dataset.s]));
}

/* ---------- pencocokan nama ---------- */
const norm=s=>String(s||'').toLowerCase().replace(/[^a-z\s]/g,' ').replace(/\s+/g,' ').trim();
function bg(s){const t=' '+s+' ',o={};for(let i=0;i<t.length-1;i++){const g=t.slice(i,i+2);o[g]=(o[g]||0)+1}return o}
function dice(a,b){a=norm(a);b=norm(b);if(!a||!b)return 0;const x=bg(a),y=bg(b);let n=0,sx=0,sy=0;
  for(const k in x){sx+=x[k];if(y[k])n+=Math.min(x[k],y[k])}for(const k in y)sy+=y[k];return 2*n/(sx+sy)}
const num=v=>{if(v===null||v===undefined||v==='')return null;const n=+String(v).replace(/[^0-9.-]/g,'');return isFinite(n)&&String(v).match(/\d/)?n:null};
function match(master,rows){
  const pairs=[];
  master.forEach((m,i)=>rows.forEach((p,j)=>pairs.push([dice(m,p.operator),i,j])));
  pairs.sort((a,b)=>b[0]-a[0]);
  const mi={},pj={};
  pairs.forEach(([s,i,j])=>{if(s>=.55&&!(i in mi)&&!(j in pj)){mi[i]={j,s};pj[j]=1}});
  res=master.map((name,i)=>{const h=mi[i];const p=h?rows[h.j]:null;
    return{name,c20:p?num(p.c20):null,c40:p?num(p.c40):null,tot:p?num(p.total):null,found:!!p,score:h?h.s:0,paperName:p?p.operator:''}});
  extra=rows.filter((p,j)=>!(j in pj)&&(num(p.c20)!==null||num(p.c40)!==null));
}
function rowIssues(r){
  const e=[];
  if(!r.found)e.push(['m','Nama tidak ditemukan di kertas (kosong?)']);
  else if(r.score<.8)e.push(['w',`Dicocokkan dengan "${r.paperName}", cek`]);
  if(r.tot!==null){const s=(r.c20||0)+(r.c40||0);if(s!==r.tot)e.push(['e',`20"+40" = ${s}, di kertas ${r.tot}`])}
  return e;
}

/* ---------- struktur sheet ---------- */
function curGroup(){return groups[+$('grp').value]||null}
function masterNames(){const g=curGroup();return g?g.names:$('names').value.split('\n').map(s=>s.trim()).filter(Boolean)}
function parseGroups(rows){
  const out=[];let cur=null;
  rows.forEach((r,i)=>{
    const a=String((r&&r[0])??'').trim(),b=String((r&&r[1])??'').trim();
    if(/^group\b/i.test(a)){cur={label:a,header:i+1,names:[],rows:[],open:true};out.push(cur);return}
    if(cur&&cur.open){if(b){cur.names.push(b);cur.rows.push(i+1)}else if(cur.names.length)cur.open=false}
  });
  return out;
}
function fillSelect(el,items,ph){el.innerHTML=(ph?`<option value="">${esc(ph)}</option>`:'')+items.map(([v,t])=>`<option value="${esc(v)}">${esc(t)}</option>`).join('')}

async function connect(){
  if(!mcp){status('Koneksi ke Google Sheets tidak tersedia di tampilan ini. Anda masih bisa memakai daftar nama manual dan menyalin hasilnya.','err');return}
  status('Menghubungkan ke Google Sheets...','busy');
  try{
    const p=asObj(await call('get_spreadsheet',{spreadsheetId:sid(),fields:['properties.title','sheets.properties.title']}));
    tabs=(p.sheets||[]).map(s=>s.properties&&s.properties.title).filter(Boolean);
    if(!tabs.length){status('Spreadsheet terbaca tapi tidak ada tab.','err');return}
    fillSelect($('tab'),tabs.map(t=>[t,t]));
    await loadTab();
    status(`Terhubung ke "${(p.properties&&p.properties.title)||'spreadsheet'}". Pilih group dan tanggal, lalu unggah foto.`,'ok');
  }catch(e){status(errText(e),'err')}
}
async function loadTab(){
  tab=$('tab').value;plan=null;
  const ab=asObj(await call('get_values',{spreadsheetId:sid(),range:`${q(tab)}!A1:B150`}));
  const rows=ab.values||[];
  groups=parseGroups(rows);
  dates=[];
  const dr=rows.findIndex(r=>/^tanggal$/i.test(String((r&&r[0])??'').trim()));
  if(dr>=0){
    const d=asObj(await call('get_values',{spreadsheetId:sid(),range:`${q(tab)}!A${dr+1}:CZ${dr+1}`}));
    const row=(d.values||[[]])[0]||[];
    row.forEach((v,i)=>{const s=String(v??'').trim();if(i>=2&&/^\d{1,2}$/.test(s))dates.push({label:s,col:i})});
  }
  fillSelect($('grp'),groups.map((g,i)=>[i,`${g.label} (baris ${g.rows[0]}-${g.rows[g.rows.length-1]}, ${g.names.length} nama)`]));
  fillSelect($('tg'),dates.map((d,i)=>[i,`${d.label} (kolom ${colLetter(d.col)})`]),'pilih tanggal');
  if(paper){match(masterNames(),paper)}
  render();steps();
}

/* ---------- foto ---------- */
function setFile(f){
  file=f||null;const p=$('pv');
  if(file){p.src=URL.createObjectURL(file);p.hidden=false;$('dt').textContent=file.name||'Foto dipilih';$('read').disabled=!canImg;
    if(!canImg)status('Pembacaan foto tidak tersedia di tampilan ini. Gunakan data contoh.','err')}
  else{p.hidden=true;$('dt').innerHTML='<b>Pilih foto</b> atau seret ke sini';$('read').disabled=true}
}
async function shrink(f){
  try{const bm=await createImageBitmap(f);const m=2000,s=Math.min(1,m/Math.max(bm.width,bm.height));
    const c=document.createElement('canvas');c.width=Math.round(bm.width*s);c.height=Math.round(bm.height*s);
    c.getContext('2d').drawImage(bm,0,0,c.width,c.height);
    const b=await new Promise(r=>c.toBlob(r,'image/jpeg',.9));return b||f}catch(e){return f}
}
async function read(){
  if(!file||!sample)return;
  const master=masterNames();
  if(!master.length){status('Daftar nama masih kosong.','err');return}
  $('read').disabled=true;written=false;status('Claude sedang membaca formulir... (bisa sampai satu menit)','busy');
  const prompt=`Gambar adalah foto formulir kertas produksi operator alat di terminal petikemas. Foto mungkin terputar 90 derajat, baca dengan orientasi yang benar.
Ambil HANYA: nama operator tiap baris, kolom "JUMLAH" bagian 20" dan 40", kolom "TOTAL" di paling kanan untuk tiap baris, dan baris "TOTAL" paling bawah (jumlah 20", jumlah 40", total).
Abaikan kolom EXPORT, IMPORT, RELOKASI, FULL, EMPTY, dan kolom ALAT.
Kembalikan HANYA JSON:
{"rows":[{"operator":"","c20":null,"c40":null,"total":null}],"totals":{"c20":null,"c40":null,"total":null}}
Aturan: satu objek per baris operator yang namanya tertulis, urut dari atas. Angka berupa bilangan bulat; sel yang kosong atau tidak terbaca diisi null. Jangan menjumlah atau mengoreksi sendiri, salin apa adanya dari kertas. Tulis nama operator seperti tercetak di kertas.`;
  let ok=false;
  try{
    const img=await shrink(file);
    const d=await sample.json(prompt,{images:[img],modelTier:'default'});
    isDemo=false;
    paper=(d.rows||[]).map(r=>({operator:r.operator,c20:r.c20,c40:r.c40,total:r.total}));
    match(master,paper);paperTot=d.totals||null;render();
    status(`Terbaca ${paper.length} baris dari kertas.`,'ok');ok=true;
  }catch(e){status(e.code==='not_granted'?'Izin ke Claude ditolak. Anda masih bisa memakai data contoh.':'Gagal membaca ('+(e.code||'error')+'). Coba foto yang lebih jelas.','err')}
  finally{$('read').disabled=false}
  if(ok)await autoWrite();
}
async function autoWrite(){
  if(!$('auto').checked||!mcp||!curGroup())return;
  if($('tg').value===''){status('Foto terbaca. Pilih tanggal di panel Sheet, lalu klik Setujui dan tulis.','ok');return}
  await planP;
  if(!checksOk){status('Foto terbaca, tetapi pemeriksaan belum lolos, jadi tidak ditulis otomatis. Perbaiki angka yang bertanda, lalu klik Setujui dan tulis.','err');return}
  if(plan&&plan.some(p=>p.cells.some(c=>c.action==='write')))await go();
  else status('Tidak ada sel kosong yang perlu diisi untuk tanggal ini.','ok');
}

/* ---------- tabel hasil ---------- */
function render(){
  steps();
  if(!res.length){$('out').innerHTML='<p class="empty">Belum ada data. Pilih tanggal, unggah foto, lalu klik Baca dengan AI.</p>';return}
  const g=curGroup();
  $('out').innerHTML=`<div id="chk"></div><div class="tw"><table><thead><tr><th>${g?'Baris':'#'}</th><th>Nama</th><th>20"</th><th>40"</th><th>Pemeriksaan</th></tr></thead>
  <tbody>${res.map((r,i)=>`<tr data-i="${i}"><td class="r">${g?g.rows[i]:i+1}</td><td class="n">${esc(r.name)}</td>
  <td><input data-i="${i}" data-k="c20" inputmode="numeric" value="${r.c20??''}" aria-label="20 inci ${esc(r.name)}"></td>
  <td><input data-i="${i}" data-k="c40" inputmode="numeric" value="${r.c40??''}" aria-label="40 inci ${esc(r.name)}"></td><td class="m"></td></tr>`).join('')}</tbody>
  <tfoot><tr><td></td><td>Jumlah</td><td id="s20"></td><td id="s40"></td><td></td></tr></tfoot></table></div>
  <div><button class="nv" id="cp">Salin angka (20" dan 40")</button><button class="ln" id="cn">Salin dengan nama</button><button class="nv" id="xl">Unduh Excel</button></div>
  <div class="wr"><div class="wr-h"><h3>Tulis ke Sheet</h3>
  <label class="ck" style="margin:0"><input type="checkbox" id="ow"> Timpa angka yang sudah ada (rumus tidak pernah ditimpa)</label></div>
  <div id="plan"></div></div>`;
  refresh();updatePlan();
}
function refresh(){
  res.forEach((r,i)=>{const tr=document.querySelector(`tr[data-i="${i}"]`);if(!tr)return;const e=rowIssues(r);
    const bad=e.some(x=>x[0]==='e');
    tr.querySelectorAll('input').forEach(inp=>inp.className=bad?'err':(e.length?'warn':''));
    let h='';
    if(!r.found)h='<span class="chip mute">tidak ada di kertas</span>';
    else if(!e.length)h='<span class="chip ok">cocok</span>';
    else h=e.map(x=>`<span class="chip ${x[0]==='e'?'err':'warn'}">${x[0]==='e'?'tidak cocok':'cek nama'}</span>${esc(x[1])}`).join(' ');
    tr.querySelector('td.m').innerHTML=h});
  const s20=res.reduce((a,r)=>a+(r.c20||0),0),s40=res.reduce((a,r)=>a+(r.c40||0),0);
  $('s20').textContent=s20;$('s40').textContent=s40;
  const t20=paperTot&&paperTot.c20!=null?paperTot.c20:null,t40=paperTot&&paperTot.c40!=null?paperTot.c40:null;
  let ok=true,msgs=[];
  const tile=(l,s,t)=>{const m=t!==null&&s===t;if(t===null||!m)ok=false;
    return`<div class="tile ${m?'ok':(t===null?'':'bad')}"><span>${l}</span><b>${s}</b><small>${t===null?'baris TOTAL kertas tidak terbaca':'kertas '+t+(m?', cocok':', TIDAK cocok')}</small></div>`};
  const tiles=`<div class="tiles">${tile('Jumlah kolom 20"',s20,t20)}${tile('Jumlah kolom 40"',s40,t40)}</div>`;
  const bad=res.filter(r=>rowIssues(r).some(x=>x[0]==='e')).length;
  if(bad){ok=false;msgs.push(`${bad} baris tidak cocok dengan Total di kertas.`)}
  if(extra.length){ok=false;msgs.push('Baris di kertas yang tidak cocok dengan daftar nama: '+extra.map(x=>`${x.operator} (${x.c20??'-'}/${x.c40??'-'})`).join(', '))}
  checksOk=ok;
  $('chk').innerHTML=tiles+(msgs.length?`<div class="msgs">${msgs.map(esc).join('<br>')}</div>`:'');
}

/* ---------- salin / unduh ---------- */
const dateLabel=()=>{const i=$('tg').value;return i!==''&&dates[+i]?dates[+i].label:''};
function lines(withName){return res.map(r=>(withName?r.name+'\t':'')+(r.c20??'')+'\t'+(r.c40??'')).join('\n')}
async function copy(t){try{await navigator.clipboard.writeText(t);status('Tersalin. Tempel di kolom tanggal '+dateLabel()+' pada sheet Anda.','ok')}catch(e){
  const ta=document.createElement('textarea');ta.value=t;document.body.appendChild(ta);ta.select();try{document.execCommand('copy');status('Tersalin.','ok')}catch(_){status('Gagal menyalin, salin manual dari tabel.','err')}ta.remove()}}
async function xlsx(){
  if(!downloads||!window.XLSX){status('Unduh Excel tidak tersedia di tampilan ini. Pakai tombol salin.','err');return}
  const aoa=[['Tanggal',dateLabel(),'Shift',$('sh').value],[],['No','Nama','20"','40"'],...res.map((r,i)=>[i+1,r.name,r.c20??'',r.c40??''])];
  const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(aoa),'Produksi '+dateLabel());
  const buf=XLSX.write(wb,{bookType:'xlsx',type:'array'});
  try{await downloads.save({filename:`produksi-tgl-${dateLabel()||'x'}.xlsx`,data:new Blob([buf],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'})});status('File siap disimpan.','ok')}catch(e){status('Unduhan dibatalkan.')}
}

/* ---------- tulis ke Sheet ---------- */
function cellState(c){
  const v=c&&c.userEnteredValue;
  if(!v)return{kind:'empty',val:''};
  if(v.formulaValue!==undefined)return{kind:'formula',val:v.formulaValue};
  if(v.numberValue!==undefined)return{kind:'value',val:v.numberValue};
  if(v.stringValue!==undefined&&v.stringValue!=='')return{kind:'value',val:v.stringValue};
  if(v.boolValue!==undefined)return{kind:'value',val:v.boolValue};
  return{kind:'empty',val:''};
}
async function readTarget(g,dc){
  const first=g.rows[0],last=g.rows[g.rows.length-1];
  const rng=`${q(tab)}!${colLetter(dc)}${first}:${colLetter(dc+2)}${last}`;
  const p=asObj(await call('get_spreadsheet',{spreadsheetId:sid(),includeGridData:true,ranges:[rng],fields:['sheets.data.rowData.values.userEnteredValue']}));
  const rd=(((p.sheets||[])[0]||{}).data||[])[0];
  const rows=(rd&&rd.rowData)||[];
  return g.rows.map(r=>{const vals=(rows[r-first]&&rows[r-first].values)||[];return[0,1,2].map(k=>cellState(vals[k]))});
}
async function buildPlan(){
  const g=curGroup(),di=$('tg').value;
  if(!g||di==='')throw{code:'local',message:'Pilih group dan tanggal dulu.'};
  const dc=dates[+di].col;
  const cur=await readTarget(g,dc);
  const shift=$('sh').value.trim(),ow=!!($('ow')&&$('ow').checked);
  const out=[];
  res.forEach((r,i)=>{
    if(r.c20===null&&r.c40===null)return;
    const row=g.rows[i],want=[];
    if(shift)want.push([0,/^\d+$/.test(shift)?+shift:shift]);
    if(r.c20!==null)want.push([1,r.c20]);
    if(r.c40!==null)want.push([2,r.c40]);
    const cells=want.map(([k,v])=>{
      const ex=cur[i][k];let action='write',reason='kosong, akan diisi';
      if(ex.kind==='formula'){action='skip';reason='berisi rumus'}
      else if(ex.kind!=='empty'){
        if(String(ex.val)===String(v)){action='skip';reason='sudah sama'}
        else if(!ow){action='skip';reason='sudah terisi'}
        else reason='ditimpa'}
      return{col:dc+k,addr:colLetter(dc+k)+row,row,old:ex.kind==='empty'?'':ex.val,val:v,action,reason};
    });
    out.push({row,name:r.name,cells});
  });
  return out;
}
const sig=p=>p.flatMap(x=>x.cells.filter(c=>c.action==='write').map(c=>c.addr+'='+c.val)).join('|');
function planHint(){
  if(isDemo)return['Mode contoh tidak ditulis ke Sheet. Baca foto sungguhan untuk menulis.',''];
  if(!mcp||!curGroup())return['Sheet belum terhubung. Klik Muat ulang dari Sheet, atau salin angka secara manual.','err'];
  if($('tg').value==='')return['Pilih tanggal di panel Sheet untuk melihat sel yang akan diisi.',''];
  return null;
}
function updatePlan(){planP=(async()=>{
  const t=++planTok;plan=null;const el=$('plan');if(!el)return;
  const h=planHint();
  if(h){el.innerHTML=`<p class="hint ${h[1]}">${esc(h[0])}</p>`;return}
  el.innerHTML='<p class="hint">Membaca isi sel tujuan di Sheet...</p>';
  try{const p=await buildPlan();if(t!==planTok)return;plan=p;renderPlan()}
  catch(e){if(t!==planTok)return;el.innerHTML=`<p class="hint err">${esc(e.code==='local'?e.message:errText(e))}</p>`}
})();return planP}
function schedulePlan(){if(busy)return;plan=null;const el=$('plan');if(el)el.innerHTML='<p class="hint">Memperbarui rincian...</p>';clearTimeout(planTimer);planTimer=setTimeout(updatePlan,450)}
function renderPlan(done){
  const el=$('plan');if(!el||!plan)return;
  const all=plan.flatMap(p=>p.cells.map(c=>({...c,name:p.name})));
  const w=all.filter(c=>c.action==='write').length,s=all.length-w;
  const none=res.filter(r=>r.c20===null&&r.c40===null).length;
  const dc=dates[+$('tg').value].col;
  el.innerHTML=`<div class="sum">Tanggal <b>${esc(dateLabel())}</b>, tab ${esc(tab)}, kolom ${colLetter(dc)} sampai ${colLetter(dc+2)}. <b>${w}</b> sel akan ditulis, <b>${s}</b> dilewati, ${none} baris tanpa angka tidak disentuh.${done?' <b>Penulisan selesai.</b>':''}</div>
  <div class="tw" style="max-height:340px;overflow:auto"><table class="pl"><thead><tr><th>Sel</th><th>Nama</th><th>Sekarang</th><th>Jadi</th><th>Status</th></tr></thead><tbody>
  ${all.map(c=>`<tr><td class="${c.action==='write'?'w':'sk'}">${c.addr}</td><td class="${c.action==='write'?'':'sk'}">${esc(c.name)}</td><td class="sk">${esc(c.old)}</td><td class="${c.action==='write'?'w':'sk'}">${esc(c.val)}</td><td class="${c.action==='write'?'':'sk'}">${esc(c.reason)}</td></tr>`).join('')}
  </tbody></table></div>
  ${!done&&w?`${checksOk?'':'<label class="ck"><input type="checkbox" id="force"> Pemeriksaan belum lolos, saya sudah memeriksa dan tetap ingin menulis</label>'}
  <button class="pri" id="go">Setujui dan tulis ${w} sel</button>`:''}`;
}
async function go(){
  if(busy||!plan)return;
  if(!checksOk&&!($('force')&&$('force').checked)){status('Centang konfirmasi dulu karena pemeriksaan belum lolos.','err');return}
  busy=true;const gb=$('go');if(gb)gb.disabled=true;
  try{
    status('Memeriksa ulang sel tujuan sebelum menulis...','busy');
    const fresh=await buildPlan();
    if(sig(fresh)!==sig(plan)){plan=fresh;renderPlan();status('Isi sheet berubah sejak rincian dibuat. Periksa rincian terbaru, lalu setujui lagi.','err');return}
    const runs=[];
    plan.forEach(p=>{
      const ws=p.cells.filter(c=>c.action==='write').sort((a,b)=>a.col-b.col);
      let cur=null;
      ws.forEach(c=>{if(cur&&c.col===cur.end+1){cur.end=c.col;cur.vals.push(c.val)}else{cur={row:p.row,start:c.col,end:c.col,vals:[c.val]};runs.push(cur)}});
    });
    let n=0,i=0;
    for(const r of runs){
      status(`Menulis ${++i} dari ${runs.length}...`,'busy');
      const a=colLetter(r.start)+r.row,b=colLetter(r.end)+r.row;
      try{await call('update_values',{spreadsheetId:sid(),range:`${q(tab)}!${a}${r.start===r.end?'':':'+b}`,values:[r.vals]});n+=r.vals.length}
      catch(e){plan=await buildPlan().catch(()=>null);renderPlan();status(`Berhenti di ${a}: ${errText(e)} ${n} sel sudah tertulis sebelumnya, rincian menunjukkan kondisi terbaru. Tidak diulang otomatis.`,'err');return}
    }
    try{await mcp.invalidate()}catch(e){}
    plan=await buildPlan();
    const ok=plan.every(p=>p.cells.every(c=>c.action==='skip'));
    written=ok;renderPlan(true);steps();
    status(ok?`Selesai: ${n} sel ditulis ke tanggal ${dateLabel()} dan sudah dicek ulang dari Sheet.`:`Selesai menulis ${n} sel, tetapi ada sel yang belum sesuai saat dicek ulang. Periksa rincian.`,ok?'ok':'err');
  }catch(e){status(e.code==='local'?e.message:errText(e),'err')}
  finally{busy=false;const b=$('go');if(b)b.disabled=false}
}

/* ---------- data contoh ---------- */
const DEMO=[['Julham Oktavia Hasibuan',4,11,15],['MHD Afdillah Fauzi',16,11,27],['Sarwedi Siringo-ringo',32,null,32],['Ramot Manurung',26,6,32],['Haris Syahputra Pulungan',20,6,26],['M. Agus Suhendra',6,8,14],['Ibrahim',8,10,18],['Syahrizal',16,6,22],['Sudirman Sagala',16,10,26],['Putra Iskandar Muda',23,3,26],['Wahyudi Nasution',6,9,15],['Erwin Siagian',34,6,40],['Muhammad Andika',12,7,19],['Dede Rinaldi',39,2,41],['Riyan Rivaldi',7,8,15],['Irsan',2,6,8],['Ridwan Zulhendra Simarmata',10,1,11],['Bagus Abdillah',16,6,22],['Agus Suriwayadi',32,3,35],['Doni Tri Pendi Purba',27,5,32]];
function demo(){
  isDemo=true;written=false;
  paper=DEMO.map(d=>({operator:d[0],c20:d[1],c40:d[2],total:d[3]}));
  match(masterNames(),paper);
  paperTot={c20:352,c40:124,total:476};render();status('Data contoh dimuat dari formulir yang sudah diverifikasi. Mode contoh tidak menulis ke Sheet.','ok');
}

/* ---------- event ---------- */
$('fi').onchange=e=>setFile(e.target.files[0]);
const dz=$('drop');
['dragenter','dragover'].forEach(ev=>dz.addEventListener(ev,e=>{e.preventDefault();dz.classList.add('over')}));
['dragleave','drop'].forEach(ev=>dz.addEventListener(ev,e=>{e.preventDefault();dz.classList.remove('over')}));
dz.addEventListener('drop',e=>{const f=e.dataTransfer&&e.dataTransfer.files[0];if(f&&f.type.startsWith('image/'))setFile(f)});
$('read').onclick=read;$('demo').onclick=demo;$('load').onclick=connect;
$('tab').onchange=()=>loadTab().catch(e=>status(errText(e),'err'));
$('grp').onchange=()=>{if(paper)match(masterNames(),paper);render()};
$('names').oninput=()=>{if(!curGroup()&&paper){match(masterNames(),paper);render()}};
['tg','sh'].forEach(id=>$(id).addEventListener('input',()=>{steps();if(res.length)schedulePlan()}));
$('out').addEventListener('input',e=>{const t=e.target;
  if(t.id==='ow'){schedulePlan();return}
  if(!t.dataset.k)return;const r=res[+t.dataset.i];r[t.dataset.k]=num(t.value);refresh();schedulePlan()});
$('out').addEventListener('click',e=>{const id=e.target.id;
  if(id==='cp')copy(lines(false));if(id==='cn')copy(lines(true));if(id==='xl')xlsx();if(id==='go')go()});

(async()=>{
  try{downloads=await claude.use('downloads')}catch(e){}
  try{sample=await claude.use('sample');if(sample){const l=await sample.limits().catch(()=>null);canImg=!!(l&&l.images);if(file)$('read').disabled=!canImg}}catch(e){}
  try{mcp=await claude.use('mcp')}catch(e){}
  await connect();
  if(!sample)status('Pembacaan foto tidak tersedia di tampilan ini. Anda bisa mencoba dengan data contoh.','err');
  steps();
})();
