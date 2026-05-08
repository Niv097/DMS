ALTER TABLE "Tenant"
ADD COLUMN IF NOT EXISTS "fms_record_type_master_json" JSONB,
ADD COLUMN IF NOT EXISTS "fms_record_desk_master_json" JSONB,
ADD COLUMN IF NOT EXISTS "fms_classification_master_json" JSONB;
