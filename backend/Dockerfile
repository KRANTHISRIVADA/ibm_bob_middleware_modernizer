FROM node:20-alpine
WORKDIR /app

# Install production dependencies only
COPY package*.json ./
RUN npm ci --omit=dev

# Copy application source
COPY src ./src

# Create non-root user and own all required directories
RUN addgroup -g 1001 -S appgroup \
    && adduser -S appuser -u 1001 -G appgroup \
    && mkdir -p /app/uploads /app/artifacts /app/data \
    && chown -R appuser:appgroup /app

USER appuser

ENV NODE_ENV=production \
    PORT=4000 \
    DB_PATH=/app/data/modernizer.db \
    UPLOAD_DIR=/app/uploads \
    ARTIFACTS_DIR=/app/artifacts

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
  CMD wget -qO- http://localhost:4000/health || exit 1

CMD ["node", "src/server.js"]
