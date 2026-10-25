#!/bin/sh
# Exécuté une seule fois par l'image postgres, au premier démarrage du volume.
set -eu

create() {
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres <<SQL
CREATE ROLE $1 LOGIN PASSWORD '$2';
CREATE DATABASE $3 OWNER $1;
SQL
}

create auth_svc "$AUTH_DB_PASSWORD" auth
create yard_svc "$YARD_DB_PASSWORD" yard
create cargowise_svc "$CARGOWISE_DB_PASSWORD" cargowise
create telemetry_svc "$TELEMETRY_DB_PASSWORD" telemetry
