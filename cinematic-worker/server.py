#!/usr/bin/env python3
"""ESN Cinematic AI worker.

This server intentionally wraps a locally installed LTX-2.5 checkout instead of
sending prompts or video to a paid third-party API. It uses only Python's
standard library for the HTTP layer.

Required before startup:
  LTX_LICENSE_ACCEPTED=true
  CINEMATIC_API_TOKEN=<long random secret>
  LTX_REPO=/opt/LTX-2

Model paths are configured through environment variables documented in
cinematic-worker/.env.example.
"""

from __future__ import annotations

import json
import os
import queue
import secrets
import shutil
import subprocess
import threading
import time
from dataclasses import asdict, dataclass
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import urlparse


ROOT = Path(__file__).resolve().parent
OUTPUT_ROOT = Path(os.environ.get("CINEMATIC_OUTPUT_DIR", str(ROOT / "outputs"))).resolve()
OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)

BIND = os.environ.get("CINEMATIC_BIND", "127.0.0.1")
PORT = int(os.environ.get("CINEMATIC_PORT", "8765"))
API_TOKEN = os.environ.get("CINEMATIC_API_TOKEN", "").strip()

LTX_REPO = Path(os.environ.get("LTX_REPO", "/opt/LTX-2")).resolve()
TRANSFORMER = os.environ.get(
    "LTX_TRANSFORMER",
    "models/ltx-2.5/diffusion_models/ltx-2.5-22b-distilled-transformer-bf16.safetensors",
)
TEXT_ENCODER = os.environ.get(
    "LTX_TEXT_ENCODER",
    "models/ltx-2.5/text_encoders/gemma4-12b-with-proj-ltx-2.5-bf16.safetensors",
)
VIDEO_VAE = os.environ.get(
    "LTX_VIDEO_VAE",
    "models/ltx-2.5/vae/ltx-2.5-video-vae-bf16.safetensors",
)
AUDIO_VAE = os.environ.get(
    "LTX_AUDIO_VAE",
    "models/ltx-2.5/vae/ltx-2.5-audio-vae-bf16.safetensors",
)
SPATIAL_UPSCALER = os.environ.get(
    "LTX_SPATIAL_UPSCALER",
    "models/ltx-2.5/latent_upscale_models/ltx-2.5-latent-spatial-upscaler-x2-bf16-1.0.safetensors",
)
DETAILING_LORA = os.environ.get("LTX_DETAILING_LORA", "").strip()
ESN_LORA = os.environ.get("LTX_ESN_LORA", "").strip()
ESN_LORA_STRENGTH = float(os.environ.get("LTX_ESN_LORA_STRENGTH", "0.8"))
OFFLOAD = os.environ.get("LTX_OFFLOAD", "cpu").strip().lower()
QUANTIZATION = os.environ.get("LTX_QUANTIZATION", "").strip().lower()
MAX_QUEUE = int(os.environ.get("CINEMATIC_MAX_QUEUE", "5"))

if os.environ.get("LTX_LICENSE_ACCEPTED", "").strip().lower() not in {"1", "true", "yes", "on"}:
    raise SystemExit(
        "LTX_LICENSE_ACCEPTED is not true. Review the LTX-2.x license before starting ESN Cinematic AI."
    )

if not API_TOKEN:
    raise SystemExit("CINEMATIC_API_TOKEN is required. Never run the worker remotely without authentication.")


@dataclass
class Job:
    id: str
    prompt: str
    preset: str
    format: str
    seconds: int
    quality: str
    seed: int
    requested_by: str | None
    status: str = "queued"
    progress: float = 0.0
    output: str | None = None
    error: str | None = None
    created_at: float = 0.0
    started_at: float | None = None
    completed_at: float | None = None


jobs: dict[str, Job] = {}
processes: dict[str, subprocess.Popen[str]] = {}
job_queue: queue.Queue[str] = queue.Queue(maxsize=MAX_QUEUE)
lock = threading.Lock()


def _save(job: Job) -> None:
    folder = OUTPUT_ROOT / job.id
    folder.mkdir(parents=True, exist_ok=True)
    (folder / "job.json").write_text(json.dumps(asdict(job), indent=2), encoding="utf-8")


def _load_previous_jobs() -> None:
    for metadata in OUTPUT_ROOT.glob("*/job.json"):
        try:
            raw = json.loads(metadata.read_text(encoding="utf-8"))
            job = Job(**raw)
            if job.status in {"queued", "running"}:
                job.status = "failed"
                job.error = "Worker restarted before generation completed."
                job.completed_at = time.time()
                _save(job)
            jobs[job.id] = job
        except Exception:
            continue


def _resolve_model_path(value: str) -> str:
    path = Path(value)
    return str(path if path.is_absolute() else LTX_REPO / path)


def _dimensions(fmt: str) -> tuple[int, int]:
    if fmt == "16:9":
        return 1024, 576
    if fmt == "1:1":
        return 768, 768
    return 576, 1024


def _frames(seconds: int) -> int:
    # LTX video VAEs operate cleanly on frame counts shaped like 8n+1.
    target = max(4, min(30, seconds)) * 24
    return max(9, ((target - 1) // 8) * 8 + 1)


def _gpu_name() -> str:
    try:
        result = subprocess.run(
            ["nvidia-smi", "--query-gpu=name,memory.total", "--format=csv,noheader"],
            capture_output=True,
            text=True,
            timeout=5,
            check=False,
        )
        if result.returncode == 0 and result.stdout.strip():
            return result.stdout.strip().splitlines()[0]
    except Exception:
        pass
    return "not detected"


def _assert_runtime() -> None:
    if not LTX_REPO.exists():
        raise RuntimeError("LTX_REPO does not exist: " + str(LTX_REPO))
    if shutil.which("uv") is None:
        raise RuntimeError("uv is not installed on the GPU worker.")

    required = [TRANSFORMER, TEXT_ENCODER, VIDEO_VAE, AUDIO_VAE, SPATIAL_UPSCALER]
    missing = [_resolve_model_path(item) for item in required if not Path(_resolve_model_path(item)).exists()]
    if missing:
        raise RuntimeError("Missing LTX model files: " + ", ".join(missing))


def _build_command(job: Job, output: Path) -> list[str]:
    width, height = _dimensions(job.format)
    common = [
        "uv", "run", "python", "-m",
        "ltx_pipelines.dfr_pipeline" if job.quality == "production" else "ltx_pipelines.distilled",
        "--transformer-path", _resolve_model_path(TRANSFORMER),
        "--text-encoder-path", _resolve_model_path(TEXT_ENCODER),
        "--video-vae-path", _resolve_model_path(VIDEO_VAE),
        "--audio-vae-path", _resolve_model_path(AUDIO_VAE),
        "--spatial-upsampler-path", _resolve_model_path(SPATIAL_UPSCALER),
        "--num-frames", str(_frames(job.seconds)),
        "--width", str(width),
        "--height", str(height),
        "--seed", str(job.seed),
        "--output-path", str(output),
        "--prompt", job.prompt,
    ]

    if job.quality == "production":
        if not DETAILING_LORA:
            raise RuntimeError("Production quality requires LTX_DETAILING_LORA.")
        detail_path = _resolve_model_path(DETAILING_LORA)
        if not Path(detail_path).exists():
            raise RuntimeError("LTX_DETAILING_LORA file not found.")
        common.extend(["--detailing-lora", detail_path])

    if OFFLOAD in {"cpu", "disk"}:
        common.extend(["--offload", OFFLOAD])

    if QUANTIZATION in {"fp8-cast", "fp8-scaled-mm"}:
        common.extend(["--quantization", QUANTIZATION])

    if ESN_LORA:
        lora_path = _resolve_model_path(ESN_LORA)
        if Path(lora_path).exists():
            common.extend(["--lora", lora_path, str(ESN_LORA_STRENGTH)])

    return common


def _run_job(job_id: str) -> None:
    with lock:
        job = jobs[job_id]
        job.status = "running"
        job.progress = 0.05
        job.started_at = time.time()
        _save(job)

    folder = OUTPUT_ROOT / job.id
    output = folder / "output.mp4"
    log_file = folder / "ltx.log"

    try:
        _assert_runtime()
        command = _build_command(job, output)

        with log_file.open("w", encoding="utf-8") as log:
            process = subprocess.Popen(
                command,
                cwd=LTX_REPO,
                stdout=log,
                stderr=subprocess.STDOUT,
                text=True,
            )
            with lock:
                processes[job.id] = process
            return_code = process.wait()

        with lock:
            processes.pop(job.id, None)

        if return_code != 0:
            tail = ""
            try:
                tail = log_file.read_text(encoding="utf-8", errors="replace")[-4000:]
            except Exception:
                pass
            raise RuntimeError("LTX generation failed. " + tail)

        if not output.exists() or output.stat().st_size == 0:
            raise RuntimeError("LTX finished without creating a usable output video.")

        with lock:
            job.status = "complete"
            job.progress = 1.0
            job.output = str(output)
            job.completed_at = time.time()
            _save(job)

    except Exception as exc:
        with lock:
            processes.pop(job.id, None)
            job.status = "failed"
            job.error = str(exc)[-4000:]
            job.completed_at = time.time()
            _save(job)


def _worker_loop() -> None:
    while True:
        job_id = job_queue.get()
        try:
            _run_job(job_id)
        finally:
            job_queue.task_done()


def _queued_running_counts() -> tuple[int, int]:
    with lock:
        queued = sum(1 for item in jobs.values() if item.status == "queued")
        running = sum(1 for item in jobs.values() if item.status == "running")
    return queued, running


class Handler(BaseHTTPRequestHandler):
    server_version = "ESNCinematicAI/1.0"

    def log_message(self, fmt: str, *args: Any) -> None:
        print("[cinematic]", fmt % args)

    def _authorized(self) -> bool:
        supplied = self.headers.get("Authorization", "")
        return secrets.compare_digest(supplied, "Bearer " + API_TOKEN)

    def _json(self, status: int, body: dict[str, Any]) -> None:
        encoded = json.dumps(body).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)

    def _read_json(self) -> dict[str, Any]:
        size = int(self.headers.get("Content-Length", "0"))
        if size <= 0 or size > 64 * 1024:
            raise ValueError("Invalid request size.")
        return json.loads(self.rfile.read(size).decode("utf-8"))

    def _job_id_from_path(self) -> str | None:
        parts = [item for item in urlparse(self.path).path.split("/") if item]
        if len(parts) >= 3 and parts[0] == "v1" and parts[1] == "jobs":
            return parts[2]
        return None

    def do_GET(self) -> None:
        if not self._authorized():
            self._json(HTTPStatus.UNAUTHORIZED, {"error": "unauthorized"})
            return

        parsed = urlparse(self.path)
        if parsed.path == "/v1/health":
            queued, running = _queued_running_counts()
            self._json(
                HTTPStatus.OK,
                {
                    "ok": True,
                    "backend": "LTX-2.5 self-hosted",
                    "gpu": _gpu_name(),
                    "queued": queued,
                    "running": running,
                    "esn_lora": bool(ESN_LORA and Path(_resolve_model_path(ESN_LORA)).exists()),
                },
            )
            return

        job_id = self._job_id_from_path()
        if job_id:
            with lock:
                job = jobs.get(job_id)
            if not job:
                self._json(HTTPStatus.NOT_FOUND, {"error": "job not found"})
                return

            if parsed.path.endswith("/file"):
                if job.status != "complete" or not job.output:
                    self._json(HTTPStatus.CONFLICT, {"error": "job output is not ready"})
                    return
                output = Path(job.output)
                if not output.exists():
                    self._json(HTTPStatus.NOT_FOUND, {"error": "output file is missing"})
                    return
                size = output.stat().st_size
                self.send_response(HTTPStatus.OK)
                self.send_header("Content-Type", "video/mp4")
                self.send_header("Content-Length", str(size))
                self.send_header("Content-Disposition", 'attachment; filename="ESN-cinematic-' + job.id + '.mp4"')
                self.end_headers()
                with output.open("rb") as source:
                    shutil.copyfileobj(source, self.wfile)
                return

            self._json(HTTPStatus.OK, asdict(job))
            return

        self._json(HTTPStatus.NOT_FOUND, {"error": "not found"})

    def do_POST(self) -> None:
        if not self._authorized():
            self._json(HTTPStatus.UNAUTHORIZED, {"error": "unauthorized"})
            return

        parsed = urlparse(self.path)
        if parsed.path == "/v1/jobs":
            if job_queue.full():
                self._json(HTTPStatus.TOO_MANY_REQUESTS, {"error": "cinematic queue is full"})
                return

            try:
                body = self._read_json()
                prompt = str(body.get("prompt", "")).strip()
                if not prompt or len(prompt) > 6000:
                    raise ValueError("Prompt must contain 1-6000 characters.")

                seconds = int(body.get("seconds", 8))
                if seconds < 4 or seconds > 30:
                    raise ValueError("seconds must be between 4 and 30")

                fmt = str(body.get("format", "9:16"))
                if fmt not in {"9:16", "16:9", "1:1"}:
                    raise ValueError("format must be 9:16, 16:9, or 1:1")

                quality = str(body.get("quality", "fast"))
                if quality not in {"fast", "production"}:
                    raise ValueError("quality must be fast or production")

                seed = int(body.get("seed", secrets.randbelow(2_000_000_000)))
                job_id = time.strftime("%Y%m%d-%H%M%S") + "-" + secrets.token_hex(3)
                job = Job(
                    id=job_id,
                    prompt=prompt,
                    preset=str(body.get("preset", "custom"))[:80],
                    format=fmt,
                    seconds=seconds,
                    quality=quality,
                    seed=seed,
                    requested_by=str(body.get("requested_by"))[:80] if body.get("requested_by") else None,
                    created_at=time.time(),
                )

                with lock:
                    jobs[job.id] = job
                    _save(job)
                job_queue.put_nowait(job.id)
                self._json(HTTPStatus.ACCEPTED, {"id": job.id, "status": job.status})
                return
            except (ValueError, TypeError, json.JSONDecodeError) as exc:
                self._json(HTTPStatus.BAD_REQUEST, {"error": str(exc)})
                return

        job_id = self._job_id_from_path()
        if job_id and parsed.path.endswith("/cancel"):
            with lock:
                job = jobs.get(job_id)
                process = processes.get(job_id)
                if not job:
                    self._json(HTTPStatus.NOT_FOUND, {"error": "job not found"})
                    return
                if job.status not in {"queued", "running"}:
                    self._json(HTTPStatus.CONFLICT, {"error": "job is not cancellable"})
                    return
                if process:
                    process.terminate()
                job.status = "cancelled"
                job.error = "Cancelled by request."
                job.completed_at = time.time()
                _save(job)
            self._json(HTTPStatus.OK, {"id": job.id, "status": job.status})
            return

        self._json(HTTPStatus.NOT_FOUND, {"error": "not found"})


def main() -> None:
    _load_previous_jobs()
    thread = threading.Thread(target=_worker_loop, daemon=True, name="esn-cinematic-worker")
    thread.start()

    print("ESN Cinematic AI worker")
    print("Bind:", BIND + ":" + str(PORT))
    print("LTX repo:", LTX_REPO)
    print("GPU:", _gpu_name())
    print("Output:", OUTPUT_ROOT)
    server = ThreadingHTTPServer((BIND, PORT), Handler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
