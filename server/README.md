# Optionaler Konvertierungs-Backend (Referenz)

CoroaPDF läuft ohne dieses Backend – es ist ausschließlich für Funktionen gedacht, die im Browser technisch nicht zuverlässig möglich sind:

| Format        | Zweck                         | Empfohlenes Werkzeug (serverseitig)               |
| ------------- | ----------------------------- | ------------------------------------------------- |
| `docx-pdf`    | Word → PDF, layouttreu        | LibreOffice headless (`soffice --convert-to pdf`) |
| `pptx-pdf`    | PowerPoint → PDF              | LibreOffice headless                              |
| `xlsx-pdf`    | Excel → PDF                   | LibreOffice headless                              |
| `pdf-docx-hq` | PDF → DOCX mit Layout/Bildern | pdf2docx (Python) oder LibreOffice-Umweg          |

## Vertrag (API)

Die App ruft bei aktiviertem Backend auf:

```
POST {SERVER_PROCESSING_URL}/convert/{format}
Authorization: Bearer {SERVER_PROCESSING_TOKEN}
Content-Type: multipart/form-data
Body: file=<Datei>

Antwort: 200 + Binärdaten der konvertierten Datei (application/pdf bzw. .docx)
Fehler:  4xx/5xx mit JSON { "error": "..." }
```

Der Next.js-Proxy unter `src/app/api/convert/[format]/route.ts` validiert Format und Größe,
setzt den Auth-Header und leitet weiter. Er protokolliert keine Dateiinhalte oder -namen.

## Minimaler Beispiel-Dienst

```dockerfile
FROM linuxserver/libreoffice:latest
# Achtung: Nur als Ausgangspunkt! Vor Produktivbetrieb:
# - eigener HTTP-Wrapper (z.B. FastAPI) statt direkter Freigabe
# - Bearer-Token-Prüfung
# - Temporärverzeichnis mit automatischer Löschung nach jeder Anfrage
```

Skizze eines sicheren Wrappers (FastAPI):

```python
import shutil, tempfile, subprocess
from fastapi import FastAPI, UploadFile, Depends, HTTPException
from fastapi.security import APIKeyHeader

app = FastAPI()
TOKEN = APIKeyHeader(name="Authorization")

def check(auth: str = Depends(TOKEN)):
    if not auth.startswith("Bearer ") or auth[7:] != os.environ["SERVER_PROCESSING_TOKEN"]:
        raise HTTPException(401)

@app.post("/convert/docx-pdf", dependencies=[Depends(check)])
async def docx_to_pdf(file: UploadFile):
    with tempfile.TemporaryDirectory() as workdir:
        src = f"{workdir}/{file.filename}"
        with open(src, "wb") as handle:
            shutil.copyfileobj(file.file, handle)
        subprocess.run(["soffice", "--headless", "--convert-to", "pdf", "--outdir", workdir, src], check=True, timeout=120)
        result = open(src.rsplit(".", 1)[0] + ".pdf", "rb").read()
    # Temporärdirectory wird hier automatisch gelöscht
    from fastapi import Response
    return Response(result, media_type="application/pdf")
```

## Betriebliche Anforderungen

- **Löschgarantie:** Hochgeladene Dateien sofort nach der Antwort vernichten (Tempdir pro Request).
- **Keine Inhalte loggen:** Nur Statuscodes/Dauern protokollieren.
- **Ressourcenlimits:** Timeout (z. B. 120 s), max. Dateigröße, Worker-Anzahl begrenzen.
- **HTTPS erzwingen** (Reverse Proxy wie Caddy/Nginx/Traefik).

## Aktivierung

In `.env.local` (bzw. beim Hosting):

```
SERVER_PROCESSING_URL=https://konvertierung.example.com
SERVER_PROCESSING_TOKEN=<zufälliger 64-Zeichen-Hexwert>
```

Danach zeigt `/api/status` `{"enabled":true}` und die Office-Konvertierungen werden freigeschaltet.
