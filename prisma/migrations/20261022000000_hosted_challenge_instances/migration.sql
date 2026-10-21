-- AlterTable
ALTER TABLE "Challenge" ADD COLUMN     "hosted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "hostingEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "hostingInternetEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "hostingTemplate" JSONB,
ADD COLUMN     "hostingVersion" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "HostingSettings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "maxInstances" INTEGER NOT NULL DEFAULT 500,
    "memoryBudgetMb" INTEGER NOT NULL DEFAULT 4096,
    "cpuBudgetMillicores" INTEGER NOT NULL DEFAULT 2000,
    "publicHost" TEXT NOT NULL DEFAULT '',
    "portRangeStart" INTEGER NOT NULL DEFAULT 20000,
    "portRangeEnd" INTEGER NOT NULL DEFAULT 29999,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HostingSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HostedInstance" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "challengeId" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'QUEUED',
    "desiredState" TEXT NOT NULL DEFAULT 'RUNNING',
    "generation" INTEGER NOT NULL DEFAULT 1,
    "observedGeneration" INTEGER NOT NULL DEFAULT 0,
    "template" JSONB NOT NULL,
    "templateVersion" INTEGER NOT NULL,
    "internetEnabled" BOOLEAN NOT NULL DEFAULT false,
    "resourceMemoryMb" INTEGER NOT NULL,
    "resourceCpuMillicores" INTEGER NOT NULL,
    "endpoints" JSONB NOT NULL DEFAULT '[]',
    "containers" JSONB NOT NULL DEFAULT '[]',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "operationToken" TEXT,
    "operationLeaseUntil" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HostedInstance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstanceEvent" (
    "id" TEXT NOT NULL,
    "instanceId" TEXT,
    "generation" INTEGER,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "level" TEXT NOT NULL DEFAULT 'INFO',
    "message" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InstanceEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegistryCredential" (
    "id" TEXT NOT NULL,
    "server" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordEncrypted" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RegistryCredential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstanceTerminalSession" (
    "id" TEXT NOT NULL,
    "instanceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "service" TEXT NOT NULL,
    "generation" INTEGER NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),

    CONSTRAINT "InstanceTerminalSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HostedInstance_desiredState_state_idx" ON "HostedInstance"("desiredState", "state");

-- CreateIndex
CREATE INDEX "HostedInstance_expiresAt_idx" ON "HostedInstance"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "HostedInstance_userId_challengeId_key" ON "HostedInstance"("userId", "challengeId");

-- CreateIndex
CREATE INDEX "InstanceEvent_instanceId_createdAt_idx" ON "InstanceEvent"("instanceId", "createdAt");

-- CreateIndex
CREATE INDEX "InstanceEvent_createdAt_idx" ON "InstanceEvent"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "RegistryCredential_server_key" ON "RegistryCredential"("server");

-- CreateIndex
CREATE INDEX "InstanceTerminalSession_expiresAt_idx" ON "InstanceTerminalSession"("expiresAt");

-- AddForeignKey
ALTER TABLE "HostedInstance" ADD CONSTRAINT "HostedInstance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HostedInstance" ADD CONSTRAINT "HostedInstance_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "Challenge"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstanceEvent" ADD CONSTRAINT "InstanceEvent_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "HostedInstance"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstanceEvent" ADD CONSTRAINT "InstanceEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstanceTerminalSession" ADD CONSTRAINT "InstanceTerminalSession_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "HostedInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstanceTerminalSession" ADD CONSTRAINT "InstanceTerminalSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
