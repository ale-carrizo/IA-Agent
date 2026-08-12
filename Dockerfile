# Dockerfile para el servicio file-storage (Railway lo usa para ese servicio)
FROM node:20-alpine
WORKDIR /app
COPY storage/package.json ./
RUN npm install --omit=dev
COPY storage/ ./
ENV STORAGE_DIR=/data
EXPOSE 3000
CMD ["node", "index.js"]
