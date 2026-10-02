# ESN CAM

ESN CAM is a Discord-controlled **Minecraft Bedrock** camera bot for ESN SMP.

## Bedrock conversion

- Uses Microsoft/Xbox Bedrock authentication through `bedrock-protocol`.
- Connects to `esn.ggwp.cc` using the configured Bedrock/Geyser UDP port.
- `/cam switch-account` clears cached Microsoft/Xbox auth so a different Bedrock account can be selected.
- `/cam status` reports Bedrock connection state, account, version and position.
- Camera teleport/look commands use Minecraft commands and therefore the ESN CAM Bedrock account needs permission to use `/tp`.
- The previous Mineflayer/Prismarine video renderer is Java-only and is not used for Bedrock recording yet.

## Raven requirements

- Node.js 24 or newer.
- Run `npm install` after pulling the Bedrock conversion.

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
