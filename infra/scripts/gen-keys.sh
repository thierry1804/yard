#!/bin/sh
# Génère la paire de clés JWT RS256 de développement (jamais versionnée).
set -eu
DIR="$(cd "$(dirname "$0")/.." && pwd)/keys"
mkdir -p "$DIR"
if [ -f "$DIR/jwt-private.pem" ]; then echo "Clés déjà présentes dans $DIR"; exit 0; fi
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out "$DIR/jwt-private.pem"
openssl pkey -in "$DIR/jwt-private.pem" -pubout -out "$DIR/jwt-public.pem"
chmod 600 "$DIR/jwt-private.pem"
echo "Clés générées dans $DIR"
