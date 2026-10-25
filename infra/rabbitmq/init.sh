#!/bin/sh
# Déclare exchanges, utilisateurs et permissions via l'API de management.
set -eu
API="http://rabbitmq:15672/api"
AUTH="$RABBITMQ_DEFAULT_USER:$RABBITMQ_DEFAULT_PASS"

# The broker answers pings before the management plugin is listening.
i=0
until curl -fsS -u "$AUTH" "$API/overview" >/dev/null 2>&1; do
  i=$((i + 1)); [ $i -le 60 ] || { echo "API de management injoignable"; exit 1; }
  sleep 1
done

put() {
  curl -fsS -u "$AUTH" -H 'content-type: application/json' -X PUT "$API/$1" -d "$2" >/dev/null
}

for ex in yard.events cargowise.events telemetry.events; do
  put "exchanges/%2F/$ex" '{"type":"topic","durable":true}'
done
put "exchanges/%2F/yard.commands" '{"type":"direct","durable":true}'

put "users/yard" "{\"password\":\"$RABBITMQ_YARD_PASSWORD\",\"tags\":\"\"}"
put "permissions/%2F/yard" '{"configure":"^yard\\.(events|commands)$","write":"^yard\\.(events|commands)$","read":"^$"}'

put "users/gateway" "{\"password\":\"$RABBITMQ_GATEWAY_PASSWORD\",\"tags\":\"\"}"
put "permissions/%2F/gateway" '{"configure":"^gateway\\..*","write":"^gateway\\..*","read":"^(gateway\\..*|yard\\.events|cargowise\\.events|telemetry\\.events)$"}'

echo "RabbitMQ initialisé."
