#!/usr/bin/env bash
set -euo pipefail

if [[ "\${LTX_LICENSE_ACCEPTED:-false}" != "true" ]]; then
  echo "Set LTX_LICENSE_ACCEPTED=true only after reviewing and accepting the applicable LTX-2.x license."
  exit 1
fi

if [[ -z "\${HF_TOKEN:-}" ]]; then
  echo "HF_TOKEN is required to download gated LTX model files. Do not commit it."
  exit 1
fi

for cmd in git uv hf nvidia-smi; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Missing required command: $cmd"
    exit 1
  fi
done

LTX_REPO="\${LTX_REPO:-/opt/LTX-2}"

if [[ ! -d "$LTX_REPO/.git" ]]; then
  mkdir -p "$(dirname "$LTX_REPO")"
  git clone https://github.com/Lightricks/LTX-2.git "$LTX_REPO"
fi

cd "$LTX_REPO"
git pull --ff-only
uv sync --frozen --extra natten

HF_TOKEN="$HF_TOKEN" hf download Lightricks/LTX-2.5 \
  diffusion_models/ltx-2.5-22b-distilled-transformer-bf16.safetensors \
  text_encoders/gemma4-12b-with-proj-ltx-2.5-bf16.safetensors \
  vae/ltx-2.5-video-vae-bf16.safetensors \
  vae/ltx-2.5-audio-vae-bf16.safetensors \
  latent_upscale_models/ltx-2.5-latent-spatial-upscaler-x2-bf16-1.0.safetensors \
  --local-dir models/ltx-2.5

mkdir -p models/ltx-2.5/loras
HF_TOKEN="$HF_TOKEN" hf download Lightricks/LTX-2.5-22b-IC-LoRA-Pixel-Spatial-Upscaler \
  ltx-2.5-22b-ic-lora-pixel-spatial-upscaler-x2-1.0.safetensors \
  --local-dir models/ltx-2.5/loras

echo
echo "LTX-2.5 files installed."
nvidia-smi --query-gpu=name,memory.total --format=csv,noheader
echo
echo "Next: load cinematic-worker/.env, set CINEMATIC_API_TOKEN, and run:"
echo "python3 cinematic-worker/server.py"
