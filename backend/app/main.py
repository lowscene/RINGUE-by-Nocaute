from datetime import date
from io import BytesIO
from pathlib import Path
import re
import pandas as pd
from fastapi import FastAPI, Depends, HTTPException, UploadFile, File, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import or_, desc, func, text, inspect
from sqlalchemy.orm import Session
from reportlab.lib.pagesizes import A4
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.enums import TA_CENTER
from .database import Base, engine, get_db
from .models import Cliente, Servico, SERVICE_CATEGORIES

app = FastAPI(title="Nocaute Dedetizadora API", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:5173", "http://localhost:3000"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

@app.on_event("startup")
def startup():
    Base.metadata.create_all(bind=engine)
    # Migração simples para instalações já existentes: adiciona a coluna de operador
    # sem apagar o volume MySQL nem os dados existentes.
    insp = inspect(engine)
    if "servicos" in insp.get_table_names():
        cols = {c["name"] for c in insp.get_columns("servicos")}
        if "operador" not in cols:
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE servicos ADD COLUMN operador VARCHAR(40) NULL"))

class ClienteIn(BaseModel):
    nome: str = Field(min_length=1, max_length=180)
    endereco: str = Field(min_length=1, max_length=300)
    telefone: str = Field(min_length=1, max_length=40)
class ClienteOut(ClienteIn):
    id: int
    class Config: from_attributes = True
class ServicoIn(BaseModel):
    categoria: str
    tipo_servico: str
    data_agendamento: date
    horario: str | None = None
    status: str = "Agendado"
    valor: float | None = None
    observacoes: str | None = None
    operador: str | None = None
class ServicoOut(ServicoIn):
    id: int
    cliente_id: int
    class Config: from_attributes = True

@app.get("/api/health")
def health(): return {"status": "ok"}

@app.get("/api/catalogo")
def catalogo(): return SERVICE_CATEGORIES

@app.get("/api/clientes")
def listar_clientes(q: str = Query(""), limit: int = Query(50, ge=1, le=200), offset: int = Query(0, ge=0), db: Session = Depends(get_db)):
    query = db.query(Cliente)
    q = q.strip()
    if q:
        term = f"%{q}%"
        query = query.filter(or_(Cliente.nome.like(term), Cliente.telefone.like(term), Cliente.endereco.like(term)))
    total = query.count()
    clientes = query.order_by(Cliente.nome.asc()).offset(offset).limit(limit).all()
    return {"items": [ClienteOut.model_validate(c).model_dump() for c in clientes], "total": total}

@app.post("/api/clientes", response_model=ClienteOut)
def criar_cliente(data: ClienteIn, db: Session = Depends(get_db)):
    c = Cliente(**data.model_dump())
    db.add(c); db.commit(); db.refresh(c); return c

@app.get("/api/clientes/{cliente_id}")
def obter_cliente(cliente_id: int, db: Session = Depends(get_db)):
    c = db.get(Cliente, cliente_id)
    if not c: raise HTTPException(404, "Cliente não encontrado")
    servicos = db.query(Servico).filter(Servico.cliente_id == cliente_id).order_by(desc(Servico.data_agendamento), desc(Servico.id)).all()
    return {"cliente": ClienteOut.model_validate(c), "servicos": [ServicoOut.model_validate(s) for s in servicos]}

@app.put("/api/clientes/{cliente_id}", response_model=ClienteOut)
def editar_cliente(cliente_id: int, data: ClienteIn, db: Session = Depends(get_db)):
    c = db.get(Cliente, cliente_id)
    if not c: raise HTTPException(404, "Cliente não encontrado")
    for k,v in data.model_dump().items(): setattr(c,k,v)
    db.commit(); db.refresh(c); return c

@app.delete("/api/clientes/{cliente_id}")
def excluir_cliente(cliente_id: int, db: Session = Depends(get_db)):
    c = db.get(Cliente, cliente_id)
    if not c: raise HTTPException(404, "Cliente não encontrado")
    db.delete(c); db.commit(); return {"ok": True}

@app.post("/api/clientes/{cliente_id}/servicos", response_model=ServicoOut)
def criar_servico(cliente_id: int, data: ServicoIn, db: Session = Depends(get_db)):
    if not db.get(Cliente, cliente_id): raise HTTPException(404, "Cliente não encontrado")
    if data.categoria not in SERVICE_CATEGORIES or data.tipo_servico not in SERVICE_CATEGORIES[data.categoria]:
        raise HTTPException(400, "Tipo de serviço inválido para a categoria")
    if data.categoria == "Dedetização" and data.operador not in ("Operador 1", "Operador 2"):
        raise HTTPException(400, "Selecione o operador da dedetização")
    if data.categoria == "Higienização":
        data.operador = None
    s = Servico(cliente_id=cliente_id, **data.model_dump())
    db.add(s); db.commit(); db.refresh(s); return s

@app.patch("/api/servicos/{servico_id}/status")
def atualizar_status(servico_id: int, status: str, db: Session = Depends(get_db)):
    s = db.get(Servico, servico_id)
    if not s: raise HTTPException(404, "Serviço não encontrado")
    s.status = status; db.commit(); db.refresh(s); return s

@app.get("/api/agenda")
def agenda(data: date | None = None, status: str | None = None, db: Session = Depends(get_db)):
    q = db.query(Servico, Cliente).join(Cliente, Cliente.id == Servico.cliente_id)
    if data: q = q.filter(Servico.data_agendamento == data)
    if status: q = q.filter(Servico.status == status)
    q = q.order_by(Servico.data_agendamento.asc(), Servico.horario.asc(), Cliente.nome.asc())
    return [{"id":s.id,"cliente_id":c.id,"cliente_nome":c.nome,"telefone":c.telefone,"endereco":c.endereco,"categoria":s.categoria,"tipo_servico":s.tipo_servico,"data_agendamento":s.data_agendamento,"horario":s.horario,"status":s.status,"valor":float(s.valor) if s.valor is not None else None,"observacoes":s.observacoes,"operador":s.operador} for s,c in q.all()]


@app.get("/api/dashboard")
def dashboard(db: Session = Depends(get_db)):
    hoje = date.today()
    clientes = db.query(func.count(Cliente.id)).scalar() or 0
    agendados = db.query(func.count(Servico.id)).filter(
        Servico.data_agendamento == hoje,
        Servico.status.in_(["Agendado", "Confirmado"])
    ).scalar() or 0
    servicos = db.query(func.count(Servico.id)).scalar() or 0
    recebido = db.query(func.coalesce(func.sum(Servico.valor), 0)).filter(Servico.status == "Pago").scalar() or 0
    a_receber = db.query(func.coalesce(func.sum(Servico.valor), 0)).filter(
        Servico.status != "Pago",
        Servico.status != "Cancelado"
    ).scalar() or 0
    pendentes = db.query(func.count(Servico.id)).filter(
        Servico.status.in_(["Aguardando pagamento", "Agendado", "Confirmado"])
    ).scalar() or 0

    q = db.query(Servico, Cliente).join(Cliente, Cliente.id == Servico.cliente_id).filter(
        Servico.data_agendamento == hoje
    ).order_by(Servico.horario.asc(), Cliente.nome.asc())
    items = []
    for s,c in q.all():
        items.append({
            "id": s.id, "cliente_id": c.id, "cliente_nome": c.nome,
            "categoria": s.categoria, "tipo_servico": s.tipo_servico,
            "horario": s.horario, "status": s.status, "valor": float(s.valor) if s.valor is not None else None,
            "operador": s.operador
        })
    return {
        "clientes": clientes,
        "agendados": agendados,
        "servicos": servicos,
        "a_receber": float(a_receber),
        "recebido": float(recebido),
        "pendentes": pendentes,
        "data_hoje": hoje.strftime("%d/%m/%Y"),
        "hoje": {
            "operador_1": [x for x in items if x["categoria"] == "Dedetização" and x["operador"] == "Operador 1"],
            "operador_2": [x for x in items if x["categoria"] == "Dedetização" and x["operador"] == "Operador 2"],
            "limpeza": [x for x in items if x["categoria"] == "Higienização"]
        }
    }

ALIASES = {
    "nome":"nome", "cliente":"nome", "name":"nome",
    "endereco":"endereco", "endereço":"endereco", "address":"endereco",
    "telefone":"telefone", "celular":"telefone", "phone":"telefone",
}
def norm(s): return re.sub(r"\s+", " ", str(s).strip().lower())

@app.post("/api/importar-excel")
def importar_excel(file: UploadFile = File(...), db: Session = Depends(get_db)):
    if not file.filename.lower().endswith((".xlsx", ".xls")):
        raise HTTPException(400, "Envie um arquivo Excel .xlsx ou .xls")
    try:
        content = file.file.read()
        sheets = pd.read_excel(BytesIO(content), sheet_name=None)
    except Exception as e:
        raise HTTPException(400, f"Não foi possível ler o Excel: {e}")
    inseridos = atualizados = ignorados = 0
    erros = []
    for sheet, df in sheets.items():
        if df.empty: continue
        cols = {norm(c): c for c in df.columns}
        mapping = {ALIASES[k]: v for k,v in cols.items() if k in ALIASES}
        if not {"nome","endereco","telefone"}.issubset(mapping):
            erros.append(f"A aba '{sheet}' não possui as colunas mínimas Nome, Endereço e Telefone.")
            continue
        for i, row in df.iterrows():
            try:
                nome, endereco, telefone = [str(row[mapping[k]]).strip() for k in ("nome","endereco","telefone")]
                if not nome or nome.lower() == "nan": ignorados += 1; continue
                existing = db.query(Cliente).filter(Cliente.nome == nome, Cliente.telefone == telefone).first()
                if existing:
                    existing.endereco = endereco; atualizados += 1
                else:
                    db.add(Cliente(nome=nome, endereco=endereco, telefone=telefone)); inseridos += 1
            except Exception as e:
                erros.append(f"Aba {sheet}, linha {i+2}: {e}")
    db.commit()
    return {"inseridos": inseridos, "atualizados": atualizados, "ignorados": ignorados, "erros": erros}

def make_pdf(cliente: Cliente, servico: Servico, titulo: str):
    buf = BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, rightMargin=45, leftMargin=45, topMargin=45, bottomMargin=45)
    styles = getSampleStyleSheet(); styles["Title"].alignment = TA_CENTER
    story = [Paragraph("DEDETIZADORA NOCAUTE", styles["Title"]), Paragraph(titulo, styles["Heading2"]), Spacer(1,20)]
    data = [
        ["Cliente", cliente.nome], ["Endereço", cliente.endereco], ["Telefone", cliente.telefone],
        ["Categoria", servico.categoria], ["Serviço", servico.tipo_servico], ["Data", servico.data_agendamento.strftime("%d/%m/%Y")],
        ["Horário", servico.horario or "Não informado"], ["Status", servico.status], ["Valor", f"R$ {float(servico.valor):,.2f}".replace(",","X").replace(".",",").replace("X",".") if servico.valor is not None else "Não informado"],
        ["Observações", servico.observacoes or ""]]
    t = Table(data, colWidths=[110, 370]); t.setStyle(TableStyle([("GRID",(0,0),(-1,-1),0.5,colors.grey),("BACKGROUND",(0,0),(0,-1),colors.whitesmoke),("VALIGN",(0,0),(-1,-1),"TOP"),("PADDING",(0,0),(-1,-1),8)]))
    story += [t, Spacer(1,40), Paragraph("Documento gerado pelo Sistema Nocaute.", styles["Normal"])]
    doc.build(story); buf.seek(0); return buf

@app.get("/api/clientes/{cliente_id}/documento")
def documento(cliente_id: int, servico_id: int, tipo: str = "ordem", db: Session = Depends(get_db)):
    c = db.get(Cliente, cliente_id); s = db.get(Servico, servico_id)
    if not c or not s or s.cliente_id != cliente_id: raise HTTPException(404, "Cliente/serviço não encontrado")
    titulo = "ORDEM DE SERVIÇO" if tipo == "ordem" else "COMPROVANTE DE SERVIÇO"
    pdf = make_pdf(c,s,titulo)
    return StreamingResponse(pdf, media_type="application/pdf", headers={"Content-Disposition": f'inline; filename="documento_{cliente_id}_{servico_id}.pdf"'})
