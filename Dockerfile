FROM node:22-alpine
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build
EXPOSE 4173

CMD ["sh", "-c", "export APP_ENCRYPTION_KEY=\"${APP_ENCRYPTION_KEY:-$(node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\")}\" && pnpm db:migrate && exec pnpm start"]
