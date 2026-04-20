import { PrismaClient } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import * as bcrypt from "bcryptjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const prisma = new PrismaClient();

interface CategoryNode {
  name: string;
  subcategories?: CategoryNode[];
}

const CATEGORIES: CategoryNode[] = [
  {
    name: "Wigs",
    subcategories: [
      { name: "360" },
      { name: "Afro Wigs" },
      { name: "Body" },
      { name: "Bob" },
      { name: "Colored" },
      { name: "HD" },
      { name: "Jerry Curly" },
      { name: "Jerry Curly Bundles" },
      { name: "Kinky" },
      { name: "Pixie" },
      { name: "Straight" },
      { name: "Water Waves Deep" },
    ],
  },
  {
    name: "Closures 4x4",
    subcategories: [
      { name: "Body" },
      { name: "Curly" },
      { name: "Straight" },
      { name: "HD" },
    ],
  },
  {
    name: "Frontals 13x4",
    subcategories: [
      { name: "Straight Kinky" },
      { name: "Deep" },
      { name: "Jerry" },
      { name: "Kinky" },
      { name: "Body" },
    ],
  },
  {
    name: "Weaves",
    subcategories: [
      { name: "Afro Bulk" },
      { name: "Body" },
      { name: "Braids" },
      { name: "Deep" },
      { name: "Jerry" },
      { name: "Kinky" },
      { name: "Kinky Straight" },
      { name: "Loose Waves" },
      { name: "Straight" },
    ],
  },
  {
    name: "Cosmetics",
    subcategories: [
      {
        name: "Hair Care",
        subcategories: [
          { name: "Hair Growth" },
          {
            name: "Hair Maintenance",
            subcategories: [
              { name: "Shampoo" },
              { name: "Treatment" },
              { name: "Conditions" },
              { name: "Spray" },
              { name: "Serum" },
              { name: "Mouse" },
              { name: "Gel" },
            ],
          },
        ],
      },
      {
        name: "Facial Care",
        subcategories: [
          { name: "Face Scrub" },
          { name: "Face Cream" },
          { name: "Face Lotion" },
        ],
      },
      {
        name: "Body Care",
        subcategories: [{ name: "Body Cream" }, { name: "Body Lotion" }],
      },
      { name: "Collagen Peptides" },
    ],
  },
  {
    name: "Wig Caps",
    subcategories: [{ name: "Dome Caps" }, { name: "Wig Caps" }],
  },
  {
    name: "Dummies",
    subcategories: [{ name: "Small/Short" }, { name: "Big/Long" }],
  },
  {
    name: "Dyes",
    subcategories: [{ name: "Lace Tint" }, { name: "Black Shampoo" }],
  },
];

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

async function seedCategories(
  nodes: CategoryNode[],
  parentId: string | null = null,
  parentSlugPrefix: string = ""
): Promise<Map<string, string>> {
  const map = new Map<string, string>();

  for (const node of nodes) {
    const slug = parentSlugPrefix
      ? `${parentSlugPrefix}-${slugify(node.name)}`
      : slugify(node.name);
    const cat = await prisma.category.upsert({
      where: { slug },
      update: { name: node.name, parentId },
      create: { name: node.name, slug, parentId },
    });
    const qualifiedKey = parentSlugPrefix
      ? `${parentSlugPrefix}/${node.name}`
      : node.name;
    map.set(qualifiedKey, cat.id);
    map.set(node.name, cat.id);

    if (node.subcategories) {
      const childMap = await seedCategories(
        node.subcategories,
        cat.id,
        slug
      );
      childMap.forEach((v, k) => map.set(k, v));
    }
  }

  return map;
}

async function main() {
  console.log("Seeding database...");

  // 1. Create admin user
  const adminPassword = process.env.ADMIN_PASSWORD || "admin123";
  const hashedPassword = await bcrypt.hash(adminPassword, 12);
  await prisma.user.upsert({
    where: { email: "admin@ellenabeauty.co.ke" },
    update: {},
    create: {
      name: "Admin",
      email: "admin@ellenabeauty.co.ke",
      passwordHash: hashedPassword,
      role: "admin",
    },
  });
  console.log("Admin user created: admin@ellenabeauty.co.ke");

  // 2. Seed categories
  const categoryMap = await seedCategories(CATEGORIES);
  console.log(`Seeded ${categoryMap.size} categories`);

  // 3. Seed products from JSON
  const productsFile = path.join(__dirname, "data", "products.json");
  if (!fs.existsSync(productsFile)) {
    console.warn(`Products file not found: ${productsFile}`);
    console.log("Skipping product seeding. Place products.json in backend/prisma/data/");
  } else {
    const productsData = JSON.parse(fs.readFileSync(productsFile, "utf8"));
    const products: any[] = productsData.products || [];

    let created = 0;
    for (const p of products) {
      const categoryName =
        p.subSubCategory || p.subCategory || p.category;
      const categoryId =
        categoryMap.get(categoryName) || categoryMap.get(p.category);
      if (!categoryId) {
        console.warn(
          `Skipping product ${p.id}: no category match for "${categoryName}"`
        );
        continue;
      }

      const slug = slugify(p.name) + "-" + p.id;

      await prisma.product.upsert({
        where: { id: p.id },
        update: {
          name: p.name,
          slug,
          description: p.description || "",
          price: p.price,
          discountPrice: p.discountPrice || null,
          image: p.image,
          video: p.video || null,
          sku: p.sku || p.id.toUpperCase(),
          rating: p.rating || 0,
          reviews: p.reviews || 0,
          inStock: p.inStock !== false,
          categoryId,
        },
        create: {
          id: p.id,
          name: p.name,
          slug,
          description: p.description || "",
          price: p.price,
          discountPrice: p.discountPrice || null,
          image: p.image,
          video: p.video || null,
          sku: p.sku || p.id.toUpperCase(),
          rating: p.rating || 0,
          reviews: p.reviews || 0,
          inStock: p.inStock !== false,
          categoryId,
        },
      });

      if (p.tags && p.tags.length > 0) {
        for (const tag of p.tags) {
          await prisma.productTag.upsert({
            where: { productId_tag: { productId: p.id, tag } },
            update: {},
            create: { productId: p.id, tag },
          });
        }
      }
      created++;
    }
    console.log(`Seeded ${created} products`);
  }

  // 4. Seed adverts from JSON
  const advertsFile = path.join(__dirname, "data", "adverts.json");
  if (fs.existsSync(advertsFile)) {
    const advertsData = JSON.parse(fs.readFileSync(advertsFile, "utf8"));
    const adverts: any[] = advertsData.adverts || [];

    let advertCount = 0;
    for (const a of adverts) {
      await prisma.advert.create({
        data: {
          title: a.title || "Promo",
          subtitle: a.subtitle || "",
          message: a.message || "",
          productId: a.productId || "",
          productName: a.productName || "",
          productImage: a.productImage || "",
          originalPrice: a.originalPrice || 0,
          discountPrice: a.discountPrice || null,
          ctaType: a.ctaType || "view-product",
          ctaText: a.ctaText || "View",
          badge: a.badge || "",
          badgeColor: a.badgeColor || "blue",
          expiresIn: a.expiresIn || null,
          priority: a.priority || 1,
          pages: JSON.stringify(a.pages || ["home"]),
          isActive: a.isActive !== false,
        },
      });
      advertCount++;
    }
    console.log(`Seeded ${advertCount} adverts`);
  }

  // 5. Seed default site config
  const defaults = [
    { key: "site_name", value: "Ellena Beauty & Cosmetics" },
    { key: "phone", value: "+254741430918" },
    { key: "email", value: "info@ellenabeauty.co.ke" },
    { key: "currency", value: "KSh" },
  ];
  for (const d of defaults) {
    await prisma.siteConfig.upsert({
      where: { key: d.key },
      update: {},
      create: d,
    });
  }
  console.log("Site config seeded");

  console.log("\nSeed complete!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
