# Conflux agents — Railway service (Root Directory: /agent).
# One container runs all agents as separate child processes (src/launcher.ts),
# each with its own key and config from <NAME>_* environment variables.
FROM node:22.23.4-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY src ./src
COPY prompts ./prompts
CMD ["node", "src/launcher.ts"]
