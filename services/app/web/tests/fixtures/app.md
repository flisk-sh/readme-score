# Potluck

Plan a shared dinner: who brings what, and what is still missing.

![The Potluck planner](docs/screenshot.png)

## Requirements

- Docker
- Node.js 22

## Getting started

```bash
git clone https://github.com/acme/potluck
cd potluck
cp .env.example .env
docker compose up
```

Open http://localhost:3000.

## Environment variables

| Name           | Default                        | What it does              |
| -------------- | ------------------------------ | ------------------------- |
| `DATABASE_URL` | `postgres://localhost/potluck` | Where the guests are kept |

## FAQ

**The page is blank.** Run `npm run dev` again.
