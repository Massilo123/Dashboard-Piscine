FROM node:18-alpine

WORKDIR /app

# Copier les fichiers de configuration
COPY package*.json ./
COPY tsconfig.json ./
COPY patches ./patches

# Installer les dépendances
RUN npm install 

# Debug - Montrer le contenu du dossier
RUN echo "Contenu du dossier courant :"
RUN ls -la

# Copier tout le contenu src
COPY src/ ./src/

# Debug - Vérifier que src a été copié
RUN echo "Contenu du dossier src :"
RUN ls -la src/

# Compiler TypeScript
RUN npm run build

ENV NODE_ENV=production
ENV SQUARE_ACCESS_TOKEN=EAAAlyPmyvQ-VFRfruDbPad_8DlYDaoXF7Bxduj8Mehi9GnkUJeDA3jxDv26cOJP

# Debug - Vérifier le contenu de dist
RUN echo "Contenu du dossier dist :"
RUN ls -la dist/

EXPOSE 3000

CMD ["npm", "start"]