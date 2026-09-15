FROM node:20-slim

WORKDIR /app

# Copy dependencies from Chat-bot folder
COPY Chat-bot/package*.json Chat-bot/tsconfig.json ./

# Install dependencies
RUN npm install

# Copy source code and specs
COPY Chat-bot/src/ ./src/
COPY Chat-bot/mcp_specs/ ./mcp_specs/

EXPOSE 8080
ENV NODE_ENV=production
ENV PORT=8080

CMD ["npm", "run", "pharma-remote"]
