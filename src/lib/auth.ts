import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { Request, Response, NextFunction } from "express";

const JWT_SECRET =
  process.env.JWT_SECRET ||
  "ellena-beauty-secret-key-change-in-production";
const SALT_ROUNDS = 12;
const TOKEN_EXPIRY = "7d";

export const hashPassword = (password: string): Promise<string> => {
  return bcrypt.hash(password, SALT_ROUNDS);
};

export const verifyPassword = (
  password: string,
  hash: string
): Promise<boolean> => {
  return bcrypt.compare(password, hash);
};

export interface TokenPayload {
  userId: string;
  email: string;
  role: string;
}

export const signToken = (payload: TokenPayload): string => {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
};

export const verifyToken = (token: string): TokenPayload | null => {
  try {
    return jwt.verify(token, JWT_SECRET) as TokenPayload;
  } catch {
    return null;
  }
};

export const getSession = (req: Request): TokenPayload | null => {
  const token = req.cookies?.token;
  if (!token) return null;
  return verifyToken(token);
};

// Middleware: require any authenticated user
export const requireAuth = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const session = getSession(req);
  if (!session) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  (req as any).user = session;
  next();
};

// Middleware: require admin role
export const requireAdmin = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const session = getSession(req);
  if (!session) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (session.role !== "admin") {
    res.status(403).json({ error: "Forbidden: admin access required" });
    return;
  }
  (req as any).user = session;
  next();
};
