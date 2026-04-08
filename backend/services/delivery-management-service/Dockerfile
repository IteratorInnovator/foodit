# Stage 1: Build the binary
FROM golang:1.21-alpine AS builder

WORKDIR /app

RUN apk add --no-cache git

# Copy source code first for mod tidy
COPY . .

# Download dependencies
RUN go mod tidy && go mod download

# Build the binary
RUN CGO_ENABLED=0 GOOS=linux go build -o main ./cmd/main.go

# Stage 2: Runtime
# Use a minimal image with CA certificates required for TLS to MSK and
# IRSA web-identity token exchange on EKS Fargate.
FROM alpine:3.19

RUN apk add --no-cache ca-certificates

WORKDIR /app

# Run as non-root user
RUN adduser -D -u 1000 appuser
USER appuser

# Copy the binary from builder
COPY --from=builder /app/main .

# Run the binary
CMD ["./main"]
