# Idempotent User Sync

Microservicio REST que sincroniza usuarios de forma idempotente usando UPSERT en PostgreSQL.

## Requisitos previos

- Docker y Docker Compose

## Levantar con Docker

```bash
docker-compose up --build
```

La app estará disponible en `http://localhost:3000`. La migración de base de datos se ejecuta automáticamente al arrancar.

## Variables de entorno

Documentadas en `.env.example`:

| Variable | Descripción | Default |
|---|---|---|
| `PORT` | Puerto del servidor | `3000` |
| `DATABASE_URL` | Connection string de PostgreSQL | `postgres://user:pass@localhost:5432/dbname` |
| `JWT_SECRET` | Clave para firmar/verificar JWT | `supersecret` |
| `BCRYPT_ROUNDS` | Rondas de hashing bcrypt | `10` |

## Ejemplos curl

Los endpoints protegidos requieren un token JWT:

```bash
# Generar un token de prueba (requiere Node.js)
TOKEN=$(node -e "console.log(require('jsonwebtoken').sign({sub:'test'},process.env.JWT_SECRET||'supersecret',{expiresIn:'1h'}))")
```

El servicio soporta el header `x-correlation-id` para trazabilidad. Si no se envía, se genera uno automáticamente. El mismo ID se devuelve en la respuesta y aparece en los logs:

```bash
curl -X POST http://localhost:3000/sync/user \
  -H "Content-Type: application/json" \
  -H "x-correlation-id: my-trace-123" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"credential": "google-oauth", "email": "user@test.com", "name": "John Doe"}'
# Header de respuesta: x-correlation-id: my-trace-123
# Log: { "correlationId": "my-trace-123", "method": "POST", "path": "/sync/user", "statusCode": 200, "durationMs": 5 }
```

### 1. Crear usuario (primera vez) → created: true

```bash
curl -X POST http://localhost:3000/sync/user \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"credential": "google-oauth", "email": "user@test.com", "name": "John Doe"}'
# Respuesta: { "created": true, "id": "...", "credential": "google-oauth", "email": "user@test.com", "name": "John Doe" }
```

### 2. Mismo request (idempotencia) → created: false, sin error

```bash
curl -X POST http://localhost:3000/sync/user \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"credential": "google-oauth", "email": "user@test.com", "name": "John Doe"}'
# Respuesta: { "created": false, "id": "...", "credential": "google-oauth", "email": "user@test.com", "name": "John Doe" }
```

### 3. Mismo credential+email, nombre diferente → actualiza, created: false

```bash
curl -X POST http://localhost:3000/sync/user \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"credential": "google-oauth", "email": "user@test.com", "name": "Johnny"}'
# Respuesta: { "created": false, "id": "...", "credential": "google-oauth", "email": "user@test.com", "name": "Johnny" }
```

### 4. Payload inválido → 400

```bash
curl -X POST http://localhost:3000/sync/user \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"credential": "google-oauth"}'
# Respuesta: 400 { "error": "Validation failed", "details": [...] }
```

### 5. Healthcheck (sin auth)

```bash
curl http://localhost:3000/health
# Respuesta: { "status": "ok" }
```

## Correr tests

Requiere PostgreSQL corriendo en `localhost:5432`. Puedes usar el Postgres del propio `docker-compose` (si ya lo tienes levantado) o una instancia local.

Los tests usan una base de datos separada (`dbname_test`) que se crea automáticamente, sin afectar los datos de la app:

```bash
npm install
npm test
```

## Decisiones de diseño

### Idempotencia con UPSERT y `xmax = 0`

La idempotencia se resuelve a nivel de base de datos, no de aplicación. La tabla `users` tiene una constraint `UNIQUE(credential, email)` y el endpoint usa un `INSERT ... ON CONFLICT DO UPDATE` (UPSERT).

Para distinguir si la fila fue insertada o actualizada se usa `(xmax = 0) AS created` en el `RETURNING`. En PostgreSQL, `xmax` es un campo interno del sistema: cuando vale `0` significa que la fila fue recién insertada (no tiene transacción previa que la haya modificado). Si `xmax > 0`, la fila ya existía y fue actualizada por el `ON CONFLICT`.

Esto evita queries adicionales (como un `SELECT` previo) y mantiene la operación atómica en una sola sentencia SQL.

### Repository pattern

El acceso a datos está aislado en `src/repositories/userRepository.ts`, que contiene únicamente el query SQL. La capa de servicio (`userService.ts`) maneja la lógica de negocio y el mapeo de respuesta. Los route handlers solo se encargan de validación, logging y delegación al servicio.

Flujo: `routes → services → repositories → db pool`

Cada capa solo conoce a la inmediatamente inferior.
