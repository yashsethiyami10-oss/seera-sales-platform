import { Workspace } from "@/components/os-shell/Workspace/Workspace";
import { PageHeader } from "@/components/os-shell/Workspace/PageHeader";
import { listDepartments, listSlaPolicies, listBusinessHours, listHolidays, listEscalationRules } from "@/actions/support";
import { ConfigurationManager } from "@/components/os-support/ConfigurationManager";

export default async function SupportConfigurationPage() {
  const [departments, slaPolicies, businessHours, holidays, escalationRules] = await Promise.all([
    listDepartments(), listSlaPolicies(), listBusinessHours(), listHolidays(), listEscalationRules(),
  ]);
  return (
    <Workspace>
      <PageHeader title="Support Configuration" description="Departments, SLA policies, business hours, holidays, escalation rules" />
      <div className="px-6 pb-10">
        <ConfigurationManager
          departments={departments.success ? departments.data.map((d) => ({ id: d.id, code: d.code, name: d.name })) : []}
          slaPolicies={slaPolicies.success ? slaPolicies.data.map((p) => ({ id: p.id, name: p.name, category: p.category, priority: p.priority, responseMinutes: p.responseMinutes, resolutionMinutes: p.resolutionMinutes })) : []}
          businessHours={businessHours.success ? businessHours.data.map((b) => ({ id: b.id, dayOfWeek: b.dayOfWeek, startTime: b.startTime, endTime: b.endTime })) : []}
          holidays={holidays.success ? holidays.data.map((h) => ({ id: h.id, date: h.date, name: h.name })) : []}
          escalationRules={escalationRules.success ? escalationRules.data.map((r) => ({ id: r.id, name: r.name, triggerType: r.triggerType })) : []}
        />
      </div>
    </Workspace>
  );
}
