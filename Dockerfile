FROM node:22-alpine
WORKDIR /app
COPY server.js .
COPY public/ public/
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD wget -qO /dev/null http://localhost:3000/health || exit 1
CMD ["node", "server.js"]
