-- Defence in depth for issued fiscal documents.
-- The application already refuses to edit anything that is not a DRAFT; these triggers make the
-- database itself refuse, so a bug, a race or a manual query cannot silently rewrite an issued invoice.
--
-- Allowed after issue: payment bookkeeping ("amountPaid", "status"), void metadata, view/sent tracking,
-- and "publicToken" rotation. Everything that defines the document is frozen.

CREATE OR REPLACE FUNCTION invoiceflow_protect_issued_invoice() RETURNS trigger AS $$
BEGIN
  -- A snapshot, once written, is permanent.
  IF OLD."snapshot" IS NOT NULL AND NEW."snapshot" IS DISTINCT FROM OLD."snapshot" THEN
    RAISE EXCEPTION 'invoiceflow: the snapshot of issued document % is immutable', OLD."id" USING ERRCODE = 'check_violation';
  END IF;

  -- A document number, once assigned, is permanent.
  IF OLD."number" IS NOT NULL AND NEW."number" IS DISTINCT FROM OLD."number" THEN
    RAISE EXCEPTION 'invoiceflow: the number of issued document % is immutable', OLD."id" USING ERRCODE = 'check_violation';
  END IF;

  IF OLD."status" <> 'DRAFT' AND (
       NEW."type" <> OLD."type"
    OR NEW."clientId" <> OLD."clientId"
    OR NEW."currency" <> OLD."currency"
    OR NEW."subtotal" <> OLD."subtotal"
    OR NEW."discountTotal" <> OLD."discountTotal"
    OR NEW."taxTotal" <> OLD."taxTotal"
    OR NEW."withholdingTotal" <> OLD."withholdingTotal"
    OR NEW."total" <> OLD."total"
    OR NEW."issueDate" IS DISTINCT FROM OLD."issueDate"
    OR NEW."creditedInvoiceId" IS DISTINCT FROM OLD."creditedInvoiceId"
  ) THEN
    RAISE EXCEPTION 'invoiceflow: financial fields of issued document % are immutable', OLD."id" USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "Invoice_protect_issued"
  BEFORE UPDATE ON "Invoice"
  FOR EACH ROW EXECUTE FUNCTION invoiceflow_protect_issued_invoice();

CREATE OR REPLACE FUNCTION invoiceflow_protect_issued_invoice_lines() RETURNS trigger AS $$
BEGIN
  -- Lines of a non-draft invoice cannot be changed or removed. (Cascade deletes of the whole invoice,
  -- e.g. when an organization is deleted, remove the parent first and therefore pass this check.)
  IF EXISTS (SELECT 1 FROM "Invoice" i WHERE i."id" = OLD."invoiceId" AND i."status" <> 'DRAFT') THEN
    RAISE EXCEPTION 'invoiceflow: lines of issued document % are immutable', OLD."invoiceId" USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "InvoiceLine_protect_issued"
  BEFORE UPDATE OR DELETE ON "InvoiceLine"
  FOR EACH ROW EXECUTE FUNCTION invoiceflow_protect_issued_invoice_lines();
