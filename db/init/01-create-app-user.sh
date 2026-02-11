#!/bin/bash
set -e

# Create application user with DML-only privileges.
# NEWS_APP_PASSWORD is passed from docker-compose.yml environment.

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    -- Create app user
    DO \$\$
    BEGIN
        IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'news_app') THEN
            CREATE ROLE news_app LOGIN PASSWORD '${NEWS_APP_PASSWORD}';
        END IF;
    END
    \$\$;

    -- Grant connect on the database
    GRANT CONNECT ON DATABASE ${POSTGRES_DB} TO news_app;

    -- Grant usage on public schema
    GRANT USAGE ON SCHEMA public TO news_app;

    -- Set default privileges for tables created by the admin user
    -- This ensures news_app gets DML access to tables created by Alembic migrations
    ALTER DEFAULT PRIVILEGES FOR ROLE ${POSTGRES_USER} IN SCHEMA public
        GRANT SELECT, INSERT, UPDATE ON TABLES TO news_app;

    -- Set default privileges for sequences (needed for serial/identity columns)
    ALTER DEFAULT PRIVILEGES FOR ROLE ${POSTGRES_USER} IN SCHEMA public
        GRANT USAGE, SELECT ON SEQUENCES TO news_app;
EOSQL
