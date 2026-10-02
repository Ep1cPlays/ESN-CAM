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
