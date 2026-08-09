import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient, type SalesOrderStatus } from "@prisma/client";
import { authorizeDatabaseCommand } from "../../lib/database/identity-guard";
import { hashPassword } from "../../lib/foundation/auth-service";
import { seedFoundation } from "../../lib/foundation/seed-service";

function envFile(file: string) {
  const values: Record<string, string> = {};
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = /^\s*([^#][^=]*?)\s*=\s*(.*?)\s*$/.exec(line);
    if (match) values[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
  }
  return values;
}

const root = path.resolve(import.meta.dirname, "..", "..");
const production = envFile(path.join(root, ".env")).DATABASE_URL;
const test = envFile(path.join(root, ".env.test")).TEST_DATABASE_URL;
const target = authorizeDatabaseCommand({
  intendedRole: "test",
  write: true,
  targetUrl: test,
  productionUrl: production,
  testUrl: test,
});
const runtime = new URL(test);
runtime.searchParams.set("connection_limit", "2");
runtime.searchParams.set("pool_timeout", "60");
runtime.searchParams.set("connect_timeout", "20");
const db = new PrismaClient({ datasourceUrl: runtime.toString() });
const password = "SeeraReview!2026";
const prefix = "IV26";

const actors = [
  ["founder", "FOUNDER_SUPER_ADMIN", "Founder Review"],
  ["company-admin", "COMPANY_ADMIN", "Company Admin Review"],
  ["accounts-manager", "ACCOUNTS_MANAGER", "Accounts Manager Review"],
  ["accounts-executive", "ACCOUNTS_EXECUTIVE", "Accounts Executive Review"],
  ["sales-head", "SALES_HEAD", "Sales Head Review"],
  ["sales-manager-1", "SALES_MANAGER", "Sales Manager North"],
  ["sales-manager-2", "SALES_MANAGER", "Sales Manager South"],
  ["sales-executive-1", "SALES_EXECUTIVE", "Sales Executive North One"],
  ["sales-executive-2", "SALES_EXECUTIVE", "Sales Executive North Two"],
  ["ss-owner", "SUPER_STOCKIST_OWNER", "Super Stockist Owner Review"],
  ["ss-operator", "SUPER_STOCKIST_OPERATOR", "Super Stockist Operator Review"],
  ["distributor-owner", "DISTRIBUTOR_OWNER", "Distributor Owner Review"],
  [
    "distributor-operator",
    "DISTRIBUTOR_OPERATOR",
    "Distributor Operator Review",
  ],
  ["delivery", "DISTRIBUTOR_DELIVERY_USER", "Delivery User Review"],
  ["retailer", "RETAILER_USER", "Retailer User Review"],
  ["auditor", "READ_ONLY_AUDITOR", "Auditor Review"],
] as const;

async function main() {
  console.log(
    `[SEERA DB GUARD] role=${target.role} fingerprint=${target.fingerprint}`,
  );
  await seedFoundation(db);
  const passwordHash = await hashPassword(password);
  const roleRows = await db.role.findMany({
    where: { code: { in: actors.map(([, role]) => role) } },
  });
  const roleByCode = new Map(roleRows.map((role) => [role.code, role]));
  const users = new Map<string, Awaited<ReturnType<typeof db.user.upsert>>>();
  for (const [slug, roleCode, name] of actors) {
    const email = `review-${slug}@seera.test`;
    const user = await db.user.upsert({
      where: { normalizedEmail: email },
      update: { name, passwordHash, status: "ACTIVE" },
      create: {
        email,
        normalizedEmail: email,
        name,
        passwordHash,
        status: "ACTIVE",
        emailVerified: new Date(),
      },
    });
    users.set(slug, user);
    const role = roleByCode.get(roleCode)!;
    const assignment = await db.userRoleAssignment.findFirst({
      where: { userId: user.id, roleId: role.id, status: "ACTIVE" },
    });
    if (!assignment)
      await db.userRoleAssignment.create({
        data: {
          userId: user.id,
          roleId: role.id,
          assignedById: users.get("founder")?.id ?? user.id,
          assignmentReason: "Integrated V1 manual review",
        },
      });
  }
  const founder = users.get("founder")!;
  const manager = users.get("sales-manager-1")!;
  const executive1 = users.get("sales-executive-1")!;
  const executive2 = users.get("sales-executive-2")!;
  const delivery = users.get("delivery")!;

  const territoryNorth = await db.seeraGeographyNode.upsert({
    where: { code: `${prefix}-T-NORTH` },
    update: {},
    create: {
      code: `${prefix}-T-NORTH`,
      name: "Integrated North Territory",
      level: "TERRITORY",
    },
  });
  const territorySouth = await db.seeraGeographyNode.upsert({
    where: { code: `${prefix}-T-SOUTH` },
    update: {},
    create: {
      code: `${prefix}-T-SOUTH`,
      name: "Integrated South Territory",
      level: "TERRITORY",
    },
  });
  const beatNorth = await db.seeraGeographyNode.upsert({
    where: { code: `${prefix}-B-NORTH-1` },
    update: {},
    create: {
      code: `${prefix}-B-NORTH-1`,
      name: "North Market Beat",
      level: "BEAT",
      parentId: territoryNorth.id,
    },
  });
  await db.seeraGeographyNode.upsert({
    where: { code: `${prefix}-B-SOUTH-1` },
    update: {},
    create: {
      code: `${prefix}-B-SOUTH-1`,
      name: "South Market Beat",
      level: "BEAT",
      parentId: territorySouth.id,
    },
  });

  const ss1 = await db.seeraPartner.upsert({
    where: { code: `${prefix}-SS-01` },
    update: { lifecycle: "ACTIVE" },
    create: {
      type: "SUPER_STOCKIST",
      code: `${prefix}-SS-01`,
      legalName: "Integrated North Super Stockist Pvt Ltd",
      tradeName: "North Seera Hub",
      lifecycle: "ACTIVE",
      gstin: "27ABCDE1234F1Z5",
      primaryContact: { mobile: "9000010001" },
      addresses: { city: "Mumbai", state: "Maharashtra" },
      territoryIds: [territoryNorth.id],
      createdById: founder.id,
    },
  });
  const ss2 = await db.seeraPartner.upsert({
    where: { code: `${prefix}-SS-02` },
    update: { lifecycle: "ACTIVE" },
    create: {
      type: "SUPER_STOCKIST",
      code: `${prefix}-SS-02`,
      legalName: "Integrated South Super Stockist Pvt Ltd",
      tradeName: "South Seera Hub",
      lifecycle: "ACTIVE",
      gstin: "29ABCDE1234F1Z1",
      primaryContact: { mobile: "9000010002" },
      addresses: { city: "Bengaluru", state: "Karnataka" },
      territoryIds: [territorySouth.id],
      createdById: founder.id,
    },
  });
  const distributor1 = await db.seeraPartner.upsert({
    where: { code: `${prefix}-D-01` },
    update: { lifecycle: "ACTIVE", assignedSuperStockistId: ss1.id },
    create: {
      type: "DISTRIBUTOR",
      code: `${prefix}-D-01`,
      legalName: "Integrated Metro Distribution LLP",
      tradeName: "Metro Seera Distribution",
      lifecycle: "ACTIVE",
      gstin: "27AAACM1234A1Z2",
      primaryContact: { mobile: "9000020001" },
      addresses: { city: "Mumbai", state: "Maharashtra" },
      territoryIds: [territoryNorth.id],
      assignedSuperStockistId: ss1.id,
      createdById: founder.id,
    },
  });
  const distributor2 = await db.seeraPartner.upsert({
    where: { code: `${prefix}-D-02` },
    update: { lifecycle: "ACTIVE", assignedSuperStockistId: ss1.id },
    create: {
      type: "DISTRIBUTOR",
      code: `${prefix}-D-02`,
      legalName: "Integrated Near Limit Distribution",
      tradeName: "Near Limit Distributor",
      lifecycle: "ACTIVE",
      primaryContact: { mobile: "9000020002" },
      addresses: { city: "Thane", state: "Maharashtra" },
      territoryIds: [territoryNorth.id],
      assignedSuperStockistId: ss1.id,
      createdById: founder.id,
    },
  });
  const distributor3 = await db.seeraPartner.upsert({
    where: { code: `${prefix}-D-03` },
    update: { lifecycle: "ACTIVE", assignedSuperStockistId: ss2.id },
    create: {
      type: "DISTRIBUTOR",
      code: `${prefix}-D-03`,
      legalName: "Integrated Overdue Distribution",
      tradeName: "Overdue Distributor",
      lifecycle: "ACTIVE",
      primaryContact: { mobile: "9000020003" },
      addresses: { city: "Bengaluru", state: "Karnataka" },
      territoryIds: [territorySouth.id],
      assignedSuperStockistId: ss2.id,
      createdById: founder.id,
    },
  });

  const partyUsers = [
    [ss1.id, users.get("ss-owner")!.id, "OWNER"],
    [ss1.id, users.get("ss-operator")!.id, "OPERATOR"],
    [distributor1.id, users.get("distributor-owner")!.id, "OWNER"],
    [distributor1.id, users.get("distributor-operator")!.id, "OPERATOR"],
    [distributor1.id, delivery.id, "DELIVERY"],
  ] as const;
  for (const [partnerId, userId, accessRole] of partyUsers) {
    const exists = await db.seeraPartyUser.findFirst({
      where: { partnerId, userId, active: true },
    });
    if (!exists)
      await db.seeraPartyUser.create({
        data: { partnerId, userId, accessRole, createdById: founder.id },
      });
  }
  for (const subjectId of [executive1.id, executive2.id]) {
    const exists = await db.seeraAssignment.findFirst({
      where: {
        assignmentType: "MANAGER_TEAM",
        subjectId,
        targetId: manager.id,
        effectiveTo: null,
      },
    });
    if (!exists)
      await db.seeraAssignment.create({
        data: {
          assignmentType: "MANAGER_TEAM",
          subjectType: "USER",
          subjectId,
          targetType: "USER",
          targetId: manager.id,
          effectiveFrom: new Date("2026-01-01"),
          reason: "Integrated review team",
          createdById: founder.id,
        },
      });
  }

  const retailers = [];
  for (let index = 1; index <= 4; index++)
    retailers.push(
      await db.seeraRetailer.upsert({
        where: { code: `${prefix}-R-${String(index).padStart(2, "0")}` },
        update: {
          lifecycle: "ACTIVE",
          distributorId: distributor1.id,
          salespersonId: index <= 2 ? executive1.id : executive2.id,
        },
        create: {
          code: `${prefix}-R-${String(index).padStart(2, "0")}`,
          businessName: `Integrated Retail Mart ${index}`,
          ownerName: `Review Retailer ${index}`,
          mobile: `91000000${String(index).padStart(2, "0")}`,
          normalizedMobile: `91000000${String(index).padStart(2, "0")}`,
          address: { city: "Mumbai", market: "Integrated Market" },
          shopType: "GENERAL_TRADE",
          territoryId: territoryNorth.id,
          beatId: beatNorth.id,
          distributorId: distributor1.id,
          salespersonId: index <= 2 ? executive1.id : executive2.id,
          lifecycle: "ACTIVE",
          createdById: founder.id,
        },
      }),
    );
  const retailerUser = users.get("retailer")!;
  const retailerAssignment = await db.seeraAssignment.findFirst({
    where: {
      assignmentType: "RETAILER_USER",
      subjectId: retailerUser.id,
      targetId: retailers[0].id,
      effectiveTo: null,
    },
  });
  if (!retailerAssignment)
    await db.seeraAssignment.create({
      data: {
        assignmentType: "RETAILER_USER",
        subjectType: "USER",
        subjectId: retailerUser.id,
        targetType: "RETAILER",
        targetId: retailers[0].id,
        effectiveFrom: new Date("2026-01-01"),
        reason: "Integrated retailer account",
        createdById: founder.id,
      },
    });

  const skuDefinitions = [
    ["HAIR-OIL-100", "Seera Hair Oil 100 ml", 149],
    ["SHAMPOO-200", "Seera Shampoo 200 ml", 249],
    ["FACE-WASH-100", "Seera Face Wash 100 ml", 199],
  ] as const;
  const skus = [];
  for (const [code, productName, mrp] of skuDefinitions) {
    const sku = await db.seeraSku.upsert({
      where: { code: `${prefix}-${code}` },
      update: { status: "ACTIVE" },
      create: {
        code: `${prefix}-${code}`,
        productName,
        category: "PERSONAL_CARE",
        packSize: 1,
        unitType: "UNIT",
        unitsPerCase: 24,
        mrp,
        hsn: "330590",
        taxRate: 18,
        status: "ACTIVE",
        createdById: founder.id,
      },
    });
    skus.push(sku);
    for (const [tier, ratio] of [
      ["COMPANY_TO_SS", 0.55],
      ["SS_TO_DISTRIBUTOR", 0.68],
      ["DISTRIBUTOR_TO_RETAILER", 0.82],
    ] as const) {
      const existing = await db.seeraPriceVersion.findFirst({
        where: { skuId: sku.id, tier, effectiveFrom: new Date("2026-01-01") },
      });
      if (!existing)
        await db.seeraPriceVersion.create({
          data: {
            skuId: sku.id,
            tier,
            amount: mrp * ratio,
            mrpSnapshot: mrp,
            effectiveFrom: new Date("2026-01-01"),
            status: "ACTIVE",
            createdById: founder.id,
          },
        });
    }
  }
  for (const [distributorId, limit, warning, block, creditDays] of [
    [distributor1.id, 500000, 400000, 500000, 21],
    [distributor2.id, 100000, 80000, 100000, 14],
    [distributor3.id, 50000, 40000, 50000, 7],
  ] as const) {
    const existing = await db.seeraCreditTerm.findFirst({
      where: { distributorId, effectiveFrom: new Date("2026-01-01") },
    });
    if (!existing)
      await db.seeraCreditTerm.create({
        data: {
          distributorId,
          creditEnabled: true,
          creditLimit: limit,
          creditDays,
          warningThreshold: warning,
          blockThreshold: block,
          graceEnabled: true,
          graceDays: 3,
          effectiveFrom: new Date("2026-01-01"),
          changeReason: "Integrated review credit policy",
          createdById: founder.id,
        },
      });
  }

  const orderCases: Array<
    [string, SalesOrderStatus, number, number, number, number, number]
  > = [
    ["CLEAN", "DELIVERED", 24, 24, 0, 0, 0],
    ["PARTIAL", "PARTIAL_DELIVERED", 24, 12, 0, 0, 0],
    ["REFUSED", "PARTIAL_DELIVERED", 24, 10, 4, 0, 0],
    ["CANCELLED", "CANCELLED", 24, 0, 0, 24, 0],
    ["RETURN", "DELIVERED", 24, 24, 0, 0, 3],
  ];
  const orders = [];
  for (let index = 0; index < orderCases.length; index++) {
    const [label, status, ordered, deliveredQty, refused, cancelled, returned] =
      orderCases[index];
    const idempotencyKey = `${prefix}-ORDER-${label}`;
    const order = await db.seeraSalesOrder.upsert({
      where: { idempotencyKey },
      update: {},
      create: {
        orderNumber: `${prefix}-RO-${label}`,
        type: "RETAILER_ORDER",
        status,
        retailerId: retailers[index % retailers.length].id,
        sellerPartnerId: distributor1.id,
        salespersonId: executive1.id,
        actorId: executive1.id,
        commercialPartyType: "DISTRIBUTOR",
        commercialPartyId: distributor1.id,
        sourcePortal: "sales-executive",
        financialAcceptance: false,
        subtotal: ordered * 122.18,
        discountTotal: 0,
        taxTotal: 0,
        total: ordered * 122.18,
        idempotencyKey,
        submittedAt: new Date("2026-08-01T09:00:00Z"),
        dispatchedAt:
          deliveredQty || refused
            ? new Date("2026-08-02T09:00:00Z")
            : undefined,
        deliveredAt:
          status === "DELIVERED" ? new Date("2026-08-03T09:00:00Z") : undefined,
        lines: {
          create: {
            skuId: skus[0].id,
            skuCodeSnapshot: skus[0].code,
            productNameSnapshot: skus[0].productName,
            packSnapshot: "1 UNIT",
            priceSnapshot: 122.18,
            mrpSnapshot: skus[0].mrp,
            taxSnapshot: { rate: "18", hsn: "330590" },
            orderedQuantity: ordered,
            acceptedQuantity: ordered - cancelled,
            allocatedQuantity: ordered - cancelled,
            dispatchedQuantity: ordered - cancelled,
            deliveredQuantity: deliveredQty,
            refusedQuantity: refused,
            cancelledQuantity: cancelled,
            returnedQuantity: returned,
            lineTotal: ordered * 122.18,
          },
        },
      },
    });
    orders.push(order);
  }
  for (const [label, order, status] of [
    ["CLEAN", orders[0], "DELIVERED"],
    ["PARTIAL", orders[1], "PARTIAL_DELIVERED"],
    ["REFUSED", orders[2], "REFUSED"],
  ] as const)
    await db.seeraDelivery.upsert({
      where: { idempotencyKey: `${prefix}-DELIVERY-${label}` },
      update: {},
      create: {
        orderId: order.id,
        deliveryUserId: delivery.id,
        status,
        quantities: { seeded: true },
        proof: { reference: `${prefix}-POD-${label}` },
        receiverName: "Integrated Receiver",
        occurredAt: new Date("2026-08-03T10:00:00Z"),
        actorId: delivery.id,
        idempotencyKey: `${prefix}-DELIVERY-${label}`,
      },
    });

  for (const [type, direction, quantity] of [
    ["OPENING", "IN", 200],
    ["RECEIPT", "IN", 100],
    ["DISPATCH", "OUT", 50],
    ["RETURN", "IN", 3],
    ["DAMAGE", "OUT", 2],
    ["ADJUSTMENT", "OUT", 1],
  ] as const)
    await db.seeraInventoryMovement.upsert({
      where: { idempotencyKey: `${prefix}-INV-${type}` },
      update: {},
      create: {
        partyType: "DISTRIBUTOR",
        partyId: distributor1.id,
        skuId: skus[0].id,
        type,
        direction,
        quantity,
        sourceType: "INTEGRATED_FIXTURE",
        sourceId: `${prefix}-${type}`,
        actorId: founder.id,
        sourcePortal: "founder-admin",
        reason: `Integrated ${type.toLowerCase()} scenario`,
        idempotencyKey: `${prefix}-INV-${type}`,
        occurredAt: new Date("2026-08-04T09:00:00Z"),
      },
    });
  await db.seeraStockReconciliation.upsert({
    where: { idempotencyKey: `${prefix}-RECON-STOCK` },
    update: {},
    create: {
      partyType: "DISTRIBUTOR",
      partyId: distributor1.id,
      periodEnd: new Date("2026-08-05"),
      status: "APPROVED",
      actorId: founder.id,
      sourcePortal: "founder-admin",
      reason: "Integrated physical count",
      idempotencyKey: `${prefix}-RECON-STOCK`,
      approvedAt: new Date("2026-08-05"),
      lines: {
        create: {
          skuId: skus[0].id,
          openingQuantity: 200,
          receiptQuantity: 100,
          issueQuantity: 50,
          systemClosing: 250,
          physicalClosing: 249,
          variance: -1,
          reason: "One unit short",
        },
      },
    },
  });

  const billing =
    (await db.seeraBillingProfile.findFirst({
      where: {
        ownerType: "DISTRIBUTOR",
        ownerId: distributor1.id,
        effectiveFrom: new Date("2026-01-01"),
      },
    })) ??
    (await db.seeraBillingProfile.create({
      data: {
        ownerType: "DISTRIBUTOR",
        ownerId: distributor1.id,
        legalName: distributor1.legalName,
        tradeName: distributor1.tradeName,
        gstRegistered: true,
        gstin: distributor1.gstin,
        registeredAddress: distributor1.addresses,
        state: "Maharashtra",
        stateCode: "27",
        invoicePrefix: `${prefix}-INV`,
        authorizedBilling: true,
        verificationStatus: "VERIFIED",
        verifiedById: founder.id,
        effectiveFrom: new Date("2026-01-01"),
        createdById: founder.id,
      },
    }));
  const invoice = await db.seeraCommercialDocument.upsert({
    where: { idempotencyKey: `${prefix}-DOC-INVOICE` },
    update: {},
    create: {
      documentNumber: `${prefix}-INV-0001`,
      type: "TAX_INVOICE",
      source: "SYSTEM_GENERATED",
      status: "ISSUED",
      issuerType: "DISTRIBUTOR",
      issuerId: distributor1.id,
      buyerType: "RETAILER",
      buyerId: retailers[0].id,
      actorId: founder.id,
      sourcePortal: "founder-admin",
      orderId: orders[0].id,
      issuerSnapshot: {
        legalName: distributor1.legalName,
        gstin: distributor1.gstin,
      },
      buyerSnapshot: { legalName: retailers[0].businessName },
      supplySnapshot: { state: "Maharashtra" },
      lineSnapshot: [{ sku: skus[0].code, quantity: 24 }],
      taxSnapshot: { gst: 18 },
      subtotal: 2932.32,
      taxableTotal: 2932.32,
      cgstTotal: 263.91,
      sgstTotal: 263.91,
      igstTotal: 0,
      grandTotal: 3460.14,
      issueDate: new Date("2026-08-03"),
      verificationStatus: "VERIFIED",
      issuedAt: new Date("2026-08-03"),
      idempotencyKey: `${prefix}-DOC-INVOICE`,
    },
  });
  await db.seeraCommercialDocument.upsert({
    where: { idempotencyKey: `${prefix}-DOC-CHALLAN` },
    update: {},
    create: {
      documentNumber: `${prefix}-CH-0001`,
      type: "DELIVERY_CHALLAN",
      source: "SYSTEM_GENERATED",
      status: "ISSUED",
      issuerType: "DISTRIBUTOR",
      issuerId: distributor1.id,
      buyerType: "RETAILER",
      buyerId: retailers[0].id,
      actorId: founder.id,
      sourcePortal: "founder-admin",
      orderId: orders[0].id,
      issuerSnapshot: { legalName: distributor1.legalName },
      buyerSnapshot: { legalName: retailers[0].businessName },
      supplySnapshot: {},
      lineSnapshot: [{ sku: skus[0].code, quantity: 24 }],
      taxSnapshot: {},
      subtotal: 0,
      taxableTotal: 0,
      grandTotal: 0,
      issueDate: new Date("2026-08-02"),
      verificationStatus: "VERIFIED",
      issuedAt: new Date("2026-08-02"),
      idempotencyKey: `${prefix}-DOC-CHALLAN`,
    },
  });
  const payment = await db.seeraPaymentRecord.upsert({
    where: { idempotencyKey: `${prefix}-PAYMENT` },
    update: {},
    create: {
      paymentNumber: `${prefix}-PAY-0001`,
      payerType: "RETAILER",
      payerId: retailers[0].id,
      payeeType: "DISTRIBUTOR",
      payeeId: distributor1.id,
      amountClaimed: 3460.14,
      amountMatched: 3460.14,
      unappliedAmount: 0,
      reference: `${prefix}-UTR-0001`,
      paymentMode: "NEFT",
      paymentDate: new Date("2026-08-05"),
      status: "VERIFIED",
      reviewerId: users.get("accounts-manager")!.id,
      reviewReason: "Integrated verified payment",
      reviewedAt: new Date("2026-08-05"),
      idempotencyKey: `${prefix}-PAYMENT`,
    },
  });
  const allocation = await db.seeraPaymentAllocation.findFirst({
    where: { idempotencyKey: `${prefix}-ALLOCATION` },
  });
  if (!allocation)
    await db.seeraPaymentAllocation.create({
      data: {
        paymentId: payment.id,
        documentId: invoice.id,
        amount: 3460.14,
        actorId: users.get("accounts-manager")!.id,
        reason: "Integrated invoice allocation",
        idempotencyKey: `${prefix}-ALLOCATION`,
      },
    });
  await db.seeraFinancialEntry.upsert({
    where: { idempotencyKey: `${prefix}-LEDGER-INVOICE` },
    update: {},
    create: {
      entryNumber: `${prefix}-LE-0001`,
      type: "INVOICE",
      status: "POSTED",
      debitPartyType: "RETAILER",
      debitPartyId: retailers[0].id,
      creditPartyType: "DISTRIBUTOR",
      creditPartyId: distributor1.id,
      amount: 3460.14,
      documentId: invoice.id,
      orderId: orders[0].id,
      commercialSnapshot: { documentNumber: invoice.documentNumber },
      actorId: users.get("accounts-manager")!.id,
      reason: "Integrated invoice posting",
      idempotencyKey: `${prefix}-LEDGER-INVOICE`,
      postedAt: new Date("2026-08-03"),
    },
  });
  await db.seeraFinancialReconciliation.upsert({
    where: { idempotencyKey: `${prefix}-FIN-RECON` },
    update: {},
    create: {
      referenceType: "PAYMENT",
      referenceId: payment.id,
      status: "MATCHED",
      expectedAmount: 3460.14,
      matchedAmount: 3460.14,
      difference: 0,
      actorId: users.get("accounts-manager")!.id,
      resolvedById: users.get("accounts-manager")!.id,
      resolvedAt: new Date("2026-08-05"),
      idempotencyKey: `${prefix}-FIN-RECON`,
    },
  });

  await db.seeraClaim.upsert({
    where: { idempotencyKey: `${prefix}-CLAIM` },
    update: {},
    create: {
      claimNumber: `${prefix}-CL-0001`,
      claimantType: "DISTRIBUTOR",
      claimantId: distributor1.id,
      againstPartyType: "SUPER_STOCKIST",
      againstPartyId: ss1.id,
      type: "DAMAGE",
      status: "SUBMITTED",
      sourceType: "DELIVERY",
      sourceId: orders[1].id,
      details: { sku: skus[0].code, quantity: 2 },
      actorId: users.get("distributor-owner")!.id,
      idempotencyKey: `${prefix}-CLAIM`,
    },
  });
  const workSession =
    (await db.seeraWorkSession.findFirst({
      where: {
        employeeId: executive1.id,
        status: "ENDED",
        remarks: `${prefix}-TA`,
      },
    })) ??
    (await db.seeraWorkSession.create({
      data: {
        employeeId: executive1.id,
        employeeRole: "SALES_EXECUTIVE",
        workingType: "RETAILING",
        status: "ENDED",
        startedAt: new Date("2026-08-01T04:00:00Z"),
        endedAt: new Date("2026-08-01T12:00:00Z"),
        remarks: `${prefix}-TA`,
        outcome: "COMPLETED",
      },
    }));
  const estimate = await db.seeraTravelEstimate.upsert({
    where: {
      employeeId_workSessionId: {
        employeeId: executive1.id,
        workSessionId: workSession.id,
      },
    },
    update: {},
    create: {
      employeeId: executive1.id,
      workSessionId: workSession.id,
      estimateDate: new Date("2026-08-01"),
      distanceKm: 42.5,
      sourceEvents: { visits: 4 },
      calculationVersion: "IV26",
    },
  });
  await db.seeraTaClaim.upsert({
    where: { idempotencyKey: `${prefix}-TA-CLAIM` },
    update: {},
    create: {
      claimNumber: `${prefix}-TA-0001`,
      employeeId: executive1.id,
      managerId: manager.id,
      claimDate: new Date("2026-08-01"),
      travelEstimateId: estimate.id,
      originalDistanceKm: 42.5,
      claimedDistanceKm: 45,
      approvedDistanceKm: 42.5,
      vehicleType: "TWO_WHEELER",
      rateSnapshot: { ratePerKm: "4.5" },
      travelAmount: 191.25,
      tollAmount: 0,
      parkingAmount: 20,
      dailyAllowance: 100,
      totalClaimed: 322.5,
      totalApproved: 311.25,
      proofFileIds: [],
      status: "MANAGER_VERIFIED",
      managerVerifiedById: manager.id,
      idempotencyKey: `${prefix}-TA-CLAIM`,
      submittedAt: new Date("2026-08-02"),
    },
  });
  const prospect = await db.seeraProspect.findFirst({
    where: {
      businessName: "Integrated Prospect Distribution",
      normalizedMobile: "9199990000",
    },
  });
  if (!prospect)
    await db.seeraProspect.create({
      data: {
        prospectType: "DISTRIBUTOR",
        businessName: "Integrated Prospect Distribution",
        normalizedMobile: "9199990000",
        areaId: territoryNorth.id,
        profile: { interest: "HIGH", source: "INTEGRATED_REVIEW" },
        status: "UNDER_REVIEW",
        followUpAt: new Date("2026-08-15"),
        ownerEmployeeId: manager.id,
      },
    });
  const approval = await db.seeraApprovalItem.findFirst({
    where: {
      entityType: "SeeraPartner",
      entityId: distributor2.id,
      status: "PENDING",
    },
  });
  if (!approval)
    await db.seeraApprovalItem.create({
      data: {
        type: "CREDIT_EXCEPTION",
        entityType: "SeeraPartner",
        entityId: distributor2.id,
        requestedById: manager.id,
        assignedRoleCode: "SALES_HEAD",
        request: { requestedLimit: 120000 },
        reason: "Integrated near-limit scenario",
      },
    });
  const lifecycle = await db.seeraPartnerLifecycleEvent.findUnique({
    where: { idempotencyKey: `${prefix}-LIFECYCLE` },
  });
  if (!lifecycle)
    await db.seeraPartnerLifecycleEvent.create({
      data: {
        partnerId: distributor2.id,
        action: "SUSPEND",
        fromLifecycle: "ACTIVE",
        toLifecycle: "SUSPENDED",
        actorId: founder.id,
        approverId: founder.id,
        reason: "Integrated reversible lifecycle evidence",
        obligationsSnapshot: { openOrders: 0 },
        idempotencyKey: `${prefix}-LIFECYCLE`,
        occurredAt: new Date("2026-07-20"),
      },
    });
  for (const user of users.values()) {
    const notification = await db.notification.findFirst({
      where: {
        recipientId: user.id,
        entityType: "INTEGRATED_REVIEW",
        entityId: prefix,
      },
    });
    if (!notification)
      await db.notification.create({
        data: {
          recipientId: user.id,
          type: "INTEGRATED_REVIEW_READY",
          title: "Seera V1 review workspace ready",
          body: "Deterministic integrated review records are available.",
          entityType: "INTEGRATED_REVIEW",
          entityId: prefix,
        },
      });
  }
  const audit = await db.auditLog.findFirst({
    where: { action: "integrated_review.seeded", entityId: prefix },
  });
  if (!audit)
    await db.auditLog.create({
      data: {
        actorId: founder.id,
        action: "integrated_review.seeded",
        entityType: "IntegratedReviewDataset",
        entityId: prefix,
        details: {
          users: users.size,
          partners: 5,
          retailers: retailers.length,
          orders: orders.length,
        },
      },
    });
  console.log(
    JSON.stringify(
      {
        fingerprint: target.fingerprint,
        users: users.size,
        passwordSource: "TEST_FIXTURE_ONLY",
        partners: 5,
        retailers: retailers.length,
        skus: skus.length,
        orders: orders.length,
        scenarios: 22,
        billingProfile: billing.id,
      },
      null,
      2,
    ),
  );
}

main()
  .finally(() => db.$disconnect())
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
