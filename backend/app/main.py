from datetime import date, datetime
from io import BytesIO
from pathlib import Path
import re

import pandas as pd
from fastapi import FastAPI, Depends, HTTPException, Query
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

from .database import Base, engine, get_db, SessionLocal
from .models import Cliente, Servico, ImportStatus, SERVICE_CATEGORIES, CONTRACT_TYPES, calcular_vencimento_contrato

app = FastAPI(title="RINGUE / Nocaute — Dedetizadora API", version="1.1.0")
app.add_middleware(
    CORSMiddleware,
    # Antes restrito a localhost:5173/3000 — bloqueava o acesso caso o sistema
    # fosse aberto por IP de rede local ou domínio do servidor. Como não há
    # cookies/sessão envolvidos, liberar qualquer origem é seguro aqui.
    allow_origins=["*"],
    allow_credentials=False, allow_methods=["*"], allow_headers=["*"]
)

def startup_migrations():
    Base.metadata.create_all(bind=engine)
    insp = inspect(engine)
    tables = insp.get_table_names()
    if "servicos" in tables:
        cols = {c["name"] for c in insp.get_columns("servicos")}
        if "operador" not in cols:
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE servicos ADD COLUMN operador VARCHAR(40) NULL"))
        if "tipo_contrato" not in cols:
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE servicos ADD COLUMN tipo_contrato VARCHAR(20) NOT NULL DEFAULT 'Avulso'"))
    if "clientes" in tables:
        cols = {c["name"] for c in insp.get_columns("clientes")}
        additions = {
            "tipo_estabelecimento": "VARCHAR(120) NULL",
            "data_cadastro": "DATE NULL",
            "razao_social": "VARCHAR(300) NULL",
            "cnpj": "VARCHAR(30) NULL",
            "inscricao_estadual": "VARCHAR(60) NULL",
            "nome_contato": "VARCHAR(180) NULL",
            "bairro": "VARCHAR(120) NULL",
            "complemento": "VARCHAR(180) NULL",
            "email": "VARCHAR(180) NULL",
        }
        with engine.begin() as conn:
            for name, definition in additions.items():
                if name not in cols:
                    conn.execute(text(f"ALTER TABLE clientes ADD COLUMN {name} {definition}"))

def seed_clientes_from_sistema_geral():
    """Carrega automaticamente os clientes da planilha SISTEMA GERAL.xlsx
    na primeira vez que o sistema sobe — substitui a antiga importação manual.
    Usa um marcador próprio (e não a contagem de clientes) para decidir se já
    rodou, para não depender do fato de a tabela estar vazia — assim, mesmo que
    algum cliente já tenha sido cadastrado manualmente, a importação ainda roda."""
    db = SessionLocal()
    try:
        ja_rodou = db.get(ImportStatus, "sistema_geral_importado")
        if ja_rodou:
            return
        path = Path(__file__).resolve().parent.parent / "data" / "SISTEMA GERAL.xlsx"
        if not path.exists():
            print("[seed] Arquivo SISTEMA GERAL.xlsx não encontrado em backend/data — importação automática ignorada.")
            return
        content = path.read_bytes()
        sheet, df = system_general_dataframe(content)
        inserted, updated, skipped, errors = import_system_df(df, db)
        db.merge(ImportStatus(chave="sistema_geral_importado", valor="ok"))
        db.commit()
        print(f"[seed] Sistema Geral importado (aba {sheet}): {inserted} inseridos, {updated} atualizados, {skipped} ignorados, {len(errors)} erro(s).")
        for e in errors[:20]:
            print(f"[seed]   - {e}")
    except Exception as e:
        print(f"[seed] Falha ao importar o Sistema Geral automaticamente: {e}")
    finally:
        db.close()

@app.on_event("startup")
def startup():
    startup_migrations()
    seed_clientes_from_sistema_geral()

class ClienteIn(BaseModel):
    nome: str = Field(min_length=1, max_length=180)
    tipo_estabelecimento: str | None = None
    data_cadastro: date | None = None
    razao_social: str | None = None
    cnpj: str | None = None
    inscricao_estadual: str | None = None
    nome_contato: str | None = None
    endereco: str = Field(min_length=1, max_length=350)
    bairro: str | None = None
    complemento: str | None = None
    email: str | None = None
    telefone: str = Field(min_length=1, max_length=80)

class ClienteOut(ClienteIn):
    id: int
    class Config:
        from_attributes = True

class ServicoIn(BaseModel):
    categoria: str
    tipo_servico: str
    data_agendamento: date
    horario: str | None = None
    status: str = "Agendado"
    valor: float | None = None
    observacoes: str | None = None
    operador: str | None = None
    tipo_contrato: str = "Avulso"

class ServicoOut(ServicoIn):
    id: int
    cliente_id: int
    data_vencimento: date | None = None
    class Config:
        from_attributes = True

@app.get("/api/health")
def health(): return {"status": "ok"}

@app.get("/api/catalogo")
def catalogo(): return SERVICE_CATEGORIES

@app.get("/api/tipos-contrato")
def tipos_contrato(): return CONTRACT_TYPES

@app.post("/api/admin/ressincronizar-sistema-geral")
def ressincronizar_sistema_geral(db: Session = Depends(get_db)):
    """Endpoint de suporte (não fica no menu) para forçar a reimportação do
    Sistema Geral agora, sem precisar reiniciar os containers. Útil após
    corrigir algum problema de importação."""
    path = Path(__file__).resolve().parent.parent / "data" / "SISTEMA GERAL.xlsx"
    if not path.exists():
        raise HTTPException(404, "Arquivo SISTEMA GERAL.xlsx não encontrado em backend/data.")
    try:
        content = path.read_bytes()
        sheet, df = system_general_dataframe(content)
        inserted, updated, skipped, errors = import_system_df(df, db)
        db.merge(ImportStatus(chave="sistema_geral_importado", valor="ok"))
        db.commit()
        return {
            "aba": sheet, "inseridos": inserted, "atualizados": updated,
            "ignorados": skipped, "total_erros": len(errors), "primeiros_erros": errors[:20]
        }
    except Exception as e:
        raise HTTPException(400, f"Não foi possível ressincronizar: {e}")

@app.get("/api/clientes")
def listar_clientes(q: str = Query(""), limit: int = Query(50, ge=1, le=200), offset: int = Query(0, ge=0), db: Session = Depends(get_db)):
    query = db.query(Cliente)
    q = q.strip()
    if q:
        term = f"%{q}%"
        query = query.filter(or_(
            Cliente.nome.like(term), Cliente.telefone.like(term), Cliente.endereco.like(term),
            Cliente.bairro.like(term), Cliente.cnpj.like(term), Cliente.razao_social.like(term),
            Cliente.nome_contato.like(term), Cliente.email.like(term)
        ))
    total = query.count()
    clientes = query.order_by(Cliente.nome.asc()).offset(offset).limit(limit).all()
    return {"items": [ClienteOut.model_validate(c).model_dump() for c in clientes], "total": total}

@app.post("/api/clientes", response_model=ClienteOut)
def criar_cliente(data: ClienteIn, db: Session = Depends(get_db)):
    c = Cliente(**data.model_dump())
    db.add(c); db.commit(); db.refresh(c)
    return c

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
    for k, v in data.model_dump().items(): setattr(c, k, v)
    db.commit(); db.refresh(c)
    return c

@app.delete("/api/clientes/{cliente_id}")
def excluir_cliente(cliente_id: int, db: Session = Depends(get_db)):
    c = db.get(Cliente, cliente_id)
    if not c: raise HTTPException(404, "Cliente não encontrado")
    db.delete(c); db.commit()
    return {"ok": True}

@app.post("/api/clientes/{cliente_id}/servicos", response_model=ServicoOut)
def criar_servico(cliente_id: int, data: ServicoIn, db: Session = Depends(get_db)):
    if not db.get(Cliente, cliente_id): raise HTTPException(404, "Cliente não encontrado")
    if data.categoria not in SERVICE_CATEGORIES or data.tipo_servico not in SERVICE_CATEGORIES[data.categoria]:
        raise HTTPException(400, "Tipo de serviço inválido para a categoria")
    if data.tipo_contrato not in CONTRACT_TYPES:
        raise HTTPException(400, "Tipo de contrato inválido")
    if data.categoria == "Dedetização" and data.operador not in ("Operador 1", "Operador 2"):
        raise HTTPException(400, "Selecione o operador da dedetização")
    if data.categoria == "Higienização": data.operador = None
    s = Servico(cliente_id=cliente_id, **data.model_dump())
    db.add(s); db.commit(); db.refresh(s)
    return s

@app.patch("/api/servicos/{servico_id}/status")
def atualizar_status(servico_id: int, status: str, db: Session = Depends(get_db)):
    s = db.get(Servico, servico_id)
    if not s: raise HTTPException(404, "Serviço não encontrado")
    s.status = status; db.commit(); db.refresh(s)
    return s

@app.get("/api/agenda")
def agenda(data: date | None = None, status: str | None = None, db: Session = Depends(get_db)):
    q = db.query(Servico, Cliente).join(Cliente, Cliente.id == Servico.cliente_id)
    if data: q = q.filter(Servico.data_agendamento == data)
    if status: q = q.filter(Servico.status == status)
    q = q.order_by(Servico.data_agendamento.asc(), Servico.horario.asc(), Cliente.nome.asc())
    return [{
        "id": s.id, "cliente_id": c.id, "cliente_nome": c.nome, "telefone": c.telefone,
        "endereco": c.endereco, "categoria": s.categoria, "tipo_servico": s.tipo_servico,
        "data_agendamento": s.data_agendamento, "horario": s.horario, "status": s.status,
        "valor": float(s.valor) if s.valor is not None else None, "observacoes": s.observacoes,
        "operador": s.operador
    } for s, c in q.all()]

@app.get("/api/dashboard")
def dashboard(db: Session = Depends(get_db)):
    hoje = date.today()
    clientes = db.query(func.count(Cliente.id)).scalar() or 0
    agendados = db.query(func.count(Servico.id)).filter(
        Servico.data_agendamento == hoje, Servico.status.in_(["Agendado", "Confirmado"])
    ).scalar() or 0
    servicos = db.query(func.count(Servico.id)).scalar() or 0
    recebido = db.query(func.coalesce(func.sum(Servico.valor), 0)).filter(Servico.status == "Pago").scalar() or 0
    a_receber = db.query(func.coalesce(func.sum(Servico.valor), 0)).filter(
        Servico.status != "Pago", Servico.status != "Cancelado"
    ).scalar() or 0
    pendentes = db.query(func.count(Servico.id)).filter(
        Servico.status.in_(["Aguardando pagamento", "Agendado", "Confirmado"])
    ).scalar() or 0
    q = db.query(Servico, Cliente).join(Cliente, Cliente.id == Servico.cliente_id).filter(
        Servico.data_agendamento == hoje
    ).order_by(Servico.horario.asc(), Cliente.nome.asc())
    items = [{
        "id": s.id, "cliente_id": c.id, "cliente_nome": c.nome,
        "categoria": s.categoria, "tipo_servico": s.tipo_servico, "horario": s.horario,
        "status": s.status, "valor": float(s.valor) if s.valor is not None else None,
        "operador": s.operador
    } for s, c in q.all()]

    # Contratos (não avulsos) que faltam 1 mês ou menos para vencer.
    contratos_q = db.query(Servico, Cliente).join(Cliente, Cliente.id == Servico.cliente_id).filter(
        Servico.tipo_contrato != "Avulso"
    ).all()
    contratos_vencendo = []
    for s, c in contratos_q:
        venc = calcular_vencimento_contrato(s.data_agendamento, s.tipo_contrato)
        if not venc:
            continue
        dias_restantes = (venc - hoje).days
        if 0 <= dias_restantes <= 30:
            contratos_vencendo.append({
                "servico_id": s.id, "cliente_id": c.id, "cliente_nome": c.nome,
                "telefone": c.telefone, "nome_contato": c.nome_contato,
                "tipo_servico": s.tipo_servico, "tipo_contrato": s.tipo_contrato,
                "data_vencimento": venc.isoformat(), "dias_restantes": dias_restantes
            })
    contratos_vencendo.sort(key=lambda x: x["dias_restantes"])

    return {
        "clientes": clientes, "agendados": agendados, "servicos": servicos,
        "a_receber": float(a_receber), "recebido": float(recebido), "pendentes": pendentes,
        "data_hoje": hoje.strftime("%d/%m/%Y"),
        "hoje": {
            "operador_1": [x for x in items if x["categoria"] == "Dedetização" and x["operador"] == "Operador 1"],
            "operador_2": [x for x in items if x["categoria"] == "Dedetização" and x["operador"] == "Operador 2"],
            "limpeza": [x for x in items if x["categoria"] == "Higienização"]
        },
        "contratos_vencendo": {
            "total": len(contratos_vencendo),
            "itens": contratos_vencendo
        }
    }

def norm(v):
    if v is None or (isinstance(v, float) and pd.isna(v)): return ""
    return re.sub(r"\s+", " ", str(v).strip().lower())

def value(v):
    if v is None or (isinstance(v, float) and pd.isna(v)): return None
    s = str(v).strip()
    return None if not s or s.lower() == "nan" else s

def as_date(v):
    if v is None or (isinstance(v, float) and pd.isna(v)): return None
    try:
        return pd.to_datetime(v).date()
    except Exception:
        return None

def clean_number(v):
    if v is None or (isinstance(v, float) and pd.isna(v)): return None
    if isinstance(v, float) and v.is_integer(): return str(int(v))
    return str(v).strip()

def system_general_dataframe(content):
    """Lê o SISTEMA GERAL, cuja tabela começa na linha 6 do Excel."""
    sheets = pd.read_excel(BytesIO(content), sheet_name=None, header=5)
    # A primeira aba contém a base de clientes. Procuramos a aba que tenha CLIENTE.
    for sheet, df in sheets.items():
        normalized = {norm(c): c for c in df.columns}
        if "cliente" in normalized and ("c.n.p.j." in normalized or "razao social" in normalized):
            return sheet, df
    raise ValueError("Não encontrei no arquivo uma aba do Sistema Geral com a tabela de clientes.")

def import_system_df(df, db):
    col = {norm(c): c for c in df.columns}
    def get(row, *names):
        for n in names:
            if n in col: return row[col[n]]
        return None

    inserted = updated = skipped = 0
    errors = []
    for i, row in df.iterrows():
        try:
            nome = value(get(row, "cliente"))
            if not nome:
                skipped += 1
                continue

            tipo = value(get(row, "descrição do local"))
            data_cad = as_date(get(row, "data"))
            razao = value(get(row, "razão social"))
            cnpj = value(get(row, "c.n.p.j."))
            ie = value(get(row, "insc. estadual"))
            contato = value(get(row, "contato"))
            rua = value(get(row, "rua - avenida - estrada - travessa ..."))
            numero = clean_number(get(row, "número"))
            complemento = value(get(row, "complemento"))
            bairro = value(get(row, "bairro"))
            email = value(get(row, "e-mail"))
            telefone = value(get(row, "telefone"))

            endereco = " ".join(x for x in [rua, numero] if x)
            if not endereco: endereco = "Não informado"
            if not telefone: telefone = "Não informado"

            # A coluna PROP. do Excel é ignorada — o identificador do cliente
            # passa a ser exclusivamente o id auto-incremento do banco.
            # A identidade de importação é combinada por nome/endereço/telefone.
            existing = db.query(Cliente).filter(
                Cliente.nome == nome, Cliente.endereco == endereco, Cliente.telefone == telefone
            ).first()

            payload = dict(
                nome=nome, tipo_estabelecimento=tipo, data_cadastro=data_cad,
                razao_social=razao, cnpj=cnpj, inscricao_estadual=ie, nome_contato=contato,
                endereco=endereco, bairro=bairro, complemento=complemento, email=email, telefone=telefone
            )
            # Savepoint por linha: se essa linha específica violar alguma restrição
            # do banco (ex.: texto maior que a coluna), só ela é descartada — o
            # restante da importação continua normalmente.
            with db.begin_nested():
                if existing:
                    for k, v in payload.items(): setattr(existing, k, v)
                    updated += 1
                else:
                    db.add(Cliente(**payload))
                    inserted += 1
                db.flush()
        except Exception as e:
            errors.append(f"Linha {i+7}: {e}")
    db.commit()
    return inserted, updated, skipped, errors

def make_pdf(cliente: Cliente, servico: Servico, titulo: str):
    buf = BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, rightMargin=45, leftMargin=45, topMargin=45, bottomMargin=45)
    styles = getSampleStyleSheet(); styles["Title"].alignment = TA_CENTER
    story = [Paragraph("DEDETIZADORA NOCAUTE", styles["Title"]), Paragraph(titulo, styles["Heading2"]), Spacer(1,20)]
    data = [
        ["ID", str(cliente.id)], ["Cliente", cliente.nome],
        ["Tipo de estabelecimento", cliente.tipo_estabelecimento or ""],
        ["Razão social", cliente.razao_social or ""], ["CNPJ", cliente.cnpj or ""],
        ["Contato", cliente.nome_contato or ""], ["Endereço", cliente.endereco],
        ["Bairro", cliente.bairro or ""], ["Complemento", cliente.complemento or ""],
        ["E-mail", cliente.email or ""], ["Telefone", cliente.telefone],
        ["Categoria", servico.categoria], ["Serviço", servico.tipo_servico],
        ["Data", servico.data_agendamento.strftime("%d/%m/%Y")],
        ["Horário", servico.horario or "Não informado"], ["Status", servico.status],
        ["Valor", f"R$ {float(servico.valor):,.2f}".replace(",","X").replace(".",",").replace("X",".") if servico.valor is not None else "Não informado"],
        ["Observações", servico.observacoes or ""]
    ]
    t = Table(data, colWidths=[130, 350])
    t.setStyle(TableStyle([
        ("GRID",(0,0),(-1,-1),0.5,colors.grey), ("BACKGROUND",(0,0),(0,-1),colors.whitesmoke),
        ("VALIGN",(0,0),(-1,-1),"TOP"), ("PADDING",(0,0),(-1,-1),7)
    ]))
    story += [t, Spacer(1,40), Paragraph("Documento gerado pelo Sistema RINGUE / Nocaute.", styles["Normal"])]
    doc.build(story); buf.seek(0); return buf

@app.get("/api/clientes/{cliente_id}/documento")
def documento(cliente_id: int, servico_id: int, tipo: str = "ordem", db: Session = Depends(get_db)):
    c = db.get(Cliente, cliente_id); s = db.get(Servico, servico_id)
    if not c or not s or s.cliente_id != cliente_id: raise HTTPException(404, "Cliente/serviço não encontrado")
    titulo = "ORDEM DE SERVIÇO" if tipo == "ordem" else "COMPROVANTE DE SERVIÇO"
    pdf = make_pdf(c, s, titulo)
    return StreamingResponse(pdf, media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="documento_{cliente_id}_{servico_id}.pdf"'})
