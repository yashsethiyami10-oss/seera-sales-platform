import { prisma } from "@/lib/prisma";
import { AppError, ForbiddenError } from "@/lib/errors";
import type { AiPrincipal } from "./types";

export async function assemblePrompt(principal: AiPrincipal, code: string, variables: Record<string, unknown>) {
  const prompt = await prisma.aiPromptTemplate.findFirst({ where: { code, status: "PUBLISHED", organizationScope: principal.organizationKey }, orderBy: { version: "desc" } });
  if (!prompt) throw new AppError("No published prompt version is available", 503);
  if (prompt.allowedRoles.length && !prompt.allowedRoles.includes(principal.roleName) && !principal.isFounder) throw new ForbiddenError("Prompt is not available to this role");
  const missing = prompt.variables.filter(variable => variables[variable] === undefined);
  if (missing.length) throw new AppError(`Missing prompt variables: ${missing.join(", ")}`);
  let content = prompt.template;
  for (const variable of prompt.variables) content = content.replaceAll(`{{${variable}}}`, String(variables[variable]));
  return { content, code: prompt.code, version: prompt.version, safetyRules: prompt.safetyRules, outputFormat: prompt.outputFormat };
}
