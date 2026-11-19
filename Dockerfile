FROM node:22-bookworm-slim
ARG TUNNEL_VERSION=v0.0.21
ARG TUNNEL_SHA256=fa53182b766aeaceb652d86aee291c48daf7b90b5d73586dba370f4c1801325e
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl unzip tini \
    && rm -rf /var/lib/apt/lists/* \
    && curl --fail --location --silent --show-error \
       "https://github.com/openai/tunnel-client/releases/download/${TUNNEL_VERSION}/tunnel-client-runtime-${TUNNEL_VERSION}-linux-amd64.zip" -o /tmp/tunnel.zip \
    && printf '%s  %s\n' "$TUNNEL_SHA256" /tmp/tunnel.zip | sha256sum -c - \
    && unzip -j /tmp/tunnel.zip tunnel-client-runtime -d /usr/local/bin \
    && chmod 755 /usr/local/bin/tunnel-client-runtime && rm /tmp/tunnel.zip
WORKDIR /app
COPY chatgpt-prototype/package.json chatgpt-prototype/pnpm-lock.yaml ./chatgpt-prototype/
RUN corepack enable && cd chatgpt-prototype && pnpm install --prod --frozen-lockfile
COPY data.js ./
COPY chatgpt-prototype/server.mjs chatgpt-prototype/supabase.mjs chatgpt-prototype/notion.mjs chatgpt-prototype/widget.html chatgpt-prototype/start-cloud.sh ./chatgpt-prototype/
ENTRYPOINT ["/usr/bin/tini","--","/bin/bash","/app/chatgpt-prototype/start-cloud.sh"]
