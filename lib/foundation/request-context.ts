import { randomUUID } from "node:crypto";
export function requestId(request?:Request){const supplied=request?.headers.get("x-request-id");return supplied&&/^[A-Za-z0-9_-]{8,100}$/.test(supplied)?supplied:randomUUID();}
