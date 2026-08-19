-- CreateTable
CREATE TABLE "Note" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Note_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
-- Supports the cursor-pagination query, which orders by
-- (createdAt DESC, id DESC) and looks up a specific row by id as the
-- pagination anchor.
CREATE INDEX "Note_createdAt_id_idx" ON "Note"("createdAt", "id");
