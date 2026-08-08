export type ConflictClass="AUTO_RESOLVABLE"|"USER_REVIEW_REQUIRED"|"SERVER_REJECTED";
export type ConflictInput={userActive:boolean;sessionActive:boolean;retailerActive?:boolean;skuActive?:boolean;priceChanged?:boolean;schemeExpired?:boolean;assignmentChanged?:boolean;creditBlocked?:boolean;duplicateSubmitted?:boolean;visitDuplicate?:boolean;stockStale?:boolean};
export function classifyOfflineConflict(i:ConflictInput):{classification:ConflictClass;code:string}|null{
 if(!i.userActive||!i.sessionActive)return{classification:"SERVER_REJECTED",code:"IDENTITY_OR_SESSION_REVOKED"};
 if(i.retailerActive===false)return{classification:"SERVER_REJECTED",code:"RETAILER_DEACTIVATED"};
 if(i.skuActive===false)return{classification:"SERVER_REJECTED",code:"SKU_DISABLED"};
 if(i.creditBlocked)return{classification:"SERVER_REJECTED",code:"CREDIT_BLOCKED"};
 if(i.duplicateSubmitted||i.visitDuplicate)return{classification:"AUTO_RESOLVABLE",code:"DUPLICATE_ALREADY_ACKNOWLEDGED"};
 if(i.priceChanged)return{classification:"USER_REVIEW_REQUIRED",code:"PRICE_CHANGED"};
 if(i.schemeExpired)return{classification:"USER_REVIEW_REQUIRED",code:"SCHEME_EXPIRED"};
 if(i.assignmentChanged)return{classification:"USER_REVIEW_REQUIRED",code:"ASSIGNMENT_CHANGED"};
 if(i.stockStale)return{classification:"USER_REVIEW_REQUIRED",code:"STOCK_STATE_STALE"};return null;
}
