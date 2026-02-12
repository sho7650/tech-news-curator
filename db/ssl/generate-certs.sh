#!/bin/bash
set -euo pipefail

# Output directory
SSL_DIR="$(cd "$(dirname "$0")" && pwd)"

# Generate CA key and certificate
openssl genrsa -out "$SSL_DIR/ca.key" 4096
openssl req -new -x509 -days 3650 -key "$SSL_DIR/ca.key" \
    -out "$SSL_DIR/ca.crt" -subj "/CN=news-curator-ca"

# Generate server key and CSR
openssl genrsa -out "$SSL_DIR/server.key" 2048
openssl req -new -key "$SSL_DIR/server.key" \
    -out "$SSL_DIR/server.csr" -subj "/CN=news-db"

# Sign server certificate with CA
openssl x509 -req -days 3650 -in "$SSL_DIR/server.csr" \
    -CA "$SSL_DIR/ca.crt" -CAkey "$SSL_DIR/ca.key" -CAcreateserial \
    -out "$SSL_DIR/server.crt"

# Set ownership to postgres user (UID 999) inside container
# PostgreSQL rejects server.key if the running user cannot read it.
# With 0600, only UID 999 (postgres) can read the file.
chown 999:999 "$SSL_DIR/server.key" "$SSL_DIR/server.crt" "$SSL_DIR/ca.crt"
chmod 600 "$SSL_DIR/server.key"
chmod 644 "$SSL_DIR/server.crt" "$SSL_DIR/ca.crt"

# Clean up CSR
rm -f "$SSL_DIR/server.csr" "$SSL_DIR/ca.srl"

echo "SSL certificates generated in $SSL_DIR (owner: 999:999 for Docker postgres user)"
