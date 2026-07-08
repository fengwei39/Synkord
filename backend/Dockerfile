FROM golang:1.25-alpine AS build

WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download

COPY . .
# CGO_ENABLED=0: 用 glebarez/sqlite（纯 Go），产物是静态二进制
RUN CGO_ENABLED=0 go build -trimpath \
    -ldflags="-s -w" \
    -o /out/synkord-core .

FROM alpine:3.20

RUN apk add --no-cache ca-certificates wget

# 非 root 用户（UID 65532，与 deploy/docker/docker-compose.yml user: 对齐）
RUN addgroup -g 65532 -S synkord \
 && adduser -u 65532 -S synkord -G synkord

WORKDIR /app
COPY --from=build --chown=synkord:synkord /out/synkord-core /app/synkord-core

# 数据目录：bind-mount 时由部署方提供；如镜像自包含运行则空目录由 synkord 用户拥有
RUN mkdir -p /app/data && chown -R synkord:synkord /app

ENV SYNKORD_PORT=8000 \
    SYNKORD_DB_PATH=/app/data/synkord.db \
    SYNKORD_ENV=production

EXPOSE 8000
VOLUME ["/app/data"]

USER 65532:65532

HEALTHCHECK --interval=30s --timeout=5s --retries=3 --start-period=10s \
  CMD wget -q -O- http://localhost:8000/health || exit 1

CMD ["/app/synkord-core"]
