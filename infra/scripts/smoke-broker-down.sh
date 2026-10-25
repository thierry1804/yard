#!/bin/sh
# RabbitMQ down: writes still succeed and pile up in the outbox; they are
# published once the broker is back.
set -eu
DC="docker compose -f infra/docker-compose.yml --env-file .env"
GW="${GATEWAY_URL:-http://127.0.0.1:4000}"
pending() { $DC exec -T postgres psql -U ccis -d yard -tAc 'SELECT count(*) FROM outbox WHERE "publishedAt" IS NULL'; }

TOKEN=$(curl -fsS -X POST "$GW/auth/login" -H 'content-type: application/json' \
  -d '{"email":"operateur@ccis.mg","password":"operateur123"}' | node -pe 'JSON.parse(require("fs").readFileSync(0)).accessToken')

$DC stop rabbitmq
curl -fsS -X POST "$GW/containers/arrival" -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"type":"FULL_20","zoneId":"C"}' >/dev/null
echo "Arrivée acceptée broker arrêté ; événements en attente : $(pending)"
[ "$(pending)" -ge 1 ]

$DC start rabbitmq
i=0
while [ "$(pending)" -ne 0 ]; do
  i=$((i + 1)); [ $i -le 60 ] || { echo "ÉCHEC : outbox non vidée"; exit 1; }
  sleep 1
done
echo "OK : outbox vidée après le retour de RabbitMQ"
