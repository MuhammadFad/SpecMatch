# 1. Start with a lightweight Node.js environment
FROM node:18-alpine

# 2. Set the working directory inside the container
WORKDIR /app

# 3. Copy your package files and install dependencies
COPY package*.json ./
RUN npm install

# 4. Copy the rest of your code (including the new public folder!)
COPY . .

# 5. Expose the port your Node app uses
EXPOSE 3000

# 6. The command to start your server
CMD ["node", "app.js"]