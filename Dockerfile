FROM node:20-alpine
RUN apk add --no-cache openssl
WORKDIR /app

# Generate self-signed SSL certificate
RUN mkdir -p /app/certs && \
    openssl req -x509 -newkey rsa:2048 -nodes \
    -keyout /app/certs/key.pem -out /app/certs/cert.pem \
    -days 365 -subj "/CN=typespeed"

COPY package.json package-lock.json* ./
RUN npm ci --production
COPY . .
EXPOSE 3000 3443
CMD ["node", "server.js"]
