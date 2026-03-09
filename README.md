# Idempotent User Sync

Microservicio REST que sincroniza usuarios de forma idempotente usando UPSERT en PostgreSQL.

## Requisitos previos

- Docker y Docker Compose

## Levantar con Docker

Antes de arrancar, crear un archivo `.env` en la raíz del proyecto con el secret para JWT:

```bash
cp .env.example .env
# Editar .env y establecer un valor seguro para JWT_SECRET
```

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
| `JWT_SECRET` | **Obligatoria.** Clave para firmar/verificar JWT. El servicio no arranca sin ella | — |
| `BCRYPT_ROUNDS` | Rondas de hashing bcrypt | `10` |

## Ejemplos curl

Los endpoints protegidos requieren un token JWT. Para generar uno desde la terminal, es necesario tener las dependencias instaladas:

```bash
npm install

# Exportar el JWT_SECRET (debe coincidir con el valor en .env)
export $(grep JWT_SECRET .env)

# Generar un token de prueba
TOKEN=$(node -e "console.log(require('jsonwebtoken').sign({sub:'test'},process.env.JWT_SECRET,{expiresIn:'1h'}))")
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

## Ejecutar tests

Requiere PostgreSQL funcionando en `localhost:5432`. Se puede usar el Postgres del propio `docker-compose` (si ya está levantado) o una instancia local.

Los tests usan una base de datos separada (`dbname_test`) que se crea automáticamente, sin afectar los datos de la app:

```bash
npm install
npm test
```

## Decisiones de diseño

### Idempotencia con UPSERT y `xmax = 0`

La idempotencia se resuelve a nivel de base de datos, no de aplicación. La tabla `users` tiene una constraint `UNIQUE(credential, email)` y el endpoint usa un `INSERT ... ON CONFLICT DO UPDATE` (UPSERT).

Para distinguir si la fila fue insertada o actualizada, se usa `(xmax = 0) AS created` en el `RETURNING`. En PostgreSQL, `xmax` es un campo interno del sistema: cuando vale `0` significa que la fila fue recién insertada (no tiene transacción previa que la haya modificado). Si `xmax > 0`, la fila ya existía y fue actualizada por el `ON CONFLICT`.

Esto evita queries adicionales (como un `SELECT` previo) y mantiene la operación atómica en una sola sentencia SQL.

### Repository pattern

El acceso a datos está aislado en `src/repositories/userRepository.ts`, que contiene únicamente el query SQL. La capa de servicio (`userService.ts`) gestiona la lógica de negocio y el mapeo de respuesta. Los route handlers solo se encargan de la validación, el logging y la delegación al servicio.

Flujo: `routes → services → repositories → db pool`

Cada capa solo conoce a la inmediatamente inferior.

### Validación y normalización

Los campos del payload se validan con zod aplicando `trim()` y `max(255)`. El email se normaliza a minúsculas (`toLowerCase()`) para evitar duplicados por diferencias de casing (por ejemplo, `User@Test.com` y `user@test.com` se tratan como el mismo email).