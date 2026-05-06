import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const prisma = new PrismaClient();

type CategoriesFile = {
  contentTemplates: string[];
};

async function main() {
  const file = readFileSync(
    join(process.cwd(), 'data', 'pint-categories.json'),
    'utf-8'
  );
  const json = JSON.parse(file) as CategoriesFile;
  const templates = json.contentTemplates ?? [];

  console.log(`Seeding ${templates.length} folders…`);

  for (const [i, name] of templates.entries()) {
    await prisma.folder.upsert({
      where: { name },
      update: {},
      create: {
        name,
        sortOrder: i,
        isSeeded: true,
      },
    });
  }

  const total = await prisma.folder.count();
  console.log(`Done. Total folders in DB: ${total}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
