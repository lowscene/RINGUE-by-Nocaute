from sqlalchemy import Column, Integer, String, Text, Date, DateTime, ForeignKey, Numeric
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from dateutil.relativedelta import relativedelta
from .database import Base

SERVICE_CATEGORIES = {
    "Dedetização": ["Desinsetização", "Desbaratização", "Desratização", "Descupinização"],
    "Higienização": ["Limpeza de cisterna", "Limpeza de caixa d'água", "Limpeza de caixa de gordura", "Desentupimento"],
}

# Tipos de contrato disponíveis para um serviço e sua duração em meses
# (Avulso não tem duração, portanto nunca "vence").
CONTRACT_TYPES = ["Avulso", "3 meses", "6 meses", "1 ano"]
CONTRACT_MONTHS = {"3 meses": 3, "6 meses": 6, "1 ano": 12}

def calcular_vencimento_contrato(data_agendamento, tipo_contrato):
    """Calcula a data de vencimento do contrato a partir da data do serviço.
    Retorna None para contratos avulsos ou quando não é possível calcular."""
    meses = CONTRACT_MONTHS.get(tipo_contrato)
    if not meses or not data_agendamento:
        return None
    return data_agendamento + relativedelta(months=meses)

class ImportStatus(Base):
    __tablename__ = "import_status"
    chave = Column(String(60), primary_key=True)
    valor = Column(String(20), nullable=False)

class Cliente(Base):
    __tablename__ = "clientes"
    id = Column(Integer, primary_key=True, autoincrement=True)
    nome = Column(String(180), nullable=False, index=True)
    tipo_estabelecimento = Column(String(120), nullable=True, index=True)
    data_cadastro = Column(Date, nullable=True, index=True)
    razao_social = Column(String(300), nullable=True)
    cnpj = Column(String(30), nullable=True, index=True)
    inscricao_estadual = Column(String(60), nullable=True)
    nome_contato = Column(String(180), nullable=True)
    endereco = Column(String(350), nullable=False)
    bairro = Column(String(120), nullable=True, index=True)
    complemento = Column(String(180), nullable=True)
    email = Column(String(180), nullable=True, index=True)
    telefone = Column(String(80), nullable=False, index=True)
    criado_em = Column(DateTime, server_default=func.now(), nullable=False)
    atualizado_em = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)
    servicos = relationship("Servico", back_populates="cliente", cascade="all, delete-orphan")

class Servico(Base):
    __tablename__ = "servicos"
    id = Column(Integer, primary_key=True)
    cliente_id = Column(Integer, ForeignKey("clientes.id", ondelete="CASCADE"), nullable=False, index=True)
    categoria = Column(String(40), nullable=False)
    tipo_servico = Column(String(120), nullable=False)
    data_agendamento = Column(Date, nullable=False, index=True)
    horario = Column(String(5), nullable=True)
    status = Column(String(40), nullable=False, default="Agendado", index=True)
    valor = Column(Numeric(10,2), nullable=True)
    observacoes = Column(Text, nullable=True)
    operador = Column(String(40), nullable=True)
    tipo_contrato = Column(String(20), nullable=False, default="Avulso", index=True)
    criado_em = Column(DateTime, server_default=func.now(), nullable=False)
    cliente = relationship("Cliente", back_populates="servicos")

    @property
    def data_vencimento(self):
        return calcular_vencimento_contrato(self.data_agendamento, self.tipo_contrato)
