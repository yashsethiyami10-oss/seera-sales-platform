import { Workspace } from "@/components/os-shell/Workspace/Workspace";
import { PageHeader } from "@/components/os-shell/Workspace/PageHeader";
import { listUnits, listBrands, listDepartments, listCustomerTypes, listInstitutionCategories, listPaymentTerms, listTaxRates } from "@/actions/master-data";
import { MastersHubTabs } from "@/components/os-masters/MastersHubTabs";

export default async function MastersPage() {
  const [units, brands, departments, customerTypes, institutionCategories, paymentTerms, taxRates] = await Promise.all([
    listUnits(), listBrands(), listDepartments(), listCustomerTypes(), listInstitutionCategories(), listPaymentTerms(), listTaxRates(),
  ]);

  return (
    <Workspace>
      <PageHeader title="Common Masters" description="Units, Brands, Departments, Customer Types, Institution Categories, Payment Terms, Tax Masters" />
      <div className="px-6 pb-10">
        <MastersHubTabs
          units={units.success ? units.data : []}
          brands={brands.success ? brands.data : []}
          departments={departments.success ? departments.data : []}
          customerTypes={customerTypes.success ? customerTypes.data : []}
          institutionCategories={institutionCategories.success ? institutionCategories.data : []}
          paymentTerms={paymentTerms.success ? paymentTerms.data : []}
          taxRates={taxRates.success ? (taxRates.data as unknown as { id: string; active: boolean; [key: string]: unknown }[]) : []}
        />
      </div>
    </Workspace>
  );
}
