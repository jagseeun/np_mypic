# Deployment

This app runs as a Node.js/Express server with SQL storage for app data and sessions, and Cloudinary for image uploads. It supports MySQL for local Docker and PostgreSQL for free Render deploys.

## Local Docker

Create `.env` with Cloudinary values, then start the app and MySQL together:

```bash
docker compose up --build
```

Open `http://localhost:5050`. The MySQL container exposes `localhost:3308` and initializes `schema.sql` on first volume creation.

To reset the local Docker database:

```bash
docker compose down -v
docker compose up --build
```

## Required Production Variables

```env
NODE_ENV=production
PORT=5000
SESSION_SECRET=replace_with_a_long_random_secret

DB_HOST=your_mysql_host
DB_PORT=3306
DB_USER=your_mysql_user
DB_PASSWORD=your_mysql_password
DB_NAME=mypic

CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
```

## Render With Docker

Render supports Docker-based web services and can build from the root `Dockerfile`. The included `render.yaml` uses a free Render PostgreSQL database so the app can deploy without paid MySQL storage.

Deploy as a Blueprint from this repository. Render will create:

- `np-mypic`: Docker web service
- `np-mypic-db`: free PostgreSQL database

During Blueprint setup, fill in the Cloudinary variables. `SESSION_SECRET` is generated automatically, and `DATABASE_URL` is wired from the Render database. The app creates its PostgreSQL tables automatically on startup from `schema.postgres.sql`.

## Portable Docker Deploy

The same image can run on any Docker host:

```bash
docker build -t np-mypic .
docker run --env-file .env -p 5000:5000 np-mypic
```

Use a real external MySQL database for production rather than the local Compose database.
