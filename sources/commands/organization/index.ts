import type { Command } from "../types.js";
import { parseOutputFlag, printJson } from "../../output.js";

const USAGE = `brex organization
brex org
brex organization --json`;

type CompanyLocation = {
  address_line_1?: string;
  address_line_2?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  country?: string;
};

type Company = {
  id?: string;
  legal_name?: string;
  dba_name?: string;
  tax_id?: string;
  status?: string;
  locations?: CompanyLocation[];
  location?: CompanyLocation;
};

type GetCompanyResponse = {
  company?: Company;
  item?: Company;
} & Company;

export const organizationCommand: Command = {
  name: "organization",
  description: "Get organization details.",
  usage: USAGE,
  aliases: ["org"],
  run: async (args, context) => {
    const { format } = parseOutputFlag(args);
    const response = await context.client.fetch<GetCompanyResponse>("/v2/company");
    const company = response.company ?? response.item ?? response;

    if (format === "json") {
      printJson(company);
      return;
    }

    const primaryLocation = company.location ?? company.locations?.[0];

    console.log("Organization Details");
    console.log("────────────────────");
    console.log(`ID:          ${company.id ?? "-"}`);
    console.log(`Legal Name:  ${company.legal_name ?? "-"}`);
    if (company.dba_name) console.log(`DBA Name:    ${company.dba_name}`);
    if (company.tax_id) console.log(`Tax ID:      ${company.tax_id}`);
    if (company.status) console.log(`Status:      ${company.status}`);
    if (primaryLocation) {
      console.log(`Address:     ${primaryLocation.address_line_1 ?? "-"}`);
      if (primaryLocation.address_line_2) {
        console.log(`             ${primaryLocation.address_line_2}`);
      }
      const cityRegion = [primaryLocation.city, primaryLocation.state].filter(Boolean).join(", ");
      const postal = primaryLocation.postal_code ?? "";
      const firstLine = [cityRegion, postal].filter(Boolean).join(" ");
      if (firstLine) console.log(`             ${firstLine}`);
      if (primaryLocation.country) console.log(`             ${primaryLocation.country}`);
    }
  },
};
