CREATE INDEX IF NOT EXISTS "FmsDocument_tenant_id_title_idx"
ON "FmsDocument" ("tenant_id", "title");

CREATE INDEX IF NOT EXISTS "FmsDocument_tenant_id_file_name_idx"
ON "FmsDocument" ("tenant_id", "file_name");

CREATE INDEX IF NOT EXISTS "FmsDocument_tenant_id_customer_name_idx"
ON "FmsDocument" ("tenant_id", "customer_name");

CREATE INDEX IF NOT EXISTS "FmsDocument_tenant_id_search_text_idx"
ON "FmsDocument" ("tenant_id", "search_text");
