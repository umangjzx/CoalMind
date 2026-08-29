-- Enabled once at first container start (see docker-compose postgres volume mount).
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
