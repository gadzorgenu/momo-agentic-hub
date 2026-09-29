import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const existing = await prisma.order.findUnique({ where: { orderId: 'ORD-1001' } })
  if (existing) {
    console.log('ORD-1001 already exists')
    return
  }

  const created = await prisma.order.create({
    data: {
      orderId: 'ORD-1001',
      amount: 150,
      currency: 'GHS',
      status: 'pending',
      customerPhone: '+233501234567',
    },
  })

  console.log('Created order', created.orderId)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
