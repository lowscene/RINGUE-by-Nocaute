# RINGUE — Sistema Nocaute

Aplicação web para gestão da empresa de dedetização/higienização.

## Stack
- Frontend: React + Vite
- Backend: Python + FastAPI + SQLAlchemy
- Banco: MySQL 8.4
- Excel: pandas + openpyxl + xlrd
- PDF: ReportLab
- Execução: Docker Compose

## Clientes
A tabela de clientes agora contempla:
ID interno + ID do Excel, Nome, Tipo de estabelecimento, Data do cadastro, Razão social, CNPJ, Inscrição estadual, Nome do contato, Endereço, Bairro, Complemento, E-mail e Telefone.

O ID do Excel é preservado em `id_excel`. Ele não é usado como chave primária porque o Sistema Geral contém IDs `PROP.` repetidos para diferentes endereços/clientes.

## Sistema Geral
O projeto inclui `backend/data/SISTEMA GERAL.xlsx`, fornecido pela empresa.

No menu do aplicativo há:
- **Importar Excel**: para arquivos novos, com detecção automática do formato.
- **Sistema Geral**: importa diretamente o arquivo `SISTEMA GERAL.xlsx` incluído no projeto.

O Sistema Geral tem o cabeçalho real na linha 6 da planilha. O importador mapeia:
PROP. → ID do Excel
CLIENTE → Nome
DESCRIÇÃO DO LOCAL → Tipo de estabelecimento
DATA → Data do cadastro
RAZÃO SOCIAL → Razão social
C.N.P.J. → CNPJ
INSC. ESTADUAL → Inscrição estadual
CONTATO → Nome do contato
RUA... + NÚMERO → Endereço
BAIRRO → Bairro
COMPLEMENTO → Complemento
E-MAIL → E-mail
TELEFONE → Telefone

A importação é idempotente: importar o mesmo Sistema Geral novamente atualiza os registros encontrados em vez de criar cópias.

## Rodar
Com Docker Desktop iniciado e funcionando:

```bash
docker compose up --build
```

Depois:
- Sistema: http://localhost:5173
- API: http://localhost:8000
- Docs: http://localhost:8000/docs

## Atenção ao banco
O MySQL usa o volume `mysql_data`, portanto os dados continuam existindo quando os containers são parados. Não use `docker compose down -v` se quiser preservar o banco.
