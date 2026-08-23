import React,{useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Search,Plus,CalendarDays,FileText,Upload,ArrowLeft,Trash2,Edit3,RefreshCw,LayoutDashboard,Users,Download,Clock,CheckCircle2,CircleDollarSign,AlertCircle,UsersRound} from 'lucide-react';
import './style.css';

const API='http://localhost:8000/api';
const services={
  "Dedetização":["Desinsetização","Desbaratização","Desratização","Descupinização"],
  "Higienização":["Limpeza de cisterna","Limpeza de caixa d'água","Limpeza de caixa de gordura","Desentupimento"]
};
const api=async(path,opt={})=>{const r=await fetch(API+path,opt);if(!r.ok)throw new Error(await r.text());return r.json()};
const money=v=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(v||0));
const dateBR=d=>new Date(d+'T12:00').toLocaleDateString('pt-BR');

function App(){
 const [page,setPage]=useState('clientes'),[q,setQ]=useState(''),[clients,setClients]=useState([]),[selected,setSelected]=useState(null),[modal,setModal]=useState(null),[loading,setLoading]=useState(false),[msg,setMsg]=useState('');
 const load=async()=>{setLoading(true);try{const d=await api('/clientes?q='+encodeURIComponent(q));setClients(d.items)}finally{setLoading(false)}};
 useEffect(()=>{if(page==='clientes'){const t=setTimeout(load,250);return()=>clearTimeout(t)}},[q,page]);
 const open=async id=>setSelected(await api('/clientes/'+id));
 const importExcel=async e=>{const file=e.target.files[0];if(!file)return;const fd=new FormData();fd.append('file',file);setMsg('Importando...');try{const d=await api('/importar-excel',{method:'POST',body:fd});setMsg(`Importação concluída: ${d.inseridos} inseridos, ${d.atualizados} atualizados.`);if(page==='clientes')load()}catch(err){setMsg('Erro na importação. Verifique o Excel.')}e.target.value=''};
 const deleteClient=async()=>{if(!confirm('Excluir este cliente e o histórico de serviços?'))return;await api('/clientes/'+selected.cliente.id,{method:'DELETE'});setSelected(null);load()};
 const go=p=>{setSelected(null);setModal(null);setPage(p)};
 return <div className="app">
   <header className="topnav">
     <button className="brand" onClick={()=>go('dashboard')}><span className="brand-main">RINGUE</span><span className="brand-by">by Nocaute</span></button>
     <nav>
       <button className={page==='dashboard'?'active':''} onClick={()=>go('dashboard')}><LayoutDashboard size={17}/> Dashboard</button>
       <button className={page==='clientes'?'active':''} onClick={()=>go('clientes')}><Users size={17}/> Clientes</button>
       <button onClick={()=>setModal('agenda')}><CalendarDays size={17}/> Agenda</button>
       <label className="nav-import"><Upload size={17}/> Importar Excel<input type="file" accept=".xlsx,.xls" onChange={importExcel}/></label>
     </nav>
   </header>
   <main>
     {msg&&<div className="toast">{msg}<button onClick={()=>setMsg('')}>×</button></div>}
     {page==='dashboard'&&<Dashboard onOpenClient={id=>{setPage('clientes');open(id)}}/>}
     {page==='clientes'&&!selected&&<ClientsPage q={q} setQ={setQ} clients={clients} loading={loading} onOpen={open} onNew={()=>setModal('new')} />}
     {page==='clientes'&&selected&&<ClientView data={selected} onBack={()=>setSelected(null)} onRefresh={()=>open(selected.cliente.id)} onSchedule={()=>setModal('schedule')} onDelete={deleteClient} onEdit={()=>setModal('edit')} />}
   </main>
   {modal==='new'&&<ClientModal title="Novo cliente" onClose={()=>setModal(null)} onSave={async d=>{await api('/clientes',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(d)});setModal(null);load()}}/>}
   {modal==='edit'&&<ClientModal title="Editar cliente" initial={selected.cliente} onClose={()=>setModal(null)} onSave={async d=>{await api('/clientes/'+selected.cliente.id,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(d)});setModal(null);open(selected.cliente.id)}}/>}
   {modal==='schedule'&&<ScheduleModal cliente={selected.cliente} onClose={()=>setModal(null)} onSave={async d=>{await api('/clientes/'+selected.cliente.id+'/servicos',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(d)});setModal(null);open(selected.cliente.id)}}/>}
   {modal==='agenda'&&<AgendaModal onClose={()=>setModal(null)}/>}
 </div>
}

function ClientsPage({q,setQ,clients,loading,onOpen,onNew}){
 return <div>
   <PageHeader title="Clientes" subtitle="Pesquise e acesse rapidamente qualquer cliente"/>
   <div className="toolbar"><div className="search"><Search size={19}/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Pesquisar por nome, telefone ou endereço..."/></div><button className="primary" onClick={onNew}><Plus size={18}/> Novo cliente</button></div>
   <section className="card"><div className="cardhead"><b>Clientes</b><span>{loading?'Carregando...':`${clients.length} encontrados`}</span></div><div className="list">{clients.map(c=><button className="clientrow" key={c.id} onClick={()=>onOpen(c.id)}><div className="avatar">{c.nome[0]}</div><div><strong>{c.nome}</strong><small>{c.telefone} · {c.endereco}</small></div><span>›</span></button>)}{!clients.length&&!loading&&<div className="empty">Nenhum cliente encontrado.</div>}</div></section>
 </div>
}

function PageHeader({title,subtitle}){return <header className="pageheader"><h1>{title}</h1><p>{subtitle}</p></header>}

function Dashboard({onOpenClient}){
 const [data,setData]=useState(null),[loading,setLoading]=useState(true);
 const load=async()=>{setLoading(true);try{setData(await api('/dashboard'))}finally{setLoading(false)}};
 useEffect(()=>{load()},[]);
 if(loading)return <div><PageHeader title="Dashboard" subtitle="Visão geral do sistema"/><div className="loading">Carregando indicadores...</div></div>;
 const groups=[{key:'operador_1',title:'Dedetização · Operador 1',icon:<UsersRound size={19}/>},{key:'operador_2',title:'Dedetização · Operador 2',icon:<UsersRound size={19}/>},{key:'limpeza',title:'Higienização · Equipe de limpeza',icon:<CheckCircle2 size={19}/>}];
 return <div>
   <PageHeader title="Dashboard" subtitle="Visão geral dos dados e dos serviços de hoje"/>
   <section className="stats-grid">
     <Stat icon={<Users size={20}/>} label="Clientes" value={data.clientes}/>
     <Stat icon={<CalendarDays size={20}/>} label="Agendados" value={data.agendados}/>
     <Stat icon={<CheckCircle2 size={20}/>} label="Serviços" value={data.servicos}/>
   </section>
   <section className="stats-grid">
     <Stat icon={<CircleDollarSign size={20}/>} label="A receber" value={money(data.a_receber)} money/>
     <Stat icon={<CircleDollarSign size={20}/>} label="Recebido" value={money(data.recebido)} money/>
     <Stat icon={<AlertCircle size={20}/>} label="Pendentes" value={data.pendentes}/>
   </section>
   <div className="section-title"><div><h2>Serviços de hoje</h2><p>{data.data_hoje}</p></div><button className="iconbutton" onClick={load}><RefreshCw size={17}/></button></div>
   <div className="service-columns">
     {groups.map(g=><section className="today-card card" key={g.key}><div className="today-head">{g.icon}<div><strong>{g.title}</strong><small>{data.hoje[g.key].length} serviço(s)</small></div></div>
       <div className="today-list">{data.hoje[g.key].map(s=><button className="today-row" key={s.id} onClick={()=>onOpenClient(s.cliente_id)}><div className="time">{s.horario||'—'}</div><div className="today-info"><strong>{s.cliente_nome}</strong><span>{s.tipo_servico}</span></div><em className={'status '+s.status.toLowerCase().replaceAll(' ','-')}>{s.status}</em></button>)}{!data.hoje[g.key].length&&<div className="empty compact">Nenhum serviço hoje.</div>}</div>
     </section>)}
   </div>
 </div>
}
function Stat({icon,label,value,money}){return <div className="stat-card card"><div className="stat-icon">{icon}</div><div><span>{label}</span><strong className={money?'money':''}>{value}</strong></div></div>}

function ClientView({data,onBack,onRefresh,onSchedule,onDelete,onEdit}){const c=data.cliente;return <div><button className="back" onClick={onBack}><ArrowLeft size={17}/> Voltar</button><div className="profile card"><div className="avatar big">{c.nome[0]}</div><div className="profileinfo"><h2>{c.nome}</h2><p>{c.endereco}</p><p>{c.telefone}</p></div><div className="actions"><button className="primary" onClick={onSchedule}><CalendarDays size={17}/> Agendar serviço</button><button onClick={onEdit}><Edit3 size={17}/> Editar</button><button className="danger" onClick={onDelete}><Trash2 size={17}/> Excluir</button></div></div><div className="macro"><button onClick={onSchedule}><CalendarDays/><b>AGENDAR SERVIÇO</b><span>Defina data, horário e tipo de serviço</span></button><button onClick={()=>data.servicos[0]?window.open(`${API}/clientes/${c.id}/documento?servico_id=${data.servicos[0].id}&tipo=ordem`,'_blank'):alert('Agende um serviço primeiro.')}><FileText/><b>IMPRIMIR DOCUMENTOS</b><span>Ordem de serviço e comprovante em PDF</span></button></div><section className="card"><div className="cardhead"><b>Histórico de serviços</b><button onClick={onRefresh}><RefreshCw size={16}/></button></div>{data.servicos.length?data.servicos.map(s=><div className="service" key={s.id}><div><strong>{s.tipo_servico}</strong><small>{s.categoria}{s.operador?' · '+s.operador:''} · {dateBR(s.data_agendamento)} {s.horario||''}</small></div><select value={s.status} onChange={async e=>{await api(`/servicos/${s.id}/status?status=${encodeURIComponent(e.target.value)}`,{method:'PATCH'});onRefresh()}}><option>Agendado</option><option>Confirmado</option><option>Realizado</option><option>Cancelado</option><option>Aguardando pagamento</option><option>Pago</option></select><button title="Imprimir" onClick={()=>window.open(`${API}/clientes/${c.id}/documento?servico_id=${s.id}&tipo=ordem`,'_blank')}><FileText size={17}/></button></div>):<div className="empty">Nenhum serviço cadastrado.</div>}</section></div>}

function ClientModal({title,initial={},onClose,onSave}){const [d,setD]=useState({nome:initial.nome||'',endereco:initial.endereco||'',telefone:initial.telefone||''});return <Modal title={title} onClose={onClose}><FormRow label="Nome"><input value={d.nome} onChange={e=>setD({...d,nome:e.target.value})}/></FormRow><FormRow label="Endereço"><input value={d.endereco} onChange={e=>setD({...d,endereco:e.target.value})}/></FormRow><FormRow label="Telefone"><input value={d.telefone} onChange={e=>setD({...d,telefone:e.target.value})}/></FormRow><ModalActions onClose={onClose} onSave={()=>onSave(d)}/></Modal>}

function formatDateBR(value){
 const digits=value.replace(/\D/g,'').slice(0,8);
 if(digits.length<=2)return digits;
 if(digits.length<=4)return digits.slice(0,2)+'/'+digits.slice(2);
 return digits.slice(0,2)+'/'+digits.slice(2,4)+'/'+digits.slice(4);
}
function dateBRToISO(value){
 const [day,month,year]=value.split('/');
 if(!day||!month||!year||year.length!==4)return '';
 return `${year}-${month.padStart(2,'0')}-${day.padStart(2,'0')}`;
}
function formatMoneyInput(value){
 const digits=value.replace(/\D/g,'');
 if(!digits)return '';
 const cents=Number(digits)/100;
 return new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(cents);
}
function moneyInputToNumber(value){
 const digits=value.replace(/\D/g,'');
 return digits?Number(digits)/100:null;
}
function ScheduleModal({cliente,onClose,onSave}){
 const [cat,setCat]=useState('Dedetização'),[tipo,setTipo]=useState(services.Dedetização[0]),[data,setData]=useState(''),[horario,setHorario]=useState(''),[operador,setOperador]=useState('Operador 1'),[obs,setObs]=useState(''),[valor,setValor]=useState('');
 useEffect(()=>{setTipo(services[cat][0]);if(cat==='Higienização')setOperador('')},[cat]);
 const save=()=>{
   const dataISO=dateBRToISO(data);
   if(!dataISO){alert('Informe uma data válida no formato DD/MM/AAAA.');return}
   onSave({categoria:cat,tipo_servico:tipo,data_agendamento:dataISO,horario:horario||null,operador:cat==='Dedetização'?operador:null,status:'Agendado',valor:moneyInputToNumber(valor),observacoes:obs||null});
 };
 return <Modal title={'Agendar serviço — '+cliente.nome} onClose={onClose}><div className="grid2">
   <FormRow label="Categoria"><select value={cat} onChange={e=>setCat(e.target.value)}><option>Dedetização</option><option>Higienização</option></select></FormRow>
   <FormRow label="Serviço"><select value={tipo} onChange={e=>setTipo(e.target.value)}>{services[cat].map(x=><option key={x}>{x}</option>)}</select></FormRow>
   <FormRow label="Data"><input type="text" inputMode="numeric" placeholder="DD/MM/AAAA" maxLength="10" value={data} onChange={e=>setData(formatDateBR(e.target.value))}/></FormRow>
   <FormRow label="Horário"><input type="text" inputMode="numeric" placeholder="HH:MM" maxLength="5" value={horario} onChange={e=>setHorario(e.target.value.replace(/\D/g,'').slice(0,4).replace(/(\d{2})(\d)/,'$1:$2'))}/></FormRow>
   {cat==='Dedetização'&&<FormRow label="Operador"><select value={operador} onChange={e=>setOperador(e.target.value)}><option>Operador 1</option><option>Operador 2</option></select></FormRow>}
   <FormRow label="Valor"><input type="text" inputMode="numeric" placeholder="R$ 0,00" value={valor} onChange={e=>setValor(formatMoneyInput(e.target.value))}/></FormRow>
 </div><FormRow label="Observações"><textarea value={obs} onChange={e=>setObs(e.target.value)} /></FormRow><ModalActions onClose={onClose} onSave={save}/></Modal>
}
function AgendaModal({onClose}){const [items,setItems]=useState([]);useEffect(()=>{api('/agenda').then(setItems)},[]);return <Modal title="Agenda" onClose={onClose}><div className="agenda">{items.map(s=><div className="agendaRow" key={s.id}><b>{dateBR(s.data_agendamento)}</b><span>{s.horario||'—'}</span><div><strong>{s.cliente_nome}</strong><small>{s.tipo_servico}{s.operador?' · '+s.operador:''}</small></div><em>{s.status}</em></div>)}{!items.length&&<div className="empty">Nenhum serviço agendado.</div>}</div></Modal>}
function FormRow({label,children}){return <label className="field"><span>{label}</span>{children}</label>}
function Modal({title,onClose,children}){return <div className="overlay"><div className="modal"><div className="modalhead"><h3>{title}</h3><button onClick={onClose}>×</button></div>{children}</div></div>}
function ModalActions({onClose,onSave}){return <div className="modalactions"><button onClick={onClose}>Cancelar</button><button className="primary" onClick={onSave}>Salvar</button></div>}
createRoot(document.getElementById('root')).render(<App/>);
