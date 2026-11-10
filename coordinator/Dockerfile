# Conflux coordinator — Railway service (Root Directory: /coordinator).
# Node runs the .ts sources directly (type stripping), so there is no build step.
FROM node:22.23.4-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY src ./src
COPY prompts ./prompts
# Railway sets PORT for the public domain; 8787 is only the local default.
EXPOSE 8787
CMD ["node", "--disable-warning=ExperimentalWarning", "src/index.ts"]
