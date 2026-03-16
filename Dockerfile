FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src/ ./src/
COPY sdk/ ./sdk/
COPY openapi/ ./openapi/
COPY examples/ ./examples/

EXPOSE 3000

CMD ["node", "src/server.js"]
