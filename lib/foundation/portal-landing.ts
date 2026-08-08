export function portalLandingPath(permissions:Set<string>):string{
  if(permissions.has("system:super_admin")||permissions.has("portal:admin"))return "/portal/founder-admin";
  if(permissions.has("portal:accounts"))return "/portal/accounts";
  if(permissions.has("portal:sales_manager"))return "/portal/sales-manager";
  if(permissions.has("portal:sales_executive"))return "/portal/sales-executive";
  if(permissions.has("portal:distributor"))return "/portal/distributor";
  if(permissions.has("portal:super_stockist"))return "/portal/super-stockist";
  if(permissions.has("portal:retailer"))return "/portal/retailer";
  return "/";
}
