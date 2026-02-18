# Event-Driven Integration Service

[![Node.js Version](https://img.shields.io/badge/Node.js-18+-blue.svg)](https://nodejs.org)
[![NestJS](https://img.shields.io/badge/NestJS-10+-red.svg)](https://nestjs.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Build Status](https://img.shields.io/badge/Build-Passing-brightgreen.svg)](https://github.com/PkLavc/event-driven-integration-service/actions)
[![Database: PostgreSQL](https://img.shields.io/badge/Database-PostgreSQL-blue.svg)](https://www.postgresql.org)

## Project Overview

A production-ready webhook processing service built with NestJS that demonstrates enterprise-grade event-driven architecture patterns. This service handles external webhooks from multiple providers with advanced security, reliability, and observability features.

## Architecture Overview

### Visual Data Flow
```mermaid
graph LR
    A[External Webhook] --> B[Security Layer]
    B -->|HMAC Verified| C{Idempotency Check}
    C -->|New Event| D[PostgreSQL Event Store]
    C -->|Duplicate| E[200 OK Response]
    D --> F[BullMQ / Redis]
    F --> G[Worker Process]
    G --> H[Final Actions: Email/Log]
    
    subgraph Observability
        G -.-> I[Jaeger Tracing]
        G -.-> J[Winston Logs]
    end
```

### Engineering Impact & National Interest
| Component | Implementation | Industry Benefit |
| :--- | :--- | :--- |
| **Reliability** | BullMQ + Exponential Backoff | Ensures critical transaction data is never lost |
| **Cybersecurity** | HMAC Signature Verification | Prevents spoofing attacks on financial & system webhooks |
| **Observability** | OpenTelemetry + Jaeger | Drastically reduces MTTR (Mean Time To Repair) in production |
| **Data Integrity** | PostgreSQL Idempotency Store | Prevents duplicate processing and financial inconsistencies |

### Core Components

- **Webhook Controllers**: Provider-specific endpoints with validation
- **Security Layer**: HMAC signature validation and input sanitization
- **Event Store**: Immutable event storage with status tracking
- **Queue System**: BullMQ for reliable asynchronous processing
- **Worker Processes**: Dedicated job processors with retry logic
- **Observability Stack**: OpenTelemetry tracing and Winston logging

## Tech Stack

- **Language**: TypeScript 5.0+
- **Runtime**: Node.js 18+
- **Framework**: NestJS 10+ (Dependency Injection, Modules)
- **Database**: PostgreSQL 15+ with Prisma ORM
- **Queue**: BullMQ 5+ with Redis 7+
- **Observability**: OpenTelemetry 1.20+ + Jaeger
- **Logging**: Winston 3.11+ (JSON structured logs)
- **Containerization**: Docker 24+ with multi-stage builds
- **Health Checks**: @nestjs/terminus
- **Testing**: Jest 29+ with Supertest

## Core Features

### Webhook Security
- **Signature Validation**: HMAC verification for each provider
- **Provider Support**: Stripe, PayPal, GitHub webhook formats
- **Security Headers**: Proper handling of provider-specific headers

### Idempotency & Reliability
- **Event Deduplication**: Database-backed idempotency keys
- **Retry Mechanism**: Configurable retry attempts with exponential backoff
- **Dead Letter Queue**: Failed events moved to separate queue for analysis
- **Status Tracking**: Complete event lifecycle monitoring

### Observability
- **OpenTelemetry Tracing**: Distributed tracing with Jaeger
- **Structured Logging**: JSON-formatted logs with Winston
- **Health Checks**: Database and memory monitoring
- **Metrics**: Processing success/failure rates

### Asynchronous Processing
- **Queue-Based**: Non-blocking webhook acceptance
- **Worker Processes**: Dedicated job processors
- **Backoff Strategy**: Smart retry timing
- **Concurrency Control**: Configurable worker limits

## API Endpoints

### Webhook Handling
```http
POST /webhooks/:provider
Content-Type: application/json
X-Stripe-Signature: t=1234567890,v1=signature...
```

**Supported Providers:**
- `stripe` - Stripe payment webhooks
- `paypal` - PayPal transaction webhooks
- `github` - GitHub repository webhooks

### Health Check
```http
GET /health
```

Returns system health status including database connectivity and memory usage.

## Configuration

### Environment Variables

```env
# Database
DATABASE_URL="postgresql://user:pass@localhost:5432/event_integration"

# Redis
REDIS_HOST="localhost"
REDIS_PORT="6379"

# Webhook Secrets
STRIPE_WEBHOOK_SECRET="whsec_..."
PAYPAL_WEBHOOK_SECRET="..."
GITHUB_WEBHOOK_SECRET="..."

# OpenTelemetry
OTEL_SERVICE_NAME="event-driven-integration-service"
JAEGER_ENDPOINT="http://localhost:14268/api/traces"
```

### Queue Configuration

- **Max Retries**: 3 attempts per event
- **Backoff**: Exponential delay (2^attempt * 1000ms)
- **Dead Letter**: Events moved after max retries
- **Cleanup**: Completed jobs removed after 10, failed after 5

## Quick Start

### Prerequisites
- Node.js 18+
- PostgreSQL
- Redis
- Docker (optional)

### Local Development

1. **Clone and install**
   ```bash
   git clone https://github.com/PkLavc/event-driven-integration-service.git && cd event-driven-integration-service
   npm install
   ```

2. **Database setup**
   ```bash
   npm run prisma:migrate
   npm run prisma:generate
   ```

3. **Start infrastructure**
   ```bash
   docker-compose up -d
   ```

4. **Run the service**
   ```bash
   npm run start:dev
   ```

### Docker Deployment

```bash
docker-compose up --build
```

## Testing Webhooks

### Stripe Webhook Test
```bash
curl -X POST http://localhost:3001/webhooks/stripe \
  -H "Content-Type: application/json" \
  -H "Stripe-Signature: t=1234567890,v1=test_signature" \
  -d '{
    "id": "evt_test_webhook",
    "type": "payment.succeeded",
    "data": {
      "amount": 1000,
      "currency": "usd"
    }
  }'
```

### Health Check
```bash
curl http://localhost:3001/health
```

## Monitoring & Observability

### Jaeger UI
Access tracing dashboard at `http://localhost:16686`

### Log Files
- `logs/combined.log` - All log levels
- `logs/error.log` - Error logs only

### Queue Monitoring
BullMQ provides dashboard at Redis connection.

### Note on Structured Logging
Codebase follows the Twelve-Factor App methodology, treating logs as event streams. JSON formatting ensures compatibility with modern log aggregators like ELK or Datadog.

## Design Patterns

### Event Logging/Auditing
- Events stored immutably in database for audit trail
- Status transitions tracked for debugging and monitoring
- Complete webhook processing history maintained

### Circuit Breaker
- Failed providers can be temporarily disabled
- Automatic recovery attempts

### Saga Pattern
- Multi-step event processing
- Compensation actions for failures

## Error Handling

- **Validation Errors**: 400 Bad Request with details
- **Signature Invalid**: 400 Bad Request
- **Idempotency Conflict**: 200 OK (already processed)
- **Processing Failures**: Retried with backoff
- **System Errors**: 500 with correlation ID

## Performance Considerations

- **Connection Pooling**: Prisma handles database connections
- **Redis Clustering**: Horizontal scaling support
- **Worker Scaling**: Multiple worker instances
- **Event Batching**: Future enhancement for high volume

## Security Features

- **Signature Verification**: HMAC-SHA256 validation
- **Input Sanitization**: JSON schema validation
- **Rate Limiting**: Configurable per provider
- **Audit Logging**: All events logged with metadata

## Production Deployment

### Infrastructure Requirements
- PostgreSQL 15+
- Redis 7+
- Jaeger Collector
- Load Balancer

### Scaling Strategies
- Horizontal pod scaling
- Database read replicas
- Redis cluster
- Message queue partitioning

### Monitoring Stack
- Prometheus metrics
- Grafana dashboards
- Alert Manager
- ELK stack for logs

## Author

**Patrick - Computer Engineer** To view other projects and portfolio details, visit:
[https://pklavc.github.io/projects.html](https://pklavc.github.io/projects.html)

---

*Built to showcase enterprise-grade event processing capabilities.*
