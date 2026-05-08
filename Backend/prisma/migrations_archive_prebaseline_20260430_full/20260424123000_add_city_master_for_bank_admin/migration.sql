CREATE TABLE "City" (
    "id" SERIAL NOT NULL,
    "tenant_id" INTEGER NOT NULL,
    "city_name" TEXT NOT NULL,
    "city_code" TEXT NOT NULL,
    "state_name" TEXT,
    "state_code" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "City_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Branch"
ADD COLUMN "city_id" INTEGER;

CREATE UNIQUE INDEX "City_tenant_id_city_name_key" ON "City"("tenant_id", "city_name");
CREATE UNIQUE INDEX "City_tenant_id_city_code_key" ON "City"("tenant_id", "city_code");
CREATE INDEX "City_tenant_id_city_name_idx" ON "City"("tenant_id", "city_name");

ALTER TABLE "City"
ADD CONSTRAINT "City_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Branch"
ADD CONSTRAINT "Branch_city_id_fkey" FOREIGN KEY ("city_id") REFERENCES "City"("id") ON DELETE SET NULL ON UPDATE CASCADE;
