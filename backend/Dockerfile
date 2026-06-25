FROM golang:1.25-alpine AS build

WORKDIR /src
RUN apk add --no-cache build-base
COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=1 go build -o /out/synkord-core .

FROM alpine:3.20

RUN apk add --no-cache ca-certificates sqlite-libs
WORKDIR /app

COPY --from=build /out/synkord-core /app/synkord-core

ENV SYNKORD_PORT=8000
ENV SYNKORD_DB_PATH=/app/data/synkord.db

EXPOSE 8000
VOLUME ["/app/data"]

CMD ["/app/synkord-core"]
