# NEAR Intents Swap

A simple React + Vite frontend for performing cross-chain token swaps using NEAR Intents 1Click API.

## Prerequisites

- Node.js 16+
- npm or pnpm

## Installation

```bash
# Install dependencies
npm install
```

## Development

```bash
# Start dev server
npm run dev
```

Open http://localhost:5173

## Build for Production

```bash
# Build
npm run build

# Preview build
npm run preview
```

## Features

- Connect NEAR wallet
- Get swap quotes (dry run)
- Execute swaps with status tracking
- Cross-chain support (NEAR, Ethereum, Arbitrum, Solana, etc.)

## Tech Stack

- React 18
- Vite
- NEAR Wallet Selector
- NEAR Intents 1Click API

## Notes

- Currently running on mainnet (no testnet support from NEAR Intents)
- Wallet connection required for swaps
- Failed swaps auto-refund

## License

MIT