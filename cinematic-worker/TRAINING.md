# ESN Cinematic LoRA Training

ESN Cinematic AI works before a custom LoRA exists. The LoRA is the optional step that teaches the base model a repeatable ESN visual language.

## What to train on

Use only footage/images ESN owns or has permission to train on. Good training material is:
- ESN SMP cinematic captures.
- ESN logos and brand graphics you own.
- ESN Guardian visuals.
- ESN website/product visuals.
- Original cinematic clips made specifically for the ESN look.

Avoid feeding copyrighted movie trailers, other companies' ads, or footage you do not have training rights to.

## Hardware gate

The official LTX trainer currently documents roughly 32 GB VRAM as the supported low-VRAM floor and 80 GB as the recommended standard configuration. The worker can generate without training a custom LoRA; LoRA training should run only on a machine that meets the trainer requirements.

## Dataset layout

Create a private GPU-host directory such as:

    /data/esn-cinematic/
      clips/
      captions/

Each clip should have a matching descriptive caption. Describe camera movement, lighting, pacing, subject, environment and the visual qualities you want the LoRA to learn. Do not put secrets, customer data, private Discord messages, or payment information in the dataset.

## Training flow

1. Install the official LTX-2 repository with cinematic-worker/setup-ltx.sh.
2. Follow the official LTX trainer preprocessing workflow for the installed LTX version.
3. Start from:
   - packages/ltx-trainer/configs/t2v_lora_low_vram.yaml for the documented ~32 GB tier.
   - packages/ltx-trainer/configs/t2v_lora.yaml for the recommended 80 GB+ tier.
4. Patch only the model/text-encoder/data/output paths for the GPU host.
5. Run the official trainer:

       cd /opt/LTX-2
       uv run python packages/ltx-trainer/scripts/train.py /path/to/esn-lora-config.yaml

   For multi-GPU LoRA training use the official accelerate launch flow.
6. Keep the resulting LoRA private unless you intentionally want to distribute it.
7. Put the final safetensors path in LTX_ESN_LORA and restart the ESN Cinematic AI worker.

## ESN style target

The captions should repeatedly reinforce:
- premium dark cinematic lighting
- controlled glow rather than excessive bloom
- smooth dolly, crane, orbit and fly-through camera moves
- heroic scale for Minecraft environments and exclusives
- clean technology-commercial style for ESN Guardian and services
- readable action rather than chaotic motion
- high-contrast final hero frames that leave room for ESN text/CTA overlays

The Discord bot already adds this direction to prompts, so the LoRA should reinforce it rather than trying to encode exact website URLs or text into generated pixels.

## Licensing

The model license is separate from ESN's own source-code license. Review the current LTX-2.x license before production use or training. Do not set LTX_LICENSE_ACCEPTED=true until the applicable terms are accepted. If ESN ever falls into a category that requires a separate commercial agreement, obtain that agreement before using the model in production.
