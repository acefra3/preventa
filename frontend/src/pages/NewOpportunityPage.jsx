import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../services/api';
import { useAuthStore } from '../store/auth.store';
import toast from 'react-hot-toast';

// ── Scoring maps ──────────────────────────────────────────────
const BANT_PTS = {
  b: { confirmed:25, process:15, exploring:5, none:0 },
  a: { cxo:25, mgr:15, tech:8, unk:0 },
  n: { critical:25, clear:16, exploring:8, none:0 },
  t: { now:25, short:18, mid:10, long:0 },
};
const MEDDIC_PTS = {
  m:{yes:15,partial:8,no:0}, e:{yes:15,partial:8,no:0},
  d:{yes:10,partial:5,no:0}, d2:{yes:10,partial:5,no:0},
  i:{yes:5,partial:3,no:0},  c:{yes:5,partial:3,no:0},
};
const GPCT_PTS = {
  g:{yes:8,partial:4,no:0}, p:{yes:8,partial:4,no:0},
  c:{yes:6,partial:3,no:0}, ci:{yes:10,partial:5,no:0},
};

function calcBant(b) {
  return (BANT_PTS.b[b.b]||0)+(BANT_PTS.a[b.a]||0)+(BANT_PTS.n[b.n]||0)+(BANT_PTS.t[b.t]||0);
}
function calcMeddic(m) {
  return Object.entries(MEDDIC_PTS).reduce((s,[k])=>s+(MEDDIC_PTS[k][m[k]]||0),0);
}
function calcGpct(g) {
  return Object.entries(GPCT_PTS).reduce((s,[k])=>s+(GPCT_PTS[k][g[k]]||0),0);
}
function calcComposite(bant,meddic,gpct) {
  return Math.round(bant*0.35 + (meddic/60*100)*0.40 + (gpct/40*100)*0.25);
}

// ── Sub-components ─────────────────────────────────────────────
function StepIndicator({ step, current }) {
  const steps = ['Info','BANT','Documentos','MEDDIC','GPCTBA','Resumen'];
  return (
    <div className="flex items-center mb-8 overflow-x-auto">
      {steps.map((s,i) => {
        const n = i+1;
        const done   = n < current;
        const active = n === current;
        return (
          <div key={s} className="flex items-center flex-shrink-0">
            <div className="flex flex-col items-center gap-1">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium border-2 transition-all
                ${done   ? 'bg-green-100 border-green-600 text-green-700'
                : active ? 'bg-bt-blue border-bt-blue text-white'
                :          'bg-white border-gray-200 text-gray-400'}`}>
                {done ? '✓' : n}
              </div>
              <span className={`text-xs whitespace-nowrap ${active?'text-bt-blue font-medium':done?'text-green-700':'text-gray-400'}`}>
                {s}
              </span>
            </div>
            {i < steps.length-1 && (
              <div className={`h-0.5 w-10 mx-1 mb-4 flex-shrink-0 ${done?'bg-green-500':'bg-gray-200'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function RadioOption({ label, desc, points, selected, onClick, color='blue' }) {
  const colors = {
    green: 'border-green-600 bg-green-50',
    amber: 'border-amber-600 bg-amber-50',
    blue:  'border-bt-blue bg-bt-blue-light',
    red:   'border-red-600 bg-red-50',
    gray:  'border-gray-400 bg-gray-50',
  };
  const ptColors = { green:'bg-green-100 text-green-800', amber:'bg-amber-100 text-amber-800',
    blue:'bg-blue-100 text-blue-800', red:'bg-red-100 text-red-800', gray:'bg-gray-100 text-gray-600' };
  return (
    <div onClick={onClick}
      className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all
        ${selected ? colors[color] : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'}`}>
      <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 mt-0.5 flex items-center justify-center
        ${selected ? 'border-bt-blue' : 'border-gray-300'}`}>
        {selected && <div className="w-2 h-2 rounded-full bg-bt-blue" />}
      </div>
      <div className="flex-1">
        <div className="text-xs font-medium text-gray-800">{label}</div>
        {desc && <div className="text-xs text-gray-500 mt-0.5">{desc}</div>}
      </div>
      {points !== undefined && (
        <span className={`badge text-xs flex-shrink-0 ${ptColors[color]}`}>{points} pts</span>
      )}
    </div>
  );
}

function YNButtons({ value, onChange, opts }) {
  const cls = {
    yes:     'border-green-600 bg-green-50 text-green-800',
    partial: 'border-amber-500 bg-amber-50 text-amber-800',
    no:      'border-red-500 bg-red-50 text-red-700',
  };
  return (
    <div className="flex gap-2 mt-1">
      {opts.map(o => (
        <button key={o.val} onClick={() => onChange(o.val)}
          className={`flex-1 py-2 rounded-lg border text-xs font-medium transition-all
            ${value===o.val ? cls[o.val]||'border-bt-blue bg-bt-blue-light text-bt-blue'
            : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function ScoreBar({ label, value, max, color }) {
  const pct = Math.round(value/max*100);
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="font-medium text-gray-700">{label}</span>
        <span className="text-gray-500">{value}/{max}</span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width:`${pct}%`, background:color }} />
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────
export default function NewOpportunityPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user } = useAuthStore();

  const [step, setStep] = useState(1);

  // Step 1 — Info general
  const [info, setInfo] = useState({
    name:'', client:'', description:'',
    priority:'media', proposalType:'', estimatedValue:'',
    startDate:'', endDate:'',
    country:'', brand:'',
  });

  // Step 2 — BANT
  const [bant, setBant] = useState({ b:null, a:null, n:null, t:null,
    budgetRange:'', contactName:'', needPain:'', timelineNotes:'' });

  // Step 3 — Docs
  const [docs, setDocs] = useState({ link:'', linkDesc:'', files:[] });

  // Step 4 — MEDDIC
  const [meddic, setMeddic] = useState({
    m:null,e:null,d:null,d2:null,i:null,c:null,
    mn_m:'',mn_e:'',mn_d:'',mn_d2:'',mn_c:'',
  });

  // Step 5 — GPCTBA
  const [gpct, setGpct] = useState({
    g:null,p:null,c:null,ci:null,
    gn_g:'',gn_p:'',gn_c:'',gn_ci:'',
  });

  const bantScore    = calcBant(bant);
  const meddicScore  = calcMeddic(meddic);
  const gpctScore    = calcGpct(gpct);
  const composite    = calcComposite(bantScore, meddicScore, gpctScore);

  function classification(score) {
    if (score>=78) return { label:'Venta muy probable', cls:'bg-green-100 text-green-800', color:'#3B6D11' };
    if (score>=58) return { label:'Oportunidad sólida', cls:'bg-blue-100 text-blue-800', color:'#185FA5' };
    if (score>=38) return { label:'Lead tibio — madurar', cls:'bg-amber-100 text-amber-800', color:'#854F0B' };
    return { label:'Lead frío', cls:'bg-red-100 text-red-800', color:'#A32D2D' };
  }

  const cls = classification(composite);

  // Validate steps
  function canProceed() {
    if (step===1) return info.name && info.client && info.startDate && info.endDate && info.priority && info.country && info.brand;
    if (step===2) return bant.b && bant.a && bant.n && bant.t;
    if (step===3) return docs.link.trim().length > 0;
    if (step===4) return Object.values({m:meddic.m,e:meddic.e,d:meddic.d,d2:meddic.d2,i:meddic.i,c:meddic.c}).every(Boolean);
    if (step===5) return gpct.g && gpct.p && gpct.c && gpct.ci;
    return true;
  }

  // Submit
  const createMut = useMutation({
    mutationFn: async () => {
      // 1. Crear propuesta
      const { data: prop } = await api.post('/proposals', {
        name:           info.name,
        clientName:     info.client,
        description:    info.description,
        priority:       info.priority,
        proposalType:   info.proposalType,
        estimatedValue: info.estimatedValue,
        startDate:      info.startDate,
        endDate:        info.endDate,
        country:        info.country,
        brand:          info.brand,
        bantScore,
        meddicScore,
        gpctScore,
        compositeScore: composite,
        bantData:  bant,
        meddicData: meddic,
        gpctData:  gpct,
      });
      // 2. Si hay link, adjuntarlo
      if (docs.link.trim()) {
        await api.post(`/documents/link/${prop.id}`, {
          externalUrl: docs.link,
          description: docs.linkDesc || 'Documento inicial',
          isFinal: false,
          iterationRef: 0,
        });
      }
      return prop;
    },
    onSuccess: (prop) => {
      qc.invalidateQueries(['proposals']);
      toast.success('Oportunidad registrada exitosamente');
      navigate('/proposals');
    },
    onError: e => toast.error(e.response?.data?.error || 'Error al crear la propuesta'),
  });

  function next() { if (canProceed()) setStep(s=>s+1); else toast.error('Completa los campos requeridos'); }
  function prev() { setStep(s=>s-1); }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-medium">Nueva oportunidad</h1>
          <p className="text-xs text-gray-500 mt-0.5">
            Prospección completa: BANT + MEDDIC + GPCTBA
          </p>
        </div>
        <button onClick={() => navigate(-1)} className="text-xs text-gray-400 hover:text-gray-700">
          ✕ Cancelar
        </button>
      </div>

      <StepIndicator step={step} current={step} />

      {/* ── STEP 1: Info general ───────────────────────────────── */}
      {step===1 && (
        <div className="card p-6 space-y-4">
          <h2 className="text-sm font-medium text-gray-700 mb-2">Información de la oportunidad</h2>

          <div>
            <label className="label">Nombre de la propuesta <span className="text-red-500">*</span></label>
            <input className="input" placeholder="Ej: Migración plataforma datos Azure"
              value={info.name} onChange={e=>setInfo(p=>({...p,name:e.target.value}))} />
          </div>
          <div>
            <label className="label">Cliente <span className="text-red-500">*</span></label>
            <input className="input" placeholder="Nombre del cliente"
              value={info.client} onChange={e=>setInfo(p=>({...p,client:e.target.value}))} />
          </div>
          <div>
            <label className="label">Descripción / alcance</label>
            <textarea className="input h-20" placeholder="Describe el contexto, tecnologías y objetivo principal…"
              value={info.description} onChange={e=>setInfo(p=>({...p,description:e.target.value}))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">País <span className="text-red-500">*</span></label>
              <select className="input" value={info.country}
                onChange={e=>setInfo(p=>({...p,country:e.target.value}))}>
                <option value="">Seleccionar país…</option>
                <option value="colombia">🇨🇴 Colombia</option>
                <option value="peru">🇵🇪 Perú</option>
              </select>
            </div>
            <div>
              <label className="label">Marca / Unidad de negocio <span className="text-red-500">*</span></label>
              <select className="input" value={info.brand}
                onChange={e=>setInfo(p=>({...p,brand:e.target.value}))}>
                <option value="">Seleccionar…</option>
                <option value="bluetab">Bluetab</option>
                <option value="ibm">IBM</option>
              </select>
            </div>
            <div>
              <label className="label">Criticidad <span className="text-red-500">*</span></label>
              <select className="input" value={info.priority}
                onChange={e=>setInfo(p=>({...p,priority:e.target.value}))}>
                <option value="critica">Crítica — &lt;10 días</option>
                <option value="alta">Alta — 10–30 días</option>
                <option value="media">Media — 30–60 días</option>
                <option value="baja">Baja — +60 días</option>
              </select>
            </div>
            <div>
              <label className="label">Tipo de propuesta</label>
              <select className="input" value={info.proposalType}
                onChange={e=>setInfo(p=>({...p,proposalType:e.target.value}))}>
                <option value="">Seleccionar…</option>
                <option>Arquitectura de datos</option>
                <option>Cloud migration</option>
                <option>Analytics & BI</option>
                <option>Data governance</option>
                <option>MLOps / IA</option>
                <option>Transformación digital</option>
                <option>Otro</option>
              </select>
            </div>
            <div>
              <label className="label">Fecha inicio <span className="text-red-500">*</span></label>
              <input type="date" className="input"
                value={info.startDate} onChange={e=>setInfo(p=>({...p,startDate:e.target.value}))} />
            </div>
            <div>
              <label className="label">Fecha límite entrega <span className="text-red-500">*</span></label>
              <input type="date" className="input"
                value={info.endDate} onChange={e=>setInfo(p=>({...p,endDate:e.target.value}))} />
            </div>
            <div className="col-span-2">
              <label className="label">Valor estimado del proyecto</label>
              <input className="input" placeholder="Ej: USD 150,000"
                value={info.estimatedValue} onChange={e=>setInfo(p=>({...p,estimatedValue:e.target.value}))} />
            </div>
          </div>
        </div>
      )}

      {/* ── STEP 2: BANT ──────────────────────────────────────── */}
      {step===2 && (
        <div className="card p-6 space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium">Prospección BANT</h2>
            <span className={`badge text-xs px-2 py-1 ${bantScore>=75?'bg-green-100 text-green-800':bantScore>=50?'bg-amber-100 text-amber-800':'bg-red-100 text-red-700'}`}>
              Score: {bantScore}/100
            </span>
          </div>

          {/* Budget */}
          <div>
            <label className="label font-medium text-gray-700">💰 B — Budget (Presupuesto)</label>
            <div className="space-y-1.5">
              <RadioOption label="Aprobado y disponible" desc="Dinero asignado formalmente" points={25}
                selected={bant.b==='confirmed'} color="green"
                onClick={()=>setBant(p=>({...p,b:'confirmed'}))} />
              <RadioOption label="En proceso de aprobación" desc="Existe pero no formalizado" points={15}
                selected={bant.b==='process'} color="amber"
                onClick={()=>setBant(p=>({...p,b:'process'}))} />
              <RadioOption label="Explorando / sin confirmar" points={5}
                selected={bant.b==='exploring'} color="gray"
                onClick={()=>setBant(p=>({...p,b:'exploring'}))} />
              <RadioOption label="Sin presupuesto identificado" points={0}
                selected={bant.b==='none'} color="red"
                onClick={()=>setBant(p=>({...p,b:'none'}))} />
            </div>
          </div>

          {/* Authority */}
          <div>
            <label className="label font-medium text-gray-700">👤 A — Authority (Autoridad)</label>
            <div className="space-y-1.5">
              <RadioOption label="C-Level / VP / Director" desc="Decisor con poder de firma" points={25}
                selected={bant.a==='cxo'} color="green"
                onClick={()=>setBant(p=>({...p,a:'cxo'}))} />
              <RadioOption label="Gerente / Jefe de área" desc="Influye pero requiere aprobación" points={15}
                selected={bant.a==='mgr'} color="amber"
                onClick={()=>setBant(p=>({...p,a:'mgr'}))} />
              <RadioOption label="Técnico / Analista" points={8}
                selected={bant.a==='tech'} color="gray"
                onClick={()=>setBant(p=>({...p,a:'tech'}))} />
              <RadioOption label="Sin contacto identificado" points={0}
                selected={bant.a==='unk'} color="red"
                onClick={()=>setBant(p=>({...p,a:'unk'}))} />
            </div>
            <input className="input mt-2 text-xs" placeholder="Nombre del contacto principal"
              value={bant.contactName} onChange={e=>setBant(p=>({...p,contactName:e.target.value}))} />
          </div>

          {/* Need */}
          <div>
            <label className="label font-medium text-gray-700">💡 N — Need (Necesidad)</label>
            <div className="space-y-1.5">
              <RadioOption label="Crítica y urgente documentada" desc="Pain point claro, consecuencias de no actuar" points={25}
                selected={bant.n==='critical'} color="green"
                onClick={()=>setBant(p=>({...p,n:'critical'}))} />
              <RadioOption label="Clara pero no urgente" points={16}
                selected={bant.n==='clear'} color="amber"
                onClick={()=>setBant(p=>({...p,n:'clear'}))} />
              <RadioOption label="Explorando / difusa" points={8}
                selected={bant.n==='exploring'} color="gray"
                onClick={()=>setBant(p=>({...p,n:'exploring'}))} />
              <RadioOption label="Sin necesidad identificada" points={0}
                selected={bant.n==='none'} color="red"
                onClick={()=>setBant(p=>({...p,n:'none'}))} />
            </div>
            <textarea className="input mt-2 text-xs h-16"
              placeholder="Describe el pain point principal del cliente…"
              value={bant.needPain} onChange={e=>setBant(p=>({...p,needPain:e.target.value}))} />
          </div>

          {/* Timeline */}
          <div>
            <label className="label font-medium text-gray-700">📅 T — Timeline (Tiempo)</label>
            <div className="space-y-1.5">
              <RadioOption label="Decisión en menos de 30 días" points={25}
                selected={bant.t==='now'} color="green"
                onClick={()=>setBant(p=>({...p,t:'now'}))} />
              <RadioOption label="1 a 3 meses" points={18}
                selected={bant.t==='short'} color="amber"
                onClick={()=>setBant(p=>({...p,t:'short'}))} />
              <RadioOption label="3 a 6 meses" points={10}
                selected={bant.t==='mid'} color="gray"
                onClick={()=>setBant(p=>({...p,t:'mid'}))} />
              <RadioOption label="Sin definir / más de 6 meses" points={0}
                selected={bant.t==='long'} color="red"
                onClick={()=>setBant(p=>({...p,t:'long'}))} />
            </div>
          </div>

          {/* Score visual */}
          <div className="bg-gray-50 rounded-lg p-3 space-y-2">
            <ScoreBar label="Budget"    value={BANT_PTS.b[bant.b]||0} max={25} color="#3B6D11" />
            <ScoreBar label="Authority" value={BANT_PTS.a[bant.a]||0} max={25} color="#185FA5" />
            <ScoreBar label="Need"      value={BANT_PTS.n[bant.n]||0} max={25} color="#EF9F27" />
            <ScoreBar label="Timeline"  value={BANT_PTS.t[bant.t]||0} max={25} color="#534AB7" />
          </div>
        </div>
      )}

      {/* ── STEP 3: Docs ──────────────────────────────────────── */}
      {step===3 && (
        <div className="card p-6 space-y-4">
          <h2 className="text-sm font-medium text-gray-700">Documentación de la oportunidad</h2>
          <p className="text-xs text-gray-500">
            Pega el enlace de Drive o SharePoint donde están los documentos del cliente. <strong>Campo obligatorio</strong> para continuar.
          </p>

          {/* Link a Drive */}
          <div>
            <label className="label">
              Enlace al documento (Drive / SharePoint) <span className="text-red-500">*</span>
            </label>
            <input className="input" placeholder="https://drive.google.com/..."
              value={docs.link} onChange={e=>setDocs(p=>({...p,link:e.target.value}))}
              style={{ borderColor: !docs.link.trim() ? '#FCA5A5' : '' }} />
            {!docs.link.trim() && (
              <p className="text-xs text-red-500 mt-1">
                ⚠️ Debes ingresar la URL del documento para continuar.
              </p>
            )}
          </div>
          <div>
            <label className="label">Descripción del documento</label>
            <input className="input" placeholder="Ej: RFP cliente, brief técnico, anexo de requisitos…"
              value={docs.linkDesc} onChange={e=>setDocs(p=>({...p,linkDesc:e.target.value}))} />
          </div>

          {docs.link && (
            <div className="flex items-center gap-2 p-2.5 bg-green-50 border border-green-200 rounded-lg">
              <span className="text-green-600">🔗</span>
              <span className="text-xs text-green-800 flex-1 truncate">{docs.link}</span>
              <span className="badge bg-green-100 text-green-700 text-xs">
                {docs.link.includes('drive.google') ? 'Google Drive'
                 : docs.link.includes('sharepoint') ? 'SharePoint'
                 : 'Enlace externo'}
              </span>
            </div>
          )}

          <div className="border-t pt-3">
            <p className="text-xs text-gray-400">
              💡 La subida de archivos directos estará disponible una vez la propuesta sea creada,
              desde el detalle de la propuesta.
            </p>
          </div>
        </div>
      )}

      {/* ── STEP 4: MEDDIC ────────────────────────────────────── */}
      {step===4 && (
        <div className="card p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium">Clasificación MEDDIC</h2>
            <span className={`badge text-xs px-2 py-1 ${meddicScore>=45?'bg-green-100 text-green-800':meddicScore>=30?'bg-amber-100 text-amber-800':'bg-red-100 text-red-700'}`}>
              {meddicScore}/60
            </span>
          </div>

          {[
            { key:'m', letter:'M', title:'Metrics', color:'#3B6D11',
              q:'¿Tienen indicadores de éxito y ROI definidos para el proyecto?',
              ph:'Ej: Reducir time-to-insight de 5 días a 4h, ROI esperado 3x en 18 meses…',
              noteKey:'mn_m', pts:MEDDIC_PTS.m },
            { key:'e', letter:'E', color:'#185FA5',
              title:'Economic Buyer',
              q:'¿Hay impacto financiero claro si no resuelven el problema?',
              ph:'Ej: Pérdidas de $2M/año por datos inconsistentes…',
              noteKey:'mn_e', pts:MEDDIC_PTS.e },
            { key:'d', letter:'D', color:'#854F0B',
              title:'Decision Criteria',
              q:'¿Existe una partida asignada o capacidad de movimiento de fondos?',
              ph:'Ej: CFO confirmó partida CAPEX Q3 por $300K…',
              noteKey:'mn_d', pts:MEDDIC_PTS.d },
            { key:'d2', letter:'D2', color:'#A32D2D',
              title:'Decision Process',
              q:'¿Conocemos a todos los firmantes y los tiempos de legal/compras?',
              ph:'Ej: CTO firma técnico, CFO firma financiero, legal tarda ~3 semanas…',
              noteKey:'mn_d2', pts:MEDDIC_PTS.d2 },
            { key:'i', letter:'I', color:'#085041',
              title:'Identify Pain',
              q:'¿El proyecto es para ejecución inmediata (este trimestre)?',
              noteKey:null, pts:MEDDIC_PTS.i },
            { key:'c', letter:'C', color:'#26215C',
              title:'Champion',
              q:'¿Hay alguien interno con influencia vendiendo por nosotros?',
              ph:'Ej: El Director de Datos ya usó Bluetab y nos recomienda internamente…',
              noteKey:'mn_c', pts:MEDDIC_PTS.c },
          ].map(dim => (
            <div key={dim.key} className="border border-gray-200 rounded-lg overflow-hidden">
              <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 border-b border-gray-200">
                <span className="w-6 h-6 rounded text-xs font-medium flex items-center justify-center flex-shrink-0"
                  style={{ background: dim.color+'22', color: dim.color }}>{dim.letter}</span>
                <span className="text-xs font-medium text-gray-800 flex-1">{dim.title} — {dim.q}</span>
                <span className={`badge text-xs ${meddic[dim.key] ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-500'}`}>
                  {MEDDIC_PTS[dim.key][meddic[dim.key]]||0} pts
                </span>
              </div>
              <div className="p-3">
                <YNButtons value={meddic[dim.key]}
                  onChange={v => setMeddic(p=>({...p,[dim.key]:v}))}
                  opts={[
                    { val:'yes',     label:`Sí (+${dim.pts.yes})` },
                    { val:'partial', label:`Parcial (+${dim.pts.partial})` },
                    { val:'no',      label:'No (0)' },
                  ]} />
                {dim.noteKey && (
                  <textarea className="input mt-2 text-xs h-12"
                    placeholder={dim.ph||''}
                    value={meddic[dim.noteKey]}
                    onChange={e=>setMeddic(p=>({...p,[dim.noteKey]:e.target.value}))} />
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── STEP 5: GPCTBA ────────────────────────────────────── */}
      {step===5 && (
        <div className="card p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium">GPCTBA / C&I</h2>
            <span className={`badge text-xs px-2 py-1 ${gpctScore>=30?'bg-green-100 text-green-800':gpctScore>=20?'bg-amber-100 text-amber-800':'bg-red-100 text-red-700'}`}>
              {gpctScore}/40
            </span>
          </div>

          {[
            { key:'g', letter:'G', color:'#3B6D11', title:'Goals',
              q:'¿Los objetivos del cliente están definidos y alineados con nuestra solución?',
              ph:'Ej: Reducir time-to-insight, consolidar 12 fuentes en una plataforma…',
              noteKey:'gn_g', pts:GPCT_PTS.g },
            { key:'p', letter:'P', color:'#185FA5', title:'Plans',
              q:'¿El cliente tiene un plan concreto de implementación o hoja de ruta?',
              ph:'Ej: Tienen roadmap aprobado por junta para 2025…',
              noteKey:'gn_p', pts:GPCT_PTS.p },
            { key:'c', letter:'C', color:'#854F0B', title:'Challenges',
              q:'¿Identificamos los obstáculos internos del cliente (técnicos, políticos, culturales)?',
              ph:'Ej: Resistencia del equipo de IT legacy, contrato vigente con proveedor actual…',
              noteKey:'gn_c', pts:GPCT_PTS.c },
            { key:'ci', letter:'C&I', color:'#26215C', title:'Consequences & Implications',
              q:'¿Cuál es el costo de NO hacer nada?',
              ph:'Ej: Sin el proyecto pierden cumplimiento regulatorio en Q2, riesgo multa $1M…',
              noteKey:'gn_ci', pts:GPCT_PTS.ci },
          ].map(dim => (
            <div key={dim.key} className="border border-gray-200 rounded-lg overflow-hidden">
              <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 border-b border-gray-200">
                <span className="w-7 h-6 rounded text-xs font-medium flex items-center justify-center flex-shrink-0"
                  style={{ background: dim.color+'22', color: dim.color }}>{dim.letter}</span>
                <span className="text-xs font-medium text-gray-800 flex-1">{dim.title} — {dim.q}</span>
                <span className={`badge text-xs ${gpct[dim.key] ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-500'}`}>
                  {GPCT_PTS[dim.key][gpct[dim.key]]||0} pts
                </span>
              </div>
              <div className="p-3">
                <YNButtons value={gpct[dim.key]}
                  onChange={v => setGpct(p=>({...p,[dim.key]:v}))}
                  opts={[
                    { val:'yes',     label:`Sí (+${dim.pts.yes})` },
                    { val:'partial', label:`Parcial (+${dim.pts.partial})` },
                    { val:'no',      label:'No (0)' },
                  ]} />
                <textarea className="input mt-2 text-xs h-12"
                  placeholder={dim.ph}
                  value={gpct[dim.noteKey]}
                  onChange={e=>setGpct(p=>({...p,[dim.noteKey]:e.target.value}))} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── STEP 6: Resumen ───────────────────────────────────── */}
      {step===6 && (
        <div className="space-y-4">
          {/* Score compuesto */}
          <div className="card p-5">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-16 h-16 rounded-full flex flex-col items-center justify-center flex-shrink-0"
                style={{ background: cls.color+'22' }}>
                <span className="text-2xl font-medium" style={{ color: cls.color }}>{composite}</span>
                <span className="text-xs" style={{ color: cls.color }}>/100</span>
              </div>
              <div>
                <span className={`badge mb-1 ${cls.cls}`}>{cls.label}</span>
                <p className="text-xs text-gray-500">{info.name} — {info.client}</p>
                <p className="text-xs text-gray-400">{info.priority} · {info.startDate} → {info.endDate}</p>
              </div>
            </div>
            <div className="space-y-2">
              <ScoreBar label="BANT"    value={bantScore}   max={100} color="#185FA5" />
              <ScoreBar label="MEDDIC"  value={meddicScore} max={60}  color="#534AB7" />
              <ScoreBar label="GPCTBA"  value={gpctScore}   max={40}  color="#993C1D" />
              <ScoreBar label="Score compuesto" value={composite} max={100} color={cls.color} />
            </div>
          </div>

          {/* Datos generales */}
          <div className="card p-4">
            <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">Resumen</h3>
            {[
              ['Cliente',     info.client],
              ['País',        info.country ? {'colombia':'🇨🇴 Colombia','peru':'🇵🇪 Perú'}[info.country] : '—'],
              ['Marca',       info.brand ? info.brand.toUpperCase() : '—'],
              ['Tipo',        info.proposalType || '—'],
              ['Valor est.',  info.estimatedValue || '—'],
              ['Inicio',      info.startDate],
              ['Cierre',      info.endDate],
              ['Docs',        docs.link ? '1 enlace adjunto' : 'Sin documentos'],
            ].map(([k,v]) => (
              <div key={k} className="flex justify-between py-1.5 border-b border-gray-100 last:border-0 text-xs">
                <span className="text-gray-500">{k}</span>
                <span className="font-medium">{v}</span>
              </div>
            ))}
          </div>

          {composite < 38 && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-700">
              ⚠️ Score bajo ({composite}/100). Se recomienda madurar el lead antes de asignar preventa.
              Puedes registrarla de todas formas y el equipo la revisará.
            </div>
          )}
        </div>
      )}

      {/* ── Navigation ────────────────────────────────────────── */}
      <div className="flex items-center justify-between mt-5">
        {step > 1 ? (
          <button onClick={prev} className="btn btn-secondary text-xs">← Atrás</button>
        ) : <div />}

        {step < 6 ? (
          <button onClick={next}
            className={`btn text-xs ${canProceed() ? 'btn-primary' : 'btn-secondary opacity-60'}`}>
            Siguiente →
          </button>
        ) : (
          <button onClick={() => createMut.mutate()}
            disabled={createMut.isLoading}
            className="btn btn-primary text-xs">
            {createMut.isLoading ? 'Registrando…' : '✓ Registrar oportunidad'}
          </button>
        )}
      </div>
    </div>
  );
}
