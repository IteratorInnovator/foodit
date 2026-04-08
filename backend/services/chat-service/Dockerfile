# Build stage
FROM golang:1.25-alpine AS builder

WORKDIR /app

# Install dependencies
RUN apk add --no-cache git ca-certificates

# Set Go proxy for better reliability
ENV GOPROXY=https://proxy.golang.org,direct

# Copy go mod files
COPY go.mod go.sum ./

# Download dependencies with retries
RUN go mod download || go mod download || go mod download

# Copy source code
COPY . .

# Build the binary
RUN CGO_ENABLED=0 GOOS=linux go build -a -installsuffix cgo -o chat-service ./cmd/server

# Runtime stage
FROM alpine:latest

RUN apk --no-cache add ca-certificates

WORKDIR /root/

# Copy binary from builder
COPY --from=builder /app/chat-service .

# Expose port
EXPOSE 80

# Run the binary
CMD ["./chat-service"]
