-- AlterTable
ALTER TABLE "Competition" ADD COLUMN "description" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Competition" ADD COLUMN "descriptionFormat" "ContentFormat" NOT NULL DEFAULT 'MARKDOWN';

-- AlterTable
ALTER TABLE "Challenge" ADD COLUMN "submitLimit" INTEGER;

-- CreateTable
CREATE TABLE "SitePage" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL DEFAULT '',
    "contentFormat" "ContentFormat" NOT NULL DEFAULT 'RICHTEXT',
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SitePage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SitePage_slug_key" ON "SitePage"("slug");
