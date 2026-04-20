import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAdmin } from "../lib/auth.js";

const router = Router();

// Helper: generate order number
const generateOrderNumber = (): string => {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `ELN-${ts}-${rand}`;
};

// POST /api/orders — Public: create order
router.post("/", async (req: Request, res: Response) => {
  try {
    const {
      items,
      deliveryMethod,
      paymentMethod,
      name,
      email,
      phone,
      countryCode,
      street,
      city,
      country,
      notes,
    } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      res.status(400).json({ error: "Order items are required" });
      return;
    }
    if (!name || !phone) {
      res
        .status(400)
        .json({ error: "Customer name and phone are required" });
      return;
    }

    const subtotal = items.reduce(
      (sum: number, item: any) => sum + item.unitPrice * item.quantity,
      0
    );
    const deliveryFee =
      subtotal > 10000
        ? 0
        : deliveryMethod === "express"
          ? 500
          : deliveryMethod === "pickup"
            ? 0
            : 300;
    const total = subtotal + deliveryFee;

    const order = await prisma.order.create({
      data: {
        orderNumber: generateOrderNumber(),
        customerName: name,
        customerEmail: email || null,
        customerPhone: phone,
        countryCode: countryCode || "+254",
        street: street || "",
        city: city || "Nairobi",
        country: country || "Kenya",
        notes: notes || null,
        subtotal,
        deliveryFee,
        total,
        paymentMethod: paymentMethod || "cash",
        items: {
          create: items.map((item: any) => ({
            productId: item.productId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            totalPrice: item.unitPrice * item.quantity,
          })),
        },
      },
      include: { items: { include: { product: true } } },
    });

    res.json({ success: true, order });
  } catch (error) {
    console.error("Order create error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/orders/track — Public: track order by number
router.get("/track", async (req: Request, res: Response) => {
  try {
    const { orderNumber } = req.query;
    if (!orderNumber) {
      res.status(400).json({ error: "Order number is required" });
      return;
    }

    const order = await prisma.order.findUnique({
      where: { orderNumber: orderNumber as string },
      include: { items: { include: { product: true } } },
    });

    if (!order) {
      res.status(404).json({ error: "Order not found" });
      return;
    }

    res.json({ order });
  } catch (error) {
    console.error("Order track error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ============ ADMIN ROUTES ============

// GET /api/orders/admin/all — Admin: list all orders
router.get(
  "/admin/all",
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const { status, paymentStatus } = req.query;
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const skip = (page - 1) * limit;

      const where: any = {};
      if (status) where.orderStatus = status as string;
      if (paymentStatus) where.paymentStatus = paymentStatus as string;

      const [orders, total] = await Promise.all([
        prisma.order.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip,
          take: limit,
          include: {
            items: {
              include: {
                product: {
                  select: { name: true, image: true, sku: true },
                },
              },
            },
          },
        }),
        prisma.order.count({ where }),
      ]);

      res.json({ orders, total, page, limit });
    } catch (error) {
      console.error("Admin orders error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// PATCH /api/orders/admin/update — Admin: update order status
router.patch(
  "/admin/update",
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const { id, orderStatus, paymentStatus, notes } = req.body;
      if (!id) {
        res.status(400).json({ error: "Order ID is required" });
        return;
      }

      const data: any = {};
      if (orderStatus) data.orderStatus = orderStatus;
      if (paymentStatus) data.paymentStatus = paymentStatus;
      if (notes !== undefined) data.notes = notes;

      const order = await prisma.order.update({
        where: { id },
        data,
        include: { items: { include: { product: true } } },
      });

      res.json({ success: true, order });
    } catch (error: any) {
      if (error.code === "P2025") {
        res.status(404).json({ error: "Order not found" });
        return;
      }
      console.error("Order update error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

export default router;
