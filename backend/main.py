from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List
import math
import numpy as np

app = FastAPI()

# Allow CORS from frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

class DeclineInput(BaseModel):
    t1: float
    q1: float
    t2: float
    q2: float
    original_q: List[float]  

@app.post("/calculate")
def calculate_decline(data: DeclineInput):
    t1, q1, t2, q2 = data.t1, data.q1, data.t2, data.q2
    D = (math.log(q1 / q2)) / (t2 - t1)

    result = []
    t_range = np.arange(t1, t2 + 1, 1)
    t_extra = np.arange(t2 + 1, t2 + 800, 1)

    original_q = data.original_q
    Np_observed = sum(original_q[:int(t2)])  
    Np_extrapolated = q2 / D
    Np_total = Np_observed + Np_extrapolated

    for t in np.concatenate([t_range, t_extra]):
        qt = q1 * math.exp(-D * (t - t1))
        result.append({ "t": float(t), "qt": qt })

    return {
        "D": D,
        "curve": result,
        "Np_observed": Np_observed,
        "Np_extrapolated": Np_extrapolated,
        "Np_total": Np_total
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000)
