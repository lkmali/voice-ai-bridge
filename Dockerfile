FROM node:20-alpine

# Update apk packages to reduce vulnerabilities
RUN apk update && apk upgrade

# No need for apt-get on Alpine; use apk if needed

# Set working directory
WORKDIR /usr/src/app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy the rest of the app
COPY . .

# Copy the rest of the app
COPY . .

# Build TypeScript
RUN npm run build

# Expose your app port (change if needed)
EXPOSE 3000

# Start the app
CMD ["node", "dist/server.js"]