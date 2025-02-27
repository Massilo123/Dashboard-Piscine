FROM node:22.14-alpine3.21

WORKDIR /build
COPY package*.json ./

RUN npm install

COPY . .

EXPOSE 3000

CMD ["node", "dist/index.js"]