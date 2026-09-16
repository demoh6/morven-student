import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const email = "demo.subadmin@morven.local";
const username = "demo_subadmin";
const password = "DemoSubAdmin123!";
const displayName = "مشرف فرعي تجريبي";

const passwordHash = await bcrypt.hash(password, 12);

let user = await prisma.user.findUnique({ where: { email } });
if (user) {
  user = await prisma.user.update({ where: { id: user.id }, data: { role: "SUB_ADMIN", displayName, username } });
  console.log("Existing user promoted to SUB_ADMIN");
} else {
  user = await prisma.$transaction(async (tx) => {
    const u = await tx.user.create({ data: { email, username, passwordHash, displayName, role: "SUB_ADMIN" } });
    await tx.profile.create({ data: { userId: u.id } });
    return u;
  });
  console.log("New demo SUB_ADMIN user created");
}

console.log("ID:      " + user.id);
console.log("Email:   " + email);
console.log("User:    " + username);
console.log("Pass:    " + password);
console.log("Role:    " + user.role);
await prisma.$disconnect();
