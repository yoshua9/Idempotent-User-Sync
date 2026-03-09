import request from "supertest";
import jwt from "jsonwebtoken";
import app from "../src/index";
import pool from "../src/config/db";

const JWT_SECRET = process.env.JWT_SECRET!;

function generateToken(): string {
  return jwt.sign({ sub: "test-user" }, JWT_SECRET, { expiresIn: "1h" });
}

beforeEach(async () => {
  await pool.query("TRUNCATE TABLE users");
});

afterAll(async () => {
  await pool.end();
});

describe("POST /sync/user", () => {
  const token = generateToken();
  const validPayload = {
    credential: "google-oauth",
    email: "user@test.com",
    name: "John Doe",
  };

  it("should create a new user (created: true)", async () => {
    const res = await request(app)
      .post("/sync/user")
      .set("Authorization", `Bearer ${token}`)
      .send(validPayload);

    expect(res.status).toBe(200);
    expect(res.body.created).toBe(true);
    expect(res.body.id).toBeDefined();
    expect(res.body.credential).toBe(validPayload.credential);
    expect(res.body.email).toBe(validPayload.email);
    expect(res.body.name).toBe(validPayload.name);
  });

  it("should return created: false on idempotent call", async () => {
    await request(app)
      .post("/sync/user")
      .set("Authorization", `Bearer ${token}`)
      .send(validPayload);

    const res = await request(app)
      .post("/sync/user")
      .set("Authorization", `Bearer ${token}`)
      .send(validPayload);

    expect(res.status).toBe(200);
    expect(res.body.created).toBe(false);
  });

  it("should update name and return created: false", async () => {
    await request(app)
      .post("/sync/user")
      .set("Authorization", `Bearer ${token}`)
      .send(validPayload);

    const res = await request(app)
      .post("/sync/user")
      .set("Authorization", `Bearer ${token}`)
      .send({ ...validPayload, name: "Johnny" });

    expect(res.status).toBe(200);
    expect(res.body.created).toBe(false);
    expect(res.body.name).toBe("Johnny");
  });

  it("should preserve the same id across upserts", async () => {
    const first = await request(app)
      .post("/sync/user")
      .set("Authorization", `Bearer ${token}`)
      .send(validPayload);

    const second = await request(app)
      .post("/sync/user")
      .set("Authorization", `Bearer ${token}`)
      .send({ ...validPayload, name: "Johnny" });

    expect(first.body.id).toBe(second.body.id);
  });

  it("should return 400 for invalid payload", async () => {
    const res = await request(app)
      .post("/sync/user")
      .set("Authorization", `Bearer ${token}`)
      .send({ credential: "google-oauth" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Validation failed");
    expect(res.body.details).toBeDefined();
  });

  it("should return 401 without Authorization header", async () => {
    const res = await request(app)
      .post("/sync/user")
      .send(validPayload);

    expect(res.status).toBe(401);
  });

  it("should return 401 with expired token", async () => {
    const expiredToken = jwt.sign({ sub: "test-user" }, JWT_SECRET, { expiresIn: "0s" });

    const res = await request(app)
      .post("/sync/user")
      .set("Authorization", `Bearer ${expiredToken}`)
      .send(validPayload);

    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Token expired");
  });
});

describe("GET /health", () => {
  it("should return 200 without auth", async () => {
    const res = await request(app).get("/health");

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
  });
});
