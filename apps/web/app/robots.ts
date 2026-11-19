import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{
      userAgent: "*",
      allow: ["/", "/plans", "/terms", "/privacy"],
      disallow: ["/api/", "/dashboard", "/invoices", "/quotes", "/clients", "/products", "/expenses", "/bills", "/suppliers", "/collections", "/reports", "/insights", "/business-planner", "/taxes", "/team", "/billing", "/settings", "/admin", "/ai", "/onboarding"],
    }],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
