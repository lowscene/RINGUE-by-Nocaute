# Sistema Nocaute — Dedetizadora

Aplicação web para gestão de clientes, agendamentos, histórico de serviços, importação de Excel e geração de documentos PDF.

## Stack
- Frontend: React + Vite
- Backend: Python + FastAPI + SQLAlchemy
- Banco: MySQL 8.4
- Excel: pandas + openpyxl + xlrd
- Documentos: ReportLab
- Execução: Docker Compose

## Funcionalidades desta versão
- Dashboard com indicadores e divisão dos serviços do dia por operador/equipe.
- Pesquisa por nome, telefone e endereço.
- Cadastro, edição e exclusão de clientes.
- Menu individual do cliente.
- Agendamento de serviço.
- Categorias e tipos de serviço exatamente conforme solicitado.
- Histórico de serviços.
- Status: Agendado, Confirmado, Realizado, Cancelado, Aguardando pagamento e Pago.
- Agenda geral.
- Importação de Excel (.xlsx/.xls), com atualização de cliente quando nome + telefone já existem.
- Geração de ordem de serviço em PDF.
- MySQL persistente em volume Docker.

## Rodar
Pré-requisito: Docker Desktop instalado e aberto.

```bash
docker compose up --build
```

Depois abra:
- Sistema: http://localhost:5173
- API: http://localhost:8000
- Documentação da API: http://localhost:8000/docs

## Excel
O importador procura colunas equivalentes a:
- Nome / Cliente / Name
- Endereço / Endereço / Address
- Telefone / Celular / Phone

O arquivo pode ter mais colunas; elas serão ignoradas nesta primeira versão. O próximo passo, quando o Excel real for fornecido, é mapear também os históricos de serviços, valores, pagamentos e outros campos existentes na empresa.

## Produção
Antes de publicar na internet, altere as senhas do MySQL, coloque HTTPS, restrinja CORS, configure backup automático e use um proxy reverso.
