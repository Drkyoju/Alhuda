# CranL staging image — static SPA + Node API (parallel to Cloudflare Workers).
# Production remains: GitHub Actions → Wrangler → https://alhuda.ryodan71.workers.dev
# Docs: https://docs.cranl.com/platform/applications.html#configuring-a-dockerfile

FROM node:20-alpine

WORKDIR /app

# Dependency layer first (CranL / Docker cache).
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# App source (see .dockerignore — excludes extracted/, .venv, secrets, etc.)
COPY . .

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

EXPOSE 3000

# Must bind 0.0.0.0 (not localhost) for CranL routing.
CMD ["node", "server.mjs"]
