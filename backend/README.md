# WildEye Backend

FastAPI backend for the WildEye project.

## Setup

```bash
cd backend
python -m venv venv
source venv/bin/activate   # On Windows: venv\Scripts\activate
pip install -r requirements.txt
```

## Run

```bash
uvicorn main:app --reload
```

API will be at **http://127.0.0.1:8000**

- **GET /** — Hello World
- **GET /health** — Health check
- **GET /docs** — Swagger UI
