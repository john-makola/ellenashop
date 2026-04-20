import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAdmin } from "../lib/auth.js";

const router = Router();

// GET /api/dashboard — Admin: dashboard stats
router.get("/", requireAdmin, async (_req: Request, res: Response) => {
  try {
    const [
      totalProducts,
      activeProducts,
      totalOrders,
      pendingOrders,
      totalCustomers,
      totalAdverts,
      recentOrders,
      revenue,
    ] = await Promise.all([
      prisma.product.count(),
      prisma.product.count({ where: { isActive: true } }),
      prisma.order.count(),
      prisma.order.count({ where: { orderStatus: "pending" } }),
      prisma.user.count({ where: { role: "customer" } }),
      prisma.advert.count({ where: { isActive: true } }),
      prisma.order.findMany({
        orderBy: { createdAt: "desc" },
        take: 10,
        include: {
          items: {
            include: {
              product: { select: { name: true, image: true } },
            },
          },
        },
      }),
      prisma.order.aggregate({
        where: { paymentStatus: "completed" },
        _sum: { total: true },
      }),
    ]);

    // Orders by status
    const ordersByStatus = await prisma.order.groupBy({
      by: ["orderStatus"],
      _count: true,
    });

    // Orders by payment status
    const ordersByPayment = await prisma.order.groupBy({
      by: ["paymentStatus"],
      _count: true,
    });

    res.json({
      stats: {
        totalProducts,
        activeProducts,
        totalOrders,
        pendingOrders,
        totalCustomers,
        totalAdverts,
        totalRevenue: revenue._sum.total || 0,
      },
      ordersByStatus: Object.fromEntries(
        ordersByStatus.map((o) => [o.orderStatus, o._count])
      ),
      ordersByPayment: Object.fromEntries(
        ordersByPayment.map((o) => [o.paymentStatus, o._count])
      ),
      recentOrders: recentOrders.map((o) => ({
        ...o,
        status: o.orderStatus,
      })),
    });
  } catch (error) {
    console.error("Dashboard error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
