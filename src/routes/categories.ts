import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAdmin } from "../lib/auth.js";

const router = Router();

// GET /api/categories — Public: list categories with hierarchy
router.get("/", async (_req: Request, res: Response) => {
  try {
    const categories = await prisma.category.findMany({
      orderBy: { sortOrder: "asc" },
      include: {
        children: {
          orderBy: { sortOrder: "asc" },
          include: {
            children: { orderBy: { sortOrder: "asc" } },
            _count: { select: { products: true } },
          },
        },
        _count: { select: { products: true } },
      },
      where: { parentId: null },
    });

    res.json({ categories });
  } catch (error) {
    console.error("Categories list error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/categories — Admin: create category
router.post("/", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { name, description, image, parentId, sortOrder } = req.body;
    if (!name) {
      res.status(400).json({ error: "Category name is required" });
      return;
    }

    const slug = name
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, "")
      .replace(/\s+/g, "-");
    const category = await prisma.category.create({
      data: {
        name,
        slug,
        description: description || null,
        image: image || null,
        parentId: parentId || null,
        sortOrder: sortOrder || 0,
      },
    });

    res.json({ success: true, category });
  } catch (error: any) {
    if (error.code === "P2002") {
      res
        .status(409)
        .json({ error: "Category with this name already exists" });
      return;
    }
    console.error("Category create error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /api/categories — Admin: update category
router.patch("/", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { id, name, description, image, parentId, sortOrder } = req.body;
    if (!id) {
      res.status(400).json({ error: "Category ID is required" });
      return;
    }

    const data: any = {};
    if (name !== undefined) {
      data.name = name;
      data.slug = name
        .toLowerCase()
        .trim()
        .replace(/[^\w\s-]/g, "")
        .replace(/\s+/g, "-");
    }
    if (description !== undefined) data.description = description || null;
    if (image !== undefined) data.image = image || null;
    if (parentId !== undefined) data.parentId = parentId || null;
    if (sortOrder !== undefined) data.sortOrder = sortOrder;

    const category = await prisma.category.update({
      where: { id },
      data,
    });

    res.json({ success: true, category });
  } catch (error: any) {
    if (error.code === "P2025") {
      res.status(404).json({ error: "Category not found" });
      return;
    }
    console.error("Category update error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /api/categories — Admin: delete category
router.delete("/", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.body;
    if (!id) {
      res.status(400).json({ error: "Category ID is required" });
      return;
    }

    // Re-parent children to the category's parent
    const cat = await prisma.category.findUnique({ where: { id } });
    if (!cat) {
      res.status(404).json({ error: "Category not found" });
      return;
    }

    await prisma.category.updateMany({
      where: { parentId: id },
      data: { parentId: cat.parentId },
    });

    await prisma.category.delete({ where: { id } });

    res.json({ success: true });
  } catch (error) {
    console.error("Category delete error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
