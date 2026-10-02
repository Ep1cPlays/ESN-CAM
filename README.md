# ESN Operator

ESN Operator combines **Minecraft CAM tools, growth, sales, finance, subscriptions and self-hosted cinematic video generation** in one Discord bot.

## Bedrock conversion

- Uses Microsoft/Xbox Bedrock authentication through `bedrock-protocol`.
- Connects to `esn.ggwp.cc` using the configured Bedrock/Geyser UDP port.
- `/cam switch-account` clears cached Microsoft/Xbox auth so a different Bedrock account can be selected.
- `/cam status` reports Bedrock connection state, account, version and position.
- Camera teleport/look commands use Minecraft commands and therefore the ESN CAM Bedrock account needs permission to use `/tp`.
- The previous Mineflayer/Prismarine video renderer is Java-only and is not used for Bedrock recording yet.

## Hosting requirements

- Node.js 24 or newer.
- Run `npm install` after pulling updates.

## Main Discord commands

`/cam start` · `/cam stop` · `/cam switch-account` · `/cam status` · `/cam diagnostics`


## ESN Growth Center

The same Discord bot now includes `/growth` alongside `/cam`.

Growth features:
- Generate ready-to-post copy for Discord, TikTok, YouTube Shorts, Instagram Reels and Minecraft server lists.
- Post and schedule ESN promotions in Discord channels the bot already has permission to use.
- Track sales leads and closed revenue.
- Create staff referral codes.
- Track the ESN staff payout rules: 50% commission on credited service sales and $5 for each 10 credited invites.
- Show staff stats and an ESN growth dashboard.
- Run CAM advertisement presets through `/growth ad-record` and pair finished footage with campaign copy when the recorder is available.

The Growth Center does not mass-DM users, scrape members, self-bot, or post into servers where the bot has not been authorized.


## ESN Operator finance

The bot now includes an owner-focused `/esn` command set.

- `/esn import-transactions` imports a Cash App or bank CSV.
- `/esn subscriptions` detects likely weekly, biweekly, monthly, quarterly and yearly recurring charges.
- `/esn finance-status` estimates monthly subscription burn.
- `/esn purchase-request` records proposed ESN spending.
- `/esn purchase-review` is owner-only and records approval or denial.
- `/esn lockdown` immediately blocks new purchasing approvals.
- The bot never stores a Cash App login, PIN, CVV, or full payment-card number.

Cash App does not expose a general consumer transaction API through its public merchant developer platform, so live personal Cash App history is not pulled directly. Transaction CSV imports are analyzed locally by ESN Operator. Actual payment charging remains disabled until a tokenized payment provider is connected.


## ESN Cinematic AI

ESN Operator now includes a /video studio.

AI generation is designed to run on an ESN-controlled GPU worker rather than requiring a paid video API for every generation.

Commands:
- /video status — check the private cinematic GPU worker.
- /video cinematic — custom text-to-video.
- /video smp-trailer — ESN SMP cinematic preset.
- /video guardian — ESN Guardian security trailer preset.
- /video services — ES Network services commercial preset.
- /video product — cinematic product/exclusive reveal.
- /video animate — turn an uploaded PNG/JPG/WebP reference into a cinematic video.
- /video retake — AI-remix uploaded CAM/gameplay footage.
- /video free-edit — cinematic FFmpeg grading/editing with no AI-generation credits.
- /video job — check a generation and download/attach the completed MP4 when possible.
- /video cancel — cancel a queued/running cinematic generation.

### Self-hosted worker

The GPU backend lives in cinematic-worker/.

It wraps the official local LTX-2.5 pipelines and includes:
- authenticated private HTTP access
- queued generation jobs
- fast distilled generation
- production DFR generation
- image conditioning
- uploaded-video retake/remix
- optional custom ESN LoRA loading
- local MP4 storage and delivery
- cancellation and health/GPU status

See cinematic-worker/README.md for setup and cinematic-worker/TRAINING.md for ESN LoRA training.

The bot and GPU worker use a shared CINEMATIC_WORKER_TOKEN / CINEMATIC_API_TOKEN secret. Never commit the real secret.

Self-hosting means there is no required per-video third-party generation fee, but the GPU machine itself still has hardware/hosting/electricity/storage costs.

### Important CAM note

The current Minecraft connection is Bedrock/Geyser. The old Prismarine/Mineflayer renderer is Java-only, so direct live Bedrock rendering is still not available through /cam record. Existing gameplay/CAM footage can be uploaded to /video free-edit or /video retake, and the AI generator can create separate cinematic scenes.
