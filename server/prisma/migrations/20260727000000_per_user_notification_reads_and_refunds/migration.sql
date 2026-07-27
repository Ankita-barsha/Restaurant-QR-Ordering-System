-- Per-user notification read state, and a refund trail on payments.
--
-- Notifications previously carried a single isRead flag. Because almost every
-- notification is a broadcast (userId IS NULL), the first person to clear the
-- bell cleared it for the whole team. Read state moves to its own table, one
-- row per (notification, staff member).
--
-- The old isRead/readAt values are NOT migrated: they record that SOMEONE read
-- a notification, with no record of who, so there is nothing to attribute them
-- to. Existing notifications simply start unread for everyone.

-- CreateTable
CREATE TABLE "notification_reads" (
    "notificationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_reads_pkey" PRIMARY KEY ("notificationId","userId")
);

-- CreateIndex
CREATE INDEX "notification_reads_userId_idx" ON "notification_reads"("userId");

-- AddForeignKey
ALTER TABLE "notification_reads" ADD CONSTRAINT "notification_reads_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "notifications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_reads" ADD CONSTRAINT "notification_reads_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- DropIndex
DROP INDEX "notifications_userId_isRead_idx";

-- AlterTable
ALTER TABLE "notifications" DROP COLUMN "isRead",
DROP COLUMN "readAt";

-- CreateIndex
CREATE INDEX "notifications_userId_idx" ON "notifications"("userId");

-- AlterTable
--
-- A refund reverses the payment row it belongs to rather than inserting a
-- negative one, so "collected" remains a plain SUM over status = 'SUCCESS'.
ALTER TABLE "payments" ADD COLUMN     "refundReason" TEXT,
ADD COLUMN     "refundedAt" TIMESTAMP(3);
