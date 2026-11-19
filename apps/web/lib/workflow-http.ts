import { NextResponse } from "next/server";
import { WorkflowError, type WorkflowErrorCode } from "@/lib/document-workflow";

const STATUS: Record<WorkflowErrorCode, number> = {
  NOT_FOUND: 404, NOT_DRAFT: 409, EMPTY_INVOICE: 400, NOT_VOIDABLE: 409, HAS_PAYMENTS: 409,
  HAS_CREDIT_NOTES: 409, NOT_CREDITABLE: 409, CREDIT_NOTE_INVALID: 400,
};

/** Map a workflow failure to an HTTP response; rethrow anything unexpected. */
export function workflowErrorResponse(error: unknown) {
  if (error instanceof WorkflowError) return NextResponse.json({ error: error.message, code: error.code }, { status: STATUS[error.code] });
  throw error;
}
