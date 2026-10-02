# ESN Cinematic AI Worker

This folder turns a GPU machine into the private generation backend for ESN Operator.

## What it does

- Self-hosted text-to-video through LTX-2.5.
- Image-to-video from Discord reference images.
- AI retake/remix of uploaded gameplay or CAM footage.
- Fast and production-quality generation paths.
- Optional custom ESN LoRA loading.
- Authenticated job queue.
- Job status, cancellation and MP4 delivery.
- No third-party per-video API is required once the GPU machine and model weights are available.

The Discord bot can still use /video free-edit without this worker. That path uses FFmpeg only.

## Architecture

Discord /video command
→ ESN Operator bot
→ authenticated private HTTP request
→ ESN Cinematic AI GPU worker
→ local LTX-2.5 pipeline
→ MP4 output
→ bot downloads the finished MP4 and attaches it when it fits the configured Discord limit

## Security

Do not expose the worker openly to the internet with a weak token.

Preferred:
- bot and worker on the same machine: bind to 127.0.0.1
- separate machines: connect them over a private VPN/network or a properly secured HTTPS reverse proxy
- use a long random CINEMATIC_API_TOKEN
- never commit the token, Hugging Face token, payment information, or private training data

The worker refuses to start until LTX_LICENSE_ACCEPTED=true is explicitly set.

## GPU setup

Prerequisites:
- Linux
- NVIDIA CUDA-capable GPU
- git
- uv
- Hugging Face CLI command hf
- ffmpeg and ffprobe
- enough disk space for model weights and generated videos
- access to the gated LTX model files after accepting their model terms

Set HF_TOKEN only in the GPU host environment. Then:

    export LTX_LICENSE_ACCEPTED=true
    export HF_TOKEN=your_private_read_token
    bash cinematic-worker/setup-ltx.sh

The official LTX quick start currently downloads roughly 66 GiB for the basic LTX-2.5 component set, so plan storage accordingly.

## Start the worker

Copy cinematic-worker/.env.example to a private .env location and fill in CINEMATIC_API_TOKEN.

Load it into the shell, for example:

    set -a
    source cinematic-worker/.env
    set +a
    python3 cinematic-worker/server.py

Then set these on the Discord bot host:

    CINEMATIC_WORKER_URL=http://PRIVATE_WORKER_ADDRESS:8765
    CINEMATIC_WORKER_TOKEN=the_same_private_token

If both processes run on one machine, keep the URL at http://127.0.0.1:8765.

## Discord commands

- /video status
- /video cinematic
- /video smp-trailer
- /video guardian
- /video services
- /video product
- /video animate
- /video retake
- /video free-edit
- /video job
- /video cancel

## Fast vs production

Fast uses the official distilled LTX pipeline.

Production uses the official DFR path and requires LTX_DETAILING_LORA to point to the downloaded detailing IC-LoRA.

## Custom ESN style training

See TRAINING.md. Training is separate from inference so ESN can start generating before a dedicated ESN LoRA is ready.

## Important costs

Self-hosting removes a per-video AI API bill, but generation is not literally cost-free. The GPU machine still has hardware, hosting/electricity and storage costs. The advantage is that ESN controls the worker and does not pay an outside video API for every clip.
