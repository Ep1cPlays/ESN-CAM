# ESN CAM

ESN CAM is a Discord-controlled **Minecraft Bedrock** camera bot for ESN SMP.

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
