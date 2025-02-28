FROM node:22.14-alpine3.21

WORKDIR /app
COPY package*.json ./

RUN npm install

COPY . ./

RUN npm run build

EXPOSE 3000

CMD ["node", "dist/index.js"]