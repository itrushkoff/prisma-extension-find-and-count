This extension for Prisma provides `findAndCount` method doing `findMany` and `count` in one transaction to avoid difference in data.\
All you need is to extend prisma in singleton
```javascript
import { findAndCountExtension } from 'prisma-extension-find-and-count'
...
MyPrismaClientSingleton.$extends(findAndCountExtension)
```
and then use it
```javascript
// options are options for findMany like 'where', 'data', 'select', etc.
this.prisma.someModel.findAndCount(options)
```


If you're looking for how to setup Prisma as singleton to avoid different contexts and instances of PrismaClient, here what I've got for NestJS (thanks to @micobarac answer in https://github.com/prisma/prisma/issues/18628#issuecomment-2655850811)

`folder structure`
```
src
--prisma
----prisma.extensions.ts
----prisma.module.ts
----prisma.provides.ts
----prisma.service.ts
app.module.ts
```

now content\
`prisma.extensions.ts` - here we can define our extension if we don't want to pull them from npm
```typescript
import { Prisma } from '@prisma/client'

export const existsExtension = Prisma.defineExtension({
  name: 'exists-extension',
  model: {
    $allModels: {
      async exists<T>(
        this: T,
        where: Prisma.Args<T, 'findFirst'>['where'],
      ): Promise<boolean> {
        const context = Prisma.getExtensionContext(this)
        const count = await (context as any).count({
          where,
          take: 1,
        } as Prisma.Args<T, 'count'>)
        return count > 0
      },
    },
  },
})

export const softDeleteExtension = Prisma.defineExtension({
  name: 'soft-delete-extension',
  model: {
    $allModels: {
      async softDelete<T>(
        this: T,
        where: Prisma.Args<T, 'update'>['where'],
      ): Promise<Prisma.Result<T, unknown, 'update'>> {
        const context = Prisma.getExtensionContext(this)
        return await (context as any).update({
          where,
          data: {
            deletedAt: new Date(),
          },
        } as Prisma.Args<T, 'update'>)
      },
    },
  },
})

export const findAndCountExtension = Prisma.defineExtension((client) => {
  return client.$extends({
    name: 'find-and-count-extension',
    model: {
      $allModels: {
        async findAndCount<Model, Args>(
          this: Model,
          args: Prisma.Exact<Args, Prisma.Args<Model, 'findMany'>>,
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
```

`prisma.provides.ts` - here we turn on our extensions through `withExtensions` method
```typescript
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { PrismaClient } from '@prisma/client'
import {
  existsExtension,
  findAndCountExtension,
  softDeleteExtension,
} from './prisma.extensions'

@Injectable()
export class PrismaProvider
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private static initialized = false

  async onModuleInit() {
    if (!PrismaProvider.initialized) {
      PrismaProvider.initialized = true
      await this.$connect()
    }
  }

  async onModuleDestroy() {
    if (PrismaProvider.initialized) {
      PrismaProvider.initialized = false
      await this.$disconnect()
    }
  }

  withExtensions() {
    return this.$extends(existsExtension)
      .$extends(softDeleteExtension)
      .$extends(findAndCountExtension)
  }
}
```

`prisma.service.ts`
```typescript
import { Injectable, Type } from '@nestjs/common'
import { PrismaProvider } from './prisma.provider'

const ExtendedPrismaClient = class {
  constructor(provider: PrismaProvider) {
    return provider.withExtensions()
  }
} as Type<ReturnType<PrismaProvider['withExtensions']>>

@Injectable()
export class PrismaService extends ExtendedPrismaClient {
  constructor(provider: PrismaProvider) {
    super(provider)
  }
}
```

`prisma.module.ts` - `@Global` decorator give us ability to import PrismaModule once and make it available in any other module
```typescript
import { Global, Module } from '@nestjs/common'
import { PrismaService } from './prisma.service'
import { PrismaProvider } from './prisma.provider'

@Global()
@Module({
  providers: [PrismaProvider, PrismaService],
  exports: [PrismaProvider, PrismaService],
})
export class PrismaModule {}
```

`app.module.ts` - don't forget to import `PrismaModule` here to make it app-wide
```javascript
import { PrismaModule } from './prisma/prisma.module'
...
@Module({
  imports: [
    PrismaModule,
...
```