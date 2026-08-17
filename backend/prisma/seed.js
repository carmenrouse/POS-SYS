const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

// Two intentionally messy sample supplier files for exercising the CSV
// pipeline locally — currency symbols, thousands separators, a leading-zero
// SKU, blank/duplicate/negative/non-numeric rows, and a completely
// different header vocabulary from the other file (so the fuzzy header
// matcher has something to prove).
const COASTAL_FEED_CSV = `Item#,Product,Qty,Unit Price,Category
EGG-001,Large Eggs (Dozen),120,"$2.10",Eggs
007,Whole Chicken,40,4.75,Poultry
FEED-40,Layer Feed 40lb Bag,"1,000","$12.00",Feed
FEED-40,Layer Feed 40lb Bag,25,12.00,Feed
,Duck Eggs (6-pack),18,3.50,Eggs
DUCK-002,,10,2.00,Eggs
BAD-QTY,Bad Quantity Row,abc,5.00,Misc
BAD-COST,Bad Cost Row,10,notanumber,Misc
NEG-001,Negative Qty,-5,3.00,Misc
ZERO-001,Zero Cost Item,10,0,Misc
`;

const HARBOR_SUPPLY_CSV = `Product Code,Item Name,Description,Quantity Ordered,Cost Each,Dept
CHKN-BRST-1LB,Chicken Breast,1lb pack,60,3.10,Poultry
DUCK-EGG-6,Duck Eggs,6-pack carton,18,3.50,Eggs
FEED-LAY-40,Layer Feed,40lb bag,25,"€11,90",Feed
`;

async function main() {
  const passwordHash = await bcrypt.hash('password123', 10);

  const business = await prisma.business.create({
    data: {
      name: 'L&H Poultry',
      users: {
        create: [
          { email: 'owner@lhpoultry.test', name: 'Lena Hart', passwordHash, role: 'OWNER' },
          { email: 'manager@lhpoultry.test', name: 'Marcus Diaz', passwordHash, role: 'MANAGER' },
          { email: 'staff@lhpoultry.test', name: 'Casey Nguyen', passwordHash, role: 'STAFF' },
        ],
      },
    },
    include: { users: true },
  });
  const owner = business.users.find((u) => u.role === 'OWNER');

  const coastalFeed = await prisma.supplier.create({
    data: {
      businessId: business.id,
      name: 'Coastal Feed & Farm Supply',
      contactName: 'Dana Reyes',
      email: 'orders@coastalfeed.test',
      phone: '555-010-2200',
    },
  });
  const harborSupply = await prisma.supplier.create({
    data: {
      businessId: business.id,
      name: 'Harbor Wholesale Supply',
      contactName: 'Priya Shah',
      email: 'sales@harborwholesale.test',
      phone: '555-010-8811',
    },
  });

  // A saved mapping profile for Harbor Wholesale, so a repeat import from
  // them auto-applies without asking the user to re-map every column.
  await prisma.supplierFieldMapping.create({
    data: {
      businessId: business.id,
      supplierId: harborSupply.id,
      mapping: {
        'Product Code': 'sku',
        'Item Name': 'name',
        Description: 'description',
        'Quantity Ordered': 'quantity',
        'Cost Each': 'unitCost',
        Dept: 'category',
      },
    },
  });

  const products = [];
  for (const p of [
    { sku: 'EGG-001', name: 'Large Eggs (Dozen)', category: 'Eggs', cost: 2.1, price: 4.5, quantityOnHand: 120 },
    { sku: '007', name: 'Whole Chicken', category: 'Poultry', cost: 4.75, price: 9.99, quantityOnHand: 40 },
    { sku: 'CHKN-BRST-1LB', name: 'Chicken Breast (1lb)', category: 'Poultry', cost: 3.1, price: 6.49, quantityOnHand: 60 },
  ]) {
    products.push(await prisma.product.create({ data: { businessId: business.id, ...p } }));
  }

  // Mock POS credentials for local development — these are not live
  // accounts, just enough for the connection-settings UI and the
  // "not connected" push-blocking path to be exercised without a real
  // Square/Shopify account.
  await prisma.pOSConnection.create({
    data: {
      businessId: business.id,
      platform: 'SQUARE',
      status: 'NOT_CONNECTED',
      config: { note: 'Paste a real Square sandbox access token to test pushes.' },
    },
  });
  await prisma.pOSConnection.create({
    data: {
      businessId: business.id,
      platform: 'SHOPIFY',
      status: 'NOT_CONNECTED',
      config: { shopDomain: 'your-store.myshopify.com', note: 'Paste a real Shopify custom-app access token to test pushes.' },
    },
  });

  const uploadsDir = path.join(__dirname, '..', 'uploads');
  fs.mkdirSync(uploadsDir, { recursive: true });
  fs.writeFileSync(path.join(uploadsDir, 'seed-coastal-feed.csv'), COASTAL_FEED_CSV);
  fs.writeFileSync(path.join(uploadsDir, 'seed-harbor-supply.csv'), HARBOR_SUPPLY_CSV);

  console.log('Seed complete.');
  console.log('Logins (password "password123"): owner@lhpoultry.test, manager@lhpoultry.test, staff@lhpoultry.test');
  console.log('Sample messy supplier files written to backend/uploads/ — upload them via the web app:');
  console.log('  - seed-coastal-feed.csv   (paired with "Coastal Feed & Farm Supply", no saved mapping yet)');
  console.log('  - seed-harbor-supply.csv  (paired with "Harbor Wholesale Supply", has a saved mapping — auto-applies)');
  console.log(`Owner id: ${owner.id}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
