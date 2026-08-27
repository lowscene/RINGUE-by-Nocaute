import os
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

DATABASE_URL = os.getenv("DATABASE_URL", "mysql+pymysql://nocaute:nocaute@db:3306/nocaute")
# O PyMySQL usa "latin1" por padrão se o charset não for definido explicitamente.
# Isso faz com que qualquer texto com acentuação (nomes, endereços, bairros do
# Sistema Geral) quebre a transação inteira ao salvar no banco. Forçamos utf8mb4
# aqui para que a conexão funcione independente do que vier em DATABASE_URL.
engine = create_engine(
    DATABASE_URL, pool_pre_ping=True, pool_recycle=280, future=True,
    connect_args={"charset": "utf8mb4"}
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
