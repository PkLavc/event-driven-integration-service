---
name: Bug report
about: Create a report to help us improve the webhook processing service
title: ''
labels: bug
assignees: ''

---

**Describe the bug**
A clear and concise description of what the bug is.

**To Reproduce**
Steps to reproduce the behavior:
1. Go to webhook endpoint
2. Send webhook payload
3. See error

**Expected behavior**
A clear and concise description of what you expected to happen.

**Screenshots**
If applicable, add screenshots to help explain your problem.

**Environment (please complete the following information):**
 - OS: [e.g. macOS, Windows, Linux]
 - Node.js Version: [e.g. 18.12.0]
 - Database: [e.g. PostgreSQL 15.2]
 - Redis Version: [e.g. 7.0.8]
 - Provider: [e.g. Stripe, PayPal, GitHub]

**Webhook Details**
- **Provider**: [e.g. Stripe]
- **Event Type**: [e.g. payment.succeeded]
- **Webhook Secret**: [Yes/No - remove actual secret]
- **Signature Header**: [e.g. Stripe-Signature]

**Webhook Payload**
```json
{
  "id": "evt_test_webhook",
  "type": "payment.succeeded",
  "data": {
    "amount": 1000,
    "currency": "usd"
  }
}
```

**Error Logs**
If applicable, add error logs from Winston:
```
Paste error logs here
```

**Additional context**
Add any other context about the problem here.

**Configuration**
Please provide relevant configuration (remove sensitive information):
- Environment variables (secrets removed)
- Database configuration
- Redis configuration