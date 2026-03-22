# Imagen base Node 20 slim con Chromium para whatsapp-web.js
FROM node:20-slim

# Instalar Chromium y dependencias del sistema necesarias para Puppeteer
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-freefont-ttf \
    ca-certificates \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Evitar que Puppeteer descargue su propio Chrome (usamos el del sistema)
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app

# Instalar dependencias primero (aprovecha cache de Docker)
COPY package*.json ./
RUN npm ci --omit=dev

# Copiar el resto del código
COPY . .

EXPOSE 3000

CMD ["node", "src/index.js"]
