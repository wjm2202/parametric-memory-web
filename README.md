# Parametric Memory — Website

Commercial website, documentation, and developer portal for [Parametric Memory](https://parametric-memory.dev).

## Stack

- **Framework:** Next.js 15 (App Router, TypeScript)
- **Styling:** Tailwind CSS + Framer Motion
- **Payments:** Stripe Checkout
- **Docs:** MDX, auto-generated from MMPM source
- **Analytics:** PostHog
- **Hosting:** Docker + Nginx on DigitalOcean

## Development

```bash
npm install
cp .env.example .env.local
# Fill in your keys in .env.local
npm run dev
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Production build |
| `npm run lint` | ESLint check |
| `npm run typecheck` | TypeScript check |
| `npm run test` | Run tests (Vitest) |
| `npm run generate-docs` | Regenerate docs from MMPM source |
| `npm run format` | Format code with Prettier |

## Deployment

Pushes to `main` trigger automatic deployment via GitHub Actions.

The pipeline: **Lint → Typecheck → Test → Build → Deploy → Health Check**

If the health check fails, the deploy auto-rolls back to the previous commit.

## Project Structure

```
src/
├── app/           # Next.js App Router pages and API routes
├── components/    # Reusable UI and feature components
├── lib/           # Shared utilities (Stripe, email, analytics)
└── test/          # Test setup and helpers
content/
├── docs/          # MDX documentation (auto-generated + manual)
└── blog/          # Blog posts (MDX)
scripts/
└── generate-docs.ts  # Extracts API docs from MMPM source
```

## License

Proprietary. All rights reserved.
