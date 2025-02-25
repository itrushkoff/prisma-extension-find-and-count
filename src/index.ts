import { Prisma } from '@prisma/client'

export const findAndCountExtension = Prisma.defineExtension((client) => {
  return client.$extends({
    name: 'find-and-count-extension',
    model: {
      $allModels: {
        async findAndCount<Model, Args>(
          this: Model,
          args: Prisma.Exact<Args, Prisma.Args<Model, 'findMany'>>
        ): Promise<[Prisma.Result<Model, Args, 'findMany'>, number]> {
          return await client.$transaction([
            (this as any).findMany(args),
            (this as any).count({ where: (args as any).where }),
          ])
        },
      },
    },
  })
})
