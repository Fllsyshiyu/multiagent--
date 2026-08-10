"""DistilBERT-only six-dimensional task complexity service.

The checkpoint's DistilBERT encoder embeds the query and calibrated textual
anchors for each of the six MA-Collab complexity dimensions. No LLM, keyword
heuristic, or no_llm/small_llm/large_llm routing label is used.
"""
from __future__ import annotations

import os
import time
from contextlib import asynccontextmanager

import torch
import torch.nn.functional as F
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from transformers import AutoModelForSequenceClassification, AutoTokenizer

MODEL_ID = os.getenv("QUERY_COMPLEXITY_MODEL", "tripathyShaswata/QueryComplexityRouter")
MAX_LENGTH = int(os.getenv("QUERY_COMPLEXITY_MAX_LENGTH", "256"))
TEMPERATURE = float(os.getenv("QUERY_COMPLEXITY_TEMPERATURE", "0.035"))

DIMENSION_ANCHORS: dict[str, list[str]] = {
    "reasoning_depth": [
        "A task requiring no reasoning, only direct copying, extraction, formatting, or arithmetic.",
        "A task requiring one simple inference, explanation, or straightforward judgment.",
        "A task requiring standard multi-step reasoning, comparison, analysis, or planning.",
        "A task requiring deep reasoning, difficult derivation, debugging, or iterative verification.",
        "An open research task, unsolved problem, or task requiring original scientific discovery.",
    ],
    "step_count": [
        "A task completed in one direct operation.",
        "A task with two or three mostly independent simple steps.",
        "A task with several sequential steps where later work uses earlier results.",
        "A task with many interdependent phases including implementation and validation.",
        "A long-running dynamic program whose steps change with real-world feedback.",
    ],
    "domain_expertise": [
        "A task requiring no specialist knowledge and only everyday knowledge.",
        "A task requiring basic commonly taught knowledge.",
        "A task requiring normal professional or undergraduate domain knowledge.",
        "A task requiring advanced expert knowledge or multiple technical disciplines.",
        "A task requiring frontier expertise, original research, or undiscovered knowledge.",
    ],
    "tool_dependency": [
        "A task requiring no external tool, retrieval, code execution, or file access.",
        "A task requiring one simple lookup, calculation, or tool call.",
        "A task requiring repeated operations with one tool, dataset, file, or code environment.",
        "A task requiring several tools, iterative execution, testing, browsing, or deployment.",
        "A task requiring physical experiments, production operations, clinical trials, or real-world action.",
    ],
    "coordination": [
        "A task for one independent executor with no coordination.",
        "A task requiring minor context coordination or consistency across a small output.",
        "A task spanning multiple modules, components, roles, or viewpoints.",
        "A task involving conflicting stakeholders, complex dependencies, negotiation, or team coordination.",
        "A task requiring long-term cross-organization coordination or dynamic strategic interaction.",
    ],
    "uncertainty": [
        "A fully specified task with a clear and easily verified correct answer.",
        "A mostly clear task with a few harmless choices.",
        "A task requiring assumptions, tradeoffs, or selection among plausible solutions.",
        "A task with missing information, difficult validation, or highly uncertain outcomes.",
        "A highly open-ended and unpredictable task with no known correct answer.",
    ],
}


class ClassifyRequest(BaseModel):
    query: str = Field(min_length=1, max_length=20_000)


class DimensionResult(BaseModel):
    score: int = Field(ge=0, le=4)
    confidence: float = Field(ge=0, le=1)
    probabilities: list[float] = Field(min_length=5, max_length=5)


class ClassifyResponse(BaseModel):
    dimensions: dict[str, DimensionResult]
    complexity: int = Field(ge=1, le=5)
    confidence: float = Field(ge=0, le=1)
    model: str
    latency_ms: float
    method: str = "distilbert_anchor_similarity_v1"


class ModelRuntime:
    tokenizer = None
    classifier_model = None
    encoder = None
    anchor_embeddings: dict[str, torch.Tensor] = {}

    def load(self) -> None:
        self.tokenizer = AutoTokenizer.from_pretrained(MODEL_ID)
        self.classifier_model = AutoModelForSequenceClassification.from_pretrained(MODEL_ID)
        self.classifier_model.eval()
        self.encoder = self.classifier_model.distilbert
        self.encoder.eval()
        self.anchor_embeddings = {
            dimension: self._encode(texts)
            for dimension, texts in DIMENSION_ANCHORS.items()
        }

    def _encode(self, texts: list[str]) -> torch.Tensor:
        if self.tokenizer is None or self.encoder is None:
            raise RuntimeError("model is not loaded")
        encoded = self.tokenizer(
            texts,
            return_tensors="pt",
            padding=True,
            truncation=True,
            max_length=MAX_LENGTH,
        )
        with torch.inference_mode():
            hidden = self.encoder(**encoded).last_hidden_state
            mask = encoded["attention_mask"].unsqueeze(-1)
            pooled = (hidden * mask).sum(dim=1) / mask.sum(dim=1).clamp(min=1)
        return F.normalize(pooled, p=2, dim=-1)

    def classify(self, query: str) -> ClassifyResponse:
        start = time.perf_counter()
        query_embedding = self._encode([query])[0]
        dimensions: dict[str, DimensionResult] = {}
        scores: dict[str, int] = {}
        confidences: list[float] = []

        for dimension, anchors in self.anchor_embeddings.items():
            similarities = torch.mv(anchors, query_embedding)
            probabilities = torch.softmax(similarities / TEMPERATURE, dim=0)
            expected = float(torch.sum(probabilities * torch.arange(5, dtype=probabilities.dtype)))
            score = max(0, min(4, round(expected)))
            confidence = float(probabilities.max())
            scores[dimension] = score
            confidences.append(confidence)
            dimensions[dimension] = DimensionResult(
                score=score,
                confidence=confidence,
                probabilities=[float(value) for value in probabilities],
            )

        return ClassifyResponse(
            dimensions=dimensions,
            complexity=calculate_complexity(scores),
            confidence=sum(confidences) / len(confidences),
            model=MODEL_ID,
            latency_ms=(time.perf_counter() - start) * 1000,
        )


def calculate_complexity(dimensions: dict[str, int]) -> int:
    values = list(dimensions.values())
    level4_count = sum(value == 4 for value in values)
    high_count = sum(value >= 3 for value in values)
    medium_count = sum(value >= 2 for value in values)
    if (
        dimensions["reasoning_depth"] == 4
        and (dimensions["domain_expertise"] >= 3 or dimensions["uncertainty"] >= 3)
    ) or (
        dimensions["tool_dependency"] == 4 and dimensions["step_count"] >= 3
    ) or level4_count >= 3:
        return 5
    if high_count >= 2 or (high_count >= 1 and medium_count >= 3):
        return 4
    if medium_count >= 2 or dimensions["reasoning_depth"] >= 2 or dimensions["step_count"] >= 2:
        return 3
    if any(value >= 1 for value in values):
        return 2
    return 1


runtime = ModelRuntime()


@asynccontextmanager
async def lifespan(_: FastAPI):
    runtime.load()
    yield


app = FastAPI(title="MA-Collab DistilBERT Complexity", version="2.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict[str, object]:
    return {
        "ok": runtime.encoder is not None,
        "model": MODEL_ID,
        "method": "distilbert_anchor_similarity_v1",
        "dimensions": list(DIMENSION_ANCHORS.keys()),
    }


@app.post("/classify", response_model=ClassifyResponse)
def classify(body: ClassifyRequest) -> ClassifyResponse:
    query = body.query.strip()
    if not query:
        raise HTTPException(status_code=422, detail="query must not be blank")
    try:
        return runtime.classify(query)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
