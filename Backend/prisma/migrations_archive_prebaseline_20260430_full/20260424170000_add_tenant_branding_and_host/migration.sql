ALTER TABLE "Tenant"
ADD COLUMN "deployment_host" TEXT,
ADD COLUMN "brand_display_name" TEXT,
ADD COLUMN "brand_short_code" TEXT,
ADD COLUMN "brand_logo_path" TEXT,
ADD COLUMN "brand_watermark_text" TEXT,
ADD COLUMN "brand_subtitle" TEXT;

CREATE UNIQUE INDEX "Tenant_deployment_host_key" ON "Tenant"("deployment_host");
