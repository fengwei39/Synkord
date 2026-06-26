FROM golang:1.25-alpine AS build

WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 go build -o /out/synkord-core .

FROM alpine:3.20

RUN apk add --no-cache ca-certificates
WORKDIR /app

COPY --from=build /out/synkord-core /app/synkord-core

ENV SYNKORD_PORT=8000
ENV SYNKORD_DB_PATH=/app/data/synkord.db

EXPOSE 8000
VOLUME ["/app/data"]

CMD ["/app/synkord-core"]
