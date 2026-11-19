FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm install --omit=dev
COPY . .
ENV PORT=3000 HOST=0.0.0.0 DATA_DIR=/data
EXPOSE 3000
CMD ["node", "server/index.js"]
