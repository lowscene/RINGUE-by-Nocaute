import React,{useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Search,Plus,CalendarDays,FileText,ArrowLeft,Trash2,Edit3,RefreshCw,LayoutDashboard,Users,Clock,CheckCircle2,CircleDollarSign,AlertCircle,UsersRound,Phone} from 'lucide-react';
import './style.css';

// Antes fixo em "http://localhost:8000/api", o que só funcionava quando o
// navegador estava na mesma máquina do Docker. Agora usa o mesmo host que foi
// digitado na barra de endereço (funciona em rede local, IP do servidor ou
// domínio), mantendo a porta 8000 do backend. Pode ser sobrescrito em build
// definindo VITE_API_URL.
const API = import.meta.env.VITE_API_URL || `${window.location.protocol}//${window.location.hostname}:8000/api`;
const services={
  "Dedetização":["Desinsetização","Desbaratização","Desratização","Descupinização"],
  "Higienização":["Limpeza de cisterna","Limpeza de caixa d'água","Limpeza de caixa de gordura","Desentupimento"]
};
const contractTypes=["Avulso","3 meses","6 meses","1 ano"];
const api=async(path,opt={})=>{const r=await fetch(API+path,opt);if(!r.ok)throw new Error(await r.text());return r.json()};
const money=v=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(v||0));
const dateBR=d=>new Date(d+'T12:00').toLocaleDateString('pt-BR');

function App(){
 const [page,setPage]=useState('clientes'),[q,setQ]=useState(''),[clients,setClients]=useState([]),[selected,setSelected]=useState(null),[modal,setModal]=useState(null),[loading,setLoading]=useState(false),[msg,setMsg]=useState('');
 const load=async()=>{setLoading(true);try{const d=await api('/clientes?q='+encodeURIComponent(q));setClients(d.items)}finally{setLoading(false)}};
 useEffect(()=>{if(page==='clientes'){const t=setTimeout(load,250);return()=>clearTimeout(t)}},[q,page]);
 const open=async id=>setSelected(await api('/clientes/'+id));
 const deleteClient=async()=>{if(!confirm('Excluir este cliente e o histórico de serviços?'))return;await api('/clientes/'+selected.cliente.id,{method:'DELETE'});setSelected(null);load()};
 const go=p=>{setSelected(null);setModal(null);setPage(p)};
 return <div className="app">
   <header className="topnav">
     <button className="brand" onClick={()=>go('dashboard')}><span className="brand-main">RINGUE</span><span className="brand-by">by Nocaute</span></button>
     <nav>
       <button className={page==='dashboard'?'active':''} onClick={()=>go('dashboard')}><LayoutDashboard size={17}/> Dashboard</button>
       <button className={page==='clientes'?'active':''} onClick={()=>go('clientes')}><Users size={17}/> Clientes</button>
       <button className={page==='agenda'?'active':''} onClick={()=>go('agenda')}><CalendarDays size={17}/> Agenda</button>
     </nav>
   </header>
   <main>
     {msg&&<div className="toast">{msg}<button onClick={()=>setMsg('')}>×</button></div>}
     {page==='dashboard'&&<Dashboard onOpenClient={id=>{setPage('clientes');open(id)}}/>}
     {page==='clientes'&&!selected&&<ClientsPage q={q} setQ={setQ} clients={clients} loading={loading} onOpen={open} onNew={()=>setModal('new')} />}
     {page==='agenda'&&<AgendaPage />}
     {page==='clientes'&&selected&&<ClientView data={selected} onBack={()=>setSelected(null)} onRefresh={()=>open(selected.cliente.id)} onSchedule={()=>setModal('schedule')} onDelete={deleteClient} onEdit={()=>setModal('edit')} />}
   </main>
   {modal==='new'&&<ClientModal title="Novo cliente" onClose={()=>setModal(null)} onSave={async d=>{await api('/clientes',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(d)});setModal(null);load()}}/>}
   {modal==='edit'&&<ClientModal title="Editar cliente" initial={selected.cliente} onClose={()=>setModal(null)} onSave={async d=>{await api('/clientes/'+selected.cliente.id,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(d)});setModal(null);open(selected.cliente.id)}}/>}
   {modal==='schedule'&&<ScheduleModal cliente={selected.cliente} onClose={()=>setModal(null)} onSave={async d=>{await api('/clientes/'+selected.cliente.id+'/servicos',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(d)});setModal(null);open(selected.cliente.id)}}/>}
 </div>
}

function ClientsPage({q,setQ,clients,loading,onOpen,onNew}){
 return <div>
   <PageHeader title="Clientes" subtitle="Pesquise e acesse rapidamente qualquer cliente"/>
   <div className="toolbar"><div className="search"><Search size={19}/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Pesquisar por nome, telefone ou endereço..."/></div><button className="primary" onClick={onNew}><Plus size={18}/> Novo cliente</button></div>
   <section className="card"><div className="cardhead"><b>Clientes</b><span>{loading?'Carregando...':`${clients.length} encontrados`}</span></div><div className="list">{clients.map(c=><button className="clientrow" key={c.id} onClick={()=>onOpen(c.id)}><div className="avatar">{c.nome[0]}</div><div><strong>{c.nome}</strong><small>{c.tipo_estabelecimento||"Cliente"} · {c.telefone} · {c.endereco}{c.bairro?" · "+c.bairro:""}</small></div><span>›</span></button>)}{!clients.length&&!loading&&<div className="empty">Nenhum cliente encontrado.</div>}</div></section>
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
   <ContractAlert info={data.contratos_vencendo}/>
   <div className="section-title"><div><h2>Serviços de hoje</h2><p>{data.data_hoje}</p></div><button className="iconbutton" onClick={load}><RefreshCw size={17}/></button></div>
   <div className="service-columns">
     {groups.map(g=><section className="today-card card" key={g.key}><div className="today-head">{g.icon}<div><strong>{g.title}</strong><small>{data.hoje[g.key].length} serviço(s)</small></div></div>
       <div className="today-list">{data.hoje[g.key].map(s=><button className="today-row" key={s.id} onClick={()=>onOpenClient(s.cliente_id)}><div className="time">{s.horario||'—'}</div><div className="today-info"><strong>{s.cliente_nome}</strong><span>{s.tipo_servico}</span></div><em className={'status '+s.status.toLowerCase().replaceAll(' ','-')}>{s.status}</em></button>)}{!data.hoje[g.key].length&&<div className="empty compact">Nenhum serviço hoje.</div>}</div>
     </section>)}
   </div>
 </div>
}
function Stat({icon,label,value,money}){return <div className="stat-card card"><div className="stat-icon">{icon}</div><div><span>{label}</span><strong className={money?'money':''}>{value}</strong></div></div>}

function ContractAlert({info}){
 const total=info?.total||0,itens=info?.itens||[];
 return <section className="contract-alert card">
   <div className="contract-alert-count">
     <AlertCircle size={22}/>
     <div><strong>{total}</strong><span>contrato{total===1?'':'s'} perto de vencer</span></div>
   </div>
   <div className="contract-alert-divider"></div>
   <div className="contract-alert-scroll">
     {itens.map(it=><ContractPill key={it.servico_id} item={it}/>)}
     {!itens.length&&<div className="contract-alert-empty">Nenhum contrato próximo do vencimento.</div>}
   </div>
 </section>
}

function ContractPill({item}){
 const [open,setOpen]=useState(false);
 return <button className={'contract-pill'+(open?' flipped':'')} onClick={()=>setOpen(o=>!o)} title="Clique para ver telefone e contato">
   {!open?<>
     <strong>{item.cliente_nome}</strong>
     <small>{item.tipo_contrato} · vence em {item.dias_restantes} dia{item.dias_restantes===1?'':'s'}</small>
   </>:<>
     <strong><Phone size={13}/> {item.telefone}</strong>
     <small>{item.nome_contato||'Contato não informado'}</small>
   </>}
 </button>
}

function ClientView({data,onBack,onRefresh,onSchedule,onDelete,onEdit}){const c=data.cliente;return <div>
 <button className="back" onClick={onBack}><ArrowLeft size={17}/> Voltar</button>
 <div className="profile card">
   <div className="avatar big">{(c.nome||'?')[0]}</div>
   <div className="profileinfo"><h2>{c.nome}</h2><p>{c.tipo_estabelecimento||'Cliente'} · ID {c.id}</p><p>{c.endereco}{c.bairro?' · '+c.bairro:''}</p><p>{c.telefone}{c.email?' · '+c.email:''}</p></div>
   <div className="actions"><button className="primary" onClick={onSchedule}><CalendarDays size={17}/> Agendar serviço</button><button onClick={onEdit}><Edit3 size={17}/> Editar</button><button className="danger" onClick={onDelete}><Trash2 size={17}/> Excluir</button></div>
 </div>
 <section className="client-details card"><div className="cardhead"><b>Dados cadastrais</b><span>Informações do Sistema Geral</span></div><div className="details-grid">
   <Detail label="ID" value={c.id}/><Detail label="Nome" value={c.nome}/><Detail label="Tipo de estabelecimento" value={c.tipo_estabelecimento}/>
   <Detail label="Data do cadastro" value={c.data_cadastro?dateBR(c.data_cadastro):'—'}/><Detail label="Razão social" value={c.razao_social}/><Detail label="CNPJ" value={c.cnpj}/>
   <Detail label="Inscrição estadual" value={c.inscricao_estadual}/><Detail label="Nome do contato" value={c.nome_contato}/><Detail label="Endereço" value={c.endereco}/>
   <Detail label="Bairro" value={c.bairro}/><Detail label="Complemento" value={c.complemento}/><Detail label="E-mail" value={c.email}/><Detail label="Telefone" value={c.telefone}/>
 </div></section>
 <div className="macro"><button onClick={onSchedule}><CalendarDays/><b>AGENDAR SERVIÇO</b><span>Defina data, horário e tipo de serviço</span></button><button onClick={()=>data.servicos[0]?window.open(`${API}/clientes/${c.id}/documento?servico_id=${data.servicos[0].id}&tipo=ordem`,'_blank'):alert('Agende um serviço primeiro.')}><FileText/><b>IMPRIMIR DOCUMENTOS</b><span>Ordem de serviço e comprovante em PDF</span></button></div>
 <section className="card"><div className="cardhead"><b>Histórico de serviços</b><button onClick={onRefresh}><RefreshCw size={16}/></button></div>{data.servicos.length?data.servicos.map(s=><div className="service" key={s.id}><div><strong>{s.tipo_servico}</strong><small>{s.categoria}{s.operador?' · '+s.operador:''} · {dateBR(s.data_agendamento)} {s.horario||''}</small>{s.tipo_contrato&&s.tipo_contrato!=='Avulso'&&<em className="contract-tag">Contrato {s.tipo_contrato}{s.data_vencimento?' · vence em '+dateBR(s.data_vencimento):''}</em>}</div><select value={s.status} onChange={async e=>{await api(`/servicos/${s.id}/status?status=${encodeURIComponent(e.target.value)}`,{method:'PATCH'});onRefresh()}}><option>Agendado</option><option>Confirmado</option><option>Realizado</option><option>Cancelado</option><option>Aguardando pagamento</option><option>Pago</option></select><button title="Imprimir" onClick={()=>window.open(`${API}/clientes/${c.id}/documento?servico_id=${s.id}&tipo=ordem`,'_blank')}><FileText size={17}/></button></div>):<div className="empty">Nenhum serviço cadastrado.</div>}</section>
 </div>}
function Detail({label,value}){return <div className="detail-item"><span>{label}</span><strong>{value||'—'}</strong></div>}

function ClientModal({title,initial={},onClose,onSave}){const [d,setD]=useState({
 nome:initial.nome||'',tipo_estabelecimento:initial.tipo_estabelecimento||'',data_cadastro:initial.data_cadastro?dateBR(initial.data_cadastro):'',
 razao_social:initial.razao_social||'',cnpj:initial.cnpj||'',inscricao_estadual:initial.inscricao_estadual||'',nome_contato:initial.nome_contato||'',
 endereco:initial.endereco||'',bairro:initial.bairro||'',complemento:initial.complemento||'',email:initial.email||'',telefone:initial.telefone||''
});
 const set=(k,v)=>setD(x=>({...x,[k]:v}));
 const save=()=>{const payload={...d,data_cadastro:d.data_cadastro?dateBRToISO(d.data_cadastro):null};if(!payload.nome||!payload.endereco||!payload.telefone){alert('Nome, endereço e telefone são obrigatórios.');return}onSave(payload)};
 return <Modal title={title} onClose={onClose}><div className="grid2">
 <FormRow label="Nome"><input value={d.nome} onChange={e=>set('nome',e.target.value)}/></FormRow>
 <FormRow label="Tipo de estabelecimento"><input value={d.tipo_estabelecimento} onChange={e=>set('tipo_estabelecimento',e.target.value)}/></FormRow>
 <FormRow label="Data do cadastro"><input inputMode="numeric" placeholder="DD/MM/AAAA" maxLength="10" value={d.data_cadastro} onChange={e=>set('data_cadastro',formatDateBR(e.target.value))}/></FormRow>
 <FormRow label="Razão social"><input value={d.razao_social} onChange={e=>set('razao_social',e.target.value)}/></FormRow>
 <FormRow label="CNPJ"><input value={d.cnpj} onChange={e=>set('cnpj',e.target.value)}/></FormRow>
 <FormRow label="Inscrição estadual"><input value={d.inscricao_estadual} onChange={e=>set('inscricao_estadual',e.target.value)}/></FormRow>
 <FormRow label="Nome do contato"><input value={d.nome_contato} onChange={e=>set('nome_contato',e.target.value)}/></FormRow>
 <FormRow label="Telefone"><input value={d.telefone} onChange={e=>set('telefone',e.target.value)}/></FormRow>
 <FormRow label="E-mail"><input type="email" value={d.email} onChange={e=>set('email',e.target.value)}/></FormRow>
 <FormRow label="Bairro"><input value={d.bairro} onChange={e=>set('bairro',e.target.value)}/></FormRow>
 <FormRow label="Endereço"><input value={d.endereco} onChange={e=>set('endereco',e.target.value)}/></FormRow>
 <FormRow label="Complemento"><input value={d.complemento} onChange={e=>set('complemento',e.target.value)}/></FormRow>
 </div><ModalActions onClose={onClose} onSave={save}/></Modal>}

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
 const [cat,setCat]=useState('Dedetização'),[tipo,setTipo]=useState(services.Dedetização[0]),[data,setData]=useState(''),[horario,setHorario]=useState(''),[operador,setOperador]=useState('Operador 1'),[obs,setObs]=useState(''),[valor,setValor]=useState(''),[tipoContrato,setTipoContrato]=useState('Avulso');
 useEffect(()=>{setTipo(services[cat][0]);if(cat==='Higienização')setOperador('')},[cat]);
 const save=()=>{
   const dataISO=dateBRToISO(data);
   if(!dataISO){alert('Informe uma data válida no formato DD/MM/AAAA.');return}
   onSave({categoria:cat,tipo_servico:tipo,data_agendamento:dataISO,horario:horario||null,operador:cat==='Dedetização'?operador:null,status:'Agendado',valor:moneyInputToNumber(valor),observacoes:obs||null,tipo_contrato:tipoContrato});
 };
 return <Modal title={'Agendar serviço — '+cliente.nome} onClose={onClose}><div className="grid2">
   <FormRow label="Categoria"><select value={cat} onChange={e=>setCat(e.target.value)}><option>Dedetização</option><option>Higienização</option></select></FormRow>
   <FormRow label="Serviço"><select value={tipo} onChange={e=>setTipo(e.target.value)}>{services[cat].map(x=><option key={x}>{x}</option>)}</select></FormRow>
   <FormRow label="Data"><input type="text" inputMode="numeric" placeholder="DD/MM/AAAA" maxLength="10" value={data} onChange={e=>setData(formatDateBR(e.target.value))}/></FormRow>
   <FormRow label="Horário"><input type="text" inputMode="numeric" placeholder="HH:MM" maxLength="5" value={horario} onChange={e=>setHorario(e.target.value.replace(/\D/g,'').slice(0,4).replace(/(\d{2})(\d)/,'$1:$2'))}/></FormRow>
   {cat==='Dedetização'&&<FormRow label="Operador"><select value={operador} onChange={e=>setOperador(e.target.value)}><option>Operador 1</option><option>Operador 2</option></select></FormRow>}
   <FormRow label="Valor"><input type="text" inputMode="numeric" placeholder="R$ 0,00" value={valor} onChange={e=>setValor(formatMoneyInput(e.target.value))}/></FormRow>
   <FormRow label="Tipo de contrato"><select value={tipoContrato} onChange={e=>setTipoContrato(e.target.value)}>{contractTypes.map(x=><option key={x}>{x}</option>)}</select></FormRow>
 </div><FormRow label="Observações"><textarea value={obs} onChange={e=>setObs(e.target.value)} /></FormRow><ModalActions onClose={onClose} onSave={save}/></Modal>
}
function AgendaPage(){
 const [items,setItems]=useState([]),[month,setMonth]=useState(new Date(new Date().getFullYear(),new Date().getMonth(),1)),[team,setTeam]=useState('Todas'),[selectedDay,setSelectedDay]=useState(null),[loading,setLoading]=useState(true);
 const load=async()=>{setLoading(true);try{setItems(await api('/agenda'))}finally{setLoading(false)}};
 useEffect(()=>{load()},[]);
 const teams=['Todas','Operador 1','Operador 2','Equipe de limpeza'];
 const filtered=items.filter(s=>{const d=new Date(s.data_agendamento+'T12:00'); const sameMonth=d.getFullYear()===month.getFullYear()&&d.getMonth()===month.getMonth(); const t=s.categoria==='Higienização'?'Equipe de limpeza':s.operador; return sameMonth&&(team==='Todas'||t===team)});
 const year=month.getFullYear(), mon=month.getMonth();
 const first=new Date(year,mon,1); const daysIn=new Date(year,mon+1,0).getDate(); const offset=(first.getDay()+6)%7;
 const cells=[]; for(let i=0;i<offset;i++)cells.push(null); for(let d=1;d<=daysIn;d++)cells.push(d); while(cells.length%7)cells.push(null);
 const keyDate=d=>`${year}-${String(mon+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
 const byDay=d=>filtered.filter(s=>s.data_agendamento===keyDate(d)).sort((a,b)=>(a.horario||'99:99').localeCompare(b.horario||'99:99'));
 const selectedItems=selectedDay?byDay(selectedDay):[];
 const monthLabel=month.toLocaleDateString('pt-BR',{month:'long',year:'numeric'});
 const prev=()=>setMonth(new Date(year,mon-1,1)),next=()=>setMonth(new Date(year,mon+1,1)),today=()=>{const n=new Date();setMonth(new Date(n.getFullYear(),n.getMonth(),1));setSelectedDay(n.getDate())};
 const teamLabel=s=>s.categoria==='Higienização'?'Limpeza':s.operador?.replace('Operador ','Op. ')||'—';
 const teamClass=s=>s.categoria==='Higienização'?'clean':s.operador==='Operador 1'?'op1':'op2';
 return <div className="agenda-page">
   <PageHeader title="Agenda" subtitle="Planejamento completo dos serviços da empresa — hoje e para os próximos meses"/>
   <section className="agenda-toolbar card">
     <div className="month-nav"><button onClick={prev}>‹</button><div><strong>{monthLabel.charAt(0).toUpperCase()+monthLabel.slice(1)}</strong><small>{filtered.length} serviço(s) neste mês</small></div><button onClick={next}>›</button><button className="today-btn" onClick={today}>Hoje</button></div>
     <div className="team-filters">{teams.map(t=><button key={t} className={team===t?'selected':''} onClick={()=>setTeam(t)}>{t}</button>)}<button className="refresh-agenda" onClick={load}><RefreshCw size={16}/></button></div>
   </section>
   <section className="team-summary">
     {[['Operador 1','op1'],['Operador 2','op2'],['Equipe de limpeza','clean']].map(([name,cls])=>{const count=filtered.filter(s=>(s.categoria==='Higienização'?'Equipe de limpeza':s.operador)===name).length;return <div className={'team-summary-card '+cls} key={name}><span></span><div><strong>{name}</strong><small>{count} serviço(s) no mês</small></div></div>})}
   </section>
   {loading?<div className="loading">Carregando agenda...</div>:<>
   <section className="calendar card">
     <div className="weekdays">{['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'].map(x=><div key={x}>{x}</div>)}</div>
     <div className="calendar-grid">{cells.map((d,i)=>{const list=d?byDay(d):[];const isToday=d&&new Date().getFullYear()===year&&new Date().getMonth()===mon&&new Date().getDate()===d;return <button key={i} disabled={!d} className={'day-cell '+(d?'':'blank')+(isToday?' today':'')+(selectedDay===d?' chosen':'')} onClick={()=>d&&setSelectedDay(d)}><div className="day-number">{d||''}{isToday&&<span>Hoje</span>}</div><div className="day-services">{list.slice(0,4).map(s=><div key={s.id} className={'mini-service '+teamClass(s)}><b>{s.horario||'—'}</b><span>{s.cliente_nome}</span><em>{teamLabel(s)}</em></div>)}{list.length>4&&<small className="more">+{list.length-4} serviços</small>}{d&&!list.length&&<span className="free-day">Livre</span>}</div></button>})}</div>
   </section>
   <section className="agenda-detail card">
     <div className="cardhead"><div><b>{selectedDay?`${String(selectedDay).padStart(2,'0')}/${String(mon+1).padStart(2,'0')}/${year}`:'Selecione um dia'}</b><span>{selectedDay?`${selectedItems.length} serviço(s) programado(s)`:'Clique em um dia para ver os detalhes'}</span></div></div>
     {selectedDay&&selectedItems.length?selectedItems.map(s=><div className="agenda-detail-row" key={s.id}><div className="detail-time">{s.horario||'—'}</div><div className={'team-dot '+teamClass(s)}></div><div className="detail-main"><strong>{s.cliente_nome}</strong><small>{s.tipo_servico} · {s.endereco}</small></div><div className="detail-team">{s.categoria==='Higienização'?'Equipe de limpeza':s.operador}</div><em className={'status '+s.status.toLowerCase().replaceAll(' ','-')}>{s.status}</em></div>):selectedDay?<div className="empty compact">Nenhum serviço programado para este dia.</div>:<div className="empty compact">Escolha uma data no calendário.</div>}
   </section></>}
 </div>
}
function FormRow({label,children}){return <label className="field"><span>{label}</span>{children}</label>}
function Modal({title,onClose,children}){return <div className="overlay"><div className="modal"><div className="modalhead"><h3>{title}</h3><button onClick={onClose}>×</button></div>{children}</div></div>}
function ModalActions({onClose,onSave}){return <div className="modalactions"><button onClick={onClose}>Cancelar</button><button className="primary" onClick={onSave}>Salvar</button></div>}
createRoot(document.getElementById('root')).render(<App/>);
