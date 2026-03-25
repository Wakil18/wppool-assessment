-- CreateTable
CREATE TABLE `OrderSync` (
  `id` VARCHAR(191) NOT NULL,
  `orderId` VARCHAR(191) NOT NULL,
  `shop` VARCHAR(191) NOT NULL,
  `status` VARCHAR(191) NOT NULL,
  `retryCount` INTEGER NOT NULL DEFAULT 0,
  `lastAttemptAt` DATETIME(3) NULL,
  `nextRetryAt` DATETIME(3) NULL,
  `payload` TEXT NOT NULL,
  `errorMessage` TEXT NULL,
  `orderTotal` VARCHAR(191) NOT NULL,
  `customerEmail` VARCHAR(191) NOT NULL,
  `isRush` BOOLEAN NOT NULL DEFAULT false,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  UNIQUE INDEX `OrderSync_orderId_shop_key`(`orderId`, `shop`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
