import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAdmin } from "../lib/auth.js";

const router = Router();

// Helper: slugify
const slugify = (text: string): string =>
  text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");

// GET /api/products — Public: list products with optional filters
router.get("/", async (req: Request, res: Response) => {
  try {
    const { category, subcategory, q, tag, sort, minPrice, maxPrice } =
      req.query;

    const where: any = { isActive: true };

    if (category) {
      where.category = { slug: category as string };
    }
    if (subcategory) {
      where.subCategory = subcategory as string;
    }
    if (q) {
      const search = q as string;
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } },
        { sku: { contains: search, mode: "insensitive" } },
      ];
    }
    if (tag) {
      where.tags = { some: { tag: tag as string } };
    }
    if (minPrice || maxPrice) {
      where.price = {};
      if (minPrice) where.price.gte = parseFloat(minPrice as string);
      if (maxPrice) where.price.lte = parseFloat(maxPrice as string);
    }

    let orderBy: any = { createdAt: "desc" };
    if (sort === "price-asc") orderBy = { price: "asc" };
    else if (sort === "price-desc") orderBy = { price: "desc" };
    else if (sort === "name") orderBy = { name: "asc" };
    else if (sort === "rating") orderBy = { rating: "desc" };

    const products = await prisma.product.findMany({
      where,
      orderBy,
      include: {
        tags: { select: { tag: true } },
        category: { select: { name: true, slug: true } },
      },
    });

    // Transform to match the frontend Product interface
    const result = products.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      price: p.price,
      discountPrice: p.discountPrice,
      category: p.category?.name,
      subCategory: p.subCategory,
      subSubCategory: p.subSubCategory,
      image: p.image,
      video: p.video,
      rating: p.rating,
      reviews: p.reviews,
      tags: p.tags.map((t) => t.tag),
      sku: p.sku,
    }));

    res.json({ products: result });
  } catch (error) {
    console.error("Products list error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/products/:id — Public: single product
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const product = await prisma.product.findUnique({
      where: { id },
      include: {
        tags: { select: { tag: true } },
        category: { select: { name: true, slug: true } },
      },
    });

    if (!product) {
      res.status(404).json({ error: "Product not found" });
      return;
    }

    const { category, tags, ...rest } = product;

    res.json({
      id: rest.id,
      name: rest.name,
      description: rest.description,
      price: rest.price,
      discountPrice: rest.discountPrice,
      category: category?.name || null,
      subCategory: rest.subCategory,
      subSubCategory: rest.subSubCategory,
      image: rest.image,
      video: rest.video,
      rating: rest.rating,
      reviews: rest.reviews,
      tags: tags.map((t: { tag: string }) => t.tag),
      sku: rest.sku,
    });
  } catch (error) {
    console.error("Product detail error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ============ ADMIN ROUTES ============

// GET /api/products/admin/all — Admin: list ALL products (including inactive)
router.get(
  "/admin/all",
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const q = req.query.q as string;
      const skip = (page - 1) * limit;

      const where: any = {};
      if (q) {
        where.OR = [
          { name: { contains: q, mode: "insensitive" } },
          { sku: { contains: q, mode: "insensitive" } },
          { description: { contains: q, mode: "insensitive" } },
        ];
      }

      const [products, total] = await Promise.all([
        prisma.product.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip,
          take: limit,
          include: {
            tags: { select: { tag: true } },
            category: { select: { id: true, name: true, slug: true } },
          },
        }),
        prisma.product.count({ where }),
      ]);

      const mapped = products.map((p) => ({
        ...p,
        tags: p.tags.map((t) => t.tag),
      }));

      res.json({ products: mapped, total, page, limit });
    } catch (error) {
      console.error("Admin products error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// POST /api/products/admin/create — Admin: create product
router.post(
  "/admin/create",
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const {
        name,
        description,
        price,
        discountPrice,
        sku,
        categoryId,
        subCategory,
        subSubCategory,
        image,
        video,
        rating,
        reviews,
        tags,
        isActive,
        isFeatured,
        inStock,
      } = req.body;

      if (!name || price === undefined) {
        res.status(400).json({ error: "Name and price are required" });
        return;
      }

      const slug = slugify(name) + "-" + Date.now();

      const product = await prisma.product.create({
        data: {
          name,
          slug,
          description: description || "",
          price: parseFloat(price),
          discountPrice: discountPrice ? parseFloat(discountPrice) : null,
          sku: sku || null,
          categoryId: categoryId || null,
          subCategory: subCategory || null,
          subSubCategory: subSubCategory || null,
          image: image || null,
          video: video || null,
          rating: rating ? parseFloat(rating) : 0,
          reviews: reviews ? parseInt(reviews) : 0,
          inStock: inStock !== false,
          isActive: isActive !== false,
          isFeatured: isFeatured === true,
          tags: {
            create: (tags || []).map((tag: string) => ({ tag })),
          },
        },
        include: {
          tags: { select: { tag: true } },
          category: { select: { id: true, name: true, slug: true } },
        },
      });

      res.json({ success: true, product });
    } catch (error: any) {
      if (error.code === "P2002") {
        res
          .status(409)
          .json({
            error: "Product with this name or SKU already exists",
          });
        return;
      }
      console.error("Product create error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// PATCH /api/products/admin/update — Admin: update product
router.patch(
  "/admin/update",
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const {
        id,
        name,
        description,
        price,
        discountPrice,
        sku,
        categoryId,
        subCategory,
        subSubCategory,
        image,
        video,
        rating,
        reviews,
        tags,
        isActive,
        isFeatured,
        inStock,
      } = req.body;

      if (!id) {
        res.status(400).json({ error: "Product ID is required" });
        return;
      }

      const data: any = {};
      if (name !== undefined) {
        data.name = name;
        data.slug = slugify(name) + "-" + Date.now();
      }
      if (description !== undefined) data.description = description;
      if (price !== undefined) data.price = parseFloat(price);
      if (discountPrice !== undefined)
        data.discountPrice = discountPrice
          ? parseFloat(discountPrice)
          : null;
      if (sku !== undefined) data.sku = sku || null;
      if (categoryId !== undefined) data.categoryId = categoryId || null;
      if (subCategory !== undefined)
        data.subCategory = subCategory || null;
      if (subSubCategory !== undefined)
        data.subSubCategory = subSubCategory || null;
      if (image !== undefined) data.image = image || null;
      if (video !== undefined) data.video = video || null;
      if (rating !== undefined) data.rating = parseFloat(rating);
      if (reviews !== undefined) data.reviews = parseInt(reviews);
      if (inStock !== undefined) data.inStock = inStock;
      if (isActive !== undefined) data.isActive = isActive;
      if (isFeatured !== undefined) data.isFeatured = isFeatured;

      // Update tags if provided
      if (tags !== undefined) {
        await prisma.productTag.deleteMany({ where: { productId: id } });
        data.tags = { create: tags.map((tag: string) => ({ tag })) };
      }

      const product = await prisma.product.update({
        where: { id },
        data,
        include: {
          tags: { select: { tag: true } },
          category: { select: { id: true, name: true, slug: true } },
        },
      });

      res.json({ success: true, product });
    } catch (error: any) {
      if (error.code === "P2025") {
        res.status(404).json({ error: "Product not found" });
        return;
      }
      console.error("Product update error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// DELETE /api/products/admin/delete — Admin: delete product(s)
router.delete(
  "/admin/delete",
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const { ids } = req.body;
      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        res.status(400).json({ error: "Product IDs are required" });
        return;
      }

      await prisma.productTag.deleteMany({
        where: { productId: { in: ids } },
      });
      await prisma.product.deleteMany({ where: { id: { in: ids } } });

      res.json({ success: true, deleted: ids.length });
    } catch (error) {
      console.error("Product delete error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

export default router;
