import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAdmin } from "../lib/auth.js";

const router = Router();

// GET /api/adverts — Public: list active adverts
router.get("/", async (_req: Request, res: Response) => {
  try {
    const adverts = await prisma.advert.findMany({
      where: { isActive: true },
      orderBy: { priority: "asc" },
    });

    const result = adverts.map((a) => ({
      ...a,
      pages: JSON.parse(a.pages),
    }));

    res.json({ adverts: result });
  } catch (error) {
    console.error("Adverts list error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/adverts/admin/all — Admin: list all adverts
router.get(
  "/admin/all",
  requireAdmin,
  async (_req: Request, res: Response) => {
    try {
      const adverts = await prisma.advert.findMany({
        orderBy: { createdAt: "desc" },
      });

      const result = adverts.map((a) => ({
        ...a,
        pages: JSON.parse(a.pages),
      }));

      res.json({ adverts: result });
    } catch (error) {
      console.error("Admin adverts error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// POST /api/adverts — Admin: create advert
router.post("/", requireAdmin, async (req: Request, res: Response) => {
  try {
    const {
      title,
      subtitle,
      message,
      productId,
      productName,
      productImage,
      originalPrice,
      discountPrice,
      ctaType,
      ctaText,
      badge,
      badgeColor,
      expiresIn,
      priority,
      pages,
      isActive,
    } = req.body;

    if (!title || !message || !productId) {
      res
        .status(400)
        .json({ error: "Title, message, and product ID are required" });
      return;
    }

    const advert = await prisma.advert.create({
      data: {
        title,
        subtitle: subtitle || "",
        message,
        productId,
        productName: productName || "",
        productImage: productImage || "",
        originalPrice: parseFloat(originalPrice) || 0,
        discountPrice: discountPrice ? parseFloat(discountPrice) : null,
        ctaType: ctaType || "view-product",
        ctaText: ctaText || "View Product",
        badge: badge || "",
        badgeColor: badgeColor || "blue",
        expiresIn: expiresIn || null,
        priority: priority || 1,
        pages: JSON.stringify(pages || ["home"]),
        isActive: isActive !== false,
      },
    });

    res.json({
      success: true,
      advert: { ...advert, pages: JSON.parse(advert.pages) },
    });
  } catch (error) {
    console.error("Advert create error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /api/adverts — Admin: update advert
router.patch("/", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { id, ...fields } = req.body;
    if (!id) {
      res.status(400).json({ error: "Advert ID is required" });
      return;
    }

    const data: any = {};
    for (const [key, value] of Object.entries(fields)) {
      if (key === "pages") {
        data.pages = JSON.stringify(value);
      } else if (key === "originalPrice" || key === "discountPrice") {
        data[key] = value ? parseFloat(value as string) : null;
      } else if (key === "priority") {
        data.priority = parseInt(value as string);
      } else {
        data[key] = value;
      }
    }

    const advert = await prisma.advert.update({ where: { id }, data });
    res.json({
      success: true,
      advert: { ...advert, pages: JSON.parse(advert.pages) },
    });
  } catch (error: any) {
    if (error.code === "P2025") {
      res.status(404).json({ error: "Advert not found" });
      return;
    }
    console.error("Advert update error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /api/adverts — Admin: delete advert
router.delete("/", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.body;
    if (!id) {
      res.status(400).json({ error: "Advert ID is required" });
      return;
    }

    await prisma.advert.delete({ where: { id } });
    res.json({ success: true });
  } catch (error) {
    console.error("Advert delete error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
