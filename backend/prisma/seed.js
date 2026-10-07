import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// Pending orders that line up with the sample SMS in the dashboard:
// exact match (Kwame), underpayment (Ama), overpayment (Kofi).
const ORDERS = [
  { customerName: 'Kwame Mensah', customerPhone: '0241234567', expectedAmount: 150 },
  { customerName: 'Ama Serwaa', customerPhone: '0201234567', expectedAmount: 97.5 },
  { customerName: 'Kofi Boateng', customerPhone: '0271234567', expectedAmount: 15 },
  { customerName: 'Efua Asante', customerPhone: '0551234567', expectedAmount: 320 },
]

async function main() {
  for (const order of ORDERS) {
    const existing = await prisma.order.findFirst({ where: { customerPhone: order.customerPhone, status: 'PENDING' } })
    if (existing) {
      console.log(`Pending order for ${order.customerName} already exists`)
      continue
    }
    await prisma.order.create({ data: order })
    console.log(`Created pending order for ${order.customerName} (GHS ${order.expectedAmount.toFixed(2)})`)
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
