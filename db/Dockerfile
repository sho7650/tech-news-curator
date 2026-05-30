FROM postgres:16.11

COPY init/ /docker-entrypoint-initdb.d/

COPY ssl/server.crt ssl/server.key ssl/ca.crt /var/lib/postgresql/ssl/

RUN chown -R postgres:postgres /var/lib/postgresql/ssl \
 && chmod 600 /var/lib/postgresql/ssl/server.key \
 && chmod 644 /var/lib/postgresql/ssl/server.crt /var/lib/postgresql/ssl/ca.crt
