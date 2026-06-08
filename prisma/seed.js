const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const DEFAULT_CATEGORIES = [
  { name: "Web", slug: "web" },
  { name: "Cryptography", slug: "cryptography" },
  { name: "Forensics", slug: "forensics" },
  { name: "Reverse Engineering", slug: "reverse-engineering" },
  { name: "Binary Exploitation", slug: "binary-exploitation" },
  { name: "Miscellaneous", slug: "miscellaneous" },
  { name: "OSINT", slug: "osint" },
];

async function main() {
  for (const cat of DEFAULT_CATEGORIES) {
    await prisma.category.upsert({
      where: { slug: cat.slug },
      update: {},
      create: { ...cat, isDefault: true },
    });
  }
  console.log("Seeded default categories.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
