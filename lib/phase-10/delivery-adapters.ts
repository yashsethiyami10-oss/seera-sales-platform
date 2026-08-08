export type DeliveryRequest={recipient:string;templateId?:string;language:"EN"|"HI";title:string;body:string;reference:string};
export type DeliveryResult={provider:string;providerMessageId:string;state:"SENT"|"DELIVERED"};
export interface NotificationProvider{readonly channel:"EMAIL"|"WHATSAPP";send(input:DeliveryRequest):Promise<DeliveryResult>}
export class TestEmailProvider implements NotificationProvider{readonly channel="EMAIL" as const;async send(input:DeliveryRequest){return{provider:"test-email",providerMessageId:`email:${input.reference}`,state:"SENT" as const};}}
export class TestWhatsAppProvider implements NotificationProvider{readonly channel="WHATSAPP" as const;async send(input:DeliveryRequest){if(!input.templateId)throw Object.assign(new Error("Approved WhatsApp template ID is required"),{code:"WHATSAPP_TEMPLATE_REQUIRED"});return{provider:"test-whatsapp-business",providerMessageId:`wa:${input.reference}`,state:"SENT" as const};}}
export function retryDelayMs(attempt:number){return Math.min(24*60*60*1000,Math.pow(2,Math.max(0,attempt))*60_000);}
