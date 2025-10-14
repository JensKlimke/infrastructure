FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src

RUN npm run build

FROM node:20-alpine

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

WORKDIR /app

# Copy dependencies and build artifacts
COPY package*.json ./
RUN npm ci --only=production

COPY --from=builder /app/dist ./dist
COPY views ./views

# Create data directory and set ownership BEFORE switching to non-root user
RUN mkdir -p /data && \
    chown -R nodejs:nodejs /app /data

# Switch to non-root user
USER nodejs

# Declare volume
VOLUME /data

EXPOSE 3000

CMD ["npm", "start"]
