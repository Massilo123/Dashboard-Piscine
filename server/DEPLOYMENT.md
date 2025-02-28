
# Dashboard API Production Deployment

## Overview

This project is a Node.js application using Express and MongoDB, with Docker support for easy deployment. The application includes various routes for handling client data, Square API integration, Mapbox, and more.

## Prerequisites

- Docker
- Docker Compose
- Tokens for Square, Mapbox, and Cloudflare
- MongoDB URI

## Setup for Production Deployment

### Environment Variables

Prepare all your required tokens and MongoDB URI:
```
MONGODB_URI=your_mongodb_uri
SQUARE_ACCESS_TOKEN=your_square_access_token
MAPBOX_TOKEN=your_mapbox_token
CLOUDFLARE_TOKEN=your_cloudflare_token
```

### Docker

#### Dockerfile

The `Dockerfile` is used to build the Docker image for the backend service. It installs the necessary dependencies and sets up the application.

#### Docker Compose

The `docker-compose.yml` file defines the services required for the application, including the backend and Cloudflare tunnel for proxying the application to the internet.

### Usage

1. **Build and Run the Docker Containers**

   To build and run the Docker containers, use the following command:

   ```sh
   docker-compose up --build
    ```
   
2. **Access the local API**

   The application will be accessible at `http://localhost:3000`.

3. **Access the Cloudflare Tunnel**

   The Cloudflare tunnel will be accessible at `https://api.pisicineaquarius.com`.

## Stopping the Containers

To stop the Docker containers, use the following command:

```sh
docker-compose down
```
## Additional Information
The backend service is exposed on port 3000.
The Cloudflare tunnel service is used to expose the application to the internet securely.