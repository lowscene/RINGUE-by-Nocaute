from sqlalchemy import Column, Integer, String, Text, Date, DateTime, ForeignKey, Numeric, Enum
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from .database import Base

SERVICE_CATEGORIES = {
    "Dedetização": ["Desinsetização", "Desbaratização", "Desratização", "Descupinização"],
    "Higienização": ["Limpeza de cisterna", "Limpeza de caixa d'água", "Limpeza de caixa de gordura", "Desentupimento"],
}

class Cliente(Base):
    __tablename__ = "clientes"
    id = Column(Integer, primary_key=True)
    nome = Column(String(180), nullable=False, index=True)
    endereco = Column(String(300), nullable=False)
    telefone = Column(String(40), nullable=False, index=True)
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
    criado_em = Column(DateTime, server_default=func.now(), nullable=False)
    cliente = relationship("Cliente", back_populates="servicos")
