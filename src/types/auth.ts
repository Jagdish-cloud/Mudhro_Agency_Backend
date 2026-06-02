export type UserRole = 1 | 2;

export type AuthPayload = {
  id: string;
  organizationId: string;
  email: string;
  role: UserRole;
};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthPayload;
    }
  }
}

export {};
