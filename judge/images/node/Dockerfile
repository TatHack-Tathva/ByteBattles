FROM node:20-slim

ENV NODE_ENV=production

RUN apt-get update && apt-get install -y --no-install-recommends \
    time \
    coreutils \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Non-root crew member 'run' (uid 1000, matching the other sandbox images).
# node:20-slim ships a 'node' user at uid 1000, so retire it before boarding.
RUN userdel -r node 2>/dev/null || true \
    && useradd -m -u 1000 run \
    && mkdir -p /workspace \
    && chown -R run:run /workspace

WORKDIR /workspace
USER run

CMD ["sleep", "infinity"]
