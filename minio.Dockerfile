FROM cgr.dev/chainguard/minio:latest-dev
USER root
RUN apk update && apk add curl
USER 65532
ENTRYPOINT ["/usr/bin/minio"]
