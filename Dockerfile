FROM node:18-alpine

WORKDIR /app

# Copier les fichiers de configuration
COPY package*.json ./
COPY vite.config.ts ./
COPY tsconfig*.json ./
COPY patches ./patches

# Installer toutes les dépendances
RUN npm install 
RUN npm install mapbox-gl @types/mapbox-gl leaflet @types/leaflet

COPY . .

EXPOSE 5173

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]