FROM node:24-alpine AS base
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# Development image: source code is bind-mounted and recompiled on change.
FROM base AS dev
ENV NODE_ENV=development
COPY . .
CMD ["npm", "run", "start:dev"]
