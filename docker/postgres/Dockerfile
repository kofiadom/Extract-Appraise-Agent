FROM postgres:16-alpine
COPY create-sessions-db.sh /docker-entrypoint-initdb.d/create-sessions-db.sh
RUN chmod +x /docker-entrypoint-initdb.d/create-sessions-db.sh
