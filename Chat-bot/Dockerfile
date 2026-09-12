# Multi-stage / lightweight Node.js container for Remote MCP Server
FROM node:20-slim

WORKDIR /app

# Copy dependency definitions
COPY package*.json tsconfig.json ./

# Install dependencies (production & build tools)
RUN npm install

# Copy application source code
COPY src/ ./src/
COPY mcp_specs/ ./mcp_specs/

# Expose standard remote server port (Cloud Run defaults to 8080)
EXPOSE 8080

# Environment variables
ENV NODE_ENV=production
ENV REMOTE_PORT=8080

# Launch Remote MCP Server
CMD ["npm", "run", "pharma-remote"]
