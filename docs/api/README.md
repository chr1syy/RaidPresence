# API Documentation

## Overview

This document provides comprehensive documentation for the RaidPresence API endpoints, including authentication, request/response formats, and usage examples.

## Authentication

[Describe authentication method here - e.g., API keys, OAuth, etc.]

## Base URL

```
https://api.raidpresence.com/v1
```

## Endpoints

### GET /health

Check the health status of the API.

**Request:**
```
GET /health
```

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2023-12-01T00:00:00Z"
}
```

### POST /raids

Create a new raid presence entry.

**Request:**
```
POST /raids
Authorization: Bearer <token>
Content-Type: application/json

{
  "raidId": "string",
  "userId": "string",
  "action": "join|leave",
  "timestamp": "2023-12-01T00:00:00Z"
}
```

**Response:**
```json
{
  "id": "string",
  "raidId": "string",
  "userId": "string",
  "action": "join|leave",
  "timestamp": "2023-12-01T00:00:00Z",
  "createdAt": "2023-12-01T00:00:00Z"
}
```

## Error Handling

The API uses standard HTTP status codes:

- `200 OK` - Success
- `400 Bad Request` - Invalid request data
- `401 Unauthorized` - Authentication required
- `403 Forbidden` - Insufficient permissions
- `404 Not Found` - Resource not found
- `500 Internal Server Error` - Server error

Error responses include a JSON object with error details:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid input parameters",
    "details": {
      "field": "raidId",
      "issue": "Required field missing"
    }
  }
}
```

## Rate Limiting

API requests are rate limited to prevent abuse. Current limits:

- 100 requests per minute per API key
- 1000 requests per hour per API key

Rate limit headers are included in responses:

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1638360000
```

## SDKs and Libraries

[Link to available SDKs and client libraries if any]

## Changelog

See [CHANGELOG.md](../CHANGELOG.md) for API version changes and updates.

## Support

For API support, please contact [support email] or create an issue in the [GitHub repository](https://github.com/your-org/raidpresence).