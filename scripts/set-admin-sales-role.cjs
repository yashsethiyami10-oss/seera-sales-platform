const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  const name = process.argv.slice(2).join(" ");
  const role = await prisma.salesRole.findUniqueOrThrow({ where: { name } });
  if (!role.active) throw new Error("Refusing to assign an inactive role");
  await prisma.user.update({
    where: { email: "admin@muv.co.in" },
    data: { salesRoleId: role.id },
  });
  console.log(name);
}

main().finally(() => prisma.$disconnect());
