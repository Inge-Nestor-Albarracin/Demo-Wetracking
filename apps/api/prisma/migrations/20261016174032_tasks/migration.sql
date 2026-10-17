-- CreateTable
CREATE TABLE "tasks" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "dueAt" TIMESTAMPTZ(3) NOT NULL,
    "assigneeId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "completedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tasks_assigneeId_completedAt_dueAt_idx" ON "tasks"("assigneeId", "completedAt", "dueAt");

-- CreateIndex
CREATE INDEX "tasks_createdById_idx" ON "tasks"("createdById");

-- CreateIndex
CREATE INDEX "tasks_dueAt_idx" ON "tasks"("dueAt");

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Business rules enforced by the database (custom SQL, keep when editing).
ALTER TABLE public.tasks
ADD CONSTRAINT tasks_title_not_blank
CHECK (length(btrim(title)) > 0);

-- The deadline must be after the creation time.
ALTER TABLE public.tasks
ADD CONSTRAINT tasks_due_after_creation
CHECK ("dueAt" > "createdAt");

-- A task can only be completed before its deadline; once the deadline
-- passes without completion it stays incomplete.
ALTER TABLE public.tasks
ADD CONSTRAINT tasks_completed_before_due
CHECK ("completedAt" IS NULL OR ("completedAt" >= "createdAt" AND "completedAt" <= "dueAt"));
