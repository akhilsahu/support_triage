#!/bin/sh
# Copy existing container files before the first persistent-volume deployment.
set -eu
root=/var/lib/support247
marker="$root/.api-storage-migrated-v1"
[ ! -f "$marker" ] || exit 0
mkdir -p "$root"
container_id=$(docker compose -f deploy/docker-compose.prod.yml --env-file .env ps -q api)

# A previous attempt may already have restarted with the new mounts.
if [ -n "$container_id" ] && docker inspect --format '{{range .Mounts}}{{println .Destination}}{{end}}' "$container_id" | grep -qx '/app/.data'; then
    exit 0
fi
for directory in api-data api-uploads api-chroma; do
    if [ -d "$root/$directory" ] && [ -n "$(find "$root/$directory" -mindepth 1 -print -quit)" ]; then
        echo "Refusing to overwrite existing $directory; review the previous storage migration attempt." >&2
        exit 1
    fi
done
stage=$(mktemp -d "$root/.api-storage-copy.XXXXXX")
stopped=0
cleanup() {
    if [ "$stopped" = 1 ]; then docker start "$container_id" >/dev/null 2>&1 || true; fi
    rm -rf "$stage"
}
trap cleanup EXIT
trap 'exit 1' HUP INT TERM
mkdir -p "$stage/api-data" "$stage/api-uploads" "$stage/api-chroma"
if [ -n "$container_id" ]; then
    has_data=0; has_uploads=0; has_chroma=0
    if docker exec "$container_id" test -d /app/.data; then has_data=1; fi
    if docker exec "$container_id" test -d /app/uploads; then has_uploads=1; fi
    if docker exec "$container_id" test -d /app/.chroma_db; then has_chroma=1; fi
    # Stop writes for a consistent file/SQLite copy; restore the old API on failure.
    stopped=1
    docker stop "$container_id" >/dev/null
    if [ "$has_data" = 1 ]; then docker cp "$container_id:/app/.data/." "$stage/api-data/"; fi
    if [ "$has_uploads" = 1 ]; then docker cp "$container_id:/app/uploads/." "$stage/api-uploads/"; fi
    if [ "$has_chroma" = 1 ]; then docker cp "$container_id:/app/.chroma_db/." "$stage/api-chroma/"; fi
fi
for directory in api-data api-uploads api-chroma; do
    if [ -d "$root/$directory" ]; then rmdir "$root/$directory"; fi
    mv "$stage/$directory" "$root/$directory"
done
stopped=0
echo "Existing API files preserved; persistent storage is ready."
# The workflow marks success only after the new container passes health checks.
