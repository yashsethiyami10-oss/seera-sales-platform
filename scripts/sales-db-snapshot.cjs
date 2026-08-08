const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
const selected = new Set([
  "users", "customers", "orders", "products", "categories",
  "sales_roles", "sales_permissions", "territories", "sales_audit_logs",
  "sales_channels", "customer_types", "lead_sources", "assignment_queues",
  "sales_inquiry_statuses", "sales_application_statuses", "sales_inquiries",
]);

async function main() {
  const tables = await prisma.$queryRawUnsafe(
    "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename"
  );
  const counts = {};
  for (const { tablename } of tables) {
    if (!selected.has(tablename)) continue;
    const [result] = await prisma.$queryRawUnsafe(
      `SELECT COUNT(*)::int AS count FROM "${tablename}"`
    );
    counts[tablename] = result.count;
  }
  console.log(JSON.stringify(counts, null, 2));
}

main().finally(() => prisma.$disconnect());
