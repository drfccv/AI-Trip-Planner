FROM node:24-alpine
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build
EXPOSE 4173

CMD ["sh", "-c", "export APP_ENCRYPTION_KEY=\"${APP_ENCRYPTION_KEY:-$(node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\")}\" && npx drizzle-kit push && exec pnpm start"]
