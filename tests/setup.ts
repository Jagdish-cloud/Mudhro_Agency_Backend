process.env.DATABASE_URL ??= "postgresql://postgres:postgres@localhost:5432/mudhro_test";
process.env.JWT_SECRET ??= "test-jwt-secret-at-least-32-chars-long-xxxxxxxx";
process.env.JWT_EXPIRES_IN ??= "1h";
process.env.BCRYPT_SALT_ROUNDS ??= "8";
process.env.NODE_ENV ??= "test";
process.env.PORT ??= "4001";
