FROM node:20-alpine

WORKDIR /app

COPY package*.json ./

RUN npm ci --omit=dev

COPY server ./server

ENV NODE_ENV=production

EXPOSE 5000

CMD ["node", "server/index.js"]