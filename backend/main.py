from fastapi import FastAPI, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import kml2geojson
import io


app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=['*']
)

@app.post("/kml2geojson")
async def create_file(file: bytes = File()):
    try:
        fileObject = io.BytesIO(file)
        result = kml2geojson.main.convert(fileObject,'')
        return {"file_size": len(file),"geoJSON":result[0]}
    except:
        raise HTTPException(status_code=400, detail="Ошибка конвертации KML в geojson")


