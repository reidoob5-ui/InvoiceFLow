import BillingOverview from "./billing-overview";
import ManualPayment from "./manual-payment";

export default function BillingPage() {
  return <div className="space-y-7"><BillingOverview /><div className="mx-auto max-w-5xl"><ManualPayment /></div></div>;
}
