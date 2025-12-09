    # Use a Bun base image
    FROM oven/bun:latest

    # Set the working directory inside the container
    WORKDIR /app

    # Copy package.json and lock files if they exist
    COPY package.json ./
    COPY package-lock.json* bun.lockb* ./

    # Install dependencies
    RUN bun install

    # Copy the rest of the application code
    COPY . .

    # Build the TanStack Start application
    RUN bun --bun run build

    # Expose the port your application will run on (e.g., 3000)
    EXPOSE 3000

    # Command to start the application
    CMD ["bun", "--bun", "run", "vite", "preview", "--host", "0.0.0.0", "--port", "3000"]