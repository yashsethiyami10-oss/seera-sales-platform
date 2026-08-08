export type NoticeLanguage="EN"|"HI";
const templates={
  PAYMENT_DUE:{EN:{title:"Payment due",body:"Payment for order {orderNumber} is due on {dueDate}.",cta:"View payment"},HI:{title:"भुगतान देय",body:"ऑर्डर {orderNumber} का भुगतान {dueDate} को देय है।",cta:"भुगतान देखें"}},
  LOW_STOCK:{EN:{title:"Low stock",body:"SKU {skuCode} stock is below the configured threshold.",cta:"View stock"},HI:{title:"कम स्टॉक",body:"SKU {skuCode} का स्टॉक निर्धारित सीमा से कम है।",cta:"स्टॉक देखें"}},
  TARGET_GAP:{EN:{title:"Target attention needed",body:"Target gap is {gap}; required daily run rate is {runRate}.",cta:"View performance"},HI:{title:"लक्ष्य पर ध्यान आवश्यक",body:"लक्ष्य अंतर {gap} है; आवश्यक दैनिक गति {runRate} है।",cta:"प्रदर्शन देखें"}},
} as const;
export type TemplateKey=keyof typeof templates;
export function renderTemplate(key:TemplateKey,language:NoticeLanguage,args:Record<string,string|number>){const chosen=templates[key]?.[language]??templates[key].EN;const fill=(v:string)=>v.replace(/\{(\w+)\}/g,(_,k)=>String(args[k]??`{${k}}`));return{title:fill(chosen.title),body:fill(chosen.body),cta:fill(chosen.cta)};}
